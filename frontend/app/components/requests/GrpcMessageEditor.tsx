import { useRef, useEffect, useCallback } from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';
import { Wand2 } from 'lucide-react';
import { Button } from '../ui/button';
import { useTheme } from '~/components/theme-provider';
import type { ReflectedMessage, ReflectedEnum } from '~/lib/api/requests/reflectGrpcServer';

interface GrpcMessageEditorProps {
  value: string;
  onChange: (value: string) => void;
  /** Fully-qualified input type name, e.g. "mypackage.HelloRequest" */
  inputTypeName?: string;
  /** All message types returned by reflection — used to build the JSON schema */
  messageTypes?: ReflectedMessage[];
  /** All enum types returned by reflection — used to populate string enum completions */
  enumTypes?: ReflectedEnum[];
}

/**
 * Converts reflected message and enum types into a draft-07 JSON Schema.
 * Enum fields become `{ "enum": ["VALUE_A", "VALUE_B"] }` so Monaco offers completions
 * for each value name as the user types inside a string.
 */
function buildJsonSchema(
  messageTypes: ReflectedMessage[],
  enumTypes: ReflectedEnum[],
  rootTypeName: string,
): object {
  const enumByName = new Map(enumTypes.map((e) => [e.name, e.values]));
  const definitions: Record<string, object> = {};

  for (const msg of messageTypes) {
    const properties: Record<string, object> = {};

    for (const field of msg.fields) {
      let fieldSchema: Record<string, unknown>;

      if (field.jsonType === 'object' && field.typeName) {
        // Nested message — use $ref
        const ref = { $ref: `#/definitions/${field.typeName}` };
        fieldSchema = field.repeated ? { type: 'array', items: ref } : ref;
      } else if (field.jsonType === 'string' && field.typeName) {
        // Enum field — emit an `enum` array so Monaco offers each value as a completion
        const values = enumByName.get(field.typeName);
        if (values && values.length > 0) {
          const enumSchema = { type: 'string', enum: values };
          fieldSchema = field.repeated ? { type: 'array', items: enumSchema } : enumSchema;
        } else {
          fieldSchema = field.repeated ? { type: 'array', items: { type: 'string' } } : { type: 'string' };
        }
      } else if (field.repeated) {
        fieldSchema = { type: 'array', items: { type: field.jsonType } };
      } else {
        fieldSchema = { type: field.jsonType };
      }

      properties[field.name] = fieldSchema;
    }

    definitions[msg.name] = {
      type: 'object',
      properties,
      additionalProperties: false,
    };
  }

  // Also register each enum as a standalone definition so nested $refs resolve correctly
  for (const en of enumTypes) {
    definitions[en.name] = { type: 'string', enum: en.values };
  }

  return {
    $schema: 'http://json-schema.org/draft-07/schema#',
    $ref: `#/definitions/${rootTypeName}`,
    definitions,
  };
}

/**
 * Unique schema URI suffix incremented per editor instance to avoid cross-editor schema leakage
 * when multiple GrpcMessageEditor instances are mounted simultaneously
 */
let schemaUriCounter = 0;

export const GrpcMessageEditor = ({
  value,
  onChange,
  inputTypeName,
  messageTypes,
  enumTypes,
}: GrpcMessageEditorProps) => {
  const { theme } = useTheme();
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);
  const monacoRef = useRef<Parameters<OnMount>[1] | null>(null);
  const modelUriRef = useRef<string>('');

  const handleMount: OnMount = useCallback((editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    const uriId = ++schemaUriCounter;
    const modelUri = `grpc-message://request-${uriId}.json`;
    modelUriRef.current = modelUri;

    const model = monaco.editor.createModel(value, 'json', monaco.Uri.parse(modelUri));
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

  // Register / update the JSON schema whenever the input type, message types, or enum types change
  useEffect(() => {
    const monaco = monacoRef.current;
    if (!monaco || !modelUriRef.current) return;

    if (inputTypeName && messageTypes && messageTypes.length > 0) {
      const rootExists = messageTypes.some((m) => m.name === inputTypeName);
      if (rootExists) {
        const schema = buildJsonSchema(messageTypes, enumTypes ?? [], inputTypeName);
        monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
          validate: true,
          schemaValidation: 'warning',
          schemas: [
            {
              uri: `http://grpc-schema/${inputTypeName}`,
              fileMatch: [modelUriRef.current],
              schema,
            },
          ],
        });
        return;
      }
    }

    // No schema available — clear any previously registered schema
    monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
      validate: true,
      schemaValidation: 'warning',
      schemas: [],
    });
  }, [inputTypeName, messageTypes, enumTypes]);

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
            suggest: { showWords: false },
            quickSuggestions: { other: true, comments: false, strings: true },
            scrollbar: { verticalScrollbarSize: 6, horizontalScrollbarSize: 6 },
            padding: { top: 8, bottom: 8 },
          }}
        />
      </div>
    </div>
  );
};
