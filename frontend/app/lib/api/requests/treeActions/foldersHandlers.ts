import {
  createFolderInCollection,
  createFolderInFolder,
  deleteFolder,
  getFolderById,
  updateFolder,
} from "../fileStructure/folders";

interface CreateFolderCtx {
  location: "collection" | "folder";
  parentId: string;
  openModal: (
    title: string,
    fields: {
      name: string;
      label: string;
      placeholder: string;
      required: boolean;
    }[],
    onSubmit: (values: Record<string, unknown>) => void,
  ) => void;
  setRefreshKey: (updater: (prev: number) => number) => void;
}

export const handleCreateFolder = ({
  location,
  parentId,
  openModal,
  setRefreshKey,
}: CreateFolderCtx) => {
  openModal(
    "Create Folder",
    [
      {
        name: "name",
        label: "Folder Name",
        placeholder: "Enter name",
        required: true,
      },
    ],
    (values) => {
      const promise =
        location === "collection"
          ? createFolderInCollection(parentId, {
              name: values.name as string,
            })
          : createFolderInFolder(parentId, {
              name: values.name as string,
            });

      promise
        .then(() => setRefreshKey((prev) => prev + 1))
        .catch((err) => console.error("Failed to create folder:", err));
    },
  );
};

interface DeleteFolderCtx {
  id: string;
  setRefreshKey: (updater: (prev: number) => number) => void;
}

export const handleDeleteFolder = ({id, setRefreshKey}: DeleteFolderCtx) => {
  deleteFolder(id)
    .then(() => setRefreshKey((prev) => prev + 1))
    .catch((err) => console.error("Failed to delete folder:", err));
};

interface UpdateFolderCtx {
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
    onSubmit: (values: Record<string, unknown>) => void,
  ) => void;
  setRefreshKey: (updater: (prev: number) => number) => void;
}

export const handleUpdateFolder = ({
  id,
  openModal,
  setRefreshKey,
}: UpdateFolderCtx) => {
  getFolderById(id)
    .then((f) => f.name)
    .catch(() => "")
    .then((temp) => {
      openModal(
        "Rename Folder",
        [
          {
            name: "name",
            label: "Folder Name",
            placeholder: "Enter name",
            defaultValue: temp,
            required: true,
          },
        ],
        (values) => {
          updateFolder(id, {name: values.name as string})
            .then(() => setRefreshKey((prev) => prev + 1))
            .catch((err) => console.error("Failed to update Folder:", err));
        },
      );
    });
};
