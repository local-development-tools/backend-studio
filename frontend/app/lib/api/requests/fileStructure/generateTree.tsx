import {RequestTreeNode} from "~/components/requests/nodes/RequestTree";
import {getCollections, type CollectionDto} from "./collections";
import {getFoldersByCollection, type FolderDto} from "./folders";

import {useState, useEffect} from "react";
import {
  getFoldersByFolder,
  getRequestsByCollection,
  getRequestsByFolder,
  type RequestDto,
} from "../requests";
import type {HttpMethod} from "~/components/requests/types";
import type {TreeAction} from "~/routes/requests";

interface GenTreeProps {
  type: "root" | "folder" | "collection" | "requestHttp" | "requestGrpc";
  id?: string;
  name?: string;
  selectedId: string | null;
  method?: HttpMethod;
  onAction?: (action: TreeAction) => void;
  refreshKey?: number;
}

export function GenTree({
  id,
  type,
  name,
  selectedId,
  method,
  onAction,
  refreshKey,
}: GenTreeProps) {
  const [collections, setCollections] = useState<CollectionDto[]>([]);
  const [folders, setFolders] = useState<FolderDto[]>([]);
  const [requestsGrpc, setrequestsGrpc] = useState<RequestDto[]>([]);
  const [requestsHttp, setrequestsHttp] = useState<RequestDto[]>([]);

  // --- Fetch depending on type ---
  const fetchData = async () => {
    try {
      if (type === "root") {
        const data = await getCollections();
        setCollections(data);
      } else if (type === "collection" && id) {
        const folderData = await getFoldersByCollection(id);
        const filteredFolders = folderData.filter((folder) => !folder.parentFolderId && !folder.parentId);
        setFolders(filteredFolders);

        const requestData = await getRequestsByCollection(id);

        setrequestsHttp(requestData.filter((r) => r.type === "http"));
        setrequestsGrpc(requestData.filter((r) => r.type === "grpc"));
      } else if (type === "folder" && id) {
        const folderData = await getFoldersByFolder(id);
        setFolders(folderData);
        const requestData = await getRequestsByFolder(id);

        setrequestsHttp(requestData.filter((r) => r.type === "http"));
        setrequestsGrpc(requestData.filter((r) => r.type === "grpc"));
      }
    } catch (err) {
      console.error(`Failed to fetch data for type ${type}:`, err);
    }
  };

  // Initial + dependency-based fetch
  useEffect(() => {
    fetchData();
  }, [type, id]);

  // 🔥 GLOBAL refresh trigger (runs on EVERY node)
  useEffect(() => {
    fetchData();
  }, [refreshKey]);

  // --- Render tree ---
  if (type === "root") {
    return (
      <RequestTreeNode
        name="Collections"
        type="root"
        isSelected={false}
        onAction={onAction}
      >
        {collections.map((collection) => (
          <GenTree
            key={collection.id}
            type="collection"
            id={collection.id}
            name={collection.name}
            selectedId={selectedId}
            onAction={onAction}
            refreshKey={refreshKey} // ✅ pass down
          />
        ))}
      </RequestTreeNode>
    );
  }

  if (type === "collection") {
    if (!id) return null;
    return (
      <RequestTreeNode
        id={id}
        name={`${name}`}
        type="collection"
        onClick={() => onAction?.({type: "select", id: `${id}`})}
        isSelected={false}
        onAction={onAction}
      >
        {folders.map((folder) => (
          <GenTree
            key={folder.id}
            type="folder"
            id={folder.id}
            name={folder.name}
            selectedId={selectedId}
            onAction={onAction}
            refreshKey={refreshKey} // ✅ pass down
          />
        ))}

        {requestsHttp.map((req) => (
          <GenTree
            key={req.id}
            type="requestHttp"
            id={req.id}
            name={req.name}
            method={req.method as HttpMethod}
            selectedId={selectedId}
            onAction={onAction}
            refreshKey={refreshKey} // ✅ pass down
          />
        ))}

        {requestsGrpc.map((req) => (
          <GenTree
            key={req.id}
            type="requestGrpc"
            id={req.id}
            name={req.name}
            selectedId={selectedId}
            onAction={onAction}
            refreshKey={refreshKey} // ✅ pass down
          />
        ))}
      </RequestTreeNode>
    );
  }

  if (type === "folder") {
    if (!id) return null;
    return (
      <RequestTreeNode
        id={id}
        name={`${name}`}
        type="folder"
        onClick={() => onAction?.({type: "select", id: `${id}`})}
        isSelected={false}
        onAction={onAction}
      >
        {folders.map((folder) => (
          <GenTree
            key={folder.id}
            type="folder"
            id={folder.id}
            name={folder.name}
            selectedId={selectedId}
            onAction={onAction}
            refreshKey={refreshKey} // ✅ pass down
          />
        ))}

        {requestsHttp.map((req) => (
          <GenTree
            key={req.id}
            type="requestHttp"
            id={req.id}
            name={req.name}
            method={req.method as HttpMethod}
            selectedId={selectedId}
            onAction={onAction}
            refreshKey={refreshKey} // ✅ pass down
          />
        ))}

        {requestsGrpc.map((req) => (
          <GenTree
            key={req.id}
            type="requestGrpc"
            id={req.id}
            name={req.name}
            selectedId={selectedId}
            onAction={onAction}
            refreshKey={refreshKey} // ✅ pass down
          />
        ))}
      </RequestTreeNode>
    );
  }

  if (type === "requestHttp") {
    if (!id) return null;
    return (
      <RequestTreeNode
        id={id}
        name={`${name}`}
        type="requestHttp"
        onClick={() => onAction?.({type: "select", id: `${id}`})}
        isSelected={selectedId === id}
        method={method}
        onAction={onAction}
      />
    );
  }

  if (type === "requestGrpc") {
    if (!id) return null;
    return (
      <RequestTreeNode
        id={id}
        name={`${name}`}
        type="requestGrpc"
        onClick={() => onAction?.({type: "select", id: `${id}`})}
        isSelected={selectedId === id}
        onAction={onAction}
      />
    );
  }

  return null;
}
