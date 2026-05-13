import { formatSql } from "~/lib/sql/formatSql";
import {useEffect, useMemo, useState} from "react";
import {Button} from "../ui/button";
import {ScrollArea} from "../ui/scroll-area";
import {Copy, RefreshCw, Trash2, X} from "lucide-react";
import {toast} from "sonner";
import {
  deleteAiPrompt,
  getAiPromptByFileName,
  listAiPrompts,
  type AiPromptDetail,
  type AiPromptListItem,
} from "~/lib/api/ai";
 
interface PromptsSidebarProps {
  open: boolean;
  onClose: () => void;
  onPasteSql: (sql: string) => void;
  refreshToken?: number;
}

const formatTimestamp = (value: string | null): string => {
  if (!value) return "Unknown time";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
};

export const PromptsSidebar = ({
  open,
  onClose,
  onPasteSql,
  refreshToken = 0,
}: PromptsSidebarProps) => {
  const [items, setItems] = useState<AiPromptListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [detail, setDetail] = useState<AiPromptDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const selectedItem = useMemo(
    () => items.find((item) => item.fileName === selectedFile) ?? null,
    [items, selectedFile],
  );

  const loadItems = async () => {
    setLoading(true);
    try {
      const prompts = await listAiPrompts();
      setItems(prompts);
      if (prompts.length > 0) {
        const nextSelected = selectedFile && prompts.some((item) => item.fileName === selectedFile)
          ? selectedFile
          : prompts[0].fileName;
        setSelectedFile(nextSelected);
      } else {
        setSelectedFile(null);
        setDetail(null);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load prompts";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    if (!open) return;
    void loadItems();
  }, [open, refreshToken]);

  useEffect(() => {
    if (!open || !selectedFile) {
      setDetail(null);
      return;
    }

    const loadDetail = async () => {
      setDetailLoading(true);
      try {
        const promptDetail = await getAiPromptByFileName(selectedFile);
        setDetail(promptDetail);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to load prompt details";
        toast.error(message);
      } finally {
        setDetailLoading(false);
      }
    };

    void loadDetail();
  }, [open, selectedFile]);

  const isManualSave = detail?.provider === "user";
  const savedSql = detail?.sql 
    ? (isManualSave ? detail.sql : formatSql(detail.sql))
    : "";

  const handleCopySql = async () => {
    if (!savedSql) {
      toast.error("No SQL available in this prompt");
      return;
    }

    await navigator.clipboard.writeText(savedSql);
    toast.success("SQL copied");
  };

  const handlePasteSql = () => {
    if (!savedSql) {
      toast.error("No SQL available in this prompt");
      return;
    }

    onPasteSql(savedSql);
    toast.success("SQL pasted into editor");
  };

  const deletePrompt = async (fileName: string) => {
  const confirmed = window.confirm(
    "Are you sure you want to delete this prompt? This action cannot be undone."
  );

  if (!confirmed) return;

  try {
    await deleteAiPrompt(fileName);

    toast.success("Prompt deleted");

    if (selectedFile === fileName) {
      setSelectedFile(null);
      setDetail(null);
    }

    await loadItems();
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to delete prompt";

    toast.error(message);
  }
};

  if (!open) return null;

  return (
    <div className="h-full min-h-0 overflow-y-auto overflow-x-hidden flex flex-col border-l border-border bg-background">
      <div className="flex shrink-0 items-center justify-between border-b border-border p-3">
        <div>
          <h3 className="text-sm font-semibold">Prompt History</h3>
          <p className="text-xs text-muted-foreground">View saved markdown prompts and SQL</p>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon-xs" onClick={() => void loadItems()} title="Refresh">
            <RefreshCw className="h-3 w-3" />
          </Button>
          <Button variant="ghost" size="icon-xs" onClick={onClose} title="Close sidebar">
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>

      <div className="grid h-full min-h-0 grid-cols-[42%_58%]">
        <div className="min-h-0 border-r border-border">
          <ScrollArea className="h-full min-h-0">
          <div className="p-2 space-y-1">
            {loading ? (
              <p className="text-xs text-muted-foreground p-2">Loading prompts...</p>
            ) : items.length === 0 ? (
              <p className="text-xs text-muted-foreground p-2">No prompt files found yet.</p>
            ) : (
              items.map((item) => (
                <div
                  key={item.fileName}
                  className={`group relative w-full rounded-md border transition-colors ${
                    item.fileName === selectedFile
                      ? "border-primary/40 bg-primary/10"
                      : "border-border hover:bg-muted/40"
                  }`}
                >
                  <button
                    className="w-full p-2 text-left"
                    onClick={() => setSelectedFile(item.fileName)}
                  >
                    <p className="text-[0.7rem] text-muted-foreground">
                      {formatTimestamp(item.timestamp)}
                    </p>

                    <p className="mt-0.5 line-clamp-2 text-xs font-medium">
                      {item.question || "(no question)"}
                    </p>

                    <p className="mt-1 text-[0.65rem] text-muted-foreground">
                      {item.provider || "unknown"}{" "}
                      {item.model ? `- ${item.model}` : ""}
                    </p>
                  </button>

                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className={`absolute right-2 top-2 transition-opacity ${
                      item.fileName === selectedFile
                        ? "opacity-100"
                        : "opacity-0 group-hover:opacity-100"
                    }`}                    
                    onClick={(e) => {
                      e.stopPropagation();
                      void deletePrompt(item.fileName);
                    }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))
            )}
          </div>
          </ScrollArea>
        </div>

        <div className="min-h-0 flex flex-col">
          <div className="shrink-0 p-3 border-b border-border">
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Selected</p>
              <p className="text-xs truncate">{selectedItem?.fileName || "No selection"}</p>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-1">
              <Button
                variant="outline"
                size="xs"
                onClick={handleCopySql}
                className="gap-1 w-full"
              >
                <Copy className="h-3 w-3" />
                Copy SQL
              </Button>
              <Button size="xs" onClick={handlePasteSql} className="w-full">
                Paste SQL
              </Button>
            </div>
          </div>

          <ScrollArea className="h-full min-h-0">
            <div className="p-3 space-y-3">
              {detailLoading ? (
                <p className="text-xs text-muted-foreground">Loading prompt details...</p>
              ) : detail ? (
                <>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase">Question</p>
                    <p className="text-sm mt-1 whitespace-pre-wrap">{detail.question || "(none)"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase">SQL</p>
                    <pre className="mt-1 rounded border border-border bg-muted/20 p-2 text-xs whitespace-pre-wrap break-words font-mono">
                      {savedSql || "(no SQL in this entry)"}
                    </pre>
                  </div>
                  {detail.explanation && (
                    <div>
                      <p className="text-xs text-muted-foreground uppercase">Explanation</p>
                      <pre className="mt-1 rounded border border-border bg-muted/20 p-2 text-xs whitespace-pre-wrap break-words">
                        {detail.explanation}
                      </pre>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-xs text-muted-foreground">Select a prompt file to view details.</p>
              )}
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  );
};
