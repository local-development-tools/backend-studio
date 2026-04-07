import { useState } from "react";
import { createRootRequest } from "~/lib/api/requests/createRootRequest";
import { listRootRequests, type ApiRequest } from "~/lib/api/requests/listRootRequests";
import { getRequestById } from "~/lib/api/requests/getRequestById";
import { updateRequest } from "~/lib/api/requests/updateRequest";
import { runRequest, type RunRequestResult } from "~/lib/api/requests/runRequest";
import { Button } from "~/components/ui/button";
import type { Route } from "./+types/requests-api-test";
import { deleteRequest } from "~/lib/api/requests/fileStructure/requests";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Requests API Test" },
    { name: "description", content: "Manual browser test page for request API helpers" },
  ];
}

export default function RequestsApiTestPage() {
  const [activeRequestId, setActiveRequestId] = useState<string | null>(null);
  const [createdRequest, setCreatedRequest] = useState<ApiRequest | null>(null);
  const [updatedName, setUpdatedName] = useState("Updated Request Name");
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const withAction = async (action: () => Promise<void>) => {
    setLoading(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () =>
    withAction(async () => {
      const created = await createRootRequest({
        name: `Test Request ${Date.now()}`,
        method: "GET",
        url: "https://httpbin.org/get",
      });
      setCreatedRequest(created);
      setActiveRequestId(created.id);
      setResult(created);
    });

  const handleList = () =>
    withAction(async () => {
      const requests = await listRootRequests();
      if (!activeRequestId && requests.length > 0) {
        setActiveRequestId(requests[0].id);
      }
      setResult(requests);
    });

  const requireRequestId = (): string => {
    if (!activeRequestId) {
      throw new Error("Create a request first (or run list to pick one automatically)");
    }

    return activeRequestId;
  };

  const handleGetById = () =>
    withAction(async () => {
      const request = await getRequestById(requireRequestId());
      setResult(request);
    });

  const handleUpdate = () =>
    withAction(async () => {
      const updated = await updateRequest(requireRequestId(), { name: updatedName });
      setResult(updated);
    });

  const handleRun = () =>
    withAction(async () => {
      const runResults = await runRequest(requireRequestId());
      setResult(runResults as RunRequestResult[]);
    });

  const handleDelete = () =>
    withAction(async () => {
      const requestId = requireRequestId();
      await deleteRequest(requestId);
      setResult({ deleted: requestId });
      setActiveRequestId(null);
      setCreatedRequest(null);
    });

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-semibold">Requests API Test</h1>

      <div className="space-y-2">
        <label className="block text-sm">Updated Name</label>
        <input
          className="w-full rounded border border-input bg-background px-3 py-2 text-sm"
          value={updatedName}
          onChange={(event) => setUpdatedName(event.target.value)}
          placeholder="Name used by update"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={handleCreate} disabled={loading}>Create Root Request</Button>
        <Button onClick={handleList} disabled={loading} variant="secondary">List Root Requests</Button>
        <Button onClick={handleGetById} disabled={loading} variant="secondary">Get By ID</Button>
        <Button onClick={handleUpdate} disabled={loading}>Update</Button>
        <Button onClick={handleRun} disabled={loading} variant="secondary">Run</Button>
        <Button onClick={handleDelete} disabled={loading} variant="destructive">Delete</Button>
      </div>

      {createdRequest && (
        <p className="text-sm text-muted-foreground">Created request id: {createdRequest.id}</p>
      )}
      {activeRequestId && (
        <p className="text-sm text-muted-foreground">Active request id: {activeRequestId}</p>
      )}

      {error && <p className="text-sm text-red-500">Error: {error}</p>}

      <pre className="rounded border border-border bg-muted p-3 text-xs overflow-auto max-h-[420px]">
        {JSON.stringify(result, null, 2)}
      </pre>
    </div>
  );
}
