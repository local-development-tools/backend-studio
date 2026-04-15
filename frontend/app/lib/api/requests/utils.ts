import type { GrpcRequest, HttpMethod, HttpRequest, MockResponse } from "~/components/requests/types";
import type { ApiRequest } from "./listRootRequests";

const PATH_PARAM_PATTERN = /:([A-Za-z0-9_]+)/g;

type KeyValueItem = {key: string; value: string; enabled?: boolean};

export const toHeaderPairs = (headers?: Record<string, string>) =>
  Object.entries(headers ?? {}).map(([key, value]) => ({key, value}));

export const toKeyValuePairs = (values?: Record<string, string>) =>
  Object.entries(values ?? {}).map(([key, value]) => ({key, value}));

export const toHeaderRecord = (headers: {key: string; value: string}[]) =>
  headers.reduce<Record<string, string>>((acc, item) => {
    const key = item.key.trim();
    if (key) {
      acc[key] = item.value;
    }
    return acc;
  }, {});

export const toKeyValueRecord = (items: {key: string; value: string; enabled?: boolean}[]) =>
  items.reduce<Record<string, string>>((acc, item) => {
    const key = item.key.trim();
    if (key && item.enabled !== false) {
      acc[key] = item.value;
    }
    return acc;
  }, {});

export const parseBodyToEditor = (body: unknown): string => {
  if (body === undefined || body === null) {
    return "";
  }
  if (typeof body === "string") {
    return body;
  }
  try {
    return JSON.stringify(body, null, 2);
  } catch {
    return String(body);
  }
};

export const parseBodyToApi = (body: string): unknown => {
  const trimmed = body.trim();
  if (!trimmed) {
    return undefined;
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    return body;
  }
};

export const parseUrlParts = (
  url: string,
): {url: string; pathParams: {key: string; value: string}[]; queryParams: {key: string; value: string}[]} => {
  const uniquePathParams = (input: string) => {
    const names = new Set<string>();
    for (const match of input.matchAll(PATH_PARAM_PATTERN)) {
      names.add(match[1]);
    }
    return Array.from(names).map((key) => ({key, value: ""}));
  };

  try {
    const parsed = new URL(url);
    return {
      url: `${parsed.origin}${parsed.pathname}`,
      pathParams: uniquePathParams(parsed.pathname),
      queryParams: Array.from(parsed.searchParams.entries()).map(
        ([key, value]) => ({key, value}),
      ),
    };
  } catch {
    const [pathname, search = ""] = url.split("?");
    return {
      url: pathname,
      pathParams: uniquePathParams(pathname),
      queryParams: Array.from(new URLSearchParams(search).entries()).map(
        ([key, value]) => ({key, value}),
      ),
    };
  }
};

export const syncPathParamsWithUrl = (
  url: string,
  currentParams: KeyValueItem[] = [],
): KeyValueItem[] => {
  const names = parseUrlParts(url).pathParams.map((item) => item.key);
  const existingValues = new Map(currentParams.map((item) => [item.key, item]));

  return names.map((key) => {
    const existing = existingValues.get(key);
    return {
      key,
      value: existing?.value ?? "",
      enabled: existing?.enabled ?? true,
    };
  });
};

export const buildUrlWithPathParams = (
  baseUrl: string,
  pathParams: KeyValueItem[],
): string => {
  const filtered = pathParams.filter((item) => item.key.trim() && item.enabled !== false);
  if (filtered.length === 0) {
    return baseUrl;
  }

  const replacePathParams = (value: string) =>
    value.replace(PATH_PARAM_PATTERN, (match, key: string) => {
      const param = filtered.find((item) => item.key === key);
      if (!param) {
        return match;
      }
      return encodeURIComponent(param.value);
    });

  try {
    const parsed = new URL(baseUrl);
    parsed.pathname = replacePathParams(parsed.pathname);
    return parsed.toString();
  } catch {
    return replacePathParams(baseUrl);
  }
};

export const buildUrlWithQuery = (
  baseUrl: string,
  queryParams: KeyValueItem[],
): string => {
  const filtered = queryParams.filter((item) => item.key.trim() && item.enabled !== false);
  if (filtered.length === 0) {
    return baseUrl;
  }

  try {
    const parsed = new URL(baseUrl);
    parsed.search = "";
    filtered.forEach((item) =>
      parsed.searchParams.append(item.key, item.value),
    );
    return parsed.toString();
  } catch {
    const query = filtered
      .map(
        (item) =>
          `${encodeURIComponent(item.key)}=${encodeURIComponent(item.value)}`,
      )
      .join("&");
    const clean = baseUrl.split("?")[0];
    return `${clean}?${query}`;
  }
};

export const buildRequestUrl = (
  baseUrl: string,
  pathParams: KeyValueItem[],
  queryParams: KeyValueItem[],
): string => buildUrlWithQuery(buildUrlWithPathParams(baseUrl, pathParams), queryParams);

export const toHttpRequest = (item: ApiRequest): HttpRequest => {
  const parsedUrl = parseUrlParts(item.url);
  return {
    id: item.id,
    name: item.name,
    type: "http",
    method: (item.method?.toUpperCase() as HttpMethod) || "GET",
    url: parsedUrl.url,
    pathParams: syncPathParamsWithUrl(item.url, toKeyValuePairs(item.pathParams ?? {})),
    headers: toHeaderPairs(item.headers),
    queryParams: parsedUrl.queryParams,
    body: parseBodyToEditor(item.body),
  };
};

export const toGrpcRequest = (item: ApiRequest): GrpcRequest => ({
  id: item.id,
  name: item.name,
  type: "grpc",
  serverAddress: item.serverAddress ?? item.url ?? "localhost:50051",
  service: item.service ?? "",
  method: item.method,
  protoContent: item.protoContent ?? "",
  message: parseBodyToEditor(item.message),
  metadata: toHeaderPairs(item.metadata),
  collectionId: item.collectionId ?? undefined,
});

export const toResponsePanelModel = (result: {
  status?: number;
  statusText?: string;
  headers?: Record<string, string>;
  durationMs: number;
  bodyText?: string;
  bodyJson?: unknown;
  error?: string;
  fallbackBody?: string;
}): MockResponse => {
  const body =
    result.bodyText ??
    (result.bodyJson !== undefined
      ? JSON.stringify(result.bodyJson, null, 2)
      : (result.error ?? result.fallbackBody ?? ""));
  return {
    status: result.status ?? 0,
    statusText: result.statusText ?? (result.error ? "Error" : "Unknown"),
    time: result.durationMs,
    size: `${new Blob([body]).size} B`,
    headers: Object.entries(result.headers ?? {}).map(([key, value]) => ({
      key,
      value,
    })),
    body,
  };
};