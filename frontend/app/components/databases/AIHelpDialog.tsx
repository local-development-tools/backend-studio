import { useState } from "react";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";
import { Copy, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { generateSqlWithAi } from "~/lib/api/ai";

interface AIHelpDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onResponse: (response: string, isQuery: boolean) => void;
  /** PostgreSQL schema whose tables are included in the AI prompt */
  selectedSchema?: string;
}

const toSqlCommentBlock = (text: string) =>
  text
    .split(/\r?\n/)
    .map((line) => (line.trim() ? `-- ${line}` : "--"))
    .join("\n");

export const AIHelpDialog = ({
  open,
  onOpenChange,
  onResponse,
  selectedSchema = "public",
}: AIHelpDialogProps) => {
  const [prompt, setPrompt] = useState("");
  const [response, setResponse] = useState<string | null>(null);
  const [responseType, setResponseType] = useState<"query" | "explanation" | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!prompt.trim()) return;

    setLoading(true);
    try {
      const ai = await generateSqlWithAi({
        question: prompt.trim(),
        schema: selectedSchema,
      });

      if (ai.sql?.trim()) {
        setResponse(ai.sql);
        setResponseType("query");
      } else {
        setResponse(ai.explanation?.trim() || "AI could not generate a SQL query for this request.");
        setResponseType("explanation");
      }
    } catch (error) {
      console.error("AI Help error:", error);
      const message = error instanceof Error ? error.message : "Failed to generate SQL";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const handleUseResponse = () => {
    if (response) {
      onResponse(response, responseType === "query");
    }
  };

  const handlePasteAsComment = () => {
    if (!response || responseType !== "explanation") return;
    onResponse(toSqlCommentBlock(response), true);
  };

  const handleRewritePrompt = () => {
    setResponse(null);
    setResponseType(null);
  };

  const handleCopyResponse = () => {
    if (response) {
      navigator.clipboard.writeText(response);
      toast.success("Copied to clipboard");
    }
  };

  const handleReset = () => {
    setPrompt("");
    setResponse(null);
    setResponseType(null);
  };

  const handleClose = () => {
    handleReset();
    onOpenChange(false);
  };

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onOpenChange(true)}
        className="gap-2"
        title="AI Help - Get query suggestions"
      >
        <Sparkles className="h-4 w-4" />
        AI Help
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/80" onClick={handleClose} />

          <div className="relative z-50 w-full max-w-2xl max-h-[80vh] bg-background border border-border rounded-lg shadow-lg p-6 flex flex-col gap-4 overflow-hidden">
            <div className="flex items-center justify-between border-b border-border pb-3 flex-shrink-0">
              <div>
                <h2 className="text-lg font-semibold">AI SQL Helper</h2>
                <p className="text-sm text-muted-foreground">
                  Ask for help with SQL queries or database explanations
                </p>
              </div>
              <button
                onClick={handleClose}
                className="rounded-sm opacity-70 hover:opacity-100 transition-opacity"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 flex flex-col gap-4 overflow-hidden">
              {!response ? (
                <>
                  <div className="flex-1 flex flex-col gap-2 overflow-hidden">
                    <label className="text-sm font-medium flex-shrink-0">Your request</label>
                    <Textarea
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      placeholder="e.g., Show me a query to find all users created in the last 7 days..."
                      className="flex-1 resize-none font-mono text-sm overflow-auto"
                      disabled={loading}
                    />
                  </div>

                  <div className="flex gap-2 justify-end flex-shrink-0">
                    <Button
                      variant="outline"
                      onClick={handleClose}
                      disabled={loading}
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={handleSubmit}
                      disabled={loading || !prompt.trim()}
                      className="gap-2"
                    >
                      <Sparkles className="h-4 w-4" />
                      {loading ? "Generating..." : "Get Help"}
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2 justify-between pb-2 border-b border-border flex-shrink-0">
                    <span className="text-xs font-medium text-muted-foreground">
                      {responseType === "query" ? "SQL Query" : "Explanation"}
                    </span>
                    <Button variant="ghost" size="sm" onClick={handleReset}>
                      New Request
                    </Button>
                  </div>

                  <div className="flex-1 overflow-auto bg-muted/20 rounded p-4 border border-border">
                    <pre className="font-mono text-sm whitespace-pre-wrap break-words">{response}</pre>
                  </div>

                  <div className="flex gap-2 justify-end flex-shrink-0">
                    <Button variant="outline" onClick={handleCopyResponse} className="gap-2">
                      <Copy className="h-4 w-4" />
                      Copy
                    </Button>
                    {responseType === "query" ? (
                      <Button onClick={handleUseResponse} className="gap-2">
                        <Sparkles className="h-4 w-4" />
                        Use in Editor
                      </Button>
                    ) : (
                      <>
                        <Button variant="outline" onClick={handleRewritePrompt}>
                          Rewrite Prompt
                        </Button>
                        <Button onClick={handlePasteAsComment}>
                          Paste as Comment
                        </Button>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};