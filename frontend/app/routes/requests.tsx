import {useState, useCallback, useEffect} from "react";
import type {Route} from "./+types/requests";
import {useOutletContext} from "react-router";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "~/components/ui/resizable";

import type {
  Request,
  MockResponse,
  HttpMethod,
} from "~/components/requests/types";

import {Globe, Server} from "lucide-react";

import {HttpRequestEditor} from "~/components/requests/HttpRequestEditor";
import {GrpcRequestEditor} from "~/components/requests/GrpcRequestEditor";
import {ResponsePanel} from "~/components/requests/ResponsePanel";
import {updateRequest as updateRequestApi} from "~/lib/api/requests/updateRequest";
import {runRequest} from "~/lib/api/requests/runRequest";
import {interpolateVariables} from "~/lib/variableStore";
import {runPostScript} from "~/lib/scriptRunner";
import {EnvironmentSelector} from "~/components/requests/EnvironmentSelector";
import {EnvironmentsModal} from "~/components/requests/EnvironmentsModal";
import {
  listEnvironments,
  setActiveEnvironment as setActiveEnvApi,
  type EnvironmentDto,
} from "~/lib/api/environments";
import {RequestsBar} from "~/components/requests/RequestsBar";
import {
  createGrpcRequestInCollection,
  createGrpcRequestInFolder,
  createHttpRequestInCollection,
  createHttpRequestInFolder,
  deleteRequest,
  getRequestById,
  updateRequest,
} from "~/lib/api/requests/fileStructure/requests";
import {ModalForm, type InputField} from "~/components/requests/modalForm";
import {
  createCollection,
  deleteCollection,
  exportCollection,
  getCollectionById,
  importCollection,
  updateCollection,
} from "~/lib/api/requests/fileStructure/collections";
import {
  createFolderInCollection,
  createFolderInFolder,
  deleteFolder,
  getFolderById,
  updateFolder,
} from "~/lib/api/requests/fileStructure/folders";
import {
  buildRequestUrl,
  buildUrlWithQuery,
  parseBodyToApi,
  parseBodyToEditor,
  syncPathParamsWithUrl,
  toKeyValuePairs,
  toKeyValueRecord,
  toHeaderPairs,
  toHeaderRecord,
  toResponsePanelModel,
} from "~/lib/api/requests/utils";
import {
  handleCreateCollection,
  handleDeleteCollection,
  handleExportCollection,
  handleImportCollection,
  handleUpdateCollection,
} from "~/lib/api/requests/treeActions/collectionsHandler";
import {
  handleCreateFolder,
  handleDeleteFolder,
  handleUpdateFolder,
} from "~/lib/api/requests/treeActions/foldersHandlers";
import {
  handleCreateGrpcRequest,
  handleCreateHttpRequest,
  handleDeleteRequest,
  handleRenameRequest,
} from "~/lib/api/requests/treeActions/requestsHandlers";

export function meta({}: Route.MetaArgs) {
  return [
    {title: "Requests"},
    {name: "description", content: "API testing interface"},
  ];
}

export type TreeAction =
  | {type: "select"; id: string}
  | {type: "forceRefreshTree"}
  | {type: "updateColapseStates"; id: string; isOpen: boolean}
  | {type: "createCollection"} //name given via modal
  | {type: "deleteCollection"; id: string}
  | {type: "updateCollection"; id: string}
  | {type: "importCollection"}
  | {type: "exportCollection"; id: string}
  | {type: "createFolder"; parentId: string; location: "collection" | "folder"} //name given via modal
  | {type: "deleteFolder"; id: string}
  | {type: "updateFolder"; id: string}
  | {
      type: "createHttpRequest";
      parentId: string;
      location: "collection" | "folder";
    } //name and rest of dada given via model
  | {
      type: "createGrpcRequest";
      parentId: string;
      location: "collection" | "folder";
    }
  | {type: "renameHttpRequest"; id: string}
  | {type: "updateHttpRequest"}
  | {type: "renameRequest"; id: string}
  | {type: "deleteRequest"; id: string};

/* ---------------- MAIN COMPONENT ---------------- */

