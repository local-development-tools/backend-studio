import { useRef, useEffect, useCallback } from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';
import { Copy, Check } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../ui/button';
import { useTheme } from '~/components/theme-provider';

interface ResponseBodyViewerProps {
  body: string;
}

/** Attempts to pretty-print a JSON string; returns the original string if it is not valid JSON */
function tryFormatJson(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

/** Returns true if the string looks like JSON (object or array) */
function looksLikeJson(raw: string): boolean {
  const trimmed = raw.trimStart();
  return trimmed.startsWith('{') || trimmed.startsWith('[');
}

let viewerCounter = 0;

export const ResponseBodyViewer = ({ body }: ResponseBodyViewerProps) => {
  const { theme } = useTheme();
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);
  const [copied, setCopied] = useState(false);

  const isJson = looksLikeJson(body);
  const displayContent = isJson ? tryFormatJson(body) : body;
  const language = isJson ? 'json' : 'plaintext';

  const handleMount: OnMount = useCallback(
    (editor, monaco) => {
      editorRef.current = editor;

      const uriId = ++viewerCounter;
      const modelUri = `grpc-response://body-${uriId}.json`;
      const model = monaco.editor.createModel(displayContent, language, monaco.Uri.parse(modelUri));
      editor.setModel(model);
    },
    // displayContent intentionally excluded — model is set once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // Sync content when body prop changes (new request/response cycle)
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const model = editor.getModel();
    if (!model) return;
    if (model.getValue() !== displayContent) {
      model.pushEditOperations([], [{ range: model.getFullModelRange(), text: displayContent }], () => null);
    }
  }, [displayContent]);

  const resolvedTheme =
    theme === 'system'
      ? typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : theme;

  const monacoTheme = resolvedTheme === 'dark' ? 'vs-dark' : 'light';

  useEffect(() => {
    editorRef.current?.updateOptions({ theme: monacoTheme });
  }, [monacoTheme]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(body).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [body]);

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center justify-end px-2 py-0.5 shrink-0">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleCopy}
          className="h-5 px-2 gap-1 text-[10px] text-muted-foreground hover:text-foreground"
          title="Copy body"
        >
          {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        <Editor
          defaultLanguage={language}
          defaultValue={displayContent}
          theme={monacoTheme}
          onMount={handleMount}
          options={{
            readOnly: true,
            minimap: { enabled: false },
            fontSize: 12,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
            lineNumbers: 'off',
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            tabSize: 2,
            automaticLayout: true,
            folding: true,
            foldingHighlight: true,
            showFoldingControls: 'always',
            scrollbar: { verticalScrollbarSize: 6, horizontalScrollbarSize: 6 },
            padding: { top: 4, bottom: 4 },
            renderLineHighlight: 'none',
            selectionHighlight: false,
            occurrencesHighlight: 'off',
            overviewRulerLanes: 0,
            hideCursorInOverviewRuler: true,
            contextmenu: false,
          }}
        />
      </div>
    </div>
  );
};
