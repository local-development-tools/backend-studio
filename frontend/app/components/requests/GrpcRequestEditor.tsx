
import { useState, useCallback, useEffect, useRef } from 'react';
import type React from 'react';
import { Send, Server, Zap, Loader2, X } from 'lucide-react';

import { KeyValueEditor } from './KeyValueEditor';
import { GrpcMessageEditor } from './GrpcMessageEditor';
import type { GrpcRequest } from './types';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Textarea } from '../ui/textarea';
import { Badge } from '../ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { reflectGrpcServer, type ReflectedService, type ReflectedMessage, type ReflectedEnum } from '~/lib/api/requests/reflectGrpcServer';
import { interpolateVariables } from '~/lib/variableStore';

interface ReflectionState {
  loading: boolean;
  error: string | null;
  services: ReflectedService[] | null;
  messageTypes: ReflectedMessage[] | null;
  enumTypes: ReflectedEnum[] | null;
}

interface GrpcRequestEditorProps {
  request: GrpcRequest;
  onChange: (r: GrpcRequest) => void;
  onSend: () => void;
  envSelector?: React.ReactNode;
  envVars?: Record<string, string>;
}

export const GrpcRequestEditor = ({ request, onChange, onSend, envSelector, envVars }: GrpcRequestEditorProps) => {
  const [reflection, setReflection] = useState<ReflectionState>({
    loading: false,
    error: null,
    services: null,
    messageTypes: null,
    enumTypes: null,
  });

  const handleReflect = useCallback(async () => {
    if (!request.serverAddress.trim()) return;

    const resolvedAddress = interpolateVariables(
      request.serverAddress,
      request.collectionId,
      envVars,
    );

    setReflection({ loading: true, error: null, services: null, messageTypes: null, enumTypes: null });
    try {
      const result = await reflectGrpcServer(resolvedAddress);
      setReflection({
        loading: false,
        error: null,
        services: result.services,
        messageTypes: result.messageTypes,
        enumTypes: result.enumTypes,
      });
    } catch (err) {
      setReflection({
        loading: false,
        error: err instanceof Error ? err.message : 'Reflection failed',
        services: null,
        messageTypes: null,
        enumTypes: null,
      });
    }
  }, [request.serverAddress, request.collectionId, envVars]);

  const clearReflection = useCallback(() => {
    setReflection({ loading: false, error: null, services: null, messageTypes: null, enumTypes: null });
  }, []);

  const prevRequestIdRef = useRef<string | null>(null);

  useEffect(() => {
    const idChanged = prevRequestIdRef.current !== request.id;
    prevRequestIdRef.current = request.id;

    if (!request.serverAddress.trim()) {
      if (idChanged) clearReflection();
      return;
    }

    if (idChanged) {
      handleReflect();
      return;
    }

    const timer = setTimeout(handleReflect, 700);
    return () => clearTimeout(timer);
  }, [request.id, request.serverAddress, envVars, handleReflect, clearReflection]);

  const selectedReflectedService = reflection.services?.find((s) => s.name === request.service) ?? null;

  const selectedReflectedMethod =
    selectedReflectedService?.methods.find((m) => m.name === request.method) ?? null;

  return (
    <div className="flex flex-col h-full">
      {/* Server address bar */}
      <div className="flex items-center gap-0 border-2 border-orange-500/40 rounded-lg overflow-hidden bg-background mb-3">
        <div className="flex items-center gap-1.5 px-3 h-9 bg-muted/50 border-r border-border shrink-0">
          <Server className="h-3.5 w-3.5 text-orange-500" />
          <span className="text-[11px] font-bold text-orange-500">gRPC</span>
        </div>
        <Input
          value={request.serverAddress}
          onChange={(e) => onChange({ ...request, serverAddress: e.target.value })}
          placeholder="localhost:50051"
          className="flex-1 h-9 border-none shadow-none focus-visible:ring-0 text-sm font-mono"
        />
        <Button
          onClick={handleReflect}
          disabled={reflection.loading || !request.serverAddress.trim()}
          variant="ghost"
          className="h-9 rounded-none px-4 gap-1.5 text-xs font-medium border-l border-border hover:bg-muted/60 shrink-0"
        >
          {reflection.loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Zap className="h-3.5 w-3.5" />
          )}
          Reflect
        </Button>
        <Button onClick={onSend} className="h-9 rounded-none px-5 gap-2 font-semibold shrink-0">
          <Send className="h-3.5 w-3.5" />
          Invoke
        </Button>
      </div>

      {/* Reflection error */}
      {reflection.error && (
        <div className="flex items-center gap-2 mb-3 px-3 py-1.5 text-xs text-red-500 bg-red-500/5 border border-red-500/20 rounded-md">
          <span className="flex-1">{reflection.error}</span>
          <button onClick={clearReflection} className="shrink-0 hover:text-red-700">
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* Service / Method */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <Label className="text-[11px] text-muted-foreground">Service</Label>
            {reflection.services && (
              <button
                onClick={clearReflection}
                className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-0.5"
              >
                <X className="h-2.5 w-2.5" />
                clear
              </button>
            )}
          </div>
          {reflection.services ? (
            <Select
              value={request.service}
              onValueChange={(value) => onChange({ ...request, service: value, method: '' })}
            >
              <SelectTrigger className="h-7 text-xs font-mono">
                <SelectValue placeholder="Select a service" />
              </SelectTrigger>
              <SelectContent>
                {reflection.services.map((svc) => (
                  <SelectItem key={svc.name} value={svc.name} className="text-xs font-mono">
                    {svc.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              value={request.service}
              onChange={(e) => onChange({ ...request, service: e.target.value })}
              placeholder="package.ServiceName"
              className="h-7 text-xs font-mono"
            />
          )}
        </div>
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">
            Method
            {selectedReflectedService && (
              <span className="ml-1 text-muted-foreground/60">
                ({selectedReflectedService.methods.length})
              </span>
            )}
          </Label>
          {reflection.services && selectedReflectedService ? (
            <Select
              value={request.method}
              onValueChange={(value) => onChange({ ...request, method: value })}
            >
              <SelectTrigger className="h-7 text-xs font-mono">
                <SelectValue placeholder="Select a method" />
              </SelectTrigger>
              <SelectContent>
                {selectedReflectedService.methods.map((m) => (
                  <SelectItem key={m.name} value={m.name} className="text-xs font-mono">
                    <span className="flex items-center gap-1.5">
                      {m.name}
                      {(m.clientStreaming || m.serverStreaming) && (
                        <span className="text-[9px] text-muted-foreground">
                          {m.clientStreaming && m.serverStreaming
                            ? 'bidi'
                            : m.clientStreaming
                              ? 'client-stream'
                              : 'server-stream'}
                        </span>
                      )}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : reflection.services && !selectedReflectedService ? (
            <Input
              value={request.method}
              onChange={(e) => onChange({ ...request, method: e.target.value })}
              placeholder="Select a service first"
              className="h-7 text-xs font-mono"
              disabled
            />
          ) : (
            <Input
              value={request.method}
              onChange={(e) => onChange({ ...request, method: e.target.value })}
              placeholder="MethodName"
              className="h-7 text-xs font-mono"
            />
          )}
        </div>
      </div>

      {/* Reflected method details */}
      {selectedReflectedService && request.method && (() => {
        const m = selectedReflectedService.methods.find((m) => m.name === request.method);
        if (!m) return null;
        return (
          <div className="flex items-center gap-3 mb-3 px-3 py-1.5 text-[10px] text-muted-foreground bg-muted/30 rounded-md font-mono">
            <span>in: <span className="text-foreground/70">{m.inputType}</span></span>
            <span className="text-border">→</span>
            <span>out: <span className="text-foreground/70">{m.outputType}</span></span>
            {(m.clientStreaming || m.serverStreaming) && (
              <Badge variant="outline" className="h-4 px-1 text-[9px] ml-auto">
                {m.clientStreaming && m.serverStreaming ? 'bidirectional stream' : m.clientStreaming ? 'client stream' : 'server stream'}
              </Badge>
            )}
          </div>
        );
      })()}

      {/* Tabs */}
      <Tabs defaultValue="message" className="flex-1 flex flex-col min-h-0">
        <div className="flex items-center border-b border-border shrink-0">
          <TabsList className="h-8 rounded-none border-b-0 bg-transparent justify-start px-0 shrink-0">
            <TabsTrigger value="message" className="text-[11px] h-6 data-[state=active]:bg-muted rounded-sm">Message</TabsTrigger>
            <TabsTrigger value="metadata" className="text-[11px] h-6 data-[state=active]:bg-muted rounded-sm">
              Metadata
              {request.metadata.length > 0 && <Badge variant="secondary" className="ml-1 h-4 px-1 text-[9px]">{request.metadata.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="proto" className="text-[11px] h-6 data-[state=active]:bg-muted rounded-sm">Proto</TabsTrigger>
          </TabsList>
          {envSelector && <div className="ml-auto pr-1">{envSelector}</div>}
        </div>
        <TabsContent value="message" className="flex-1 m-0 mt-2 min-h-0">
          <GrpcMessageEditor
            value={request.message}
            onChange={(message) => onChange({ ...request, message })}
            inputTypeName={selectedReflectedMethod?.inputType}
            messageTypes={reflection.messageTypes ?? undefined}
            enumTypes={reflection.enumTypes ?? undefined}
          />
        </TabsContent>
        <TabsContent value="metadata" className="flex-1 m-0 mt-2 min-h-0 overflow-auto">
          <KeyValueEditor
            items={request.metadata}
            onChange={(metadata) => onChange({ ...request, metadata })}
          />
        </TabsContent>
        <TabsContent value="proto" className="flex-1 m-0 mt-2 min-h-0">
          <Textarea
            value={request.protoContent}
            onChange={(e) => onChange({ ...request, protoContent: e.target.value })}
            placeholder="Paste your .proto file content here..."
            className="font-mono text-xs h-full min-h-[120px] resize-none"
          />
        </TabsContent>
      </Tabs>
    </div>
  );
};
