import {useState} from "react";
import {Sparkles, X} from "lucide-react";
import {Button} from "../ui/button";
import {toast} from "sonner";
import {analyzeLogsWithAi, type AnalyzeLogsResponse} from "~/lib/api/ai";
import type {ContainerLog} from "~/lib/api/logs";

interface AIHelpDialogProps {
  title: string;
  logs: ContainerLog[];
}

export const AIHelpDialog = ({title, logs}: AIHelpDialogProps) => {
  const [open, setOpen] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalyzeLogsResponse | null>(null);

  const handleAnalyzeLogs = async () => {
    if (logs.length === 0) {
      toast.error("No logs available to analyze yet");
      return;
    }

    setAnalyzing(true);

    try {
      const logPayload = logs.map((log) => {
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
  };

  const closeDialog = () => {
    setOpen(false);
  };

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
                <div className="text-sm text-muted-foreground">
                  Analyze the latest {logs.length} log entries from this container.
                </div>

                <div className="bg-muted/20 border border-border rounded p-3 text-xs font-mono whitespace-pre-wrap overflow-auto">
                  {logs.length === 0
                    ? "No logs captured yet. Wait for logs to stream and try again."
                    : logs
                        .slice(-20)
                        .map((log) => (log.raw?.trim() ? log.raw : String(log.message)))
                        .join("\n")}
                </div>

                <div className="flex gap-2 justify-end">
                  <Button variant="outline" onClick={closeDialog} disabled={analyzing}>
                    Close
                  </Button>
                  <Button onClick={handleAnalyzeLogs} disabled={analyzing || logs.length === 0} className="gap-2">
                    <Sparkles className="h-4 w-4" />
                    {analyzing ? "Analyzing..." : "Analyze Logs"}
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