export default function Requests() {
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("selectedRequestId");
  });
  const [selectedRequest, setSelectedRequest] = useState<Request | null>(null);

  const [requests, setRequests] = useState<Request[]>([]);

  const [response, setResponse] = useState<MockResponse | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [scriptError, setScriptError] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const [environments, setEnvironments] = useState<EnvironmentDto[]>([]);
  const [activeEnvironment, setActiveEnvironment] = useState<string | null>(
    null,
  );
  const [showEnvModal, setShowEnvModal] = useState(false);
  const [activeEnvVars, setActiveEnvVars] = useState<Record<string, string>>(
    {},
  );

  const [showModal, setShowModal] = useState(false);
  const [modalContent, setModalContent] = useState<{
    title: string;
    fields: InputField[];
    onSubmit: (values: Record<string, string | File>) => void; // ✅ changed
  } | null>(null);

  useEffect(() => {
    if (!selectedId) return;

    const loadRequest = async () => {
      try {
        const data = await getRequestById(selectedId); // returns RequestDto

        let mappedRequest: Request;

        if (data.type === "http") {
          const pathParams = syncPathParamsWithUrl(
            data.url,
            toKeyValuePairs(data.pathParams ?? {}),
          );
          const queryParts = new URL(data.url, "http://placeholder.local");
          mappedRequest = {
            id: data.id,
            name: data.name,
            type: "http",
            method: data.method as HttpMethod,
            url: data.url,
            pathParams,
            headers: data.headers
              ? Object.entries(data.headers).map(([key, value]) => ({
                  key,
                  value,
                }))
              : [],
            queryParams: Array.from(queryParts.searchParams.entries()).map(
              ([key, value]) => ({key, value}),
            ),
            body:
              typeof data.body === "string" || data.body == null
                ? (data.body ?? "")
                : JSON.stringify(data.body),
            postScript: data.postScript,
            collectionId: data.collectionId ?? undefined,
          };
        } else if (data.type === "grpc") {
          mappedRequest = {
            id: data.id,
            name: data.name,
            type: "grpc",
            serverAddress: data.serverAddress ?? data.url ?? "",
            service: data.service ?? "",
            method: data.method ?? "",
            protoContent: data.protoContent ?? "",
            message: parseBodyToEditor(data.message),
            metadata: toHeaderPairs(data.metadata),
            collectionId: data.collectionId ?? undefined,
          };
        } else {
          throw new Error("Unknown request type");
        }

        console.log(mappedRequest);
        setSelectedRequest(mappedRequest);
      } catch (err) {
        console.error(err);
        setSelectedRequest(null);
      }
    };

    void loadRequest();
  }, [selectedId]);

  /* -------- LOAD ENVIRONMENTS -------- */

  const currentCollectionId = selectedRequest?.collectionId;

  useEffect(() => {
    if (!currentCollectionId) {
      setEnvironments([]);
      setActiveEnvironment(null);
      setActiveEnvVars({});
      return;
    }

    const loadEnvs = async () => {
      try {
        const [envs, collection] = await Promise.all([
          listEnvironments(currentCollectionId),
          getCollectionById(currentCollectionId),
        ]);
        setEnvironments(envs);
        const active = collection.activeEnvironment ?? null;
        setActiveEnvironment(active);
        const activeEnv = envs.find((e) => e.name === active);
        setActiveEnvVars(activeEnv?.vars ?? {});
      } catch (err) {
        console.error("Failed to load environments", err);
      }
    };

    void loadEnvs();
  }, [currentCollectionId]);

  const handleEnvSelect = useCallback(
    (name: string | null) => {
      if (!currentCollectionId) return;
      setActiveEnvironment(name);
      const env = environments.find((e) => e.name === name);
      setActiveEnvVars(env?.vars ?? {});
      void setActiveEnvApi(currentCollectionId, name).catch((err) =>
        console.error("Failed to persist active environment", err),
      );
    },
    [currentCollectionId, environments],
  );

  /* -------- UPDATE -------- */

  const updateRequestOld = useCallback((updated: Request) => {
    setRequests((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));

    setSelectedRequest(updated);

    setError(null);

    const base = {
      type: updated.type,
      name: updated.name,
      method: updated.method,
    };

    const payload =
      updated.type === "http"
        ? {
            ...base,
            url: buildUrlWithQuery(updated.url, updated.queryParams),
            pathParams: toKeyValueRecord(updated.pathParams),
            headers: toHeaderRecord(updated.headers),
            body: parseBodyToApi(updated.body),
            postScript: updated.postScript ?? "",
          }
        : {
            ...base,
            url: updated.serverAddress,
            serverAddress: updated.serverAddress,
            service: updated.service,
            protoContent: updated.protoContent,
            message: parseBodyToApi(updated.message),
            metadata: toHeaderRecord(updated.metadata),
          };

    void updateRequestApi(updated.id, payload).catch((err) => {
      setError(err instanceof Error ? err.message : "Failed to update request");
    });
  }, []);

  /* -------- SEND -------- */

  const handleSend = useCallback(() => {
    if (!selectedRequest) return;

    setError(null);
    setScriptError(null);

    console.log("Run started", {
      requestId: selectedRequest.id,
      type: selectedRequest.type,
      name: selectedRequest.name,
    });

    setLoading(true);
    setResponse(null);

    const collectionId =
      selectedRequest.type === "http"
        ? selectedRequest.collectionId
        : undefined;

    // For HTTP requests: build raw payloads (to restore after run) and interpolated payloads (to execute with)
    const rawHttpPayload =
      selectedRequest.type === "http"
        ? {
            type: "http" as const,
            name: selectedRequest.name,
            method: selectedRequest.method,
            url: buildUrlWithQuery(
              selectedRequest.url,
              selectedRequest.queryParams,
            ),
            pathParams: toKeyValueRecord(selectedRequest.pathParams),
            headers: toHeaderRecord(selectedRequest.headers),
            body: parseBodyToApi(selectedRequest.body),
            postScript: selectedRequest.postScript ?? "",
          }
        : null;

    const envVars = activeEnvVars;

    const interpolatedHttpPayload =
      selectedRequest.type === "http"
        ? {
            type: "http" as const,
            name: selectedRequest.name,
            method: selectedRequest.method,
            url: interpolateVariables(
              buildRequestUrl(
                selectedRequest.url,
                selectedRequest.pathParams,
                selectedRequest.queryParams,
              ),
              collectionId,
              envVars,
            ),
            pathParams: toKeyValueRecord(selectedRequest.pathParams),
            headers: toHeaderRecord(
              selectedRequest.headers.map((h) => ({
                key: h.key,
                value: interpolateVariables(h.value, collectionId, envVars),
              })),
            ),
            body: parseBodyToApi(
              interpolateVariables(selectedRequest.body, collectionId, envVars),
            ),
            postScript: selectedRequest.postScript ?? "",
          }
        : null;

    const rawGrpcPayload =
      selectedRequest.type === "grpc"
        ? {
            type: "grpc" as const,
            name: selectedRequest.name,
            method: selectedRequest.method,
            url: selectedRequest.serverAddress,
            serverAddress: selectedRequest.serverAddress,
            service: selectedRequest.service,
            protoContent: selectedRequest.protoContent,
            message: parseBodyToApi(selectedRequest.message),
            metadata: toHeaderRecord(selectedRequest.metadata),
          }
        : null;

    const interpolatedGrpcPayload =
      selectedRequest.type === "grpc"
        ? {
            type: "grpc" as const,
            name: selectedRequest.name,
            method: selectedRequest.method,
            url: interpolateVariables(
              selectedRequest.serverAddress,
              collectionId,
              envVars,
            ),
            serverAddress: interpolateVariables(
              selectedRequest.serverAddress,
              collectionId,
              envVars,
            ),
            service: selectedRequest.service,
            protoContent: selectedRequest.protoContent,
            message: parseBodyToApi(
              interpolateVariables(
                selectedRequest.message,
                collectionId,
                envVars,
              ),
            ),
            metadata: toHeaderRecord(
              selectedRequest.metadata.map((m) => ({
                key: m.key,
                value: interpolateVariables(m.value, collectionId, envVars),
              })),
            ),
          }
        : null;

    // Save interpolated values so backend executes with resolved variables
    const persistPromise = interpolatedHttpPayload
      ? updateRequestApi(selectedRequest.id, interpolatedHttpPayload)
      : updateRequestApi(selectedRequest.id, interpolatedGrpcPayload!);

    void persistPromise
      .catch((err) => {
        const saveError =
          err instanceof Error
            ? err.message
            : "Failed to save request before run";
        setError(`${saveError}. Running last saved version.`);
        console.warn(
          "Request save before run failed; using last saved version",
          {
            requestId: selectedRequest.id,
            error: saveError,
          },
        );
      })
      .then(() => runRequest(selectedRequest.id))
      .then((results) => {
        const first = results[0];
        console.log("Run results", {
          requestId: selectedRequest.id,
          type: selectedRequest.type,
          results,
        });
        if (!first) {
          throw new Error("No run result returned");
        }

        if (selectedRequest.type === "grpc") {
          const fallbackBody = JSON.stringify(
            {
              ok: first.ok,
              status: first.status,
              statusText: first.statusText,
              messageSent: parseBodyToApi(selectedRequest.message),
            },
            null,
            2,
          );
          setResponse(toResponsePanelModel({...first, fallbackBody}));
          return;
        }

        const panelModel = toResponsePanelModel(first);
        setResponse(panelModel);

        if (selectedRequest.type === "http" && selectedRequest.postScript) {
          const scriptErr = runPostScript(
            selectedRequest.postScript,
            {
              status: panelModel.status,
              statusText: panelModel.statusText,
              headers: Object.fromEntries(
                panelModel.headers.map((h) => [h.key, h.value]),
              ),
              body: panelModel.body,
            },
            collectionId,
            envVars,
          );
          if (scriptErr) {
            setScriptError(`Script error: ${scriptErr.message}`);
          }
        }
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to run request");
        console.error("Run request failed", {
          requestId: selectedRequest.id,
          type: selectedRequest.type,
          error: err,
        });
      })
      .finally(() => {
        setLoading(false);
        // Restore raw template values so {{vars}} are preserved in the stored file,
        // but only if the user hasn't switched to a different request while in-flight.
        if (rawHttpPayload) {
          setSelectedRequest((current) => {
            if (
              current &&
              current.id === selectedRequest.id &&
              current.type === "http"
            ) {
              void updateRequestApi(selectedRequest.id, rawHttpPayload).catch(
                () => {},
              );
            }
            return current;
          });
        }
        if (rawGrpcPayload) {
          setSelectedRequest((current) => {
            if (
              current &&
              current.id === selectedRequest.id &&
              current.type === "grpc"
            ) {
              void updateRequestApi(selectedRequest.id, rawGrpcPayload).catch(
                () => {},
              );
            }
            return current;
          });
        }
      });
  }, [selectedRequest, activeEnvVars]);

  const handleTreeAction = (action: TreeAction) => {
    switch (action.type) {
      case "forceRefreshTree":
        setRefreshKey((prev) => prev + 1);
        break;

      case "select":
        setSelectedId(action.id);
        setResponse(null);
        setError(null);
        localStorage.setItem("selectedRequestId", action.id); // ✅ ADD THIS

        console.log(requests);
        break;

      case "createCollection":
        handleCreateCollection({openModal, setRefreshKey});
        break;

      case "deleteCollection":
        handleDeleteCollection({id: action.id, setRefreshKey});
        break;

      case "updateCollection":
        handleUpdateCollection({
          id: action.id,
          openModal,
          setRefreshKey,
        });
        break;

      case "importCollection":
        handleImportCollection({openModal, setRefreshKey});
        break;

      case "exportCollection":
        handleExportCollection({id: action.id});
        break;

      case "createFolder":
        handleCreateFolder({
          location: action.location,
          parentId: action.parentId,
          openModal,
          setRefreshKey,
        });
        break;

      case "deleteFolder":
        handleDeleteFolder({id: action.id, setRefreshKey});
        break;

      case "updateFolder":
        handleUpdateFolder({
          id: action.id,
          openModal,
          setRefreshKey,
        });
        break;

      case "createHttpRequest":
        handleCreateHttpRequest({
          location: action.location,
          parentId: action.parentId,
          openModal,
          setRefreshKey,
        });
        break;

      case "renameRequest":
        handleRenameRequest({
          id: action.id,
          openModal,
          setRefreshKey,
        });
        break;

      case "deleteRequest":
        handleDeleteRequest({id: action.id, setRefreshKey});
        break;

      case "createGrpcRequest":
        handleCreateGrpcRequest({
          location: action.location,
          parentId: action.parentId,
          openModal,
          setRefreshKey,
        });
        break;
    }
  };

  const openModal = (
    title: string,
    fields: InputField[],
    onSubmit: (values: Record<string, string | File>) => void,
  ) => {
    setModalContent({title, fields, onSubmit});
    setShowModal(true);
  };

  return (
    <div className="flex w-full h-full">
      <ResizablePanelGroup orientation="horizontal" className="w-full">
        <ResizablePanel defaultSize="20%" className="min-h-0 overflow-hidden">
          <RequestsBar
            // requests={requests}
            selectedId={selectedId}
            onAction={handleTreeAction}
            refreshKey={refreshKey}
            // onAdd={addRequest}
            // onDelete={deleteRequest}
            // onRename={handleRename}
          />
        </ResizablePanel>

        <ResizableHandle withHandle />

        <ResizablePanel>
          {selectedRequest ? (
            <ResizablePanelGroup orientation="vertical" className="w-full">
              <ResizablePanel defaultSize="55%">
                <div className="p-4 h-full">
                  {selectedRequest.type === "http" ? (
                    <HttpRequestEditor
                      request={selectedRequest}
                      onChange={updateRequestOld}
                      onSend={handleSend}
                      envSelector={
                        currentCollectionId ? (
                          <EnvironmentSelector
                            environments={environments}
                            activeEnvironment={activeEnvironment}
                            onSelect={handleEnvSelect}
                            onManage={() => setShowEnvModal(true)}
                          />
                        ) : undefined
                      }
                    />
                  ) : (
                    <GrpcRequestEditor
                      request={selectedRequest}
                      onChange={updateRequestOld}
                      onSend={handleSend}
                      envVars={activeEnvVars}
                      envSelector={
                        currentCollectionId ? (
                          <EnvironmentSelector
                            environments={environments}
                            activeEnvironment={activeEnvironment}
                            onSelect={handleEnvSelect}
                            onManage={() => setShowEnvModal(true)}
                          />
                        ) : undefined
                      }
                    />
                  )}
                </div>
              </ResizablePanel>

              <ResizableHandle withHandle />

              <ResizablePanel defaultSize="45%">
                <ResponsePanel response={response} loading={loading} />
              </ResizablePanel>
            </ResizablePanelGroup>
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              <div className="text-center space-y-3">
                <div className="flex gap-3 justify-center">
                  <Globe className="h-8 w-8 opacity-40" />
                  <Server className="h-8 w-8 opacity-40" />
                </div>
                <p className="text-sm">Select or create a request</p>
              </div>
            </div>
          )}

          {error && (
            <div className="px-4 py-2 text-xs text-red-500 border-t border-border">
              {error}
            </div>
          )}
          {scriptError && (
            <div className="px-4 py-2 text-xs text-amber-600 border-t border-border flex items-center justify-between gap-2">
              <span>{scriptError}</span>
              <button
                className="shrink-0 hover:text-amber-800"
                onClick={() => setScriptError(null)}
              >
                ✕
              </button>
            </div>
          )}
        </ResizablePanel>
      </ResizablePanelGroup>
      {showModal && modalContent && (
        <ModalForm
          title={modalContent.title}
          fields={modalContent.fields}
          onSubmit={(values) => {
            modalContent.onSubmit(values); // run the action
            setShowModal(false); // close modal
            setModalContent(null); // reset
          }}
          onClose={() => {
            setShowModal(false);
            setModalContent(null);
          }}
        />
      )}
      {showEnvModal && currentCollectionId && (
        <EnvironmentsModal
          collectionId={currentCollectionId}
          environments={environments}
          onClose={() => setShowEnvModal(false)}
          onRefresh={(updated) => {
            setEnvironments(updated);
            const activeEnv = updated.find((e) => e.name === activeEnvironment);
            setActiveEnvVars(activeEnv?.vars ?? {});
          }}
        />
      )}
    </div>
  );
}
