import { useState } from "react";
import { ChevronDown, CopyPlus, Loader2, TriangleAlert, X } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { cloneDatabaseToLocal, type CloneSslMode } from "~/lib/api/databases";
import { toast } from "sonner";

interface DatabaseSelectorProps {
  selectedDatabase: string;
  selectedSchema: string;
  databases: string[];
  schemas: string[];
  onDatabaseChange: (db: string) => void;
  onSchemaChange: (schema: string) => void;
  onDatabaseCloned?: (newDatabase?: string) => void;
}

export const DatabaseSelector = ({
  selectedDatabase,
  selectedSchema,
  databases,
  schemas,
  onDatabaseChange,
  onSchemaChange,
  onDatabaseCloned,
}: DatabaseSelectorProps) => {
  const [cloneOpen, setCloneOpen] = useState(false);
  const [isCloning, setIsCloning] = useState(false);
  const [cloneHost, setCloneHost] = useState("");
  const [clonePort, setClonePort] = useState("5432");
  const [cloneUser, setCloneUser] = useState("postgres");
  const [clonePassword, setClonePassword] = useState("");
  const [cloneDbName, setCloneDbName] = useState("");
  const [cloneSslMode, setCloneSslMode] = useState<CloneSslMode>("prefer");
  const [cloneError, setCloneError] = useState<string | null>(null);

  const resetCloneForm = () => {
    setCloneHost("");
    setClonePort("5432");
    setCloneUser("postgres");
    setClonePassword("");
    setCloneDbName("");
    setCloneSslMode("prefer");
    setCloneError(null);
  };

  const closeCloneModal = () => {
    setCloneOpen(false);
    setCloneError(null);
  };

  const handleClone = async () => {
    setCloneError(null);

    if (!cloneHost.trim() || !cloneUser.trim() || !clonePassword.trim() || !cloneDbName.trim()) {
      const msg = "Host, user, password and database name are required";
      setCloneError(msg);
      toast.error(msg);
      return;
    }

    const parsedPort = Number(clonePort);
    if (!Number.isFinite(parsedPort) || parsedPort <= 0) {
      const msg = "Port must be a valid number";
      setCloneError(msg);
      toast.error(msg);
      return;
    }

    setIsCloning(true);
    try {
      const result = await cloneDatabaseToLocal({
        host: cloneHost.trim(),
        port: parsedPort,
        user: cloneUser.trim(),
        password: clonePassword,
        dbname: cloneDbName.trim(),
        sslmode: cloneSslMode,
      });

      toast.success("Database cloned successfully");
      onDatabaseCloned?.(result.localDatabase);
      closeCloneModal();
      resetCloneForm();
    } catch (error) {
      console.error("Clone DB failed", error);
      const msg = error instanceof Error ? error.message : "Failed to clone database";
      setCloneError(msg);
      toast.error(msg);
    } finally {
      setIsCloning(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 py-3 px-3 border-b border-border">
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">Database</span>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1 px-2"
            onClick={() => {
              setCloneError(null);
              setCloneOpen(true);
            }}
          >
            <CopyPlus className="h-3.5 w-3.5" />
            Clone DB
          </Button>
        </div>
        <div className="flex">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                className="w-auto max-w-full gap-2 px-2.5"
                size="sm"
                title={selectedDatabase || "Select database"}
              >
                <span className="max-w-[22rem] truncate">{selectedDatabase || "Select database"}</span>
                <ChevronDown className="h-3 w-3 shrink-0" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              {databases.map((db) => (
                <DropdownMenuItem
                  key={db}
                  title={db}
                  onClick={() => onDatabaseChange(db)}
                  className={selectedDatabase === db ? "bg-accent" : ""}
                >
                  {db}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground">Schema</span>
        <div className="flex">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                className="w-auto max-w-full gap-2 px-2.5"
                size="sm"
                title={selectedSchema || "Select schema"}
              >
                <span className="max-w-[22rem] truncate">{selectedSchema || "Select schema"}</span>
                <ChevronDown className="h-3 w-3 shrink-0" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              {schemas.map((schema) => (
                <DropdownMenuItem
                  key={schema}
                  onClick={() => onSchemaChange(schema)}
                  className={selectedSchema === schema ? "bg-accent" : ""}
                >
                  {schema}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {cloneOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/80" onClick={closeCloneModal} />

          <div className="relative z-50 w-full max-w-2xl max-h-[80vh] bg-background border border-border rounded-lg shadow-lg p-6 flex flex-col gap-4 overflow-hidden">
            <div className="flex items-center justify-between border-b border-border pb-3 flex-shrink-0">
              <div>
                <h2 className="text-lg font-semibold">Clone Database</h2>
                <p className="text-sm text-muted-foreground">
                  Clone external database to your local PostgreSQL
                </p>
              </div>
              <button
                onClick={closeCloneModal}
                className="rounded-sm opacity-70 hover:opacity-100 transition-opacity"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {cloneError && (
              <div className="flex items-start gap-2 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
                <TriangleAlert className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{cloneError}</span>
              </div>
            )}

            <div className="flex-1 overflow-auto space-y-4 pr-1">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="clone-host">Source Host</Label>
                  <Input
                    id="clone-host"
                    placeholder="db.supabase.co"
                    value={cloneHost}
                    onChange={(e) => setCloneHost(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="clone-port">Source Port</Label>
                  <Input
                    id="clone-port"
                    placeholder="5432"
                    value={clonePort}
                    onChange={(e) => setClonePort(e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="clone-user">Source User</Label>
                  <Input
                    id="clone-user"
                    placeholder="postgres"
                    value={cloneUser}
                    onChange={(e) => setCloneUser(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="clone-password">Source Password</Label>
                  <Input
                    id="clone-password"
                    type="password"
                    placeholder="••••••••"
                    value={clonePassword}
                    onChange={(e) => setClonePassword(e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="clone-dbname">Source Database Name</Label>
                  <Input
                    id="clone-dbname"
                    placeholder="postgres"
                    value={cloneDbName}
                    onChange={(e) => setCloneDbName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="clone-sslmode">SSL Mode</Label>
                  <Select
                    value={cloneSslMode}
                    onValueChange={(value) => setCloneSslMode(value as CloneSslMode)}
                  >
                    <SelectTrigger id="clone-sslmode">
                      <SelectValue placeholder="Select SSL mode" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="disable">disable</SelectItem>
                      <SelectItem value="allow">allow</SelectItem>
                      <SelectItem value="prefer">prefer</SelectItem>
                      <SelectItem value="require">require</SelectItem>
                      <SelectItem value="verify-ca">verify-ca</SelectItem>
                      <SelectItem value="verify-full">verify-full</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className="flex gap-2 justify-end flex-shrink-0 border-t border-border pt-3">
              <Button variant="outline" onClick={closeCloneModal} disabled={isCloning}>
                Cancel
              </Button>
              <Button onClick={handleClone} disabled={isCloning} className="gap-2">
                {isCloning && <Loader2 className="h-4 w-4 animate-spin" />}
                Clone Database
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
