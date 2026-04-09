// handleCreateHttpRequest.ts
import type { HttpMethod } from "~/components/requests/types";
import {
    createGrpcRequestInCollection,
  createGrpcRequestInFolder,
  createHttpRequestInCollection,
  createHttpRequestInFolder,
  deleteRequest,
  getRequestById,
  updateRequest,
} from "../fileStructure/requests";

interface CreateHttpRequestCtx {
  location: "collection" | "folder";
  parentId: string;
  openModal: (
    title: string,
    fields: {
      name: string;
      label: string;
      placeholder?: string;
      type?: string;
      options?: string[];
      defaultValue?: string;
      required?: boolean;
    }[],
    onSubmit: (values: Record<string, unknown>) => void
  ) => void;
  setRefreshKey: (updater: (prev: number) => number) => void;
}

export const handleCreateHttpRequest = ({
  location,
  parentId,
  openModal,
  setRefreshKey,
}: CreateHttpRequestCtx) => {
  openModal(
    "Create Request",
    [
      {
        name: "name",
        label: "Request Name",
        placeholder: "Enter name",
        required: true,
      },
      {
        name: "url",
        label: "url",
        placeholder: "http://...",
      },
      {
        label: "Method",
        name: "method",
        type: "select",
        options: ["GET", "POST", "PUT", "DELETE", "PATCH"],
        defaultValue: "GET",
      },
    ],
    (values) => {
      const method = `${values.method as string}` as HttpMethod;

      const requestData = {
        method,
        url: (values.url as string) || "http://localhost:3000",
        headers: {},
        body: {},
      };

      const promise =
        location === "collection"
          ? createHttpRequestInCollection(
              parentId,
              values.name as string,
              requestData
            )
          : createHttpRequestInFolder(
              parentId,
              values.name as string,
              requestData
            );

      promise
        .then(() => setRefreshKey((prev) => prev + 1))
        .catch((err) => console.error("Failed to create request:", err));
    }
  );
};


interface RenameRequestCtx {
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

export const handleRenameRequest = ({
  id,
  openModal,
  setRefreshKey,
}: RenameRequestCtx) => {
  getRequestById(id)
    .then((r) => r.name)
    .catch(() => "")
    .then((temp) => {
      openModal(
        "Rename Request",
        [
          {
            name: "name",
            label: "Request Name",
            placeholder: "Enter name",
            defaultValue: temp,
            required: true,
          },
        ],
        (values) => {
          updateRequest(id, { name: values.name as string })
            .then(() => setRefreshKey((prev) => prev + 1))
            .catch((err) =>
              console.error("Failed to update request:", err)
            );
        }
      );
    });
};

interface DeleteRequestCtx {
  id: string;
  setRefreshKey: (updater: (prev: number) => number) => void;
}

export const handleDeleteRequest = ({ id, setRefreshKey }: DeleteRequestCtx) => {
  deleteRequest(id)
    .then(() => setRefreshKey((prev) => prev + 1))
    .catch((err) => console.error("Failed to delete request:", err));
};

interface CreateGrpcRequestCtx {
  location: "collection" | "folder";
  parentId: string;
  openModal: (
    title: string,
    fields: {
      name: string;
      label: string;
      placeholder?: string;
      required?: boolean;
    }[],
    onSubmit: (values: Record<string, unknown>) => void
  ) => void;
  setRefreshKey: (updater: (prev: number) => number) => void;
}

export const handleCreateGrpcRequest = ({
  location,
  parentId,
  openModal,
  setRefreshKey,
}: CreateGrpcRequestCtx) => {
  openModal(
    "Create gRPC Request",
    [
      {
        name: "name",
        label: "Request Name",
        placeholder: "Enter name",
        required: true,
      },
      {
        name: "service",
        label: "Service",
        placeholder: "my.package.Service",
        required: true,
      },
      {
        name: "method",
        label: "Method",
        placeholder: "MyMethod",
        required: true,
      },
      {
        name: "serverAddress",
        label: "Server Address",
        placeholder: "localhost:50051",
        required: true,
      },
    ],
    (values) => {
      const data = {
        serverAddress: values.serverAddress as string,
        service: values.service as string,
        method: values.method as string,
      };

      const promise =
        location === "collection"
          ? createGrpcRequestInCollection(
              parentId,
              values.name as string,
              data
            )
          : createGrpcRequestInFolder(
              parentId,
              values.name as string,
              data
            );

      promise
        .then(() => setRefreshKey((prev) => prev + 1))
        .catch((err) =>
          console.error("Failed to create gRPC request:", err)
        );
    }
  );
};