import { useState, useEffect, useRef, useCallback } from "react";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "~/components/ui/resizable";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Badge } from "~/components/ui/badge";
import { ScrollArea } from "~/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { cn } from "~/lib/utils";
import { Radio, RefreshCw, Play, Square, Trash2 } from "lucide-react";
import {
  listSubscriptions,
  pullMessages,
  type PubSubSubscription,
  type PubSubMessage,
} from "~/lib/api/pubsub";

export function meta() {
  return [
    { title: "PubSub Monitor" },
    { name: "description", content: "Monitor PubSub subscription messages in real time" },
  ];
}

type MonitoredMessage = {
  id: string;
  receivedAt: string;
  message: PubSubMessage;
};

const POLL_INTERVALS = [
  { label: "1s", value: 1000 },
  { label: "2s", value: 2000 },
  { label: "5s", value: 5000 },
  { label: "10s", value: 10000 },
] as const;

const MAX_MESSAGES_OPTIONS = [10, 25, 50, 100] as const;

function shortName(fullName: string): string {
  return fullName.split("/").pop() ?? fullName;
}

type DecodedData = { content: string; format: "json" | "text" | "proto" | "binary" };

// --- Schemaless protobuf decoder ---

function readVarint(bytes: Uint8Array, offset: number): [bigint, number] {
  let result = 0n;
  let shift = 0n;
  let pos = offset;
  while (pos < bytes.length) {
    const b = BigInt(bytes[pos++]);
    result |= (b & 0x7fn) << shift;
    shift += 7n;
    if (!(b & 0x80n)) break;
    if (shift >= 70n) throw new Error("varint overflow");
  }
  return [result, pos];
}

type ProtoValue =
  | { kind: "varint"; value: bigint }
  | { kind: "string"; value: string }
  | { kind: "message"; fields: ProtoField[] }
  | { kind: "bytes"; hex: string }
  | { kind: "fixed32"; value: number }
  | { kind: "fixed64"; value: bigint };

interface ProtoField {
  number: number;
  value: ProtoValue;
}

function isPrintableAscii(bytes: Uint8Array): boolean {
  for (const b of bytes) {
    if (b < 32 && b !== 9 && b !== 10 && b !== 13) return false;
    if (b > 126) return false;
  }
  return true;
}

function interpretLengthDelimited(content: Uint8Array, depth: number): ProtoValue {
  if (isPrintableAscii(content)) {
    return { kind: "string", value: new TextDecoder().decode(content) };
  }

  if (content.length > 0) {
    const nested = parseProtoBytes(content, depth);
    if (nested !== null && nested.length > 0) {
      return { kind: "message", fields: nested };
    }
  }

  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(content);
    if ([...text].every((c) => c.charCodeAt(0) >= 32 || c === "\t" || c === "\n" || c === "\r")) {
      return { kind: "string", value: text };
    }
  } catch {
    // not valid utf-8
  }

  return {
    kind: "bytes",
    hex: Array.from(content)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join(" "),
  };
}

function parseProtoBytes(bytes: Uint8Array, depth = 0): ProtoField[] | null {
  if (depth > 8) return null;
  const fields: ProtoField[] = [];
  let pos = 0;
  try {
    while (pos < bytes.length) {
      let tag: bigint;
      [tag, pos] = readVarint(bytes, pos);

      const fieldNumber = Number(tag >> 3n);
      const wireType = Number(tag & 0x7n);

      if (fieldNumber === 0 || fieldNumber > 536870911) return null;

      switch (wireType) {
        case 0: {
          let value: bigint;
          [value, pos] = readVarint(bytes, pos);
          fields.push({ number: fieldNumber, value: { kind: "varint", value } });
          break;
        }
        case 1: {
          if (pos + 8 > bytes.length) return null;
          const view = new DataView(bytes.buffer, bytes.byteOffset + pos, 8);
          const lo = BigInt(view.getUint32(0, true));
          const hi = BigInt(view.getUint32(4, true));
          fields.push({ number: fieldNumber, value: { kind: "fixed64", value: (hi << 32n) | lo } });
          pos += 8;
          break;
        }
        case 2: {
          let lenBig: bigint;
          [lenBig, pos] = readVarint(bytes, pos);
          const len = Number(lenBig);
          if (pos + len > bytes.length) return null;
          const content = bytes.slice(pos, pos + len);
          pos += len;
          fields.push({ number: fieldNumber, value: interpretLengthDelimited(content, depth + 1) });
          break;
        }
        case 5: {
          if (pos + 4 > bytes.length) return null;
          const view = new DataView(bytes.buffer, bytes.byteOffset + pos, 4);
          fields.push({ number: fieldNumber, value: { kind: "fixed32", value: view.getUint32(0, true) } });
          pos += 4;
          break;
        }
        default:
          return null;
      }
    }
  } catch {
    return null;
  }
  return pos === bytes.length ? fields : null;
}

