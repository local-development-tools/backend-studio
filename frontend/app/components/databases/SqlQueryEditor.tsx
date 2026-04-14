import { useState } from "react";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";
import { BookmarkPlus, PanelRight, Play } from "lucide-react";
import { AIHelpDialog } from "./AIHelpDialog";
import { formatSql } from "~/lib/sql/formatSql";

interface SqlQueryEditorProps {
  value: string;
  onChange: (value: string) => void;
  onExecute: (query: string) => void;
  onSaveSql?: (sql: string) => void;
  onTogglePrompts?: () => void;
  isExecuting?: boolean;
  selectedSchema?: string;
}

export const SqlQueryEditor = ({
  value,
  onChange,
  onExecute,
  onSaveSql,
  onTogglePrompts,
  isExecuting = false,
  selectedSchema = "public",
}: SqlQueryEditorProps) => {
  const [aiHelpOpen, setAiHelpOpen] = useState(false);

  const handleExecute = () => {
    if (!value.trim()) return;
    onExecute(value);
  };

  const handleAIResponse = (response: string, isQuery: boolean) => {
    if (isQuery) {
      onChange(formatSql(response));
    }
    setAiHelpOpen(false);
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex flex-row items-center justify-between pb-3 border-b border-border flex-shrink-0">
        <h2 className="text-sm font-semibold">SQL Query</h2>
        <div className="flex items-center gap-2">
          <AIHelpDialog
            open={aiHelpOpen}
            onOpenChange={setAiHelpOpen}
            onResponse={handleAIResponse}
            selectedSchema={selectedSchema}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => onSaveSql?.(value)}
            disabled={!value.trim()}
            className="gap-2"
            title="Save SQL for quick reuse"
          >
            <BookmarkPlus className="h-4 w-4" />
            Save SQL
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onTogglePrompts}
            className="gap-2"
            title="Open prompt history sidebar"
          >
            <PanelRight className="h-4 w-4" />
            Prompts
          </Button>
          <Button
            size="sm"
            onClick={handleExecute}
            disabled={isExecuting || !value.trim()}
            className="gap-2"
          >
            <Play className="h-4 w-4" />
            Run Query
          </Button>
        </div>
      </div>

      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="SELECT * FROM table_name LIMIT 10;"
        className="font-mono text-sm flex-1 min-h-0 resize-none overflow-auto mt-4"
        disabled={isExecuting}
      />
    </div>
  );
};
