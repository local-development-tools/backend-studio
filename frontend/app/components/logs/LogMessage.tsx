import type {ReactNode} from "react";
import {cn} from "~/lib/utils";
import type {ContainerLog} from "~/lib/api/logs";

export type LogLevel = ContainerLog["level"];

interface LogMessageProps {
  log: ContainerLog;
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return String(v);
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function renderMessage(msg: ContainerLog["message"]): ReactNode {
  if (typeof msg === "string") return <span>{msg}</span>;

  if (Array.isArray(msg)) {
    return <span className="whitespace-pre-wrap">{msg.join("\n")}</span>;
  }

  const {message, name, ...rest} = msg as Record<string, unknown>;
  const fields = Object.entries(rest);

  return (
    <span className="break-all">
      {message != null && (
        <span className="mr-2">{String(message)}</span>
      )}
      {name != null && (
        <span className="text-muted-foreground/60 mr-2">
          <span>name=</span>
          <span>{String(name)}</span>
        </span>
      )}
      {fields.map(([k, v]) => (
        <span key={k} className="text-muted-foreground mr-2">
          <span>{k}=</span>
          <span>{formatValue(v)}</span>
        </span>
      ))}
    </span>
  );
}

export const LogMessage = ({log}: LogMessageProps) => {
  const levelColors: Record<LogLevel, string> = {
    info: "text-blue-500",
    debug: "text-muted-foreground",
    warn: "text-yellow-500",
    error: "text-red-500",
    trace: "text-purple-500",
    fatal: "text-red-700 font-bold",
    unknown: "text-gray-400",
  };

  const formattedTime = new Date(log.timestamp).toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3,
  });

  return (
    <div className="flex gap-2 font-mono text-xs hover:bg-muted/70 px-1 rounded">
      <span className="text-muted-foreground shrink-0">{formattedTime}</span>

      <span className={cn("uppercase w-16 inline-block shrink-0", levelColors[log.level])}>
        [{log.level}]
      </span>

      {renderMessage(log.message)}
    </div>
  );
};
