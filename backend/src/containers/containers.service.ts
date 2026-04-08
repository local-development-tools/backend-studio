import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  MessageEvent,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import Docker from 'dockerode';
import { statSync } from 'node:fs';
import { join } from 'node:path';
import { PassThrough, Readable } from 'stream';
import { Observable, Subject } from 'rxjs';
import { map } from 'rxjs/operators';

const MICROSERVICES_MOUNT = '/microservices';
type DockerContainerInfo = Awaited<ReturnType<Docker['listContainers']>>[number];

type ContainerLifecycleAction = 'start' | 'stop' | 'restart' | 'pause' | 'unpause' | 'kill';

const docker = new Docker();

@Injectable()
export class ContainersService implements OnModuleInit, OnModuleDestroy {
  private static readonly defaultLogLineLimit = 100;
  private static readonly maxLogLineLimit = 5000;

  private static readonly lifecycleActions = new Set<ContainerLifecycleAction>([
    'start',
    'stop',
    'restart',
    'pause',
    'unpause',
    'kill',
  ]);

  private static readonly dockerLifecycleEventActions = new Set<string>([
    'create',
    'start',
    'restart',
    'stop',
    'die',
    'kill',
    'pause',
    'unpause',
    'destroy',
  ]);

  private readonly lifecycleEvents = new Subject<ContainerLifecyclePayload>();
  private dockerEventsStream: Readable | null = null;
  private dockerEventsBuffer = '';
  private reconnectTimeout: NodeJS.Timeout | null = null;

  onModuleInit(): void {
    void this.startDockerLifecycleEventsListener();
  }

  onModuleDestroy(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.dockerEventsStream) {
      this.dockerEventsStream.removeAllListeners();
      this.dockerEventsStream.destroy();
      this.dockerEventsStream = null;
    }

