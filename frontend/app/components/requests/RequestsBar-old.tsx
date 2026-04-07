import {useState} from "react";
import {
  Plus,
  Search,
  Trash2,
  Globe,
  Server,
  PencilIcon,
  Menu,
} from "lucide-react";
import {cn} from "~/lib/utils";
import {Button} from "../ui/button";
import type {Request, RequestType} from "./types";
import {ScrollArea} from "../ui/scroll-area";
import {MethodBadge} from "./MethodBadge";
import {Input} from "../ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";

interface RequestsBarProps {
  requests: Request[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAdd: (type: RequestType) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, newName: string) => void;
}

export const RequestsBar = ({
  requests,
  selectedId,
  onSelect,
  onAdd,
  onDelete,
  onRename,
}: RequestsBarProps) => {
  const [search, setSearch] = useState("");

  const filtered = requests.filter(
    (r) =>
      r.name.toLowerCase().includes(search.toLowerCase()) ||
      (r.type === "http" && r.url.toLowerCase().includes(search.toLowerCase())),
  );

  const httpRequests = filtered.filter((r) => r.type === "http");
  const grpcRequests = filtered.filter((r) => r.type === "grpc");

  return (
    <div className="w-full h-full">
      <div className="p-2 space-y-2 border-b border-border">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter requests..."
            className="h-7 text-xs pl-7 bg-background"
          />
        </div>

        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onAdd("http")}
            className="h-6 text-[11px] flex-1 gap-1 px-2"
          >
            <Plus className="h-3 w-3" />
            HTTP
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onAdd("grpc")}
            className="h-6 text-[11px] flex-1 gap-1 px-2"
          >
            <Plus className="h-3 w-3" />
            gRPC
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1" viewportRef={null}>
        <div className="p-1">
          {httpRequests.length > 0 && (
            <div className="mb-1">
              <div className="flex items-center gap-1.5 px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                <Globe className="h-3 w-3" />
                HTTP
              </div>

              {httpRequests.map((req) => (
                <SidebarItem
                  key={req.id}
                  request={req}
                  isSelected={selectedId === req.id}
                  onSelect={() => onSelect(req.id)}
                  onDelete={() => onDelete(req.id)}
                  onRename={(newName) => onRename(req.id, newName)}
                />
              ))}
            </div>
          )}

          {grpcRequests.length > 0 && (
            <div className="mb-1">
              <div className="flex items-center gap-1.5 px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                <Server className="h-3 w-3" />
                gRPC
              </div>

              {grpcRequests.map((req) => (
                <SidebarItem
                  key={req.id}
                  request={req}
                  isSelected={selectedId === req.id}
                  onSelect={() => onSelect(req.id)}
                  onDelete={() => onDelete(req.id)}
                  onRename={(newName) => onRename(req.id, newName)}
                />
              ))}
            </div>
          )}

          {filtered.length === 0 && (
            <p className="text-[11px] text-muted-foreground text-center py-6">
              No requests found
            </p>
          )}
        </div>
      </ScrollArea>
    </div>
  );
};

const SidebarItem = ({
  request,
  isSelected,
  onSelect,
  onDelete,
  onRename,
}: {
  request: Request;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onRename: (newName: string) => void;
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [draftName, setDraftName] = useState(request.name);

  const finishRename = () => {
    const trimmed = draftName.trim();
    if (trimmed && trimmed !== request.name) {
      onRename(trimmed);
    }
    setIsEditing(false);
  };

  const cancelRename = () => {
    setDraftName(request.name);
    setIsEditing(false);
  };

  return (
    <div
      onClick={() => !isEditing && onSelect()}
      className={cn(
        "group flex items-center gap-1.5 rounded px-2 py-1.5 text-xs transition-colors",
        isEditing
          ? "bg-muted/40"
          : isSelected
            ? "bg-accent text-accent-foreground"
            : "hover:bg-muted/60 cursor-pointer",
      )}
    >
      {request.type === "http" ? (
        <MethodBadge
          method={request.method}
          className="w-10 shrink-0 text-[10px]"
        />
      ) : (
        <span className="text-[10px] font-bold text-orange-500 w-10 shrink-0">
          gRPC
        </span>
      )}

      {isEditing ? (
        <Input
          autoFocus
          value={draftName}
          onChange={(e) => setDraftName(e.target.value)}
          onBlur={finishRename}
          onKeyDown={(e) => {
            if (e.key === "Enter") finishRename();
            if (e.key === "Escape") cancelRename();
          }}
          className="h-6 text-xs bg-background border-border focus-visible:ring-1 focus-visible:ring-ring"
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <span className="flex-1 truncate">{request.name}</span>
      )}

      {!isEditing && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              onClick={(e) => e.stopPropagation()}
              className="opacity-0 group-hover:opacity-100"
            >
              <Menu className="w-4 h-4" />
            </button>
          </DropdownMenuTrigger>

          <DropdownMenuContent className="w-40" align="start">
            <DropdownMenuGroup>
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  setIsEditing(true);
                }}
              >
                Rename
              </DropdownMenuItem>

              <DropdownMenuItem
                variant="destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
              >
                Delete
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
};
