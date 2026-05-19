// handleCreateCollection.ts
import {
  createCollection,
  deleteCollection,
  exportCollection,
  getCollectionById,
  importCollection,
  storeCollection,
  updateCollection,
} from "../fileStructure/collections";
import { getContainers } from "~/lib/api/containers";

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

interface StoreCollectionCtx {
  id: string;
  openModal: (
    title: string,
    fields: {
      name: string;
      label: string;
      placeholder?: string;
      defaultValue?: string;
      description?: string;
      required: boolean;
      type?: string;
      options?: Array<string | {label: string; value: string}>;
    }[],
    onSubmit: (values: Record<string, unknown>) => void
  ) => void;
}

export const handleStoreCollection = ({ id, openModal }: StoreCollectionCtx) => {
  getContainers()
    .then((containers) => {
      openModal(
        "Store Collection",
        [
          {
            name: "containerId",
            label: "Destination Container",
            type: "select",
            description: "Choose the container that should receive the copied collection.",
            options: containers.map((container) => {
              const primaryName = container.names[0]?.replace(/^\//, "") ?? container.id;
              return {
                label: `${primaryName} (${container.id.slice(0, 12)})`,
                value: container.id,
              };
            }),
            required: false,
          },
          {
            name: "containerPath",
            label: "Path Inside Container",
            placeholder: "/app/data/collections",
            defaultValue: "/app/data/collections",
            description: "The folder path inside the selected container where the collection will be copied. Make sure this path exists in the container before submitting.",
            required: false,
          },
        ],
        (values) => {
          storeCollection(id, {
            containerId: typeof values.containerId === "string" ? values.containerId : undefined,
            containerPath: typeof values.containerPath === "string" ? values.containerPath : undefined,
          }).catch((err) => console.error("Failed to store collection:", err));
        },
      );
    })
    .catch((err) => {
      console.error("Failed to load containers for store action:", err);
      openModal(
        "Store Collection",
        [
          {
            name: "containerId",
            label: "Destination Container",
            type: "select",
            description: "Choose the container that should receive the copied collection.",
            options: [],
            required: false,
          },
          {
            name: "containerPath",
            label: "Path Inside Container",
            placeholder: "/app/data/collections",
            defaultValue: "/app/data/collections",
            description: "The folder path inside the selected container where the collection will be copied.",
            required: false,
          },
        ],
        (values) => {
          storeCollection(id, {
            containerId: typeof values.containerId === "string" ? values.containerId : undefined,
            containerPath: typeof values.containerPath === "string" ? values.containerPath : undefined,
          }).catch((submitErr) => console.error("Failed to store collection:", submitErr));
        },
      );
    });
};