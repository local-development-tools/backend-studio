import { Injectable } from '@nestjs/common';

export interface FormattedLogEvent {
  type: 'simple' | 'complex' | 'group';
  message: string | Record<string, any> | string[];
  level: 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'fatal' | 'unknown';
  std: 'stdout' | 'stderr';
  timestamp: number;
  raw: string;
}

@Injectable()
export class LogFormatterService {
  private readonly dockerTimestampPattern =
    /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))\s+(.*)$/;
  private readonly pythonTracebackStartPattern = /^Traceback \(.+?\):$/;
  private readonly pythonTracebackEndPattern =
    /^[A-Za-z_][A-Za-z0-9_]*(Error|Exception|Warning|Exit|Interrupt)(: .*)?$/;

  private tryParseJSON(line: string): Record<string, any> | null {
    try {
      const parsed = JSON.parse(line);
      if (typeof parsed === 'object' && parsed !== null) {
        return parsed;
      }
    } catch (error) {
      // Not JSON, continue
    }
    return null;
  }

  /**
   * Try to parse log in logfmt format: key1=value1 key2="value 2"
   * Example: time=2024-01-01T12:00:00Z level=info msg="Hello world"
   */
  private tryParseLogfmt(line: string): Record<string, any> | null {
    const keyRegex = /\b([a-zA-Z_]\w*)=/g;
    const entries: Array<{
      key: string;
      keyStart: number;
      valueStart: number;
    }> = [];
    let match: RegExpExecArray | null;

    while ((match = keyRegex.exec(line)) !== null) {
      entries.push({
        key: match[1],
        keyStart: match.index,
        valueStart: match.index + match[0].length,
      });
    }

    if (entries.length === 0) return null;

    const result: Record<string, any> = {};

    for (let i = 0; i < entries.length; i++) {
      const { key, valueStart } = entries[i];
      const valueEnd = i + 1 < entries.length ? entries[i + 1].keyStart - 1 : line.length;
      let value = line.slice(valueStart, valueEnd).trim();

      if (value.startsWith('"') && value.endsWith('"')) {
        value = value.slice(1, -1);
      }

      result[key] = value;
    }

    return result;
  }

  /**
   * Detect if log is complex (JSON or logfmt)
   */
  private detectComplexLog(line: string): Record<string, any> | null {
    const json = this.tryParseJSON(line);
    if (json) return json;

    const logfmt = this.tryParseLogfmt(line);
    if (logfmt) return logfmt;

    return null;
  }

  /**
   * Extract log level from message using multiple strategies
   */
  private extractLogLevel(line: string): string {
    // Remove timestamps first (common pattern)
    let cleanedLine = line.replace(/^\d{4}-\d{2}-\d{2}T[\d:.,Z+-]+\s+/i, '');
    cleanedLine = this.stripANSI(cleanedLine);

    const levelPatterns: Record<string, RegExp[]> = {
      error: [/^\s*error\s*[:|\[]|(?<!\.)\berror\b\s*[:|\[]|\[\s*error\s*\]|\bERR\b/i],
      warn: [/^\s*warn(?:ing)?\s*[:|\[]|(?<!\.)\bwarn(?:ing)?\b\s*[:|\[]|\[\s*warn(?:ing)?\s*\]|\bWRN\b/i],
      info: [/^\s*info(?:rmation)?\s*[:|\[]|(?<!\.)\binfo(?:rmation)?\b\s*[:|\[]|\[\s*info(?:rmation)?\s*\]|\bINF\b/i],
      debug: [/^\s*debug\s*[:|\[]|(?<!\.)\bdebug\b\s*[:|\[]|\[\s*debug\s*\]|\bDBG\b/i],
      trace: [/^\s*trace\s*[:|\[]|(?<!\.)\btrace\b\s*[:|\[]|\[\s*trace\s*\]|verbose\b/i],
      fatal: [/^\s*fatal\s*[:|\[]|(?<!\.)\bfatal\b\s*[:|\[]|\[\s*fatal\s*\]|severe\b|critical\b|\bCRIT\b/i],
    };

    for (const [level, patterns] of Object.entries(levelPatterns)) {
      for (const pattern of patterns) {
        if (pattern.test(cleanedLine)) {
          return level;
        }
      }
    }

    return 'info';
  }

  /**
   * Remove ANSI color codes from string
   */
  private stripANSI(str: string): string {
    const ansiPattern =
      /[\u001B\u009B][[\\]()#;?]*(?:(?:(?:[a-zA-Z\\d]*(?:;[a-zA-Z\\d]*)*)?\u0007)|(?:(?:\d{1,4}(?:;\d{0,4})*)?[\\dA-PRZcf-ntqry=><~]))/g;
    return str.replace(ansiPattern, '');
  }

  /**
   * Detect multi-line logs (e.g., stack traces)
   */
  private isStackTrace(line: string): boolean {
    const { message } = this.extractDockerTimestamp(line);
    const cleanedLine = this.stripANSI(message);
    return /^\s+(at\s+|in\s+|\.\.\.|File\s+.+,\s+line\s+\d+)/i.test(cleanedLine);
  }

  private isPythonTracebackStart(line: string): boolean {
    const { message } = this.extractDockerTimestamp(line);
    const cleanedLine = this.stripANSI(message).trimStart();
    return this.pythonTracebackStartPattern.test(cleanedLine);
  }

  private isPythonTracebackEnd(line: string): boolean {
    const { message } = this.extractDockerTimestamp(line);
    const cleanedLine = this.stripANSI(message).trimStart();
    return this.pythonTracebackEndPattern.test(cleanedLine);
  }

  private extractTracebackLevel(line: string): FormattedLogEvent['level'] {
    const cleanedLine = this.stripANSI(line).trimStart();

    if (/Warning(?::|$)/.test(cleanedLine)) {
      return 'warn';
    }

    if (/(Error|Exception|Exit|Interrupt)(?::|$)/.test(cleanedLine)) {
      return 'error';
    }

    return 'error';
  }

  /**
   * Format a single log line
   */
  formatLog(line: string, std: 'stdout' | 'stderr' = 'stdout'): FormattedLogEvent {
    const { message, timestamp } = this.extractDockerTimestamp(line);
    const complexMessage = this.detectComplexLog(message);
    const level = this.resolveLevelFromParsed(complexMessage) ?? this.extractLogLevel(message);

    return {
      type: complexMessage ? 'complex' : 'simple',
      message: complexMessage || message,
      level: level as any,
      std,
      timestamp,
      raw: line,
    };
  }

  private resolveLevelFromParsed(parsed: Record<string, any> | null): FormattedLogEvent['level'] | null {
    if (!parsed) return null;

    const raw = parsed['level'] ?? parsed['lvl'] ?? parsed['severity'] ?? parsed['log.level'];
    if (typeof raw !== 'string') return null;

    const normalized = raw.trim().toLowerCase();
    const known: FormattedLogEvent['level'][] = ['error', 'warn', 'info', 'debug', 'trace', 'fatal'];
    const exact = known.find(
      (l) => normalized === l || normalized === `${l}ing` || (normalized === 'warning' && l === 'warn'),
    );
    if (exact) return exact;

    if (/^err/.test(normalized)) return 'error';
    if (/^warn/.test(normalized)) return 'warn';
    if (/^inf/.test(normalized)) return 'info';
    if (/^deb/.test(normalized)) return 'debug';
    if (/^trac|^verb/.test(normalized)) return 'trace';
    if (/^fat|^crit|^sev/.test(normalized)) return 'fatal';

    return null;
  }

  /**
   * Format multiple log lines, grouping multi-line logs
   */
  formatLogs(lines: string[], std: 'stdout' | 'stderr' = 'stdout'): FormattedLogEvent[] {
    const formatted: FormattedLogEvent[] = [];
    let groupedLines: string[] = [];
    let activeGroupType: 'stack' | 'traceback' | null = null;

    const flushGroup = () => {
      if (groupedLines.length === 0 || !activeGroupType) return;

      const firstLine = this.extractDockerTimestamp(groupedLines[0]);
      const lastLine = this.extractDockerTimestamp(groupedLines[groupedLines.length - 1]);

      const level =
        activeGroupType === 'traceback'
          ? this.extractTracebackLevel(lastLine.message)
          : (this.extractLogLevel(firstLine.message) as FormattedLogEvent['level']);

      formatted.push({
        type: 'group',
        message: groupedLines,
        level,
        std,
        timestamp: firstLine.timestamp,
        raw: groupedLines.join('\n'),
      });

      groupedLines = [];
      activeGroupType = null;
    };

    for (const line of lines) {
      if (line.trim() === '') continue;

      if (activeGroupType === 'traceback') {
        groupedLines.push(line);
        if (this.isPythonTracebackEnd(line)) {
          flushGroup();
        }
        continue;
      }

      if (activeGroupType === 'stack') {
        if (this.isStackTrace(line)) {
          groupedLines.push(line);
          continue;
        }
        flushGroup();
      }

      if (this.isPythonTracebackStart(line)) {
        groupedLines = [line];
        activeGroupType = 'traceback';
        continue;
      }

      if (this.isStackTrace(line)) {
        groupedLines = [line];
        activeGroupType = 'stack';
        continue;
      }

      formatted.push(this.formatLog(line, std));
    }

    flushGroup();

    return formatted;
  }

  /**
   * Format log for JSON serialization
   */
  serializeLog(event: FormattedLogEvent): string {
    return JSON.stringify({
      t: event.type, // type
      m: event.message, // message
      l: event.level, // level
      s: event.std, // std
      ts: event.timestamp, // timestamp
      rm: event.raw, // rawMessage
    });
  }

  private extractDockerTimestamp(line: string): {
    message: string;
    timestamp: number;
  } {
    const match = line.match(this.dockerTimestampPattern);
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
