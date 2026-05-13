import {DatabasesScreen} from "~/components/databases/DatabasesScreen";
import type {Route} from "./+types/db-viewer";
import {useState} from "react";

export function meta({}: Route.MetaArgs) {
  return [
    {title: "Database Viewer"},
    {name: "description", content: "Query and manage your databases"},
  ];
}

export default function DbViewer() {
  const [jsonEditOpen, setJsonEditOpen] = useState(true);

  const [jsonPayload, setJsonPayload] = useState(
    JSON.stringify({test: true}, null, 2),
  );

  const handleSave = () => {
    try {
      const parsed = JSON.parse(jsonPayload);

      // format JSON nicely on save
      const formatted = JSON.stringify(parsed, null, 2);
      setJsonPayload(formatted);

      console.log("VALID JSON:", parsed);
      console.log("FORMATTED JSON:", formatted);

      setJsonEditOpen(false); // close after save (optional)
    } catch (e) {
      console.log("Invalid JSON, not saving");
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <DatabasesScreen />

      {jsonEditOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-[600px] rounded-lg bg-background border border-border p-4">
            <div className="mb-2 font-semibold">Edit JSON</div>

            <textarea
              className="w-full h-[300px] font-mono text-sm p-2 border rounded"
              value={jsonPayload}
              onChange={(e) => setJsonPayload(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Tab") {
                  e.preventDefault();

                  const textarea = e.currentTarget;
                  const start = textarea.selectionStart;
                  const end = textarea.selectionEnd;

                  const newValue =
                    jsonPayload.substring(0, start) +
                    "  " + // 2 spaces for indentation
                    jsonPayload.substring(end);

                  setJsonPayload(newValue);

                  // restore cursor position after insert
                  setTimeout(() => {
                    textarea.selectionStart = textarea.selectionEnd = start + 2;
                  }, 0);
                }
              }}
            />

            <div className="mt-3 flex justify-end gap-2">
              <button
                className="px-3 py-1 border rounded"
                onClick={() => setJsonEditOpen(false)}
              >
                Cancel
              </button>

              <button
                className="px-3 py-1 border rounded bg-black text-white"
                onClick={handleSave}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
