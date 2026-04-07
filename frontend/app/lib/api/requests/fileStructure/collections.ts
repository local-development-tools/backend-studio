// --- Types ---
export interface CollectionDto {
  id: string;
  name: string;
  description?: string;
  activeEnvironment?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCollectionDto {
  name: string;
  description?: string;
}

export interface UpdateCollectionDto {
  name?: string;
  description?: string;
}

// --- Import types ---
export interface ImportCollectionDto {
  file: File;
  paths?: string;
}

// --- API functions ---
export function getCollections(): Promise<CollectionDto[]> {
  return fetch("http://localhost:3000" + "/collections").then((res) => {
    if (!res.ok) throw new Error("Failed to fetch collections");
    return res.json() as Promise<CollectionDto[]>;
  });
}

export function getCollectionById(id: string): Promise<CollectionDto> {
  return fetch(`http://localhost:3000/collections/${id}`).then((res) => {
    if (!res.ok) throw new Error(`Failed to fetch collection with id ${id}`);
    return res.json() as Promise<CollectionDto>;
  });
}

export function createCollection(data: CreateCollectionDto): Promise<CollectionDto> {
  return fetch("http://localhost:3000/collections", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  }).then((res) => {
    if (!res.ok) throw new Error("Failed to create collection");
    return res.json() as Promise<CollectionDto>;
  });
}

export function updateCollection(id: string, data: UpdateCollectionDto): Promise<CollectionDto> {
  return fetch(`http://localhost:3000/collections/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  }).then((res) => {
    if (!res.ok) throw new Error(`Failed to update collection with id ${id}`);
    return res.json() as Promise<CollectionDto>;
  });
}

export function deleteCollection(id: string): Promise<void> {
  return fetch(`http://localhost:3000/collections/${id}`, {
    method: "DELETE",
  }).then((res) => {
    if (!res.ok) throw new Error(`Failed to delete collection with id ${id}`);
  });
}

export function importCollection(data: ImportCollectionDto): Promise<void> {
  const formData = new FormData();

  formData.append("file", data.file);

  if (data.paths && data.paths.trim()) {
    formData.append("paths", data.paths);
  }

  return fetch("http://localhost:3000/collections/import", {
    method: "POST",
    body: formData,
  }).then((res) => {
    if (!res.ok) throw new Error("Failed to import collection");
  });
}

export function exportCollection(id: string): Promise<void> {
  return fetch(`http://localhost:3000/collections/${id}/export`).then(
    async (res) => {
      if (!res.ok) {
        throw new Error(`Failed to export collection with id ${id}`);
      }

      const blob = await res.blob();

      // Try to get filename from headers
      const disposition = res.headers.get("content-disposition");
      let filename = "collection.zip";

      if (disposition) {
        const match = disposition.match(/filename="?(.+?)"?$/);
        if (match) filename = match[1];
      }

      const url = window.URL.createObjectURL(blob);

      const link = document.createElement("a");
      link.href = url;
      link.download = filename;

      document.body.appendChild(link);
      link.click();

      link.remove();
      window.URL.revokeObjectURL(url);
    }
  );
}
