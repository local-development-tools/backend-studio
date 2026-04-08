// handleCreateCollection.ts
import { createCollection, deleteCollection, exportCollection, getCollectionById, importCollection, updateCollection } from "../fileStructure/collections";

interface CreateCollectionCtx {
  openModal: (
    title: string,
    fields: { name: string; label: string; placeholder: string; required: boolean }[],
    onSubmit: (values: Record<string, unknown>) => void
  ) => void;
  setRefreshKey: (updater: (prev: number) => number) => void;
}

export const handleCreateCollection = ({ openModal, setRefreshKey }: CreateCollectionCtx) => {
  openModal(
    "Create Collection",
    [
      {
        name: "name",
        label: "Collection Name",
        placeholder: "Enter name",
        required: true,
      },
    ],
    (values) => {
      createCollection({ name: values.name as string })
        .then(() => setRefreshKey((prev) => prev + 1))
        .catch((err) => console.error("Failed to create collection:", err));
    },
  );
};

interface DeleteCollectionCtx {
  id: string;
  setRefreshKey: (updater: (prev: number) => number) => void;
}

export const handleDeleteCollection = ({ id, setRefreshKey }: DeleteCollectionCtx) => {
  deleteCollection(id)
    .then(() => setRefreshKey((prev) => prev + 1))
    .catch((err) => console.error("Failed to delete collection:", err));
};

interface UpdateCollectionCtx {
  id: string;
  openModal: (
    title: string,
    fields: {
      name: string;
      label: string;
      placeholder: string;
      defaultValue?: string;
      required: boolean;
    }[],
    onSubmit: (values: Record<string, unknown>) => void
  ) => void;
  setRefreshKey: (updater: (prev: number) => number) => void;
}

export const handleUpdateCollection = ({
  id,
  openModal,
  setRefreshKey,
}: UpdateCollectionCtx) => {
  getCollectionById(id)
    .then((c) => c.name)
    .catch(() => "")
    .then((temp) => {
      openModal(
        "Rename Collection",
        [
          {
            name: "name",
            label: "Collection Name",
            placeholder: "Enter name",
            defaultValue: temp,
            required: true,
          },
        ],
        (values) => {
          updateCollection(id, { name: values.name as string })
            .then(() => setRefreshKey((prev) => prev + 1))
            .catch((err) =>
              console.error("Failed to update collection:", err)
            );
        }
      );
    });
};


interface ImportCollectionCtx {
  openModal: (
    title: string,
    fields: {
      name: string;
      label: string;
      type?: string;
      accept?: string;
      placeholder?: string;
      required: boolean;
    }[],
    onSubmit: (values: Record<string, unknown>) => void | Promise<void>
  ) => void;
  setRefreshKey: (updater: (prev: number) => number) => void;
}

export const handleImportCollection = ({
  openModal,
  setRefreshKey,
}: ImportCollectionCtx) => {
  openModal(
    "Import Collection",
    [
      {
        name: "file",
        label: "ZIP File",
        type: "file",
        accept: ".zip",
        required: true,
      },
      {
        name: "paths",
        label: "Paths (JSON array)",
        placeholder: '["my-collection/request1.bru"]',
        required: false,
      },
    ],
    async (values) => {
      if (!(values.file instanceof File)) return;

      await importCollection({
        file: values.file,
        paths:
          typeof values.paths === "string" ? values.paths : undefined,
      });

      setRefreshKey((prev) => prev + 1);
    }
  );
};

interface ExportCollectionCtx {
  id: string;
}

export const handleExportCollection = ({ id }: ExportCollectionCtx) => {
  exportCollection(id).catch((err) =>
    console.error("Failed to export collection:", err)
  );
};