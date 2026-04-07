import {Button} from "~/components/ui/button";
import type {Route} from "./+types/settings";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import {Bot, Database, FolderOpen, Loader2, Palette, TriangleAlert} from "lucide-react";
import {Input} from "~/components/ui/input";
import {Label} from "~/components/ui/label";
import {useTheme} from "~/components/theme-provider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { useEffect, useRef, useState } from "react";
import {
  getAiSettings,
  getDatabaseSettings,
  getMicroservicesRoot,
  patchAiSettings,
  patchDatabaseSettings,
  patchMicroservicesRoot,
  type AiProvider,
} from "~/lib/api/settings";
import { Badge } from "~/components/ui/badge";
import { toast } from "sonner";

export function meta({}: Route.MetaArgs) {
  return [
    {title: "New React Router App"},
    {name: "description", content: "Welcome to React Router!"},
  ];
}

export default function Settings() {
  const {theme, setTheme} = useTheme();

  const [dbHost, setDbHost] = useState("");
  const [dbPort, setDbPort] = useState("");
  const [dbName, setDbName] = useState("");
  const [dbUser, setDbUser] = useState("");
  const [dbPassword, setDbPassword] = useState("");
  const [dbConnected, setDbConnected] = useState(false);
  const [dbPasswordSet, setDbPasswordSet] = useState(false);
  const [isSavingDb, setIsSavingDb] = useState(false);

  const [microservicesPath, setMicroservicesPath] = useState("");
  const [savedPath, setSavedPath] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [restartRequired, setRestartRequired] = useState(false);
  const [aiProvider, setAiProvider] = useState<AiProvider>("openai");
  const [aiModel, setAiModel] = useState("");
  const [openAiApiKey, setOpenAiApiKey] = useState("");
  const [anthropicApiKey, setAnthropicApiKey] = useState("");
  const [lmStudioBaseUrl, setLmStudioBaseUrl] = useState("ws://host.docker.internal:1234");
  const [lmStudioModel, setLmStudioModel] = useState("llama-3.2-3b-instruct");
  const [openAiKeySet, setOpenAiKeySet] = useState(false);
  const [anthropicKeySet, setAnthropicKeySet] = useState(false);
  const [isSavingAi, setIsSavingAi] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getDatabaseSettings()
      .then((db) => {
        setDbHost(db.host ?? "host.docker.internal");
        setDbPort(db.port ? String(db.port) : "5432");
        setDbName(db.database ?? "");
        setDbUser(db.username ?? "");
        setDbConnected(db.connected);
        setDbPasswordSet(db.passwordSet);
      })
      .catch(() => {});

    getAiSettings()
      .then((ai) => {
        setAiProvider(ai.provider);
        setAiModel(ai.model ?? "");
        setLmStudioBaseUrl(ai.lmStudio.baseUrl ?? "ws://host.docker.internal:1234");
        setLmStudioModel(ai.lmStudio.model ?? "llama-3.2-3b-instruct");
        setOpenAiKeySet(ai.openAIApiKeySet);
        setAnthropicKeySet(ai.anthropicApiKeySet);
      })
      .catch(() => {});

    getMicroservicesRoot()
      .then(({path}) => {
        const val = path ?? "";
        setMicroservicesPath(val);
        setSavedPath(path);
      })
      .catch(() => {});
  }, []);

  const handleSaveDb = async () => {
    const parsedPort = Number(dbPort);
    if (!Number.isFinite(parsedPort) || parsedPort <= 0) {
      toast.error("Port must be a valid number");
      return;
    }

    setIsSavingDb(true);
    try {
      const saved = await patchDatabaseSettings({
        host: dbHost.trim(),
        port: parsedPort,
        database: dbName.trim(),
        username: dbUser.trim(),
        ...(dbPassword.trim() ? { password: dbPassword } : {}),
      });

      setDbConnected(saved.connected);
      setDbPasswordSet(saved.passwordSet);
      setDbPassword("");
      toast.success("Database settings saved");
    } catch {
      toast.error("Failed to save database settings");
    } finally {
      setIsSavingDb(false);
    }
  };

  const handleSaveAi = async () => {
    setIsSavingAi(true);
    try {
      const saved = await patchAiSettings({
        aiProvider,
        aiModel: aiModel.trim() || undefined,
        ...(aiProvider === "openai" && openAiApiKey.trim()
          ? { openAIApiKey: openAiApiKey.trim() }
          : {}),
        ...(aiProvider === "anthropic" && anthropicApiKey.trim()
          ? { anthropicApiKey: anthropicApiKey.trim() }
          : {}),
        ...(aiProvider === "lmstudio"
          ? {
              lmStudio: {
                baseUrl: lmStudioBaseUrl.trim() || undefined,
                model: lmStudioModel.trim() || undefined,
              },
            }
          : {}),
      });

      setAiProvider(saved.provider);
      setAiModel(saved.model ?? "");
      setLmStudioBaseUrl(saved.lmStudio.baseUrl ?? lmStudioBaseUrl);
      setLmStudioModel(saved.lmStudio.model ?? lmStudioModel);
      setOpenAiKeySet(saved.openAIApiKeySet);
      setAnthropicKeySet(saved.anthropicApiKeySet);
      setOpenAiApiKey("");
      setAnthropicApiKey("");
      toast.success("AI settings saved");
    } catch {
      toast.error("Failed to save AI settings");
    } finally {
      setIsSavingAi(false);
    }
  };

  const handleSavePath = async () => {
    const trimmed = microservicesPath.trim();
    if (!trimmed || trimmed === savedPath) return;

    setIsSaving(true);
    try {
      const result = await patchMicroservicesRoot(trimmed);
      setSavedPath(result.path);
      setRestartRequired(true);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col p-8 gap-4 h-full overflow-y-auto">
      <div className="flex flex-col">
        <span className="text-2xl font-bold">Settings</span>
        <span className="text-muted-foreground">
          Configure your development dashboard
        </span>
      </div>
      <div className="flex flex-wrap gap-4 w-1/2">
        <Card className="w-full">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              <CardTitle>PostgreSQL Connection</CardTitle>
            </div>
            <CardDescription>
              Configure your database connection settings
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="host">Host</Label>
                <Input
                  id="host"
                  placeholder="host.docker.internal"
                  value={dbHost}
                  onChange={(e) => setDbHost(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="port">Port</Label>
                <Input
                  id="port"
                  placeholder="5432"
                  value={dbPort}
                  onChange={(e) => setDbPort(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="database">Database</Label>
              <Input
                id="database"
                placeholder="myapp"
                value={dbName}
                onChange={(e) => setDbName(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  placeholder="postgres"
                  value={dbUser}
                  onChange={(e) => setDbUser(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={dbPassword}
                  onChange={(e) => setDbPassword(e.target.value)}
                />
              </div>
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Status: {dbConnected ? "connected" : "not connected"}</span>
              <span>Password: {dbPasswordSet ? "set" : "not set"}</span>
            </div>
            <Button className="w-full" onClick={handleSaveDb} disabled={isSavingDb}>
              {isSavingDb ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Database Settings"}
            </Button>
          </CardContent>
        </Card>

        <Card className="w-full">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bot className="h-5 w-5" />
                <CardTitle>AI Connection</CardTitle>
              </div>
            </div>
            <CardDescription>
              Configure AI provider and model settings
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="ai-provider">Provider</Label>
              <Select
                value={aiProvider}
                onValueChange={(value) => setAiProvider(value as AiProvider)}
              >
                <SelectTrigger id="ai-provider">
                  <SelectValue placeholder="Select provider" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="openai">OpenAI</SelectItem>
                  <SelectItem value="anthropic">Anthropic</SelectItem>
                  <SelectItem value="lmstudio">LM Studio</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {aiProvider === "openai" && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="openai-model">Model</Label>
                  <Input
                    id="openai-model"
                    placeholder="gpt-4o-mini"
                    value={aiModel}
                    onChange={(e) => setAiModel(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="openai-api-key">OpenAI API Key</Label>
                  <Input
                    id="openai-api-key"
                    type="password"
                    placeholder={openAiKeySet ? "********" : "sk-..."}
                    value={openAiApiKey}
                    onChange={(e) => setOpenAiApiKey(e.target.value)}
                  />
                </div>
                <div className="flex items-center justify-end text-xs text-muted-foreground">
                  <span>OpenAI API Key: {openAiKeySet ? "set" : "not set"}</span>
                </div>
              </>
            )}

            {aiProvider === "anthropic" && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="anthropic-model">Model</Label>
                  <Input
                    id="anthropic-model"
                    placeholder="claude-3-5-sonnet-latest"
                    value={aiModel}
                    onChange={(e) => setAiModel(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="anthropic-api-key">Anthropic API Key</Label>
                  <Input
                    id="anthropic-api-key"
                    type="password"
                    placeholder={anthropicKeySet ? "********" : "sk-ant-..."}
                    value={anthropicApiKey}
                    onChange={(e) => setAnthropicApiKey(e.target.value)}
                  />
                </div>
                <div className="flex items-center justify-end text-xs text-muted-foreground">
                  <span>Anthropic API Key: {anthropicKeySet ? "set" : "not set"}</span>
                </div>
              </>
            )}

            {aiProvider === "lmstudio" && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="lmstudio-base-url">LM Studio Base URL</Label>
                  <Input
                    id="lmstudio-base-url"
                    placeholder="ws://host.docker.internal:1234"
                    value={lmStudioBaseUrl}
                    onChange={(e) => setLmStudioBaseUrl(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lmstudio-model">LM Studio Model</Label>
                  <Input
                    id="lmstudio-model"
                    placeholder="llama-3.2-3b-instruct"
                    value={lmStudioModel}
                    onChange={(e) => setLmStudioModel(e.target.value)}
                  />
                </div>
              </>
            )}

            <Button className="w-full" onClick={handleSaveAi} disabled={isSavingAi}>
              {isSavingAi ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save AI Settings"}
            </Button>
          </CardContent>
        </Card>

        <Card className="w-full">
          <CardHeader>
            <div className="flex items-center gap-2">
              <FolderOpen className="h-5 w-5" />
              <CardTitle>Microservices</CardTitle>
            </div>
            <CardDescription>
              Path on the host where all microservice projects live
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="microservices-root">Microservices root folder</Label>
              <div className="flex gap-2">
                <Input
                  id="microservices-root"
                  ref={inputRef}
                  placeholder="/Users/you/Projects"
                  value={microservicesPath}
                  onChange={(e) => {
                    setMicroservicesPath(e.target.value);
                    setRestartRequired(false);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSavePath();
                  }}
                />
                <Button onClick={handleSavePath} disabled={isSaving || !microservicesPath.trim()}>
                  {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Each subdirectory name is matched against the first segment of the Docker Compose service name (e.g. <code>callisto/</code> → service <code>callisto-grpc</code>)
              </p>
            </div>
            {restartRequired && (
              <div className="flex items-center gap-2 rounded-md border border-yellow-500/50 bg-yellow-500/10 px-3 py-2 text-sm text-yellow-600 dark:text-yellow-400">
                <TriangleAlert className="h-4 w-4 shrink-0" />
                Restart containers to apply the new path (<code>docker compose down && docker compose up -d</code>)
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="w-full">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Palette className="h-5 w-5" />
              <CardTitle>UI Preferences</CardTitle>
            </div>
            <CardDescription>
              Customize the appearance of your dashboard
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Theme</Label>
                <p className="text-sm text-muted-foreground">
                  Select light, dark, or system theme
                </p>
              </div>

              <Select
                value={theme}
                onValueChange={(value) =>
                  setTheme(value as "light" | "dark" | "system")
                }
              >
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Select theme" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="light">Light</SelectItem>
                  <SelectItem value="dark">Dark</SelectItem>
                  <SelectItem value="system">System</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
