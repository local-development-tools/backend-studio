import { Controller, Get, Param, Post, Query, Sse, MessageEvent } from '@nestjs/common';
import { Observable } from 'rxjs';
import { ContainersService } from './containers.service';
import { FormattedLogEvent, LogFormatterService } from './log-formatter.service';

@Controller('containers')
export class ContainersController {
  private static readonly tracebackStartPattern = /^(?:[A-Z]+:\s+)?Traceback \(.+?\):/i;
  private static readonly tracebackEndPattern =
    /^(?:[A-Z]+:\s+)?[A-Za-z_][A-Za-z0-9_.]*(Error|Exception|Warning|Exit|Interrupt)(: .*)?$/;
  private static readonly stackFrameLinePattern = /^File\s+"[^"]+",\s+line\s+\d+/;
  private static readonly maxTracebackLinesAfterStart = 300;
  private static readonly dockerTimestampPattern =
    /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))\s+(.*)$/;

  constructor(
    private readonly containersService: ContainersService,
    private readonly logFormatterService: LogFormatterService,
  ) {}

  @Get()
  async getContainers(): Promise<any> {
    return await this.containersService.getContainers();
  }

  @Get('running')
  async getRunningContainers(): Promise<any> {
    return await this.containersService.getRunningContainers();
  }

  @Get('stack/:stackName')
  async getContainersByStack(@Param('stackName') stackName: string): Promise<any> {
    return await this.containersService.getContainersByStack(stackName);
  }

  @Get('nostack')
  async getContainersWithoutStack(): Promise<any> {
    return await this.containersService.getContainersWithoutStack();
  }

  @Get('stackNames')
  async getStackNames(): Promise<string[]> {
    return await this.containersService.getStackNames();
  }

  @Get('stale/:stackName')
  async getStaleContainers(@Param('stackName') stackName: string) {
    return await this.containersService.getStaleContainers(stackName);
  }

  @Post(':id/lifecycle/:action')
  async controlContainerLifecycle(@Param('id') containerId: string, @Param('action') action: string): Promise<any> {
    return await this.containersService.controlContainerLifecycle(containerId, action);
  }

  @Sse('logs/stream/:id')
  streamContainerLogs(
    @Param('id') containerId: string,
    @Query('lineLimit') lineLimitRaw?: string,
  ): Observable<MessageEvent> {
    return this.createLogsStream(containerId, lineLimitRaw);
  }

  private createLogsStream(containerId: string, lineLimitRaw?: string): Observable<MessageEvent> {
    const lineLimit = lineLimitRaw ? Number.parseInt(lineLimitRaw, 10) : undefined;

    return new Observable((observer) => {
      const formatter = this.logFormatterService;

      let pendingTracebackLines: string[] = [];
      let pendingTracebackRawLines: string[] = [];
      let pendingTracebackTimestamp = 0;
      let pendingTracebackLinesAfterStart = 0;
      let chunkRemainder = '';

      const emitSerializedEvent = (event: FormattedLogEvent): void => {
        const serialized = formatter.serializeLog(event);
        observer.next({ data: serialized } as MessageEvent);
      };

      const emitSingleLine = (line: string): void => {
        const formatted = formatter.formatLog(line, 'stdout');
        emitSerializedEvent(formatted);
      };

      const emitTracebackGroup = (lines: string[], rawLines: string[], timestamp: number): void => {
        if (!lines.length) {
          return;
        }

        emitSerializedEvent({
          type: 'group',
          message: lines,
          level: 'error',
          std: 'stdout',
          timestamp,
          raw: rawLines.join('\n'),
        });
      };

      const flushPendingTraceback = (truncateToLimit: boolean): void => {
        if (!pendingTracebackLines.length) {
          return;
        }

        const maxGroupLines = ContainersController.maxTracebackLinesAfterStart + 1;
        const linesToEmit = truncateToLimit ? pendingTracebackLines.slice(0, maxGroupLines) : pendingTracebackLines;
        const rawLinesToEmit = truncateToLimit
          ? pendingTracebackRawLines.slice(0, maxGroupLines)
          : pendingTracebackRawLines;

        emitTracebackGroup(linesToEmit, rawLinesToEmit, pendingTracebackTimestamp || Date.now());
        pendingTracebackLines = [];
        pendingTracebackRawLines = [];
        pendingTracebackTimestamp = 0;
        pendingTracebackLinesAfterStart = 0;
      };

      const processLine = (rawLine: string): void => {
        const line = rawLine.replace(/\r$/, '');
        if (!line.trim()) {
          return;
        }

        const dockerMetadata = this.extractDockerTimestamp(line);
        const normalized = this.normalizeForPattern(dockerMetadata.message);

        if (pendingTracebackLines.length) {
          pendingTracebackLines.push(dockerMetadata.message);
          pendingTracebackRawLines.push(line);
          pendingTracebackLinesAfterStart += 1;

          const reachedEnd = ContainersController.tracebackEndPattern.test(normalized);
          const reachedCutoff = pendingTracebackLinesAfterStart >= ContainersController.maxTracebackLinesAfterStart;

          if (reachedEnd) {
            flushPendingTraceback(false);
          } else if (reachedCutoff) {
            flushPendingTraceback(true);
          }

          return;
        }

        if (ContainersController.tracebackStartPattern.test(normalized)) {
          pendingTracebackLines = [dockerMetadata.message];
          pendingTracebackRawLines = [line];
          pendingTracebackTimestamp = dockerMetadata.timestamp;
          pendingTracebackLinesAfterStart = 0;
          return;
        }

        // Orphaned stack frame: stream started mid-traceback (tail truncated the header)
        if (ContainersController.stackFrameLinePattern.test(normalized)) {
          pendingTracebackLines = [dockerMetadata.message];
          pendingTracebackRawLines = [line];
          pendingTracebackTimestamp = dockerMetadata.timestamp;
          pendingTracebackLinesAfterStart = 0;
          return;
        }

        emitSingleLine(line);
      };

      this.containersService
        .streamContainerLogs(containerId, lineLimit)
        .then((stream) => {
          stream.on('data', (chunk: Buffer) => {
            chunkRemainder += chunk.toString();
            const lines = chunkRemainder.split('\n');
            chunkRemainder = lines.pop() ?? '';
            lines.forEach(processLine);
          });

          stream.on('end', () => {
            if (chunkRemainder.trim()) {
              processLine(chunkRemainder);
            }

            flushPendingTraceback(true);
            observer.complete();
          });
          stream.on('error', (error: Error) => observer.error(error));
        })
        .catch((error) => observer.error(error));
    });
  }

  private normalizeForPattern(line: string): string {
    return line
      .replace(
        /[\u001B\u009B][[\\]()#;?]*(?:(?:(?:[a-zA-Z\\d]*(?:;[a-zA-Z\\d]*)*)?\u0007)|(?:(?:\d{1,4}(?:;\d{0,4})*)?[\\dA-PRZcf-ntqry=><~]))/g,
        '',
      )
      .trim();
  }

  private extractDockerTimestamp(line: string): {
    message: string;
    timestamp: number;
  } {
    const match = line.match(ContainersController.dockerTimestampPattern);
    if (!match) {
      return { message: line, timestamp: Date.now() };
    }

    const parsed = Date.parse(match[1]);
    return {
      message: match[2],
      timestamp: Number.isNaN(parsed) ? Date.now() : parsed,
    };
  }
}
