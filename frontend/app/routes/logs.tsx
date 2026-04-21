import {GripVertical, LayoutDashboard, LayoutGrid, Rows2} from "lucide-react";
import {useOutletContext} from "react-router";
import {LogConsole} from "~/components/logs/LogConsole";
import {ToggleGroup, ToggleGroupItem} from "~/components/ui/toggle-group";
import {useEffect, useRef, useState} from "react";
import {cn} from "~/lib/utils";
import {
  getContainersByStack,
  getContainersWithoutStack,
  streamContainerLifecycle,
  type ContainerDto,
  type StackNameDto,
} from "~/lib/api/containers";

const OTHER_STACK_VALUE = "__other__";

type LayoutContext = {
  selectedStack: StackNameDto;
};

const orderKey = (stack: string) => `logs-container-order:${stack}`;

const normalizeContainerName = (name: string) =>
  name.startsWith("/") ? name.slice(1) : name;

const getContainerOrderKey = (container: ContainerDto) =>
  normalizeContainerName(container.names[0] ?? container.id);

export default function Logs() {
  const { selectedStack } = useOutletContext<LayoutContext>();
  const isOtherSelected = selectedStack === OTHER_STACK_VALUE;
  const [currentContainers, setCurrentContainers] = useState<ContainerDto[]>([]);
  const [containerOrder, setContainerOrder] = useState<string[]>([]);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  const dragItemKey = useRef<string | null>(null);

  useEffect(() => {
    if (!selectedStack || selectedStack.trim() === "") return;

    const loadContainers = isOtherSelected
      ? getContainersWithoutStack()
      : getContainersByStack(selectedStack);

    loadContainers.then((containers) => {
      setCurrentContainers(containers);
    });
  }, [isOtherSelected, selectedStack]);

  // Merge newly discovered containers into the persisted order.
  useEffect(() => {
    if (!selectedStack) return;
    const saved = localStorage.getItem(orderKey(selectedStack));
    const parsedSaved = saved ? JSON.parse(saved) : [];
    const savedOrder = Array.isArray(parsedSaved)
      ? parsedSaved.filter((entry): entry is string => typeof entry === "string")
      : [];
    const allKeys = currentContainers.map(getContainerOrderKey);

    // Migrate old id-based order to the new name-based order.
    const normalizedSavedOrder = savedOrder
      .map((entry) => {
        if (allKeys.includes(entry)) return entry;

        const matchById = currentContainers.find((container) => container.id === entry);
        return matchById ? getContainerOrderKey(matchById) : entry;
      })
      .filter((entry) => allKeys.includes(entry));

    const merged = [
      ...normalizedSavedOrder,
      ...allKeys.filter((key) => !normalizedSavedOrder.includes(key)),
    ];

    setContainerOrder(Array.from(new Set(merged)));
  }, [currentContainers, selectedStack]);

  // Persist order changes.
  useEffect(() => {
    if (!selectedStack || containerOrder.length === 0) return;
    localStorage.setItem(
      orderKey(selectedStack),
      JSON.stringify(containerOrder),
    );
  }, [containerOrder, selectedStack]);

  useEffect(() => {
    const toUiState = (state: string): ContainerDto["state"] =>
      state.toLowerCase() === "running" ? "running" : "exited";

    const source = streamContainerLifecycle((event) => {
      if (isOtherSelected) {
        if (event.stack && event.stack.trim() !== "") return;
      } else if (!event.stack || event.stack !== selectedStack) {
        return;
      }

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
              stack: event.stack ?? "",
            },
          ];
        }

        return prev;
      });
    });

    return () => {
      source.close();
    };
  }, [isOtherSelected, selectedStack]);

  const orderedContainers = containerOrder
    .map((key) => currentContainers.find((container) => getContainerOrderKey(container) === key))
    .filter((c): c is ContainerDto => c !== undefined && c.state === "running");

  const handleDragStart = (key: string) => {
    dragItemKey.current = key;
  };

  const handleDragOver = (e: React.DragEvent, key: string) => {
    e.preventDefault();
    setDragOverKey(key);
  };

  const handleDrop = (targetKey: string) => {
    const fromKey = dragItemKey.current;
    if (!fromKey || fromKey === targetKey) {
      setDragOverKey(null);
      return;
    }

    setContainerOrder((prev) => {
      const copy = [...prev];
      const fromIdx = copy.indexOf(fromKey);
      const toIdx = copy.indexOf(targetKey);

      if (fromIdx === -1 || toIdx === -1) return prev;

      copy.splice(fromIdx, 1);
      copy.splice(toIdx, 0, fromKey);
      return copy;
    });

    dragItemKey.current = null;
    setDragOverKey(null);
  };

  const handleDragEnd = () => {
    dragItemKey.current = null;
    setDragOverKey(null);
  };

  const dragHandle = (container: ContainerDto) => ({
    draggable: true as const,
    onDragStart: () => handleDragStart(getContainerOrderKey(container)),
    onDragEnd: handleDragEnd,
  });

  const dropZone = (container: ContainerDto) => ({
    onDragOver: (e: React.DragEvent) => handleDragOver(e, getContainerOrderKey(container)),
    onDrop: () => handleDrop(getContainerOrderKey(container)),
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
                {...dropZone(container)}
                className={cn(
                  "group relative transition-opacity",
                  dragOverKey === getContainerOrderKey(container) &&
                    dragItemKey.current !== getContainerOrderKey(container) &&
                    "opacity-50",
                )}
              >
                <div
                  {...dragHandle(container)}
                  onMouseDown={(e) => e.stopPropagation()}
                  className="absolute left-0 top-0 bottom-0 w-5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing z-10"
                >
                  <GripVertical className="h-4 w-4 text-muted-foreground" />
                </div>

                <LogConsole
                  containerId={container.id}
                  title={container.names[0]}
                />
              </div>
            ))}
          </div>
        )}

        {layout === "grid" && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {orderedContainers.map((container) => (
              <div
                key={container.id}
                {...dropZone(container)}
                className={cn(
                  "group relative transition-opacity",
                  dragOverKey === getContainerOrderKey(container) &&
                    dragItemKey.current !== getContainerOrderKey(container) &&
                    "opacity-50",
                )}
              >
                <div
                  {...dragHandle(container)}
                  onMouseDown={(e) => e.stopPropagation()}
                  className="absolute left-0 top-0 bottom-0 w-5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing z-10"
                >
                  <GripVertical className="h-4 w-4 text-muted-foreground" />
                </div>

                <LogConsole
                  containerId={container.id}
                  title={container.names[0]}
                />
              </div>
            ))}
          </div>
        )}

        {layout === "double_column" && (
          <div className="flex">
            <div className="w-full mr-2 flex flex-col gap-2">
              {orderedContainers
                .filter((_, i) => i % 2 === 0)
                .map((container) => (
                  <div
                    key={container.id}
                    {...dropZone(container)}
                    className={cn(
                      "group relative transition-opacity",
                      dragOverKey === getContainerOrderKey(container) &&
                        dragItemKey.current !== getContainerOrderKey(container) &&
                        "opacity-50",
                    )}
                  >
                    <div
                      {...dragHandle(container)}
                      onMouseDown={(e) => e.stopPropagation()}
                      className="absolute left-0 top-0 bottom-0 w-5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing z-10"
                    >
                      <GripVertical className="h-4 w-4 text-muted-foreground" />
                    </div>

                    <LogConsole
                      containerId={container.id}
                      title={container.names[0]}
                    />
                  </div>
                ))}
            </div>

            <div className="w-full flex flex-col gap-2">
              {orderedContainers
                .filter((_, i) => i % 2 !== 0)
                .map((container) => (
                  <div
                    key={container.id}
                    {...dropZone(container)}
                    className={cn(
                      "group relative transition-opacity",
                      dragOverKey === getContainerOrderKey(container) &&
                        dragItemKey.current !== getContainerOrderKey(container) &&
                        "opacity-50",
                    )}
                  >
                    <div
                      {...dragHandle(container)}
                      onMouseDown={(e) => e.stopPropagation()}
                      className="absolute left-0 top-0 bottom-0 w-5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing z-10"
                    >
                      <GripVertical className="h-4 w-4 text-muted-foreground" />
                    </div>

                    <LogConsole
                      containerId={container.id}
                      title={container.names[0]}
                    />
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
