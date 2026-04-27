import { useState, useRef, useEffect, useCallback, useMemo, type ComponentType } from "react";
import type { EditorProps, OnMount } from "@monaco-editor/react";
import type * as Monaco from "monaco-editor";
import { Button } from "../ui/button";
import { BookmarkPlus, PanelRight, Play } from "lucide-react";
import { AIHelpDialog } from "./AIHelpDialog";
import { formatSql } from "~/lib/sql/formatSql";
import { inferCompletionScope } from "~/lib/sql/inferCompletionScope";
import { useTheme } from "~/components/theme-provider";

const SQL_MODEL_URI = "inmemory://db-viewer/query.sql";

export interface SqlCompletionContext {
  schema: string;
  tableNames: string[];
  columnNames?: string[];
}

interface SqlQueryEditorProps {
  value: string;
  onChange: (value: string) => void;
  onExecute: (query: string) => void;
  onSaveSql?: (sql: string) => void;
  onTogglePrompts?: () => void;
  isExecuting?: boolean;
  selectedSchema?: string;
  completionContext?: SqlCompletionContext;
}

function quotePgIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

export const SqlQueryEditor = ({
  value,
  onChange,
  onExecute,
  onSaveSql,
  onTogglePrompts,
  isExecuting = false,
  selectedSchema = "public",
  completionContext,
}: SqlQueryEditorProps) => {
  const { theme } = useTheme();
  const [monacoEditor, setMonacoEditor] = useState<ComponentType<EditorProps> | null>(null);
  const [aiHelpOpen, setAiHelpOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void import("@monaco-editor/react")
      .then((mod) => {
        if (cancelled) return;
        // Named export is memo(); typeof is "object", not "function"
        const Comp = mod.Editor ?? mod.default;
        if (Comp != null) {
          setMonacoEditor(() => Comp as ComponentType<EditorProps>);
        }
      })
      .catch((err) => {
        console.error("Failed to load @monaco-editor/react", err);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);
  const monacoRef = useRef<Parameters<OnMount>[1] | null>(null);
  const completionDisposableRef = useRef<{ dispose: () => void } | null>(null);
  const completionContextRef = useRef<SqlCompletionContext>({
    schema: selectedSchema,
    tableNames: [],
    columnNames: [],
  });
  const onExecuteRef = useRef(onExecute);
  const isExecutingRef = useRef(isExecuting);

  useEffect(() => {
    onExecuteRef.current = onExecute;
  }, [onExecute]);

  useEffect(() => {
    isExecutingRef.current = isExecuting;
  }, [isExecuting]);

  const fallbackCompletionContext = useMemo(
    () => ({
      schema: selectedSchema,
      tableNames: [] as string[],
      columnNames: [] as string[],
    }),
    [selectedSchema],
  );

  const ctx = completionContext ?? fallbackCompletionContext;

  useEffect(() => {
    completionContextRef.current = {
      schema: ctx.schema,
      tableNames: ctx.tableNames,
      columnNames: ctx.columnNames ?? [],
    };
  }, [ctx.schema, ctx.tableNames, ctx.columnNames]);

  const handleExecute = useCallback(() => {
    const text = editorRef.current?.getModel()?.getValue() ?? value;
    if (!text.trim()) return;
    onExecute(text);
  }, [onExecute, value]);

  const handleAIResponse = (response: string, isQuery: boolean) => {
    if (isQuery) {
      onChange(formatSql(response));
    }
    setAiHelpOpen(false);
  };

  const resolvedTheme =
    theme === "system"
      ? typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : theme;

  const monacoTheme = resolvedTheme === "dark" ? "vs-dark" : "light";

  useEffect(() => {
    monacoRef.current?.editor.setTheme(monacoTheme);
  }, [monacoTheme]);

  useEffect(() => {
    editorRef.current?.updateOptions({ readOnly: isExecuting });
  }, [isExecuting]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const model = editor.getModel();
    if (model && model.getValue() !== value) {
      model.pushEditOperations(
        [],
        [{ range: model.getFullModelRange(), text: value }],
        () => null,
      );
    }
  }, [value]);

  useEffect(() => {
    return () => {
      completionDisposableRef.current?.dispose();
      completionDisposableRef.current = null;
    };
  }, []);

  const handleMount: OnMount = useCallback(
    (editor, monaco) => {
      editorRef.current = editor;
      monacoRef.current = monaco;

      const model =
        monaco.editor.getModel(monaco.Uri.parse(SQL_MODEL_URI)) ??
        monaco.editor.createModel(value, "sql", monaco.Uri.parse(SQL_MODEL_URI));
      model.setValue(value);
      editor.setModel(model);

      completionDisposableRef.current?.dispose();
      completionDisposableRef.current = monaco.languages.registerCompletionItemProvider("sql", {
        triggerCharacters: ['"', "."],
        provideCompletionItems: (
          model: Monaco.editor.ITextModel,
          position: Monaco.Position,
        ): Monaco.languages.ProviderResult<Monaco.languages.CompletionList> => {
          const textBefore = model.getValueInRange(
            new monaco.Range(1, 1, position.lineNumber, position.column),
          );
          const scope = inferCompletionScope(textBefore);

          const word = model.getWordUntilPosition(position);
          const replaceRange: Monaco.IRange = {
            startLineNumber: position.lineNumber,
            startColumn: word.startColumn,
            endLineNumber: position.lineNumber,
            endColumn: word.endColumn,
          };

          const { schema, tableNames, columnNames = [] } = completionContextRef.current;
          const suggestions: Monaco.languages.CompletionItem[] = [];
          const seen = new Set<string>();

          const includeTables = scope === "tables" || scope === "both";
          const includeColumns = scope === "columns" || scope === "both";

          if (includeTables) {
            for (const name of tableNames) {
              const quoted = quotePgIdent(name);
              const qualified =
                schema && schema.length > 0
                  ? `${quotePgIdent(schema)}.${quoted}`
                  : quoted;

              if (!seen.has(qualified)) {
                seen.add(qualified);
                suggestions.push({
                  label: qualified,
                  kind: monaco.languages.CompletionItemKind.Class,
                  insertText: qualified,
                  detail: "Table",
                  sortText: `0_${qualified}`,
                  range: replaceRange,
                });
              }
              if (!seen.has(name)) {
                seen.add(name);
                suggestions.push({
                  label: name,
                  kind: monaco.languages.CompletionItemKind.Class,
                  insertText: quoted,
                  detail: "Table",
                  sortText: `0_${name}`,
                  range: replaceRange,
                });
              }
            }
          }

          if (includeColumns) {
            for (const col of columnNames) {
              const quotedCol = quotePgIdent(col);
              if (!seen.has(`col:${col}`)) {
                seen.add(`col:${col}`);
                suggestions.push({
                  label: col,
                  kind: monaco.languages.CompletionItemKind.Field,
                  insertText: quotedCol,
                  detail: "Column",
                  sortText: `1_${col}`,
                  range: replaceRange,
                });
              }
            }
          }

          return { suggestions };
        },
      });

      editor.updateOptions({ readOnly: isExecutingRef.current });

      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
        const text = editor.getModel()?.getValue() ?? "";
        if (!text.trim() || isExecutingRef.current) return;
        onExecuteRef.current(text);
      });

      editor.focus();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount once; context via ref
    [],
  );

  const MonacoSqlEditor = monacoEditor;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex flex-shrink-0 flex-row items-center justify-between border-b border-border pb-3">
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
            title="Run query (⌘/Ctrl+Enter)"
          >
            <Play className="h-4 w-4" />
            Run Query
          </Button>
        </div>
      </div>

      <div className="mt-4 flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-border">
        {MonacoSqlEditor ? (
          <MonacoSqlEditor
            defaultLanguage="sql"
            height="100%"
            theme={monacoTheme}
            onMount={handleMount}
            onChange={(v) => onChange(v ?? "")}
            options={{
              minimap: { enabled: false },
              fontSize: 13,
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
              lineNumbers: "on",
              scrollBeyondLastLine: false,
              wordWrap: "on",
              tabSize: 2,
              automaticLayout: true,
              readOnly: isExecuting,
              scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 },
              padding: { top: 8, bottom: 8 },
              suggest: { showKeywords: true, showSnippets: false },
              quickSuggestions: { strings: true, comments: false, other: true },
            }}
          />
        ) : (
          <div className="flex min-h-[12rem] flex-1 items-center justify-center bg-muted/20 text-xs text-muted-foreground">
            Loading editor…
          </div>
        )}
      </div>
    </div>
  );
};
