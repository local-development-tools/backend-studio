import { GripVertical, LayoutDashboard, LayoutGrid, Rows2 } from "lucide-react";
import { useOutletContext } from "react-router";
import { LogConsole } from "~/components/logs/LogConsole";
import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group";
import { useEffect, useRef, useState } from "react";
import { cn } from "~/lib/utils";
import {
  getContainersByStack,
  streamContainerLifecycle,
  type ContainerDto,
  type StackNameDto,
} from "~/lib/api/containers";

type LayoutContext = {
  selectedStack: StackNameDto;
};

const orderKey = (stack: string) => `logs-container-order:${stack}`;

export default function Logs() {
  const { selectedStack } = useOutletContext<LayoutContext>();
  const [currentContainers, setCurrentContainers] = useState<ContainerDto[]>([]);
  const [containerOrder, setContainerOrder] = useState<string[]>([]);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const dragItemId = useRef<string | null>(null);

  useEffect(() => {
    if (!selectedStack || selectedStack.trim() === "") return;

    getContainersByStack(selectedStack).then((containers) => {
      setCurrentContainers(containers);
    });
  }, [selectedStack]);

  // Merge newly discovered containers into the persisted order.
  useEffect(() => {
    if (!selectedStack) return;
    const saved = localStorage.getItem(orderKey(selectedStack));
    const savedOrder: string[] = saved ? JSON.parse(saved) : [];
    const allIds = currentContainers.map((c) => c.id);
    const merged = [
      ...savedOrder.filter((id) => allIds.includes(id)),
      ...allIds.filter((id) => !savedOrder.includes(id)),
    ];
    setContainerOrder(merged);
  }, [currentContainers, selectedStack]);

  // Persist order changes.
  useEffect(() => {
    if (!selectedStack || containerOrder.length === 0) return;
    localStorage.setItem(orderKey(selectedStack), JSON.stringify(containerOrder));
  }, [containerOrder, selectedStack]);

  useEffect(() => {
    const toUiState = (state: string): ContainerDto["state"] =>
      state.toLowerCase() === "running" ? "running" : "exited";

    const source = streamContainerLifecycle((event) => {
      if (!event.stack || event.stack !== selectedStack) return;

      const nextState = toUiState(event.state);

      setCurrentContainers((prev) => {
        let matchedExisting = false;
        let didChange = false;

        const updated = prev.map((container) => {
          const isSameContainer =
            container.id === event.id || event.id.startsWith(container.id);

          if (!isSameContainer) return container;

          matchedExisting = true;

          if (container.state === nextState) return container;

          didChange = true;
          return {
            ...container,
            state: nextState,
          };
        });

        if (didChange) return updated;

        if (!matchedExisting) {
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

  const orderedContainers = containerOrder
    .map((id) => currentContainers.find((c) => c.id === id))
    .filter((c): c is ContainerDto => c !== undefined && c.state === "running");

  const handleDragStart = (id: string) => {
    dragItemId.current = id;
  };

  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    setDragOverId(id);
  };

  const handleDrop = (targetId: string) => {
    const fromId = dragItemId.current;
    if (!fromId || fromId === targetId) {
      setDragOverId(null);
      return;
    }
    setContainerOrder((prev) => {
      const copy = [...prev];
      const fromIdx = copy.indexOf(fromId);
      const toIdx = copy.indexOf(targetId);
      copy.splice(fromIdx, 1);
      copy.splice(toIdx, 0, fromId);
      return copy;
    });
    dragItemId.current = null;
    setDragOverId(null);
  };

  const handleDragEnd = () => {
    dragItemId.current = null;
    setDragOverId(null);
  };

  const draggable = (container: ContainerDto) => ({
    draggable: true as const,
    onDragStart: () => handleDragStart(container.id),
    onDragOver: (e: React.DragEvent) => handleDragOver(e, container.id),
    onDrop: () => handleDrop(container.id),
    onDragEnd: handleDragEnd,
  });

  const [layout, setLayout] = useState<
    "single_column" | "grid" | "double_column"
  >("single_column");

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="flex flex-row justify-end p-2">
        <ToggleGroup
          type="single"
          value={layout}
          onValueChange={(v) => setLayout(v as any)}
        >
          <ToggleGroupItem value="single_column" className="px-2">
            <Rows2 className="min-w-6 min-h-6" />
          </ToggleGroupItem>

          <ToggleGroupItem value="grid" className="px-2">
            <LayoutGrid className="min-w-6 min-h-6" />
          </ToggleGroupItem>

          <ToggleGroupItem value="double_column" className="px-2">
            <LayoutDashboard className="min-w-6 min-h-6" />
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      <div className="flex-1 px-6">
        {layout === "single_column" && (
          <div className="flex flex-col gap-2">
            {orderedContainers.map((container) => (
              <div
                key={container.id}
                {...draggable(container)}
                className={cn(
                  "group relative transition-opacity",
                  dragOverId === container.id && dragItemId.current !== container.id && "opacity-50",
                )}
              >
                <div className="absolute left-0 top-0 bottom-0 w-5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing z-10">
                  <GripVertical className="h-4 w-4 text-muted-foreground" />
                </div>
                <LogConsole containerId={container.id} title={container.names[0]} />
              </div>
            ))}
          </div>
        )}

        {layout === "grid" && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {orderedContainers.map((container) => (
              <div
                key={container.id}
                {...draggable(container)}
                className={cn(
                  "group relative transition-opacity",
                  dragOverId === container.id && dragItemId.current !== container.id && "opacity-50",
                )}
              >
                <div className="absolute left-0 top-0 bottom-0 w-5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing z-10">
                  <GripVertical className="h-4 w-4 text-muted-foreground" />
                </div>
                <LogConsole containerId={container.id} title={container.names[0]} />
              </div>
            ))}
          </div>
        )}

        {layout === "double_column" && (
          <div className="flex">
            <div className="w-full mr-2 flex flex-col gap-2">
              {orderedContainers.filter((_, i) => i % 2 === 0).map((container) => (
                <div
                  key={container.id}
                  {...draggable(container)}
                  className={cn(
                    "group relative transition-opacity",
                    dragOverId === container.id && dragItemId.current !== container.id && "opacity-50",
                  )}
                >
                  <div className="absolute left-0 top-0 bottom-0 w-5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing z-10">
                    <GripVertical className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <LogConsole containerId={container.id} title={container.names[0]} />
                </div>
              ))}
            </div>

            <div className="w-full flex flex-col gap-2">
              {orderedContainers.filter((_, i) => i % 2 !== 0).map((container) => (
                <div
                  key={container.id}
                  {...draggable(container)}
                  className={cn(
                    "group relative transition-opacity",
                    dragOverId === container.id && dragItemId.current !== container.id && "opacity-50",
                  )}
                >
                  <div className="absolute left-0 top-0 bottom-0 w-5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing z-10">
                    <GripVertical className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <LogConsole containerId={container.id} title={container.names[0]} />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}