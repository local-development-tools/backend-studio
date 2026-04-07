import { BadRequestException, Injectable } from '@nestjs/common';
import type * as GrpcType from '@grpc/grpc-js';
import type * as ProtoLoaderType from '@grpc/proto-loader';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

export interface ReflectedMethod {
  name: string;
  inputType: string;
  outputType: string;
  clientStreaming: boolean;
  serverStreaming: boolean;
}

export interface ReflectedService {
  name: string;
  methods: ReflectedMethod[];
}

export interface ReflectedMessageField {
  name: string;
  /** JSON-compatible type: "string" | "number" | "boolean" | "object" | "array-string" | "array-number" | "array-boolean" | "array-object" */
  jsonType: string;
  /** Fully-qualified type name for message fields (e.g. "mypackage.NestedMsg") */
  typeName?: string;
  repeated: boolean;
}

export interface ReflectedMessage {
  /** Fully-qualified name, e.g. "mypackage.HelloRequest" */
  name: string;
  fields: ReflectedMessageField[];
}

export interface ReflectedEnum {
  /** Fully-qualified name, e.g. "mypackage.Status" */
  name: string;
  /** Enum value names, e.g. ["STATUS_UNKNOWN", "STATUS_ACTIVE"] */
  values: string[];
}

export interface GrpcReflectionResult {
  services: ReflectedService[];
  messageTypes: ReflectedMessage[];
  enumTypes: ReflectedEnum[];
}

type ProtoField = {
  fieldNumber: number;
  wireType: number;
  value: Buffer | bigint;
};

const REFLECTION_PROTO = `
syntax = "proto3";
package grpc.reflection.v1alpha;
service ServerReflection {
  rpc ServerReflectionInfo(stream ServerReflectionRequest) returns (stream ServerReflectionResponse);
}
message ServerReflectionRequest {
  string host = 1;
  oneof message_request {
    string file_by_filename = 3;
    string file_containing_symbol = 4;
    string list_services = 7;
  }
}
message ServerReflectionResponse {
  string valid_host = 1;
  ServerReflectionRequest original_request = 2;
  oneof message_response {
    FileDescriptorResponse file_descriptor_response = 4;
    ListServiceResponse list_services_response = 6;
    ErrorResponse error_response = 7;
  }
}
message FileDescriptorResponse {
  repeated bytes file_descriptor_proto = 1;
}
message ListServiceResponse {
  repeated ServiceResponse service = 1;
}
message ServiceResponse {
  string name = 1;
}
message ErrorResponse {
  int32 error_code = 1;
  string error_message = 2;
}`;

const PROTO_LOADER_OPTIONS = {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
};

@Injectable()
export class GrpcReflectionService {
  /**
   * Parses a raw gRPC server address, stripping protocol prefixes and inferring TLS
   */
  parseGrpcAddress(raw: string): { address: string; useTls: boolean } {
    const trimmed = raw.trim();
    if (trimmed.startsWith('https://')) {
      return { address: trimmed.slice('https://'.length), useTls: true };
    }
    if (trimmed.startsWith('http://')) {
      return { address: trimmed.slice('http://'.length), useTls: false };
    }
    return { address: trimmed, useTls: false };
  }

  /**
   * Lists all services and their methods by querying the server's reflection endpoint,
   * and also returns all message type definitions for autocomplete support
   */
  async reflect(serverAddress: string): Promise<GrpcReflectionResult> {
    if (!serverAddress?.trim()) {
      throw new BadRequestException('serverAddress is required');
    }

    const { grpc, protoLoader } = await this._loadGrpcDeps();
    const client = await this._createReflectionClient(grpc, protoLoader, serverAddress);
    try {
      const { services, messageTypes, enumTypes } = await this._listServicesAndMessages(client);
      return { services, messageTypes, enumTypes };
    } finally {
      client.close();
    }
  }

  /**
   * Loads a gRPC PackageDefinition for the given service using server reflection,
   * including all transitive file descriptor dependencies
   */
  async loadPackageDefinition(serverAddress: string, service: string): Promise<ProtoLoaderType.PackageDefinition> {
    const { grpc, protoLoader } = await this._loadGrpcDeps();

    if (typeof protoLoader.loadFileDescriptorSetFromBuffer !== 'function') {
      throw new Error('@grpc/proto-loader does not support loadFileDescriptorSetFromBuffer; upgrade to >= 0.7.0');
    }

    const client = await this._createReflectionClient(grpc, protoLoader, serverAddress);
    try {
      const fileDescriptorBytes = await this._fetchFileDescriptors(client, service);
      const fdsBuffer = this._buildFileDescriptorSetBuffer(fileDescriptorBytes);
      return protoLoader.loadFileDescriptorSetFromBuffer(fdsBuffer, PROTO_LOADER_OPTIONS);
    } finally {
      client.close();
    }
  }

