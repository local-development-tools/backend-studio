import {useState, useEffect, useRef} from "react";
import {LogMessage} from "./LogMessage";
import {parseSSELog, type ContainerLog} from "~/lib/api/logs";
import {API_BASE_URL} from "~/lib/api/config";
import {Card, CardContent, CardHeader, CardTitle} from "../ui/card";
import {Checkbox} from "../ui/checkbox";
import {Switch} from "../ui/switch";
import {ScrollArea} from "../ui/scroll-area";
import {cn} from "~/lib/utils";
import {GripHorizontal} from "lucide-react";
import {AIHelpDialog} from "./AIHelpDialog";

interface LogConsoleProps {
  title: string;
  containerId: string;
  minHeight?: number;
  maxHeight?: number;
}

type LogLevel = ContainerLog["level"];

const LEVELS: LogLevel[] = [
  "info",
  "debug",
  "warn",
  "error",
  "trace",
  "fatal",
  "unknown",
];

const levelStyles: Record<LogLevel, string> = {
  info: "text-blue-500",
  debug: "text-muted-foreground",
  warn: "text-yellow-500",
  error: "text-red-500",
  trace: "text-purple-500",
  fatal: "text-red-700 font-bold",
  unknown: "text-gray-400",
};

export const LogConsole = ({
  title,
  containerId,
  minHeight = 120,
  maxHeight = 600,
}: LogConsoleProps) => {
  const [logs, setLogs] = useState<ContainerLog[]>([]);
  const [lineLimit, setLineLimit] = useState(30);

  const [autoScroll, setAutoScroll] = useState(true);
  const [height, setHeight] = useState(220);
  const [resizing, setResizing] = useState(false);

  const [filters, setFilters] = useState<Record<LogLevel, boolean>>({
    info: true,
    debug: true,
    warn: true,
    error: true,
    trace: true,
    fatal: true,
    unknown: true,
  });

  const viewportRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  const startYRef = useRef(0);
  const startHeightRef = useRef(0);

  // visibility observer
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => setIsVisible(entry.isIntersecting),
      {threshold: 0.1},
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // SSE
  useEffect(() => {
    if (!isVisible) return;

    setLogs([]);

    const sse = new EventSource(
      `${API_BASE_URL}/containers/logs/stream/${containerId}?lineLimit=${lineLimit}`,
    );

    sse.onmessage = (e) => {
      const parsed = parseSSELog(e.data);
      setLogs((prev) => [...prev, parsed]);
    };

    sse.onerror = (err) => {
      console.error("SSE error for", containerId, err);
    };

    return () => {
      sse.close();
    };
  }, [containerId, lineLimit, isVisible]);

  const loadMoreLogs = () => {
    setLineLimit((prev) => prev + 30);
  };

  const filteredLogs = logs.filter((log) => filters[log.level]);

  // auto scroll
  const scrollToBottom = () => {
    if (!viewportRef.current) return;
    viewportRef.current.scrollTop += viewportRef.current.scrollHeight;
  };

  useEffect(() => {
    if (!autoScroll) return;
    scrollToBottom();
  }, [filteredLogs, autoScroll]);

  // resize handling
  useEffect(() => {
    if (!resizing) return;

    document.body.style.userSelect = "none";
    document.body.style.cursor = "ns-resize";

    const onMove = (e: MouseEvent) => {
      const delta = e.clientY - startYRef.current;
      const newHeight = startHeightRef.current + delta;

      setHeight(Math.min(maxHeight, Math.max(minHeight, newHeight)));
    };

    const onUp = () => {
      setResizing(false);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);

    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
  }, [resizing, minHeight, maxHeight]);

  return (
    <Card ref={containerRef} className="overflow-hidden p-0 bg-background">
      <CardHeader className="flex justify-between items-center py-2 px-3 bg-muted">
        <CardTitle className="text-sm">{title}</CardTitle>

        <div className="flex items-center gap-4 select-none">
          <div className="flex gap-3 border-r pr-4">
            {LEVELS.map((level) => (
              <label
                key={level}
                className="flex items-center gap-1 text-xs uppercase cursor-pointer select-none"
              >
                <Checkbox
                  checked={filters[level]}
                  onCheckedChange={() =>
                    setFilters((f) => ({
                      ...f,
                      [level]: !f[level],
                    }))
                  }
                  className="h-3.5 w-3.5"
                />

                <span className={cn(levelStyles[level], "font-bold")}>
                  {level}
                </span>
              </label>
            ))}
          </div>

          <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
            <Switch checked={autoScroll} onCheckedChange={setAutoScroll} />
            Auto Scroll
          </label>

          <div className="select-none">
            <AIHelpDialog title={title} logs={logs} />
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0 relative">
        <ScrollArea style={{height}} viewportRef={viewportRef}>
          <div
            className={cn(
              "p-3 space-y-0.5 text-xs select-text",
              resizing && "select-none"
            )}
          >
            <div className="flex justify-center mb-2 select-none">
              <button
                onClick={loadMoreLogs}
                className="text-xs px-3 py-1 rounded border bg-muted hover:bg-muted/70"
              >
                Load more logs
              </button>
            </div>

            {filteredLogs.length === 0 ? (
              <p className="italic text-muted-foreground">No logs</p>
            ) : (
              filteredLogs.map((log) => (
                <LogMessage key={log.timestamp + log.raw} log={log} />
              ))
            )}
          </div>
        </ScrollArea>

        <div
          onMouseDown={(e) => {
            e.preventDefault(); // prevents text selection while resizing
            startYRef.current = e.clientY;
            startHeightRef.current = height;
            setResizing(true);
          }}
          className={cn(
            "absolute bottom-0 left-0 right-0 h-2 flex justify-center items-center cursor-ns-resize border-t bg-muted/50 hover:bg-muted select-none",
            resizing && "bg-primary/20",
          )}
        >
          <GripHorizontal className="h-3 w-3 text-muted-foreground pointer-events-none" />
        </div>
      </CardContent>
    </Card>
  );
};