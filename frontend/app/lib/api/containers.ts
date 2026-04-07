import { API_BASE_URL } from '~/lib/api/config';

// --- Types ---
export interface ContainerDto {
  id: string;
  names: string[];
  state: "running" | "exited";
  stack: string;
}

export type StackNameDto = string;

export interface ContainerLifecycleEvent {
  id: string;
  action: string;
  state: string;
  status: string;
  names: string[];
  image: string | null;
  stack: string | null;
  service: string | null;
  timestamp: string;
}

// --- API functions ---
export function getContainers(): Promise<ContainerDto[]> {
  return fetch(`${API_BASE_URL}/containers`).then((res) => {
    if (!res.ok) throw new Error("Failed to fetch containers");
    return res.json() as Promise<ContainerDto[]>; // type assertion
  });
}

export function getRunningContainers(): Promise<ContainerDto[]> {
  return fetch(`${API_BASE_URL}/containers/running`).then(
    (res) => {
      if (!res.ok) throw new Error("Failed to fetch running containers");
      return res.json() as Promise<ContainerDto[]>;
    },
  );
}

export function getContainersByStack(
  stackName: string,
): Promise<ContainerDto[]> {
  return fetch(
    `${API_BASE_URL}/containers/stack/${stackName}`,
  ).then((res) => {
    if (!res.ok)
      throw new Error(`Failed to fetch containers for stack ${stackName}`);
    return res.json() as Promise<ContainerDto[]>;
  });
}

export function getContainersWithoutStack(): Promise<ContainerDto[]> {
  return fetch(`${API_BASE_URL}/containers/nostack`).then(
    (res) => {
      if (!res.ok) throw new Error("Failed to fetch containers without stack");
      return res.json() as Promise<ContainerDto[]>;
    },
  );
}

export function getStackNames(): Promise<StackNameDto[]> {
  return fetch(`${API_BASE_URL}/containers/stackNames`).then(
    (res) => {
      if (!res.ok) throw new Error("Failed to fetch stack names");
      return res.json() as Promise<StackNameDto[]>;
    },
  );
}

export function getStaleContainers(
  stack: string,
): Promise<{ containerId: string; stale: boolean }[]> {
  return fetch(
    `${API_BASE_URL}/containers/stale/${encodeURIComponent(stack)}`,
  ).then((res) => {
    if (!res.ok) throw new Error(`Failed to fetch stale containers for stack ${stack}`);
    return res.json() as Promise<{ containerId: string; stale: boolean }[]>;
  });
}

export function streamContainerLifecycle(
  onEvent: (event: ContainerLifecycleEvent) => void,
  onError?: (error: Event) => void,
): EventSource {
  const sse = new EventSource(
    `${API_BASE_URL}/containers/lifecycle/stream`,
  );

  const handleMessage = (messageEvent: MessageEvent<string>) => {
    try {
      const payload = JSON.parse(messageEvent.data) as ContainerLifecycleEvent;
      onEvent(payload);
    } catch (error) {
      console.error("Failed to parse container lifecycle SSE event", error);
    }
  };

  sse.onmessage = handleMessage;
  sse.addEventListener("container.lifecycle", (event) => {
    handleMessage(event as MessageEvent<string>);
  });

  sse.onerror = (error) => {
    onError?.(error);
  };

  return sse;
}