  private async _loadGrpcDeps(): Promise<{ grpc: typeof GrpcType; protoLoader: typeof ProtoLoaderType }> {
    try {
      const [grpc, protoLoader] = await Promise.all([import('@grpc/grpc-js'), import('@grpc/proto-loader')]);
      return { grpc, protoLoader };
    } catch {
      throw new Error('gRPC dependencies are missing. Install @grpc/grpc-js and @grpc/proto-loader.');
    }
  }

  private async _createReflectionClient(
    grpc: typeof GrpcType,
    protoLoader: typeof ProtoLoaderType,
    serverAddress: string,
  ): Promise<GrpcType.Client> {
    let tempDir: string | undefined;
    try {
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'grpc-reflect-'));
      const protoPath = path.join(tempDir, 'reflection.proto');
      await fs.writeFile(protoPath, REFLECTION_PROTO, 'utf-8');

      const pkgDef = protoLoader.loadSync(protoPath, PROTO_LOADER_OPTIONS);
      const grpcObject = grpc.loadPackageDefinition(pkgDef);
      const nested = grpcObject as unknown as Record<
        string,
        Record<string, Record<string, Record<string, GrpcType.ServiceClientConstructor>>>
      >;
      const ReflectionService = nested?.grpc?.reflection?.v1alpha?.ServerReflection;

      if (!ReflectionService) {
        throw new Error('Failed to load gRPC reflection service definition');
      }

