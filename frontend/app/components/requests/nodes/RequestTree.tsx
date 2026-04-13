import {
  FilePlus,
  RotateCw,
  CopyMinus,
  MoreVertical,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { type ReactNode } from "react";
import { Button } from "~/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "~/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { METHOD_COLOR_BASE } from "~/lib/api/requests/methodColors";
import type { HttpMethod } from "../types";
import type { TreeAction } from "~/routes/requests";

interface RequestTreeNodeProps {
  id?: string;
  name: string;
  type: "root" | "folder" | "collection" | "requestHttp" | "requestGrpc";
  level?: number;
  children?: ReactNode;
  onClick?: () => void;
  onDoubleClick?: () => void;
  onAction?: (action: TreeAction) => void;
  isSelected: boolean;
  method?: HttpMethod;
  openFolders: Record<string, boolean>;
}

export function RequestTreeNode({
  id,
  name,
  type,
  children,
  onClick,
  onDoubleClick,
  onAction,
  isSelected,
  method,
  openFolders,
}: RequestTreeNodeProps) {
  const isOpen =
    type === "root" ? true : openFolders?.[id ?? ""] ?? false;

  const toggleOpen = (next: boolean) => {
    if (type === "root") return;

    onAction?.({
      type: "updateColapseStates",
      id: `${id}`,
      isOpen: next,
    });
  };

  const RootOptions = () => (
    <div className="flex gap-1">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-[11px] flex-1 gap-1 px-2"
          >
            <FilePlus className="w-3.5 h-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuGroup>
            <DropdownMenuItem
              onClick={() => onAction?.({ type: "createCollection" })}
            >
              Create collection
            </DropdownMenuItem>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                Import collection
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuItem
                  onClick={() =>
                    onAction?.({ type: "importCollection" })
                  }
                >
                  .ZIP
                </DropdownMenuItem>
                <DropdownMenuItem>Folder</DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <Button
        variant="ghost"
        size="sm"
        className="h-6 text-[11px] flex-1 gap-1 px-2"
      >
        <RotateCw className="w-3.5 h-3.5" />
      </Button>

      <Button
        variant="ghost"
        size="sm"
        className="h-6 text-[11px] flex-1 gap-1 px-2"
      >
        <CopyMinus className="w-3.5 h-3.5" />
      </Button>
    </div>
  );

  const OptionsMenu = () => {
    let items: ReactNode = null;

    if (type === "folder") {
      if (!id) return null;
      items = (
        <>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Create new</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuItem
                onClick={() =>
                  onAction?.({
                    type: "createHttpRequest",
                    parentId: `${id}`,
                    location: "folder",
                  })
                }
              >
                Http Request
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() =>
                  onAction?.({
                    type: "createGrpcRequest",
                    parentId: `${id}`,
                    location: "folder",
                  })
                }
              >
                gRPC Request
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() =>
                  onAction?.({
                    type: "createFolder",
                    parentId: `${id}`,
                    location: "folder",
                  })
                }
              >
                Folder
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          <DropdownMenuItem
            onClick={() =>
              onAction?.({ type: "updateFolder", id: `${id}` })
            }
          >
            Rename Folder
          </DropdownMenuItem>

          <DropdownMenuItem
            variant="destructive"
            onClick={() =>
              onAction?.({ type: "deleteFolder", id: `${id}` })
            }
          >
            Delete Folder
          </DropdownMenuItem>
        </>
      );
    } else if (type === "collection") {
      if (!id) return null;
      items = (
        <>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Create new</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuItem
                onClick={() =>
                  onAction?.({
                    type: "createHttpRequest",
                    parentId: `${id}`,
                    location: "collection",
                  })
                }
              >
                Http Request
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() =>
                  onAction?.({
                    type: "createGrpcRequest",
                    parentId: `${id}`,
                    location: "collection",
                  })
                }
              >
                gRPC Request
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() =>
                  onAction?.({
                    type: "createFolder",
                    parentId: `${id}`,
                    location: "collection",
                  })
                }
              >
                Folder
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          <DropdownMenuItem
            onClick={() =>
              onAction?.({ type: "updateCollection", id: `${id}` })
            }
          >
            Rename Collection
          </DropdownMenuItem>

          <DropdownMenuItem
            onClick={() =>
              onAction?.({ type: "exportCollection", id: `${id}` })
            }
          >
            Export Collection
          </DropdownMenuItem>

          <DropdownMenuItem
            variant="destructive"
            onClick={() =>
              onAction?.({
                type: "deleteCollection",
                id: `${id}`,
              })
            }
          >
            Delete Collection
          </DropdownMenuItem>
        </>
      );
    } else if (type === "requestHttp" || type === "requestGrpc") {
      if (!id) return null;
      items = (
        <>
          <DropdownMenuItem>Duplicate Request</DropdownMenuItem>

          <DropdownMenuItem
            onClick={() =>
              onAction?.({ type: "renameRequest", id: `${id}` })
            }
          >
            Rename Request
          </DropdownMenuItem>

          <DropdownMenuItem
            variant="destructive"
            onClick={() =>
              onAction?.({
                type: "deleteRequest",
                id: `${id}`,
              })
            }
          >
            Delete Request
          </DropdownMenuItem>
        </>
      );
    }

    return (
      <DropdownMenu>
        <DropdownMenuTrigger className="p-1 hover:bg-muted rounded">
          <MoreVertical className="w-4 h-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent className="min-w-30">
          {items}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  // REQUEST NODE
  if (type === "requestHttp" || type === "requestGrpc") {
    return (
      <div
        className={`flex items-center gap-2 py-1 justify-between rounded-xl pl-2 group ${
          isSelected ? "bg-primary/30" : ""
        }`}
      >
        <div
          className="flex items-center gap-2 cursor-pointer w-full"
          onClick={onClick}
        >
          {method && type === "requestHttp" && (
            <span
              className={`font-mono text-sm px-1 rounded text-${METHOD_COLOR_BASE[method]}`}
            >
              {method}
            </span>
          )}

          {type === "requestGrpc" && (
            <span className="font-mono text-sm px-1 rounded text-orange-500">
              gRPC
            </span>
          )}

          <span className="text-sm">{name}</span>
        </div>

        <div
          className={`transition-opacity ${
            isSelected
              ? "opacity-100"
              : "opacity-0 group-hover:opacity-100"
          }`}
        >
          <OptionsMenu />
        </div>
      </div>
    );
  }

  // TREE NODE
  return (
    <Collapsible
      open={isOpen}
      onOpenChange={(next) => toggleOpen(next)}
    >
      <div className="flex items-center justify-between group">
        <CollapsibleTrigger asChild>
          <div
            className="flex items-center gap-1 py-1 cursor-pointer hover:bg-muted rounded w-full"
            onClick={() => toggleOpen(!isOpen)}
            onDoubleClick={onDoubleClick}
          >
            {isOpen ? (
              <ChevronDown className="w-4 h-4 shrink-0" />
            ) : (
              <ChevronRight className="w-4 h-4 shrink-0" />
            )}
            <span className="text-sm">{name}</span>
          </div>
        </CollapsibleTrigger>

        <div
          className={`flex gap-1 ${
            type === "root"
              ? ""
              : "opacity-0 group-hover:opacity-100 transition-opacity"
          }`}
        >
          {type === "root" ? <RootOptions /> : <OptionsMenu />}
        </div>
      </div>

      <CollapsibleContent>
        <div className="pl-4">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}