function formatProtoFields(fields: ProtoField[], indent = 0): string {
  const pad = "  ".repeat(indent);
  return fields
    .map(({ number, value }) => {
      switch (value.kind) {
        case "varint":
          return `${pad}field_${number}: ${value.value}`;
        case "string":
          return `${pad}field_${number}: "${value.value}"`;
        case "bytes":
          return `${pad}field_${number}: <${value.hex}>`;
        case "fixed32":
          return `${pad}field_${number}: ${value.value} (fixed32)`;
        case "fixed64":
          return `${pad}field_${number}: ${value.value} (fixed64)`;
        case "message":
          return `${pad}field_${number}: {\n${formatProtoFields(value.fields, indent + 1)}\n${pad}}`;
      }
    })
    .join("\n");
}

function isBinaryContent(bytes: Uint8Array): boolean {
  let controlCount = 0;
  for (const b of bytes) {
    if (b < 32 && b !== 9 && b !== 10 && b !== 13) controlCount++;
  }
  return controlCount / bytes.length > 0.02;
}

function hexDump(bytes: Uint8Array): string {
  const lines: string[] = [];
  for (let i = 0; i < bytes.length; i += 16) {
    const slice = bytes.slice(i, i + 16);
    const offset = i.toString(16).padStart(8, "0");
    const hex = Array.from(slice)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join(" ")
      .padEnd(47, " ");
    const ascii = Array.from(slice)
      .map((b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : "."))
      .join("");
    lines.push(`${offset}  ${hex}  |${ascii}|`);
  }
  return lines.join("\n");
}

function decodeMessageData(data: string): DecodedData {
  if (!data) return { content: "(empty)", format: "text" };
  try {
    const binaryString = atob(data);
    const bytes = Uint8Array.from(binaryString, (c) => c.charCodeAt(0));

    if (!isBinaryContent(bytes)) {
      const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
      try {
        return { content: JSON.stringify(JSON.parse(text), null, 2), format: "json" };
      } catch {
        return { content: text, format: "text" };
      }
    }

    const protoFields = parseProtoBytes(bytes);
    if (protoFields && protoFields.length > 0) {
      return { content: formatProtoFields(protoFields), format: "proto" };
    }

    return { content: hexDump(bytes), format: "binary" };
  } catch {
    return { content: data, format: "text" };
  }
}

const FORMAT_BADGE: Record<DecodedData["format"], string> = {
  json: "JSON",
  text: "text",
  proto: "protobuf",
  binary: "binary · hex",
};

function MessageCard({ msg }: { msg: MonitoredMessage }) {
  const decoded = decodeMessageData(msg.message.data ?? "");
  const hasAttributes = Object.keys(msg.message.attributes ?? {}).length > 0;

  return (
    <div className="border border-border rounded-md p-3 text-sm space-y-2 bg-card">
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="outline" className="text-xs font-mono shrink-0">
          {msg.id}
        </Badge>
        <Badge variant="secondary" className="text-xs shrink-0">
          {FORMAT_BADGE[decoded.format]}
        </Badge>
        <span className="text-xs text-muted-foreground ml-auto">
          received {msg.receivedAt} &middot; published{" "}
          {new Date(msg.message.publishTime).toLocaleTimeString()}
        </span>
      </div>
      {hasAttributes && (
        <div className="flex flex-wrap gap-1">
          {Object.entries(msg.message.attributes).map(([k, v]) => (
            <Badge key={k} variant="secondary" className="text-xs font-mono">
              {k}: {v}
            </Badge>
          ))}
        </div>
      )}
      <pre className="whitespace-pre-wrap break-all text-xs font-mono bg-muted/50 rounded p-2 max-h-64 overflow-y-auto leading-relaxed">
        {decoded.content}
      </pre>
    </div>
  );
}