      const { address, useTls } = this.parseGrpcAddress(serverAddress);
      const credentials = useTls ? grpc.credentials.createSsl() : grpc.credentials.createInsecure();
      return new ReflectionService(address, credentials);
    } finally {
      if (tempDir) {
        await fs.rm(tempDir, { recursive: true, force: true });
      }
    }
  }

  private _listServicesAndMessages(client: any): Promise<{
    services: ReflectedService[];
    messageTypes: ReflectedMessage[];
    enumTypes: ReflectedEnum[];
  }> {
    return new Promise((resolve, reject) => {
      const call = client.ServerReflectionInfo();
      const allServices: ReflectedService[] = [];
      const allMessages: ReflectedMessage[] = [];
      const allEnums: ReflectedEnum[] = [];
      const seenServiceNames = new Set<string>();
      const seenMessageNames = new Set<string>();
      const seenEnumNames = new Set<string>();
      let pendingSymbols = 0;
      let listingDone = false;
      let streamEnded = false;

      const tryEnd = () => {
        if (listingDone && pendingSymbols === 0 && !streamEnded) {
          streamEnded = true;
          call.end();
        }
      };

      call.on('data', (response: any) => {
        if (response.list_services_response) {
          const serviceNames: string[] = (response.list_services_response.service ?? [])
            .map((s: any) => s.name as string)
            .filter((name: string) => !name.startsWith('grpc.'));

          listingDone = true;

          if (serviceNames.length === 0) {
            tryEnd();
            return;
          }

          pendingSymbols = serviceNames.length;
          for (const name of serviceNames) {
            call.write({ file_containing_symbol: name });
          }
        } else if (response.file_descriptor_response) {
          const bytesList: Buffer[] = response.file_descriptor_response.file_descriptor_proto ?? [];
          for (const bytes of bytesList) {
            const { services, messageTypes, enumTypes } = this._decodeFileDescriptor(bytes);
            for (const svc of services) {
              if (!seenServiceNames.has(svc.name)) {
                seenServiceNames.add(svc.name);
                allServices.push(svc);
              }
            }
            for (const msg of messageTypes) {
              if (!seenMessageNames.has(msg.name)) {
                seenMessageNames.add(msg.name);
                allMessages.push(msg);
              }
            }
            for (const en of enumTypes) {
              if (!seenEnumNames.has(en.name)) {
                seenEnumNames.add(en.name);
                allEnums.push(en);
              }
            }
          }
          pendingSymbols = Math.max(0, pendingSymbols - 1);
          tryEnd();
        } else if (response.error_response) {
          pendingSymbols = Math.max(0, pendingSymbols - 1);
          tryEnd();
        }
      });

      call.on('error', (err: Error) => reject(err));
      call.on('end', () =>
        resolve({
          services: allServices,
          messageTypes: allMessages,
          enumTypes: allEnums,
        }),
      );

      call.write({ list_services: '' });
    });
  }

  private _fetchFileDescriptors(client: any, service: string): Promise<Buffer[]> {
    return new Promise((resolve, reject) => {
      const call = client.ServerReflectionInfo();
      const requestedFiles = new Set<string>();
      const collectedFiles = new Map<string, Buffer>();
      let pending = 1; // 1 for the initial file_containing_symbol request
      let streamEnded = false;

      const tryEnd = () => {
        if (pending <= 0 && !streamEnded) {
          streamEnded = true;
          call.end();
        }
      };

      const requestFile = (filename: string) => {
        if (requestedFiles.has(filename) || collectedFiles.has(filename)) return;
        requestedFiles.add(filename);
        pending++;
        call.write({ file_by_filename: filename });
      };

      const processFileDescriptor = (bytes: Buffer) => {
        const fields = this._decodeProtoFields(bytes);
        const nameField = fields.find((f) => f.fieldNumber === 1 && f.wireType === 2);
        const name = nameField ? (nameField.value as Buffer).toString('utf-8') : '';

        if (name && !collectedFiles.has(name)) {
          collectedFiles.set(name, bytes);
        }

        // Field 3 = repeated string dependency — fetch all transitively
        for (const f of fields) {
          if (f.fieldNumber === 3 && f.wireType === 2) {
            requestFile((f.value as Buffer).toString('utf-8'));
          }
        }
      };

      call.on('data', (response: any) => {
        if (response.file_descriptor_response) {
          const bytesList: Buffer[] = response.file_descriptor_response.file_descriptor_proto ?? [];
          for (const bytes of bytesList) {
            processFileDescriptor(bytes);
          }
          pending--;
          tryEnd();
        } else if (response.error_response) {
          pending--;
          tryEnd();
        }
      });

      call.on('error', reject);
      call.on('end', () => resolve(Array.from(collectedFiles.values())));

      call.write({ file_containing_symbol: service });
    });
  }

  private _buildFileDescriptorSetBuffer(protoBytesList: Buffer[]): Buffer {
    const parts: Buffer[] = [];
    for (const bytes of protoBytesList) {
      parts.push(Buffer.from([0x0a])); // field 1, wire type 2
      parts.push(this._encodeVarint(bytes.length));
      parts.push(bytes);
    }
    return Buffer.concat(parts);
  }

  private _encodeVarint(value: number): Buffer {
    const bytes: number[] = [];
    let v = value;
    while (v > 0x7f) {
      bytes.push((v & 0x7f) | 0x80);
      v >>>= 7;
    }
    bytes.push(v >>> 0);
    return Buffer.from(bytes);
  }

  private _readVarint(buf: Buffer, offset: number): [bigint, number] {
    let result = 0n;
    let shift = 0n;
    let pos = offset;
    while (pos < buf.length) {
      const byte = buf[pos++];
      result |= BigInt(byte & 0x7f) << shift;
      shift += 7n;
      if ((byte & 0x80) === 0) break;
    }
    return [result, pos - offset];
  }

  private _decodeProtoFields(buf: Buffer): ProtoField[] {
    const fields: ProtoField[] = [];
    let offset = 0;

    while (offset < buf.length) {
      const [tag, tagLen] = this._readVarint(buf, offset);
      offset += tagLen;

      const fieldNumber = Number(tag >> 3n);
      const wireType = Number(tag & 7n);

      if (wireType === 0) {
        const [value, len] = this._readVarint(buf, offset);
        offset += len;
        fields.push({ fieldNumber, wireType, value });
      } else if (wireType === 2) {
        const [length, lenLen] = this._readVarint(buf, offset);
        offset += lenLen;
        fields.push({
          fieldNumber,
          wireType,
          value: buf.slice(offset, offset + Number(length)),
        });
        offset += Number(length);
      } else if (wireType === 1) {
        offset += 8;
      } else if (wireType === 5) {
        offset += 4;
      } else {
        break;
      }
    }

    return fields;
  }

  private _decodeMethodDescriptor(buf: Buffer): ReflectedMethod | null {
    const fields = this._decodeProtoFields(buf);
    const method: Partial<ReflectedMethod> = {
      clientStreaming: false,
      serverStreaming: false,
    };

    for (const f of fields) {
      if (f.fieldNumber === 1 && f.wireType === 2) {
        method.name = (f.value as Buffer).toString('utf-8');
      } else if (f.fieldNumber === 2 && f.wireType === 2) {
        method.inputType = (f.value as Buffer).toString('utf-8').replace(/^\./, '');
      } else if (f.fieldNumber === 3 && f.wireType === 2) {
        method.outputType = (f.value as Buffer).toString('utf-8').replace(/^\./, '');
      } else if (f.fieldNumber === 5 && f.wireType === 0) {
        method.clientStreaming = (f.value as bigint) !== 0n;
      } else if (f.fieldNumber === 6 && f.wireType === 0) {
        method.serverStreaming = (f.value as bigint) !== 0n;
      }
    }

    if (!method.name) return null;

    return {
      name: method.name,
      inputType: method.inputType ?? '',
      outputType: method.outputType ?? '',
      clientStreaming: method.clientStreaming ?? false,
      serverStreaming: method.serverStreaming ?? false,
    };
  }

  private _decodeServiceDescriptor(buf: Buffer, pkg: string): ReflectedService | null {
    const fields = this._decodeProtoFields(buf);
    let name = '';
    const methods: ReflectedMethod[] = [];

    for (const f of fields) {
      if (f.fieldNumber === 1 && f.wireType === 2) {
        name = (f.value as Buffer).toString('utf-8');
      } else if (f.fieldNumber === 2 && f.wireType === 2) {
        const method = this._decodeMethodDescriptor(f.value as Buffer);
        if (method) methods.push(method);
      }
    }

    if (!name) return null;
    return { name: pkg ? `${pkg}.${name}` : name, methods };
  }

  /**
   * Maps a FieldDescriptorProto.type number to a JSON-compatible type string
   * See: https://protobuf.dev/reference/protobuf/google.protobuf/#field-descriptor-proto
   */
  private _protoFieldTypeToJson(type: number): string {
    switch (type) {
      case 1: // double
      case 2: // float
      case 3: // int64
      case 4: // uint64
      case 5: // int32
      case 6: // fixed64
      case 7: // fixed32
      case 13: // uint32
      case 15: // sfixed32
      case 16: // sfixed64
      case 17: // sint32
      case 18: // sint64
        return 'number';
      case 8: // bool
        return 'boolean';
      case 9: // string
        return 'string';
      case 12: // bytes
        return 'string'; // base64-encoded
      case 11: // message
        return 'object';
      case 14: // enum
        return 'string'; // simplified; full enum support would need enum descriptor
      default:
        return 'string';
    }
  }

  /**
   * Decodes a FieldDescriptorProto binary into a ReflectedMessageField
   * FieldDescriptorProto wire fields: 1=name, 4=label, 5=type, 6=type_name
   */
  private _decodeFieldDescriptor(buf: Buffer): ReflectedMessageField | null {
    const fields = this._decodeProtoFields(buf);
    let name = '';
    let type = 9; // default: string
    let typeName: string | undefined;
    let label = 1; // default: optional

    for (const f of fields) {
      if (f.fieldNumber === 1 && f.wireType === 2) {
        name = (f.value as Buffer).toString('utf-8');
      } else if (f.fieldNumber === 4 && f.wireType === 0) {
        label = Number(f.value as bigint);
      } else if (f.fieldNumber === 5 && f.wireType === 0) {
        type = Number(f.value as bigint);
      } else if (f.fieldNumber === 6 && f.wireType === 2) {
        typeName = (f.value as Buffer).toString('utf-8').replace(/^\./, '');
      }
    }

    if (!name) return null;

    const repeated = label === 3; // LABEL_REPEATED = 3
    const jsonType = this._protoFieldTypeToJson(type);

    return { name, jsonType, typeName, repeated };
  }

  /**
   * Decodes an EnumValueDescriptorProto binary and returns the value name
   * EnumValueDescriptorProto wire fields: 1=name, 2=number
   */
  private _decodeEnumValueDescriptor(buf: Buffer): string | null {
    const fields = this._decodeProtoFields(buf);
    for (const f of fields) {
      if (f.fieldNumber === 1 && f.wireType === 2) {
        return (f.value as Buffer).toString('utf-8');
      }
    }
    return null;
  }

  /**
   * Decodes an EnumDescriptorProto binary into a ReflectedEnum
   * EnumDescriptorProto wire fields: 1=name, 2=value (repeated EnumValueDescriptorProto)
   */
  private _decodeEnumDescriptor(buf: Buffer, qualifiedPrefix: string): ReflectedEnum | null {
    const fields = this._decodeProtoFields(buf);
    let name = '';
    const values: string[] = [];

    for (const f of fields) {
      if (f.fieldNumber === 1 && f.wireType === 2) {
        name = (f.value as Buffer).toString('utf-8');
      } else if (f.fieldNumber === 2 && f.wireType === 2) {
        const valueName = this._decodeEnumValueDescriptor(f.value as Buffer);
        if (valueName) values.push(valueName);
      }
    }

    if (!name) return null;
    return {
      name: qualifiedPrefix ? `${qualifiedPrefix}.${name}` : name,
      values,
    };
  }

  /**
   * Decodes a DescriptorProto binary into zero or more ReflectedMessage and ReflectedEnum entries
   * (one message for the type itself, plus any nested types and nested enums)
   * DescriptorProto wire fields: 1=name, 2=field, 3=nested_type, 4=enum_type
   */
  private _decodeMessageDescriptor(buf: Buffer, pkg: string): { messages: ReflectedMessage[]; enums: ReflectedEnum[] } {
    const fields = this._decodeProtoFields(buf);
    let name = '';
    const messageFields: ReflectedMessageField[] = [];
    const nestedMessages: ReflectedMessage[] = [];
    const nestedEnums: ReflectedEnum[] = [];

    for (const f of fields) {
      if (f.fieldNumber === 1 && f.wireType === 2) {
        name = (f.value as Buffer).toString('utf-8');
      } else if (f.fieldNumber === 2 && f.wireType === 2) {
        const field = this._decodeFieldDescriptor(f.value as Buffer);
        if (field) messageFields.push(field);
      } else if (f.fieldNumber === 3 && f.wireType === 2) {
        const nested = this._decodeMessageDescriptor(f.value as Buffer, '');
        nestedMessages.push(...nested.messages);
        nestedEnums.push(...nested.enums);
      } else if (f.fieldNumber === 4 && f.wireType === 2) {
        // Collect inline (nested) enum types — prefix resolved once we know parent name
        const en = this._decodeEnumDescriptor(f.value as Buffer, '');
        if (en) nestedEnums.push(en);
      }
    }

    if (!name) return { messages: [], enums: [] };

    const fullName = pkg ? `${pkg}.${name}` : name;
    const resultMessages: ReflectedMessage[] = [{ name: fullName, fields: messageFields }];
    const resultEnums: ReflectedEnum[] = [];

    for (const nested of nestedMessages) {
      resultMessages.push({ ...nested, name: `${fullName}.${nested.name}` });
    }
    for (const en of nestedEnums) {
      resultEnums.push({ ...en, name: `${fullName}.${en.name}` });
    }

    return { messages: resultMessages, enums: resultEnums };
  }

  /**
   * Decodes a FileDescriptorProto binary and returns all services, message types, and enum types it contains
   * FileDescriptorProto wire fields: 2=package, 4=message_type, 5=enum_type, 6=service
   */
  private _decodeFileDescriptor(bytes: Buffer): {
    services: ReflectedService[];
    messageTypes: ReflectedMessage[];
    enumTypes: ReflectedEnum[];
  } {
    const fields = this._decodeProtoFields(bytes);
    let pkg = '';
    const services: ReflectedService[] = [];
    const messageTypes: ReflectedMessage[] = [];
    const enumTypes: ReflectedEnum[] = [];

    for (const f of fields) {
      if (f.fieldNumber === 2 && f.wireType === 2) {
        pkg = (f.value as Buffer).toString('utf-8');
      } else if (f.fieldNumber === 4 && f.wireType === 2) {
        const { messages, enums } = this._decodeMessageDescriptor(f.value as Buffer, pkg);
        messageTypes.push(...messages);
        enumTypes.push(...enums);
      } else if (f.fieldNumber === 5 && f.wireType === 2) {
        const en = this._decodeEnumDescriptor(f.value as Buffer, pkg);
        if (en) enumTypes.push(en);
      } else if (f.fieldNumber === 6 && f.wireType === 2) {
        const svc = this._decodeServiceDescriptor(f.value as Buffer, pkg);
        if (svc) services.push(svc);
      }
    }

    return { services, messageTypes, enumTypes };
  }
}
