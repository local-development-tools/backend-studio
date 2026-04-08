import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { DatabasesService } from 'src/databases/databases.service';
import { LmStudioService } from './lmstudio.service';

export type AIProvider = 'openai' | 'anthropic' | 'lmstudio';

type SqlAssistantRequest = {
  question: string;
  schema?: string;
  provider?: AIProvider;
  model?: string;
};

type LogAssistantRequest = {
  logs: string | Array<string | Record<string, unknown>>;
  provider?: AIProvider;
  model?: string;
};

export type LogAnalysisResult = {
  summary: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  probableCause: string;
  affectedComponent?: string;
  immediateActions: string[];
  preventionActions: string[];
};

type AvailableModel = {
  id: string;
  label: string;
};

type ProviderModelList = {
  available: boolean;
  models: AvailableModel[];
  error: string | null;
};

export type PromptLogListItem = {
  fileName: string;
  timestamp: string | null;
  provider: string | null;
  model: string | null;
  question: string | null;
  sql: string;
  explanation?: string;
};

export type PromptLogDetail = PromptLogListItem & {
  content: string;
};

export type AiModelsListResponse = {
  openai: ProviderModelList;
  anthropic: ProviderModelList;
  lmstudio: ProviderModelList;
};

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly promptsDir = path.join(process.cwd(), 'data', 'prompts');

  constructor(
    private readonly databasesService: DatabasesService,
    private readonly lmStudioService: LmStudioService,
  ) {}

  async listProviderModels(): Promise<AiModelsListResponse> {
    const [openai, anthropic, lmstudio] = await Promise.all([
      this.listOpenAiModels(),
      this.listAnthropicModels(),
      this.lmStudioService.listModels(),
    ]);

    return {
      openai,
      anthropic,
      lmstudio,
    };
  }

  private resolveOpenAiKey(): string {
    const key = process.env.OPENAI_API_KEY;
    if (!key) {
      throw new BadRequestException('Missing OpenAI API key. Set it via POST /settings/ai or OPENAI_API_KEY.');
    }

    return key;
  }

  async generateSql(request: SqlAssistantRequest): Promise<{ sql: string; explanation?: string }> {
    const provider = this.resolveProvider(request.provider);
    const preferredModel = this.resolveModel(request.model, provider);
    const { summary, schema: pgSchema } = await this.databasesService.getSchemaSummary(request.schema);
    const prompt = this.buildSqlPrompt(request.question, summary, pgSchema);

    let rawResponse: string;
    switch (provider) {
      case 'anthropic':
        rawResponse = await this.generateWithAnthropic(prompt, preferredModel);
        break;
      case 'lmstudio':
        rawResponse = await this.lmStudioService.generateText(prompt, preferredModel);
        break;
      case 'openai':
      default:
        rawResponse = await this.generateWithOpenAI(prompt, preferredModel);
        break;
    }

    const parsedResponse = this.parseSqlResponse(rawResponse);
    await this.persistGenerateSqlPromptToMarkdown({
      question: request.question,
      provider,
      model: preferredModel,
      prompt,
      rawResponse,
      parsedResponse,
    });

    return parsedResponse;
  }

  async analyzeLogs(request: LogAssistantRequest): Promise<LogAnalysisResult> {
    const normalizedLogs = this.normalizeLogsInput(request.logs);
    if (!normalizedLogs) {
      throw new BadRequestException('Logs input is required');
    }

    const trimmedLogs = this.takeTailLogsByBytes(normalizedLogs, 80_000);
    const provider = this.resolveProvider(request.provider);
    const preferredModel = this.resolveModel(request.model, provider);
    const prompt = this.buildLogAnalysisPrompt(trimmedLogs);

    let rawResponse: string;
    switch (provider) {
      case 'anthropic':
        rawResponse = await this.generateWithAnthropic(prompt, preferredModel);
        break;
      case 'lmstudio':
        rawResponse = await this.lmStudioService.generateText(prompt, preferredModel);
        break;
      case 'openai':
      default:
        rawResponse = await this.generateWithOpenAI(prompt, preferredModel);
        break;
    }

    return this.parseLogAnalysisResponse(rawResponse);
  }

  async generateText(prompt: string, model?: string, provider?: AIProvider): Promise<string> {
    if (!prompt?.trim()) {
      throw new BadRequestException('Prompt is required');
    }

    const selectedProvider = this.resolveProvider(provider);
    const preferredModel = this.resolveModel(model, selectedProvider);

    if (selectedProvider === 'anthropic') {
      return this.generateWithAnthropic(prompt, preferredModel);
    }

    if (selectedProvider === 'lmstudio') {
      return this.lmStudioService.generateText(prompt, preferredModel);
    }

    return this.generateWithOpenAI(prompt, preferredModel);
  }

  async listPromptLogs(): Promise<PromptLogListItem[]> {
    try {
      const entries = await fs.readdir(this.promptsDir, {
        withFileTypes: true,
      });
      const markdownFiles = entries
        .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.md'))
        .map((entry) => entry.name)
        .sort((a, b) => b.localeCompare(a));

      const items = await Promise.all(
        markdownFiles.map(async (fileName) => {
          const filePath = path.join(this.promptsDir, fileName);
          const content = await fs.readFile(filePath, 'utf-8');
          return this.parsePromptLog(fileName, content);
        }),
      );

      return items;
    } catch (error) {
      const isMissingDir = (error as { code?: string }).code === 'ENOENT';
      if (isMissingDir) {
        return [];
      }

      const message = error instanceof Error ? error.message : String(error);
      throw new BadRequestException(`Failed to list prompt logs: ${message}`);
    }
  }

  async getPromptLog(fileName: string): Promise<PromptLogDetail> {
    const safeFileName = this.toSafePromptFileName(fileName);
    const filePath = path.join(this.promptsDir, safeFileName);

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const parsed = this.parsePromptLog(safeFileName, content);
      return {
        ...parsed,
        content,
      };
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === 'ENOENT') {
        throw new BadRequestException(`Prompt file not found: ${safeFileName}`);
      }

      const message = error instanceof Error ? error.message : String(error);
      throw new BadRequestException(`Failed to read prompt file: ${message}`);
    }
  }

  async saveSqlPrompt(input: { sql: string; title?: string; question?: string }): Promise<{ fileName: string }> {
    const sql = input.sql?.trim();
    if (!sql) {
      throw new BadRequestException('SQL is required');
    }

    const now = new Date();
    const timestamp = now.toISOString();
    const timestampForFile = timestamp.replace(/[:.]/g, '-');
    const fileName = `saved-sql-${timestampForFile}-${randomUUID().slice(0, 8)}.md`;
    const filePath = path.join(this.promptsDir, fileName);

    const markdown = [
      '# Saved SQL',
      '',
      `- Timestamp: ${timestamp}`,
      '- Provider: user',
      '- Model: manual',
      '',
      '## Question',
      '',
      input.question?.trim() || input.title?.trim() || '(manual save)',
      '',
      '## Parsed Result',
      '',
      '```json',
      JSON.stringify({ sql, explanation: null }, null, 2),
      '```',
      '',
    ].join('\n');

    try {
      await fs.mkdir(this.promptsDir, { recursive: true });
      await fs.writeFile(filePath, markdown, 'utf-8');
      return { fileName };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new BadRequestException(`Failed to save SQL prompt: ${message}`);
    }
  }

  async updatePromptQuestion(fileName: string, question: string): Promise<PromptLogDetail> {
    const safeFileName = this.toSafePromptFileName(fileName);
    const normalizedQuestion = question.trim();
    if (!normalizedQuestion) {
      throw new BadRequestException('Question is required');
    }

    const filePath = path.join(this.promptsDir, safeFileName);

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const updatedContent = this.replaceMarkdownSection(content, 'Question', normalizedQuestion);
      await fs.writeFile(filePath, updatedContent, 'utf-8');
      return this.getPromptLog(safeFileName);
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === 'ENOENT') {
        throw new BadRequestException(`Prompt file not found: ${safeFileName}`);
      }

      const message = error instanceof Error ? error.message : String(error);
      throw new BadRequestException(`Failed to update prompt question: ${message}`);
    }
  }

  async deletePromptLog(fileName: string): Promise<{ deleted: true }> {
    const safeFileName = this.toSafePromptFileName(fileName);
    const filePath = path.join(this.promptsDir, safeFileName);

    try {
      await fs.unlink(filePath);
      return { deleted: true };
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === 'ENOENT') {
        throw new BadRequestException(`Prompt file not found: ${safeFileName}`);
      }

      const message = error instanceof Error ? error.message : String(error);
      throw new BadRequestException(`Failed to delete prompt file: ${message}`);
    }
  }

  private resolveProvider(provider?: string): AIProvider {
    const requested = provider?.trim();
    if (requested === 'openai' || requested === 'anthropic' || requested === 'lmstudio') {
      return requested;
    }

    const envProvider = process.env.AI_PROVIDER?.trim();
    if (envProvider === 'openai' || envProvider === 'anthropic' || envProvider === 'lmstudio') {
      return envProvider;
    }

    return 'openai';
  }

  private resolveModel(model: string | undefined, provider: AIProvider): string | undefined {
    const requestedModel = model?.trim();
    if (requestedModel) {
      return requestedModel;
    }

    if (provider === 'lmstudio') {
      const lmStudioModel = process.env.LMSTUDIO_MODEL?.trim();
      return lmStudioModel || undefined;
    }

    const envModel = process.env.AI_MODEL?.trim();
    return envModel || undefined;
  }

  private buildSqlPrompt(question: string, schemaSummary: string, pgSchema: string): string {
    return [
      'You are a PostgreSQL SQL assistant.',
      'Generate one read-only SQL query that answers the user request.',
      'Rules:',
      '- Return valid PostgreSQL SQL.',
      '- Use SELECT/INSERT/UPDATE/DELETE/DDL or CTE statements as needed.',
      '- Use only tables and columns present in schema.',
      '- If request cannot be answered from schema, return sql as empty string and explain why.',
      '- Respond in JSON only with shape: {"sql":"...","explanation":"..."}',
      `PostgreSQL schema (tables below belong to this schema): ${pgSchema}`,
      `Tables and columns:\n${schemaSummary}`,
      `User request: ${question}`,
    ].join('\n');
  }

  private buildLogAnalysisPrompt(logs: string): string {
    return [
      'You are a production incident assistant.',
      'Analyze the logs and provide a concise diagnosis and remediation plan.',
      'Rules:',
      '- Focus on actionable engineering fixes.',
      '- Infer the most likely root cause from evidence in logs.',
      '- If evidence is weak, clearly state assumptions in probableCause.',
      '- Return JSON only with shape:',
      '{"summary":"...","severity":"low|medium|high|critical","probableCause":"...","affectedComponent":"...","immediateActions":["..."],"preventionActions":["..."]}',
      `Logs:\n${logs}`,
    ].join('\n');
  }

  private takeTailLogsByBytes(logs: string, maxBytes: number): string {
    const lines = logs.split(/\r?\n/).filter((line) => !!line.trim());
    const selected: string[] = [];
    let usedBytes = 0;

    for (let i = lines.length - 1; i >= 0; i -= 1) {
      const line = lines[i];
      const lineBytes = Buffer.byteLength(line + '\n', 'utf8');

      if (selected.length === 0 && lineBytes > maxBytes) {
        const trimmed = this.takeTailStringByBytes(line, maxBytes);
        return trimmed;
      }

      if (usedBytes + lineBytes > maxBytes) {
        break;
      }

      selected.push(line);
      usedBytes += lineBytes;
    }

    return selected.reverse().join('\n');
  }

  private normalizeLogsInput(logs: LogAssistantRequest['logs']): string {
    if (Array.isArray(logs)) {
      return logs
        .map((item) => {
          if (typeof item === 'string') {
            return item;
          }

          try {
            return JSON.stringify(item);
          } catch {
            return '[unserializable-log-item]';
          }
        })
        .filter((line) => !!line?.trim())
        .join('\n')
        .trim();
    }

    if (typeof logs === 'string') {
      return logs.trim();
    }

    return '';
  }

  private takeTailStringByBytes(value: string, maxBytes: number): string {
    let result = value;

    while (Buffer.byteLength(result, 'utf8') > maxBytes && result.length > 0) {
      result = result.slice(Math.ceil(result.length / 2));
    }

    return result;
  }

  private async generateWithOpenAI(prompt: string, model?: string): Promise<string> {
    const openai = new OpenAI({ apiKey: this.resolveOpenAiKey() });
    const response = await openai.responses.create({
      model: model ?? 'gpt-4.1-mini',
      input: prompt,
    });

    return response.output_text;
  }

  private async listOpenAiModels(): Promise<ProviderModelList> {
    const key = process.env.OPENAI_API_KEY;
    if (!key) {
      return {
        available: false,
        models: [],
        error: 'Missing OPENAI_API_KEY. Set it via POST /settings/ai or environment variable.',
      };
    }

    try {
      const openai = new OpenAI({ apiKey: key });
      const response = await openai.models.list();
      const models = (response.data ?? [])
        .map((model) => ({
          id: model.id,
          label: model.id,
        }))
        .sort((a, b) => a.id.localeCompare(b.id));

      return {
        available: true,
        models,
        error: null,
      };
    } catch (error) {
      return {
        available: false,
        models: [],
        error: this.getProviderErrorMessage('OpenAI', error),
      };
    }
  }

  private async listAnthropicModels(): Promise<ProviderModelList> {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) {
      return {
        available: false,
        models: [],
        error: 'Missing ANTHROPIC_API_KEY. Set it via POST /settings/ai or environment variable.',
      };
    }

    try {
      const anthropic = new Anthropic({ apiKey: key });
      const response = await anthropic.models.list();
      const responseData = (response as { data?: Array<{ id: string; display_name?: string }> }).data ?? [];
      const models = responseData
        .map((model) => ({
          id: model.id,
          label: model.display_name || model.id,
        }))
        .sort((a, b) => a.id.localeCompare(b.id));

      return {
        available: true,
        models,
        error: null,
      };
    } catch (error) {
      return {
        available: false,
        models: [],
        error: this.getProviderErrorMessage('Anthropic', error),
      };
    }
  }

  private async generateWithAnthropic(prompt: string, model?: string): Promise<string> {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) {
      throw new BadRequestException('Missing Anthropic API key. Set it via POST /settings/ai or ANTHROPIC_API_KEY.');
    }

    const anthropic = new Anthropic({ apiKey: key });
    const response = await anthropic.messages.create({
      model: model ?? 'claude-3-5-sonnet-20241022',
      max_tokens: 700,
      messages: [{ role: 'user', content: prompt }],
    });

    return response.content
      .filter((item) => item.type === 'text')
      .map((item) => item.text)
      .join('\n');
  }

  private parseSqlResponse(raw: string): { sql: string; explanation?: string } {
    const candidates = this.collectSqlCandidates(raw);
    for (let index = candidates.length - 1; index >= 0; index -= 1) {
      const candidate = candidates[index];
      if (this.isLikelySql(candidate.sql)) {
        return {
          sql: candidate.sql,
          explanation: candidate.explanation,
        };
      }
    }

    for (let index = candidates.length - 1; index >= 0; index -= 1) {
      const candidate = candidates[index];
      if (candidate.sql) {
        return {
          sql: candidate.sql,
          explanation: candidate.explanation,
        };
      }
    }

    for (let index = candidates.length - 1; index >= 0; index -= 1) {
      const candidate = candidates[index];
      if (candidate.explanation) {
        const recoveredSql = this.recoverSqlFromText(`${candidate.explanation}\n${raw}`);
        if (recoveredSql) {
          return {
            sql: recoveredSql,
            explanation: undefined,
          };
        }

        return {
          sql: '',
          explanation: candidate.explanation,
        };
      }
    }

    const recoveredSql = this.recoverSqlFromText(raw);
    if (recoveredSql) {
      return {
        sql: recoveredSql,
        explanation: undefined,
      };
    }

    return {
      sql: '',
      explanation: raw.trim() || 'Model did not return valid JSON output',
    };
  }

  private collectSqlCandidates(raw: string): Array<{ sql: string; explanation?: string }> {
    const collected: Array<{
      index: number;
      sql: string;
      explanation?: string;
    }> = [];

    const jsonMatches = this.extractAllJsonCandidates(raw);
    for (const jsonMatch of jsonMatches) {
      try {
        const parsed = JSON.parse(jsonMatch.json) as {
          sql?: unknown;
          explanation?: unknown;
        };
        const sql = typeof parsed.sql === 'string' ? this.normalizeSqlCandidate(parsed.sql) : '';
        const explanation = typeof parsed.explanation === 'string' ? parsed.explanation.trim() : undefined;

        if (sql || explanation) {
          collected.push({
            index: jsonMatch.index,
            sql,
            explanation,
          });
        }
      } catch {
        // Ignore malformed candidates and continue evaluating others.
      }
    }

    const sqlFieldMatches = raw.matchAll(/"sql"\s*:\s*"((?:\\.|[^"\\])*)"/gi);
    for (const match of sqlFieldMatches) {
      const encoded = match[1] ?? '';
      try {
        const decoded = JSON.parse(`"${encoded}"`) as string;
        const normalized = this.normalizeSqlCandidate(decoded);
        if (normalized) {
          collected.push({
            index: match.index ?? 0,
            sql: normalized,
          });
        }
      } catch {
        // Ignore malformed encoded fragments.
      }
    }

    const fencedSqlMatches = raw.matchAll(/```sql\s*([\s\S]*?)```/gi);
    for (const match of fencedSqlMatches) {
      const candidate = this.normalizeSqlCandidate(match[1] ?? '');
      if (candidate) {
        collected.push({
          index: match.index ?? 0,
          sql: candidate,
        });
      }
    }

    collected.sort((a, b) => a.index - b.index);

    return collected.map((item) => ({
      sql: item.sql,
      explanation: item.explanation,
    }));
  }

  private async persistGenerateSqlPromptToMarkdown(input: {
    question: string;
    provider: AIProvider;
    model?: string;
    prompt: string;
    rawResponse: string;
    parsedResponse: { sql: string; explanation?: string };
  }): Promise<void> {
    const now = new Date();
    const timestamp = now.toISOString();
    const timestampForFile = timestamp.replace(/[:.]/g, '-');
    const fileName = `generate-sql-${timestampForFile}-${randomUUID().slice(0, 8)}.md`;
    const filePath = path.join(this.promptsDir, fileName);

    const markdown = [
      '# Generate SQL Prompt Log',
      '',
      `- Timestamp: ${timestamp}`,
      `- Provider: ${input.provider}`,
      `- Model: ${input.model ?? '(default)'}`,
      '',
      '## Question',
      '',
      input.question.trim() || '(empty)',
      '',
      // '## Prompt Sent To AI',
      // '',
      // '```text',
      // input.prompt,
      // '```',
      // '',
      // '## AI Raw Response',
      // '',
      // '```text',
      // input.rawResponse || '(empty)',
      // '```',
      // '',
      '## Parsed Result',
      '',
      '```json',
      JSON.stringify(input.parsedResponse, null, 2),
      '```',
      '',
    ].join('\n');

    try {
      await fs.mkdir(this.promptsDir, { recursive: true });
      await fs.writeFile(filePath, markdown, 'utf-8');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Failed to persist Generate SQL prompt log: ${message}`);
    }
  }

  private toSafePromptFileName(fileName: string): string {
    const decoded = decodeURIComponent(fileName || '').trim();
    if (!decoded || decoded.includes('..') || decoded.includes('/') || decoded.includes('\\')) {
      throw new BadRequestException('Invalid prompt file name');
    }

    if (!decoded.toLowerCase().endsWith('.md')) {
      throw new BadRequestException('Prompt file must be a markdown file');
    }

    return decoded;
  }

  private parsePromptLog(fileName: string, content: string): PromptLogListItem {
    const timestamp = this.readMarkdownMeta(content, 'Timestamp');
    const provider = this.readMarkdownMeta(content, 'Provider');
    const model = this.readMarkdownMeta(content, 'Model');
    const question = this.readMarkdownSection(content, 'Question');
    const parsed = this.readParsedResult(content);

    return {
      fileName,
      timestamp,
      provider,
      model,
      question,
      sql: parsed.sql ?? '',
      explanation: parsed.explanation,
    };
  }

  private readMarkdownMeta(content: string, key: string): string | null {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`^-\\s+${escaped}:\\s*(.+)$`, 'm');
    const match = content.match(regex);
    return match?.[1]?.trim() || null;
  }

  private readMarkdownSection(content: string, sectionName: string): string | null {
    const escaped = sectionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`##\\s+${escaped}\\s*\\n([\\s\\S]*?)(?:\\n##\\s+|$)`, 'i');
    const match = content.match(regex);
    if (!match) return null;

    const value = match[1].trim();
    if (!value || value === '(empty)') return null;
    return value;
  }

  private readParsedResult(content: string): {
    sql?: string;
    explanation?: string;
  } {
    const blockMatch = content.match(/##\s+Parsed Result\s*\n\s*```json\s*\n([\s\S]*?)\n```/i);
    if (!blockMatch) {
      return {};
    }

    try {
      const parsed = JSON.parse(blockMatch[1].trim()) as {
        sql?: unknown;
        explanation?: unknown;
      };
      return {
        sql: typeof parsed.sql === 'string' ? parsed.sql : undefined,
        explanation: typeof parsed.explanation === 'string' ? parsed.explanation : undefined,
      };
    } catch {
      return {};
    }
  }

  private replaceMarkdownSection(content: string, sectionName: string, nextValue: string): string {
    const escaped = sectionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`##\\s+${escaped}\\s*\\n([\\s\\S]*?)(?=\\n##\\s+|$)`, 'i');

    if (regex.test(content)) {
      return content.replace(regex, `## ${sectionName}\n\n${nextValue}\n`);
    }

    const trimmed = content.trimEnd();
    return `${trimmed}\n\n## ${sectionName}\n\n${nextValue}\n`;
  }

  private recoverSqlFromText(text: string): string | null {
    const fromConcatenatedJson = this.extractSqlFromConcatenatedJson(text);
    if (fromConcatenatedJson) {
      return fromConcatenatedJson;
    }

    return this.extractLikelySqlBlock(text);
  }

  private extractSqlFromConcatenatedJson(text: string): string | null {
    const matches = text.matchAll(/"sql"\s*:\s*([\s\S]*?)(?=,\s*"explanation"|}\s*(?:```|$))/gi);
    let bestMatch: string | null = null;

    for (const match of matches) {
      const expression = match[1] ?? '';
      if (!expression.includes('"')) {
        continue;
      }

      const stringParts = expression.matchAll(/"((?:\\.|[^"\\])*)"/g);
      const segments: string[] = [];

      for (const part of stringParts) {
        const payload = part[1] ?? '';
        try {
          segments.push(JSON.parse(`"${payload}"`) as string);
        } catch {
          // Ignore invalid segment and continue with what can be decoded.
        }
      }

      if (segments.length === 0) {
        continue;
      }

      const candidate = this.normalizeSqlCandidate(segments.join(''));
      if (this.isLikelySql(candidate)) {
        bestMatch = candidate;
      }
    }

    return bestMatch;
  }

  private extractLikelySqlBlock(text: string): string | null {
    const fencedSqlMatches = text.matchAll(/```sql\s*([\s\S]*?)```/gi);
    let bestFencedMatch: string | null = null;
    for (const fencedSql of fencedSqlMatches) {
      const candidate = this.normalizeSqlCandidate(fencedSql[1] ?? '');
      if (this.isLikelySql(candidate)) {
        bestFencedMatch = candidate;
      }
    }

    if (bestFencedMatch) {
      return bestFencedMatch;
    }

    const sqlStatementMatches = text.matchAll(
      /\b(select|with|insert|update|delete|create|alter|drop)\b[\s\S]*?(?:;|$)/gi,
    );
    let bestStatementMatch: string | null = null;
    for (const statementMatch of sqlStatementMatches) {
      let statement = statementMatch[0] ?? '';
      const stopMarkers = ['```', 'The final answer is', 'Note:', '{"sql"', "'sql'"];
      for (const marker of stopMarkers) {
        const markerIndex = statement.indexOf(marker);
        if (markerIndex > 0) {
          statement = statement.slice(0, markerIndex);
        }
      }

      const candidate = this.normalizeSqlCandidate(statement);
      if (this.isLikelySql(candidate)) {
        bestStatementMatch = candidate;
      }
    }

    if (bestStatementMatch) {
      return bestStatementMatch;
    }

    return null;
  }

  private extractAllJsonCandidates(input: string): Array<{ index: number; json: string }> {
    const candidates: Array<{ index: number; json: string }> = [];

    for (let start = 0; start < input.length; start += 1) {
      const startChar = input[start];
      if (startChar !== '{' && startChar !== '[') {
        continue;
      }

      const stack: string[] = [];
      let inString = false;
      let escaped = false;

      for (let index = start; index < input.length; index += 1) {
        const char = input[index];

        if (inString) {
          if (escaped) {
            escaped = false;
            continue;
          }

          if (char === '\\') {
            escaped = true;
            continue;
          }

          if (char === '"') {
            inString = false;
          }

          continue;
        }

        if (char === '"') {
          inString = true;
          continue;
        }

        if (char === '{') {
          stack.push('}');
          continue;
        }

        if (char === '[') {
          stack.push(']');
          continue;
        }

        if (char === '}' || char === ']') {
          const expected = stack.pop();
          if (expected !== char) {
            break;
          }

          if (stack.length === 0) {
            candidates.push({
              index: start,
              json: input.slice(start, index + 1),
            });
            break;
          }
        }
      }
    }

    return candidates;
  }

  private normalizeSqlCandidate(value: string): string {
    return value
      .replace(/\r/g, '')
      .replace(/\\n/g, '\n')
      .replace(/\\t/g, '\t')
      .replace(/^\s*['"`]+/, '')
      .replace(/['"`]+\s*$/, '')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[\n\t]+/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  private isLikelySql(value: string): boolean {
    if (!value) {
      return false;
    }

    const normalized = value.trim();
    if (!/^(select|with|insert|update|delete|create|alter|drop)\b/i.test(normalized)) {
      return false;
    }

    if (/^select\s+\*\s+from\s+table_name\b/i.test(normalized) && normalized.length < 80) {
      return false;
    }

    return normalized.length > 12;
  }

  private parseLogAnalysisResponse(raw: string): LogAnalysisResult {
    const fallback: LogAnalysisResult = {
      summary: 'Unable to fully parse model output.',
      severity: 'medium',
      probableCause: raw.trim() || 'No output from model',
      affectedComponent: undefined,
      immediateActions: ['Inspect full logs around first error timestamp and stack trace.'],
      preventionActions: ['Add better structured logging and alerts for this failure mode.'],
    };

    const parsed = this.tryParseJson(raw) as Partial<LogAnalysisResult> | null;
    if (!parsed) {
      return fallback;
    }

    const severity = parsed.severity;
    const normalizedSeverity: LogAnalysisResult['severity'] =
      severity === 'low' || severity === 'medium' || severity === 'high' || severity === 'critical'
        ? severity
        : 'medium';

    return {
      summary: parsed.summary?.trim() || fallback.summary,
      severity: normalizedSeverity,
      probableCause: parsed.probableCause?.trim() || fallback.probableCause,
      affectedComponent: parsed.affectedComponent?.trim() || undefined,
      immediateActions:
        parsed.immediateActions?.filter((item) => !!item?.trim()).map((item) => item.trim()) ??
        fallback.immediateActions,
      preventionActions:
        parsed.preventionActions?.filter((item) => !!item?.trim()).map((item) => item.trim()) ??
        fallback.preventionActions,
    };
  }

  private tryParseJson(raw: string): unknown | null {
    const trimmed = raw.trim();
    if (!trimmed) {
      return null;
    }

    try {
      return JSON.parse(trimmed);
    } catch {
      const fencedMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
      if (fencedMatch) {
        try {
          return JSON.parse(fencedMatch[1]);
        } catch {
          // Fall through to object/array extraction.
        }
      }

      const candidate = this.extractFirstJsonCandidate(trimmed);
      if (!candidate) {
        return null;
      }

      try {
        return JSON.parse(candidate);
      } catch {
        return null;
      }
    }
  }

  private extractFirstJsonCandidate(input: string): string | null {
    for (let start = 0; start < input.length; start += 1) {
      const startChar = input[start];
      if (startChar !== '{' && startChar !== '[') {
        continue;
      }

      const stack: string[] = [];
      let inString = false;
      let escaped = false;

      for (let index = start; index < input.length; index += 1) {
        const char = input[index];

        if (inString) {
          if (escaped) {
            escaped = false;
            continue;
          }

          if (char === '\\') {
            escaped = true;
            continue;
          }

          if (char === '"') {
            inString = false;
          }

          continue;
        }

        if (char === '"') {
          inString = true;
          continue;
        }

        if (char === '{') {
          stack.push('}');
          continue;
        }

        if (char === '[') {
          stack.push(']');
          continue;
        }

        if (char === '}' || char === ']') {
          const expected = stack.pop();
          if (expected !== char) {
            break;
          }

          if (stack.length === 0) {
            return input.slice(start, index + 1);
          }
        }
      }
    }

    return null;
  }

  private getProviderErrorMessage(provider: 'OpenAI' | 'Anthropic' | 'LM Studio', error: unknown): string {
    if (error instanceof Error && error.message) {
      return `${provider} models request failed: ${error.message}`;
    }

    return `${provider} models request failed.`;
  }
}
