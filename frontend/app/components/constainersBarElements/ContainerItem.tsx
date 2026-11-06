import { Loader2, Play, Square } from "lucide-react";
import { cn } from "~/lib/utils";
import type { ContainerDto } from "~/lib/api/containers";
import { Button } from "~/components/ui/button";

const StatusDot = ({ state }: { state: ContainerDto["state"] }) => {
  const colors = {
    running: "bg-green-500",
    exited: "bg-gray-500",
  };

  return (
    <div className={cn("h-2 w-2 rounded-full shrink-0", colors[state])} />
  );
};

interface ContainerItemProps {
  container: ContainerDto;
  busy?: boolean;
  onToggleRunningState: () => void;
}

function stripStackPrefix(name: string, stack: string): string {
  const stripped = name.startsWith("/") ? name.slice(1) : name;
  const prefix = `${stack}-`;
  return stripped.startsWith(prefix) ? stripped.slice(prefix.length) : stripped;
}

export const ContainerItem = ({
  container,
  busy = false,
  onToggleRunningState,
}: ContainerItemProps) => {
  const displayName = stripStackPrefix(container.names[0], container.stack);
  const isRunning = container.state === "running";

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-lg border px-3 py-2 bg-card",
        container.state === "exited" && "opacity-60",
      )}
    >
      <StatusDot state={container.state} />
      <div className="min-w-0">
        <p className="text-sm font-medium truncate">{displayName}</p>
      </div>

      <Button
        type="button"
        size="xs"
        variant={isRunning ? "destructive" : "secondary"}
        className="ml-auto"
        disabled={busy}
        onClick={onToggleRunningState}
      >
        {busy ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : isRunning ? (
          <Square className="h-3.5 w-3.5" />
        ) : (
          <Play className="h-3.5 w-3.5" />
        )}
      </Button>
    </div>
  );
};