export default function PubSubMonitor() {
  const [subscriptions, setSubscriptions] = useState<PubSubSubscription[]>([]);
  const [isLoadingSubscriptions, setIsLoadingSubscriptions] = useState(false);
  const [subscriptionsError, setSubscriptionsError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const [selectedSubscription, setSelectedSubscription] = useState<PubSubSubscription | null>(null);
  const [messages, setMessages] = useState<MonitoredMessage[]>([]);
  const seenIdsRef = useRef(new Set<string>());

  const [isMonitoring, setIsMonitoring] = useState(false);
  const [pollInterval, setPollInterval] = useState(2000);
  const [maxMessages, setMaxMessages] = useState(10);
  const [lastPollError, setLastPollError] = useState<string | null>(null);

  const subscriptionsViewportRef = useRef<HTMLDivElement>(null);
  const messagesViewportRef = useRef<HTMLDivElement>(null);

  const loadSubscriptions = useCallback(async () => {
    setIsLoadingSubscriptions(true);
    setSubscriptionsError(null);
    try {
      const subs = await listSubscriptions();
      setSubscriptions(subs);
    } catch (err) {
      setSubscriptionsError(err instanceof Error ? err.message : "Failed to load subscriptions");
    } finally {
      setIsLoadingSubscriptions(false);
    }
  }, []);

  useEffect(() => {
    loadSubscriptions();
  }, [loadSubscriptions]);

  useEffect(() => {
    const viewport = messagesViewportRef.current;
    if (viewport && messages.length > 0) {
      viewport.scrollTo({ top: viewport.scrollHeight, behavior: "smooth" });
    }
  }, [messages]);

  useEffect(() => {
    if (!isMonitoring || !selectedSubscription) return;

    const subShortName = shortName(selectedSubscription.name);

    const doPoll = async () => {
      try {
        const received = await pullMessages(subShortName, maxMessages);
        if (received.length > 0) {
          setMessages((prev) => {
            const newMessages: MonitoredMessage[] = [];
            for (const r of received) {
              const id = r.message.messageId;
              if (!seenIdsRef.current.has(id)) {
                seenIdsRef.current.add(id);
                newMessages.push({
                  id,
                  receivedAt: new Date().toLocaleTimeString(),
                  message: r.message,
                });
              }
            }
            return newMessages.length > 0 ? [...prev, ...newMessages] : prev;
          });
        }
        setLastPollError(null);
      } catch (err) {
        setLastPollError(err instanceof Error ? err.message : "Poll failed");
      }
    };

    doPoll();
    const intervalId = setInterval(doPoll, pollInterval);
    return () => clearInterval(intervalId);
  }, [isMonitoring, selectedSubscription, pollInterval, maxMessages]);

  const handleSelectSubscription = useCallback((sub: PubSubSubscription) => {
    setSelectedSubscription(sub);
    setIsMonitoring(false);
    setMessages([]);
    seenIdsRef.current.clear();
    setLastPollError(null);
  }, []);

  const handleClearMessages = useCallback(() => {
    setMessages([]);
    seenIdsRef.current.clear();
  }, []);

  const filteredSubscriptions = subscriptions.filter((s) =>
    shortName(s.name).toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="flex w-full h-full">
      <ResizablePanelGroup orientation="horizontal" className="w-full">
        <ResizablePanel defaultSize="15%" minSize="15%" maxSize="50%">
          <div className="flex flex-col h-full border-r border-border">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
              <Radio className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="font-semibold text-sm">Subscriptions</span>
              <Button
                variant="ghost"
                size="icon"
                className="ml-auto h-7 w-7"
                onClick={loadSubscriptions}
                disabled={isLoadingSubscriptions}
              >
                <RefreshCw
                  className={cn("h-3.5 w-3.5", isLoadingSubscriptions && "animate-spin")}
                />
              </Button>
            </div>

            <div className="px-2 py-2 border-b border-border">
              <Input
                placeholder="Filter..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-7 text-xs"
              />
            </div>

            {subscriptionsError && (
              <div className="px-3 py-2 text-xs text-destructive">{subscriptionsError}</div>
            )}

            <ScrollArea className="flex-1" viewportRef={subscriptionsViewportRef}>
              <div className="p-1 space-y-0.5">
                {filteredSubscriptions.map((sub) => {
                  const name = shortName(sub.name);
                  const topic = shortName(sub.topic);
                  const isSelected = selectedSubscription?.name === sub.name;

                  return (
                    <button
                      key={sub.name}
                      onClick={() => handleSelectSubscription(sub)}
                      className={cn(
                        "w-full text-left rounded-md px-2 py-2 text-xs transition-colors",
                        isSelected
                          ? "bg-sidebar-accent text-sidebar-accent-foreground"
                          : "hover:bg-muted text-foreground",
                      )}
                    >
                      <div className="font-medium truncate">{name}</div>
                      <div className="text-muted-foreground truncate text-[10px] mt-0.5">
                        {topic}
                      </div>
                    </button>
                  );
                })}

                {!isLoadingSubscriptions && filteredSubscriptions.length === 0 && (
                  <div className="px-2 py-4 text-center text-xs text-muted-foreground">
                    {search ? "No matching subscriptions" : "No subscriptions found"}
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
        </ResizablePanel>

        <ResizableHandle />

        <ResizablePanel defaultSize="85%">
          <div className="flex flex-col h-full">
            <div className="flex items-center gap-2 px-4 py-2 border-b border-border shrink-0 flex-wrap">
              {selectedSubscription ? (
                <span className="text-sm font-mono text-muted-foreground truncate max-w-xs">
                  {shortName(selectedSubscription.name)}
                </span>
              ) : (
                <span className="text-sm text-muted-foreground">No subscription selected</span>
              )}

              <div className="ml-auto flex items-center gap-2 flex-wrap">
                {lastPollError && (
                  <span className="text-xs text-destructive truncate max-w-[200px]">
                    {lastPollError}
                  </span>
                )}

                <Badge variant="secondary" className="text-xs">
                  {messages.length} messages
                </Badge>

                <Select
                  value={String(maxMessages)}
                  onValueChange={(v) => setMaxMessages(Number(v))}
                >
                  <SelectTrigger className="h-7 w-[90px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MAX_MESSAGES_OPTIONS.map((n) => (
                      <SelectItem key={n} value={String(n)} className="text-xs">
                        {n} msgs
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  value={String(pollInterval)}
                  onValueChange={(v) => setPollInterval(Number(v))}
                >
                  <SelectTrigger className="h-7 w-[72px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {POLL_INTERVALS.map(({ label, value }) => (
                      <SelectItem key={value} value={String(value)} className="text-xs">
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs px-2"
                  onClick={handleClearMessages}
                  disabled={messages.length === 0}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1" />
                  Clear
                </Button>

                <Button
                  variant={isMonitoring ? "destructive" : "default"}
                  size="sm"
                  className="h-7 text-xs px-3"
                  onClick={() => setIsMonitoring((v) => !v)}
                  disabled={!selectedSubscription}
                >
                  {isMonitoring ? (
                    <>
                      <Square className="h-3.5 w-3.5 mr-1" />
                      Stop
                    </>
                  ) : (
                    <>
                      <Play className="h-3.5 w-3.5 mr-1" />
                      Start
                    </>
                  )}
                </Button>
              </div>
            </div>

            <ScrollArea className="flex-1 p-4" viewportRef={messagesViewportRef}>
              {!selectedSubscription && (
                <div className="flex flex-col items-center justify-center h-40 text-muted-foreground text-sm gap-2">
                  <Radio className="h-8 w-8 opacity-30" />
                  <span>Select a subscription to start monitoring</span>
                </div>
              )}

              {selectedSubscription && !isMonitoring && messages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-40 text-muted-foreground text-sm gap-2">
                  <Play className="h-8 w-8 opacity-30" />
                  <span>Press Start to begin monitoring</span>
                </div>
              )}

              {selectedSubscription && isMonitoring && messages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-40 text-muted-foreground text-sm gap-2">
                  <Radio className="h-8 w-8 opacity-30 animate-pulse" />
                  <span>Waiting for messages...</span>
                </div>
              )}

              <div className="space-y-2">
                {messages.map((msg) => (
                  <MessageCard key={msg.id} msg={msg} />
                ))}
              </div>
            </ScrollArea>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
