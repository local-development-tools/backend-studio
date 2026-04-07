import { API_BASE_URL } from '~/lib/api/config';

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
  /** JSON-compatible type: "string" | "number" | "boolean" | "object" */
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

export async function reflectGrpcServer(serverAddress: string): Promise<GrpcReflectionResult> {
  const response = await fetch(`${API_BASE_URL}/grpc/reflect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ serverAddress }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: `HTTP error status: ${response.status}` }));
    throw new Error(error.message ?? `HTTP error status: ${response.status}`);
  }

  return (await response.json()) as GrpcReflectionResult;
}
