import {useMemo, useState} from "react";
import {Sparkles, X} from "lucide-react";
import {Button} from "../ui/button";
import {toast} from "sonner";
import {analyzeLogsWithAi, type AnalyzeLogsResponse} from "~/lib/api/ai";
import type {ContainerLog} from "~/lib/api/logs";
import {Checkbox} from "../ui/checkbox";

interface AIHelpDialogProps {
  title: string;
  logs: ContainerLog[];
}

export const AIHelpDialog = ({title, logs}: AIHelpDialogProps) => {
  const [open, setOpen] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalyzeLogsResponse | null>(null);
  const [showErrorsOnly, setShowErrorsOnly] = useState(false);
  const [selectedIndexes, setSelectedIndexes] = useState<Set<number>>(new Set());

  const visibleIndexes = useMemo(
    () => logs
      .map((log, index) => ({log, index}))
      .filter(({log}) => !showErrorsOnly || log.level === "error" || log.level === "fatal")
      .map(({index}) => index),
    [logs, showErrorsOnly],
  );

  const selectedLogs = useMemo(
    () => Array.from(selectedIndexes).sort((a, b) => a - b).map((index) => logs[index]).filter(Boolean),
    [logs, selectedIndexes],
  );

  const visibleLogs = useMemo(
    () => visibleIndexes.map((index) => logs[index]),
    [logs, visibleIndexes],
  );

  const logsToAnalyze = selectedLogs.length > 0 ? selectedLogs : visibleLogs;

  const handleAnalyzeLogs = async () => {
    if (logsToAnalyze.length === 0) {
      toast.error("No logs available to analyze yet");
      return;
    }

    setAnalyzing(true);

    try {
      const logPayload = logsToAnalyze.map((log) => {
        if (log.raw?.trim()) {
          return log.raw;
        }

        if (typeof log.message === "string") {
          return log.message;
        }

        return JSON.stringify(log.message);
      });

      const result = await analyzeLogsWithAi({logs: logPayload});
      setAnalysisResult(result);
    } catch (error) {
      console.error("AI logs analysis error:", error);
      const message = error instanceof Error ? error.message : "Failed to analyze logs";
      toast.error(message);
    } finally {
      setAnalyzing(false);
    }
  };

  const openDialog = () => {
    setOpen(true);
    setAnalysisResult(null);
    setSelectedIndexes(new Set());
  };

  const closeDialog = () => {
    setOpen(false);
  };

  const toggleSelection = (index: number) => {
    setSelectedIndexes((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const clearSelection = () => {
    setSelectedIndexes(new Set());
  };

  const selectVisible = () => {
    setSelectedIndexes((prev) => {
      const next = new Set(prev);
      visibleIndexes.forEach((index) => next.add(index));
      return next;
    });
  };

  const selectErrors = () => {
    setSelectedIndexes((prev) => {
      const next = new Set(prev);
      logs.forEach((log, index) => {
        if (log.level === "error" || log.level === "fatal") {
          next.add(index);
        }
      });
      return next;
    });
  };

  const selectedVisibleCount = visibleIndexes.filter((index) => selectedIndexes.has(index)).length;

  const logText = (log: ContainerLog) => (log.raw?.trim() ? log.raw : String(log.message));

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="h-7 px-2 text-xs gap-1"
        onClick={openDialog}
        title="AI Help - Analyze container logs"
      >
        <Sparkles className="h-3.5 w-3.5" />
        AI Help
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/80" onClick={closeDialog} />

          <div className="relative z-50 w-full max-w-3xl max-h-[85vh] bg-background border border-border rounded-lg shadow-lg p-6 flex flex-col gap-4 overflow-hidden">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div>
                <h2 className="text-lg font-semibold">AI Logs Helper</h2>
                <p className="text-sm text-muted-foreground">Analyze recent logs for {title}</p>
              </div>
              <button
                onClick={closeDialog}
                className="rounded-sm opacity-70 hover:opacity-100 transition-opacity"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {!analysisResult ? (
              <div className="flex-1 flex flex-col gap-4 overflow-hidden">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <label className="inline-flex items-center gap-2 rounded border px-2 py-1 cursor-pointer">
                    <Checkbox checked={showErrorsOnly} onCheckedChange={() => setShowErrorsOnly((v) => !v)} />
                    Show errors only
                  </label>

                  <button
                    onClick={selectVisible}
                    className="px-2 py-1 rounded border bg-muted hover:bg-muted/70"
                    type="button"
                  >
                    Select Visible
                  </button>
                  <button
                    onClick={selectErrors}
                    className="px-2 py-1 rounded border bg-muted hover:bg-muted/70"
                    type="button"
                  >
                    Select Errors
                  </button>
                  <button
                    onClick={clearSelection}
                    className="px-2 py-1 rounded border bg-muted hover:bg-muted/70"
                    type="button"
                    disabled={selectedIndexes.size === 0}
                  >
                    Clear
                  </button>
                </div>

                <div className="text-sm text-muted-foreground">
                  {selectedLogs.length > 0
                    ? `Will analyze ${selectedLogs.length} selected log entries.`
                    : `No logs selected. Will analyze ${visibleLogs.length} visible log entries.`}
                </div>

                <div className="text-xs text-muted-foreground">
                  Selected in view: {selectedVisibleCount} / {visibleIndexes.length}
                </div>

                <div className="bg-muted/20 border border-border rounded p-3 text-xs font-mono overflow-auto space-y-1">
                  {visibleIndexes.length === 0 ? (
                    <div>No logs match current filters.</div>
                  ) : (
                    visibleIndexes.slice(-60).map((index) => {
                      const log = logs[index];
                      return (
                        <label key={`${log.timestamp}-${index}`} className="flex items-start gap-2 cursor-pointer">
                          <Checkbox
                            checked={selectedIndexes.has(index)}
                            onCheckedChange={() => toggleSelection(index)}
                            className="mt-0.5"
                          />
                          <span className="uppercase min-w-14 text-muted-foreground">[{log.level}]</span>
                          <span className="break-all whitespace-pre-wrap">{logText(log)}</span>
                        </label>
                      );
                    })
                  )}
                </div>

                <div className="flex gap-2 justify-end">
                  <Button variant="outline" onClick={closeDialog} disabled={analyzing}>
                    Close
                  </Button>
                  <Button onClick={handleAnalyzeLogs} disabled={analyzing || logsToAnalyze.length === 0} className="gap-2">
                    <Sparkles className="h-4 w-4" />
                    {analyzing
                      ? "Analyzing..."
                      : selectedLogs.length > 0
                        ? "Analyze Selected Logs"
                        : "Analyze Visible Logs"}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex-1 overflow-auto space-y-4 pr-1">
                <div className="rounded border border-border bg-muted/20 p-3">
                  <div className="text-xs text-muted-foreground uppercase">Severity</div>
                  <div className="text-sm font-semibold mt-1">{analysisResult.severity}</div>
                </div>

                <div>
                  <div className="text-xs text-muted-foreground uppercase mb-1">Summary</div>
                  <p className="text-sm">{analysisResult.summary}</p>
                </div>

                <div>
                  <div className="text-xs text-muted-foreground uppercase mb-1">Probable Cause</div>
                  <p className="text-sm">{analysisResult.probableCause}</p>
                </div>

                {analysisResult.affectedComponent && (
                  <div>
                    <div className="text-xs text-muted-foreground uppercase mb-1">Affected Component</div>
                    <p className="text-sm">{analysisResult.affectedComponent}</p>
                  </div>
                )}

                <div>
                  <div className="text-xs text-muted-foreground uppercase mb-1">Immediate Actions</div>
                  <ul className="list-disc pl-5 text-sm space-y-1">
                    {analysisResult.immediateActions.map((action, index) => (
                      <li key={`immediate-${index}`}>{action}</li>
                    ))}
                  </ul>
                </div>

                <div>
                  <div className="text-xs text-muted-foreground uppercase mb-1">Prevention Actions</div>
                  <ul className="list-disc pl-5 text-sm space-y-1">
                    {analysisResult.preventionActions.map((action, index) => (
                      <li key={`prevention-${index}`}>{action}</li>
                    ))}
                  </ul>
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-border">
                  <Button variant="outline" onClick={() => setAnalysisResult(null)}>
                    Analyze Again
                  </Button>
                  <Button onClick={closeDialog}>Done</Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};
