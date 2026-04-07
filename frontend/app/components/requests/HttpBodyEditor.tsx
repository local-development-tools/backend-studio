import { useRef, useEffect, useCallback } from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';
import { Wand2 } from 'lucide-react';
import { Button } from '../ui/button';
import { useTheme } from '~/components/theme-provider';

interface HttpBodyEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export const HttpBodyEditor = ({ value, onChange, placeholder }: HttpBodyEditorProps) => {
  const { theme } = useTheme();
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);
  const monacoRef = useRef<Parameters<OnMount>[1] | null>(null);

  const handleMount: OnMount = useCallback((editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    const model = monaco.editor.createModel(value, 'json');
    editor.setModel(model);

    monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
      validate: true,
      schemaValidation: 'warning',
      schemas: [],
    });

    editor.focus();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the model content in sync when value changes externally
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const model = editor.getModel();
    if (model && model.getValue() !== value) {
      model.pushEditOperations([], [{ range: model.getFullModelRange(), text: value }], () => null);
    }
  }, [value]);

  const handleFormat = useCallback(() => {
    editorRef.current?.getAction('editor.action.formatDocument')?.run();
  }, []);

  const resolvedTheme =
    theme === 'system'
      ? typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : theme;

  const monacoTheme = resolvedTheme === 'dark' ? 'vs-dark' : 'light';

  // Sync Monaco theme whenever the app theme changes
  useEffect(() => {
    monacoRef.current?.editor.setTheme(monacoTheme);
  }, [monacoTheme]);

  return (
    <div className="flex flex-col h-full gap-1.5 min-h-0">
      <div className="flex items-center justify-end gap-1 shrink-0">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleFormat}
          className="h-5 px-2 gap-1 text-[10px] text-muted-foreground hover:text-foreground"
          title="Format JSON"
        >
          <Wand2 className="h-3 w-3" />
          Format
        </Button>
      </div>
      <div className="flex-1 min-h-0 rounded-md border border-border overflow-hidden">
        <Editor
          defaultLanguage="json"
          defaultValue={value}
          theme={monacoTheme}
          onMount={handleMount}
          onChange={(v) => onChange(v ?? '')}
          options={{
            minimap: { enabled: false },
            fontSize: 12,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
            lineNumbers: 'off',
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            tabSize: 2,
            automaticLayout: true,
            scrollbar: { verticalScrollbarSize: 6, horizontalScrollbarSize: 6 },
            padding: { top: 8, bottom: 8 },
          }}
        />
      </div>
    </div>
  );
};
