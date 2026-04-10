import {useEffect, useState} from "react";
import {
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import {cn} from "~/lib/utils";
import {Button} from "./ui/button";
import {toast} from "sonner";
import {Tabs, TabsContent, TabsList, TabsTrigger} from "./ui/tabs";
import {ContainerItem} from "./constainersBarElements/ContainerItem";
import {
  controlContainerLifecycle,
  getContainersByStack,
  getStaleContainers,
  streamContainerLifecycle,
  type ContainerDto,
  type ContainerLifecycleEvent,
  type StackNameDto,
} from "~/lib/api/containers";

export interface Container {
  id: string;
  name: string;
  status: "running" | "stopped" | "unhealthy";
  health: "healthy" | "unhealthy" | "starting" | "none";
  image: string;
}

export type ContainerStacks = Record<string, Container[]>;

//replace with container endpoint data later

interface ContainersBarProps {
  stacks: StackNameDto[];
  selectedStack: StackNameDto;
  setSelectedStack: React.Dispatch<React.SetStateAction<StackNameDto>>;
}

export const ContainersBar = ({
  stacks,
  selectedStack,
  setSelectedStack,
}: ContainersBarProps) => {
  const [expanded, setExpanded] = useState(true);

  const stackNames = stacks;
  const [currentContainers, setCurrentContainers] = useState<ContainerDto[]>([]);
  const [staleIds, setStaleIds] = useState<Set<string>>(new Set());
  const [pendingLifecycleIds, setPendingLifecycleIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!selectedStack || selectedStack.trim() === "") return;

    getContainersByStack(selectedStack).then((containers) => {
      setCurrentContainers(containers);
    });

    getStaleContainers(selectedStack)
      .then((results) => {
        setStaleIds(new Set(results.filter((r) => r.stale).map((r) => r.containerId)));
      })
      .catch(() => {});
  }, [selectedStack]);

  useEffect(() => {
    const toUiState = (state: string): ContainerDto["state"] =>
      state.toLowerCase() === "running" ? "running" : "exited";

    const isEventForSelectedStack = (event: ContainerLifecycleEvent): boolean => {
      if (!event.stack || !selectedStack) {
        return false;
      }

      return event.stack === selectedStack;
    };

    const source = streamContainerLifecycle((event) => {
      const nextState = toUiState(event.state);

      setCurrentContainers((prev) => {
        let matchedExisting = false;
        let didChange = false;

        const updated = prev.map((container) => {
          const isSameContainer =
            container.id === event.id || event.id.startsWith(container.id);

          if (!isSameContainer) {
            return container;
          }

          matchedExisting = true;

          if (container.state === nextState) {
            return container;
          }

          didChange = true;
          return {
            ...container,
            state: nextState,
          };
        });

        if (didChange) {
          return updated;
        }

        if (!matchedExisting && isEventForSelectedStack(event)) {
          return [
            ...prev,
            {
              id: event.id,
              names: event.names?.length ? event.names : [event.id],
              state: nextState,
              stack: event.stack ?? selectedStack,
            },
          ];
        }

        return prev;
      });
    });

    return () => {
      source.close();
    };
  }, [selectedStack]);

  // getContainersByStack(selectedStack)
  // .then((currentContainers) => {
  //   currentContainers = currentContainers ?? [];
  // });

  const isSameContainer = (a: string, b: string): boolean => {
    return a === b || a.startsWith(b) || b.startsWith(a);
  };

  const toUiState = (state: string): ContainerDto["state"] =>
    state.toLowerCase() === "running" ? "running" : "exited";

  const handleToggleContainerState = async (container: ContainerDto) => {
    if (pendingLifecycleIds.has(container.id)) {
      return;
    }

    const action = container.state === "running" ? "stop" : "start";

    setPendingLifecycleIds((prev) => {
      const next = new Set(prev);
      next.add(container.id);
      return next;
    });

    try {
      const result = await controlContainerLifecycle(container.id, action);
      const nextState = toUiState(result.container.state);

      setCurrentContainers((prev) =>
        prev.map((item) => {
          if (!isSameContainer(item.id, container.id)) {
            return item;
          }

          return {
            ...item,
            state: nextState,
          };
        }),
      );

      toast.success(`Container ${action} requested`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `Failed to ${action} container`);
    } finally {
      setPendingLifecycleIds((prev) => {
        const next = new Set(prev);
        next.delete(container.id);
        return next;
      });
    }
  };

  return (
    <header className="border-b border-border bg-card w-full">
      <Tabs
        value={selectedStack}
        onValueChange={setSelectedStack}
        className="w-full gap-0"
      >
        {/* Top Row: Tabs + Expand Button */}
        <div
          className={cn(
            "flex items-center",
            expanded ? "border-b border-border" : "",
          )}
        >
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setExpanded(!expanded)}
            className="m-2 h-10 w-10"
          >
            {expanded ? (
              <ChevronUp className="min-w-6 min-h-6" />
            ) : (
              <ChevronDown className="min-w-6 min-h-6" />
            )}
          </Button>
          <TabsList variant="line" className="justify-start overflow-x-auto">
            {stackNames.map((stack) => (
              <TabsTrigger key={stack} value={stack}>
                {stack}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {/* Collapsible Content */}
        {expanded && (
          <TabsContent
            value={selectedStack}
            className="mt-0 bg-muted p-3 flex flex-wrap gap-2"
          >
            {currentContainers.map((container) => (
              <ContainerItem
                key={container.id}
                container={container}
                stale={staleIds.has(container.id)}
                busy={pendingLifecycleIds.has(container.id)}
                onToggleRunningState={() => handleToggleContainerState(container)}
              />
            ))}

            {currentContainers.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No containers in this stack.
              </p>
            )}
          </TabsContent>
        )}
      </Tabs>
    </header>
  );
};