    this.lifecycleEvents.complete();
  }

  async getContainers(): Promise<any> {
    try {
      const containers = await docker.listContainers({ all: true });
      return containers.map((container) => this.toContainerResponse(container));
    } catch (error) {
      this.throwDockerError(error);
    }
  }

  async getRunningContainers(): Promise<any> {
    try {
      const containers = await docker.listContainers({ all: false });
      return containers.map((container) => this.toContainerResponse(container));
    } catch (error) {
      this.throwDockerError(error);
    }
  }

  async getContainersByStack(stackName: string): Promise<any> {
    try {
      const containers = await docker.listContainers({ all: true });
      return containers
        .filter((container) => container.Labels?.['com.docker.compose.project'] === stackName)
        .map((container) => this.toContainerResponse(container));
    } catch (error) {
      this.throwDockerError(error);
    }
  }

  async getContainersWithoutStack(): Promise<any> {
    try {
      const containers = await docker.listContainers({ all: true });
      return containers
        .filter((container) => !container.Labels?.['com.docker.compose.project'])
        .map((container) => this.toContainerResponse(container));
    } catch (error) {
      this.throwDockerError(error);
    }
  }

  async getStackNames(): Promise<string[]> {
    try {
      const containers = await docker.listContainers({ all: true });
      const stackNames = new Set<string>();
      containers.forEach((container) => {
        const stackName = container.Labels?.['com.docker.compose.project'];
        if (stackName) {
          stackNames.add(stackName);
        }
      });
      return Array.from(stackNames);
    } catch (error) {
      this.throwDockerError(error);
    }
  }

  async controlContainerLifecycle(containerId: string, action: string): Promise<any> {
    const normalizedAction = action.toLowerCase() as ContainerLifecycleAction;
    if (!ContainersService.lifecycleActions.has(normalizedAction)) {
      throw new BadRequestException(
        `Unsupported lifecycle action: ${action}. Allowed actions: ${Array.from(ContainersService.lifecycleActions).join(', ')}`,
      );
    }

    try {
      const container = docker.getContainer(containerId);
      await this.runLifecycleAction(container, normalizedAction);
      const refreshed = await this.getContainerById(containerId);

      return {
        action: normalizedAction,
        container: this.toContainerResponse(refreshed),
      };
    } catch (error) {
      this.throwDockerError(error, { containerId });
    }
  }

  async streamContainerLogs(containerId: string, lineLimit?: number): Promise<NodeJS.ReadableStream> {
    const normalizedLineLimit = this.normalizeLogLineLimit(lineLimit);

    try {
      const container = docker.getContainer(containerId);
      const stream = await container.logs({
        stdout: true,
        stderr: true,
        follow: true,
        tail: normalizedLineLimit,
        timestamps: true,
      });
      const output = new PassThrough();
      docker.modem.demuxStream(stream, output, output);
      stream.on('end', () => output.end());
      stream.on('error', (error: Error) => output.destroy(error));
      return output;
    } catch (error) {
      this.throwDockerError(error, { containerId });
    }
  }

  async getStaleContainers(stackName: string): Promise<{ containerId: string; stale: boolean }[]> {
    try {
      const containers = await docker.listContainers({ all: false });
      const stackContainers = containers.filter((c) => c.Labels?.['com.docker.compose.project'] === stackName);

      const results: { containerId: string; stale: boolean }[] = [];

      for (const container of stackContainers) {
        const serviceName = container.Labels?.['com.docker.compose.service'];
        if (!serviceName) continue;

        const folder = serviceName.split('-')[0];
        const pyprojectPath = join(MICROSERVICES_MOUNT, folder, 'pyproject.toml');

        let pyprojectMtime: Date;
        try {
          pyprojectMtime = statSync(pyprojectPath).mtime;
        } catch {
          continue;
        }

        let imageBuildTime: Date;
        try {
          const imageInfo = await docker.getImage(container.ImageID).inspect();
          imageBuildTime = new Date(imageInfo.Created);
        } catch {
          continue;
        }

        results.push({
          containerId: container.Id,
          stale: pyprojectMtime > imageBuildTime,
        });
      }

      return results;
    } catch (error) {
      this.throwDockerError(error);
    }
  }

  streamContainerLifecycle(): Observable<MessageEvent> {
    return this.lifecycleEvents
      .asObservable()
      .pipe(map((event) => ({ type: 'container.lifecycle', data: event }) as MessageEvent));
  }

  private toContainerResponse(container: DockerContainerInfo) {
    return {
      id: container.Id,
      names: container.Names,
      state: container.State,
      imageid: container.ImageID,
      image: container.Image,
      status: container.Status,
      created: container.Created,
      ports: container.Ports,
      stack: container.Labels?.['com.docker.compose.project'] || null,
      service: container.Labels?.['com.docker.compose.service'] || null,
    };
  }

  private async startDockerLifecycleEventsListener(): Promise<void> {
    try {
      const stream = await docker.getEvents({
        filters: { type: ['container'] },
      });
      this.dockerEventsStream = stream;
      this.dockerEventsBuffer = '';

      stream.on('data', (chunk: Buffer) => this.handleDockerEventsChunk(chunk));
      stream.on('error', () => this.scheduleDockerEventsReconnect());
      stream.on('end', () => this.scheduleDockerEventsReconnect());
      stream.on('close', () => this.scheduleDockerEventsReconnect());
    } catch {
      this.scheduleDockerEventsReconnect();
    }
  }

  private scheduleDockerEventsReconnect(): void {
    if (this.reconnectTimeout) {
      return;
    }

    if (this.dockerEventsStream) {
      this.dockerEventsStream.removeAllListeners();
      this.dockerEventsStream = null;
    }

    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = null;
      void this.startDockerLifecycleEventsListener();
    }, 3000);
  }

  private handleDockerEventsChunk(chunk: Buffer): void {
    this.dockerEventsBuffer += chunk.toString('utf-8');
    const lines = this.dockerEventsBuffer.split('\n');
    this.dockerEventsBuffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }

      this.handleDockerLifecycleEventLine(trimmed);
    }
  }

  private handleDockerLifecycleEventLine(eventLine: string): void {
    try {
      const event = JSON.parse(eventLine) as DockerEventPayload;
      const action = (event.Action ?? event.status ?? '').toLowerCase();

      if (event.Type !== 'container' || !ContainersService.dockerLifecycleEventActions.has(action)) {
        return;
      }

      const containerId = event.id ?? event.Actor?.ID;
      if (!containerId) {
        return;
      }

      void this.publishLifecycleEvent(containerId, action, event);
    } catch {
      return;
    }
  }

  private async publishLifecycleEvent(containerId: string, action: string, event: DockerEventPayload): Promise<void> {
    const actorAttributes = event.Actor?.Attributes;
    const snapshot = await this.getContainerSnapshot(containerId);

    this.lifecycleEvents.next({
      id: containerId,
      action,
      state: snapshot?.state ?? this.mapStateFromLifecycleAction(action),
      status: snapshot?.status ?? action,
      names: snapshot?.names ?? this.toNames(actorAttributes?.name),
      image: snapshot?.image ?? actorAttributes?.image ?? null,
      stack: snapshot?.stack ?? actorAttributes?.['com.docker.compose.project'] ?? null,
      service: snapshot?.service ?? actorAttributes?.['com.docker.compose.service'] ?? null,
      timestamp: this.toIsoTimestamp(event.timeNano ?? event.time),
    });
  }

  private async getContainerSnapshot(containerId: string): Promise<ContainerSnapshot | null> {
    try {
      const inspect = await docker.getContainer(containerId).inspect();
      return {
        state: inspect.State?.Status ?? null,
        status: inspect.State?.Status ?? null,
        names: this.toNames(inspect.Name),
        image: inspect.Config?.Image ?? null,
        stack: inspect.Config?.Labels?.['com.docker.compose.project'] ?? null,
        service: inspect.Config?.Labels?.['com.docker.compose.service'] ?? null,
      };
    } catch {
      return null;
    }
  }

  private toNames(name?: string): string[] {
    if (!name) {
      return [];
    }

    const normalized = name.startsWith('/') ? name : `/${name}`;
    return [normalized];
  }

  private mapStateFromLifecycleAction(action: string): string {
    switch (action) {
      case 'create':
        return 'created';
      case 'start':
      case 'restart':
      case 'unpause':
        return 'running';
      case 'stop':
      case 'die':
      case 'kill':
        return 'exited';
      case 'pause':
        return 'paused';
      case 'destroy':
        return 'removed';
      default:
        return action;
    }
  }

  private toIsoTimestamp(time?: number): string {
    if (!time) {
      return new Date().toISOString();
    }

    if (time > 10_000_000_000) {
      return new Date(Math.floor(time / 1_000_000)).toISOString();
    }

    return new Date(time * 1000).toISOString();
  }

  private async runLifecycleAction(container: Docker.Container, action: ContainerLifecycleAction): Promise<void> {
    switch (action) {
      case 'start':
        await container.start();
        return;
      case 'stop':
        await container.stop();
        return;
      case 'restart':
        await container.restart();
        return;
      case 'pause':
        await container.pause();
        return;
      case 'unpause':
        await container.unpause();
        return;
      case 'kill':
        await container.kill();
        return;
    }
  }

  private async getContainerById(containerId: string): Promise<DockerContainerInfo> {
    const containers: DockerContainerInfo[] = await docker.listContainers({ all: true });
    const container = containers.find((item) => item.Id === containerId || item.Id.startsWith(containerId));

    if (!container) {
      throw new NotFoundException(`Container not found: ${containerId}`);
    }

    return container;
  }

  private throwDockerError(error: unknown, context?: { containerId?: string }): never {
    if (this.isDockerUnavailableError(error)) {
      throw new ServiceUnavailableException(
        'Docker is not connected. Ensure Docker Desktop/daemon is running and reachable, then try again.',
      );
    }

    if (this.isContainerNotFoundError(error)) {
      const containerLabel = context?.containerId ? `: ${context.containerId}` : '';
      throw new NotFoundException(`Container not found${containerLabel}`);
    }

    throw new InternalServerErrorException(this.getDockerErrorMessage(error));
  }

  private isDockerUnavailableError(error: unknown): boolean {
    const nodeError = error as NodeJS.ErrnoException & { message?: string };
    const message = nodeError?.message?.toLowerCase() ?? '';
    const code = nodeError?.code;

    if (code && ['ENOENT', 'ECONNREFUSED', 'EHOSTUNREACH', 'ETIMEDOUT', 'ECONNRESET'].includes(code)) {
      return true;
    }

    return (
      message.includes('cannot connect to the docker daemon') ||
      message.includes('is the docker daemon running') ||
      message.includes('connect enoent') ||
      message.includes('connect econnrefused') ||
      message.includes('docker desktop is not running') ||
      message.includes('socket hang up')
    );
  }

  private isContainerNotFoundError(error: unknown): boolean {
    const dockerError = error as {
      statusCode?: number;
      reason?: string;
      message?: string;
    };
    const message = dockerError?.message?.toLowerCase() ?? '';
    const reason = dockerError?.reason?.toLowerCase() ?? '';

    return (
      dockerError?.statusCode === 404 ||
      message.includes('no such container') ||
      reason.includes('no such container') ||
      message.includes('container not found')
    );
  }

  private getDockerErrorMessage(error: unknown): string {
    if (error instanceof Error && error.message) {
      return `Docker operation failed: ${error.message}`;
    }

    return 'Docker operation failed due to an unknown error.';
  }

  private normalizeLogLineLimit(lineLimit?: number): number {
    if (!Number.isFinite(lineLimit)) {
      return ContainersService.defaultLogLineLimit;
    }

    const integerLimit = Math.trunc(lineLimit as number);
    if (integerLimit <= 0) {
      return ContainersService.defaultLogLineLimit;
    }

    return Math.min(integerLimit, ContainersService.maxLogLineLimit);
  }
}

type DockerEventPayload = {
  Type?: string;
  Action?: string;
  status?: string;
  id?: string;
  time?: number;
  timeNano?: number;
  Actor?: {
    ID?: string;
    Attributes?: Record<string, string>;
  };
};

type ContainerSnapshot = {
  state: string | null;
  status: string | null;
  names: string[];
  image: string | null;
  stack: string | null;
  service: string | null;
};

type ContainerLifecyclePayload = {
  id: string;
  action: string;
  state: string;
  status: string;
  names: string[];
  image: string | null;
  stack: string | null;
  service: string | null;
  timestamp: string;
};
