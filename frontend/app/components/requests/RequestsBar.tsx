import {
  CopyMinus,
  FilePlus,
  FolderPlus,
  Plus,
  RotateCw,
  Search,
} from "lucide-react";
import {Button} from "../ui/button";
import {ScrollArea} from "../ui/scroll-area";
import {Input} from "../ui/input";
import {useEffect, useState} from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import {RequestTreeNode} from "./nodes/RequestTree";
import {
  createCollection,
  getCollections,
  type CollectionDto,
} from "~/lib/api/requests/fileStructure/collections";
import {ModalForm} from "./modalForm";
import {GenTree} from "~/lib/api/requests/fileStructure/generateTree";
import type {TreeAction} from "~/routes/requests";

interface RequestsBarProps {
  selectedId: string | null;
  onAction?: (action: TreeAction) => void;
  refreshKey?: number;
}

export const RequestsBar = ({ selectedId, onAction, refreshKey}: RequestsBarProps) => {
  const [collections, setCollections] = useState<CollectionDto[]>([]);
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);

  const handleOpenModal = () => setShowModal(true);
  const handleCloseModal = () => setShowModal(false);

  const fetchCollections = async () => {
    try {
      const data = await getCollections();
      setCollections(data);
    } catch (err) {
      console.error("Failed to fetch collections:", err);
    }
  };

  // Load on mount
  useEffect(() => {
    fetchCollections();
  }, []);

  const handleCreateCollectionSubmit = async (
    values: Record<string, string>,
  ) => {
    // Log the entered name
    console.log("Collection name submitted:", values.name);

    try {
      // Only send the name to your API
      const newCollection = await createCollection({
        name: values.name,
      });

      // Close the modal after successful creation
      fetchCollections();
      handleCloseModal();
    } catch (err) {
      console.error("Failed to create collection:", err);
    }
  };

  return (
    <div className="w-full h-full min-h-0 flex flex-col overflow-hidden">
      {/* <div className="p-2 space-y-2 border-b border-border"> */}
      {/* search function currently dissabled cuz im rewriting the nodes */}
      {/* <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter requests..."
            className="h-7 text-xs pl-7 bg-background"
          />
        </div> */}
      {/* 
        
      </div> */}

      <ScrollArea className="flex-1 min-h-0 h-full" viewportRef={null}>
        <GenTree
          type={"root"}
          selectedId={selectedId}
          onAction={onAction}
          refreshKey={refreshKey}
        ></GenTree>
      </ScrollArea>
    </div>
  );
};
