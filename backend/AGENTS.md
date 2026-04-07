# Backend AGENT Guidelines

Scope: applies to everything under `backend/`.

## Stack and Runtime
- Framework: NestJS (TypeScript).
- Runtime assumptions: Node.js + npm scripts from `backend/package.json`.
- Module root: `src/`; build output: `dist/`.

## Core Architecture
- Follow Nest module boundaries: each domain folder owns its controller(s), service(s), DTOs, entities, and module wiring.
- Keep controllers thin: map HTTP routes to service methods and avoid business logic in controllers.
- Put business rules and persistence logic in services.
- Prefer dependency injection for cross-service usage; register providers in the owning `*.module.ts`.

## Data and Persistence Conventions
- This backend primarily persists domain data in the filesystem under `process.cwd()/data` (especially `data/collections`).
- Keep file and directory layout compatible with existing patterns (`meta.json`, `.bru` files, collection/folder/request structure).
- When changing persistence behavior, preserve backward compatibility with existing on-disk data.
- Use async `fs/promises` APIs and explicit UTF-8 encoding for text reads/writes.

## API and DTO Conventions
- Keep request/response contracts explicit with DTO and entity classes in `dto/` and `entities/`.
- Preserve existing route shapes and naming patterns unless the task explicitly asks for API changes.
- Throw Nest HTTP exceptions (`NotFoundException`, `BadRequestException`, etc.) for expected client-facing failures.
- Validate path/body inputs close to service entry points when integrity matters (IDs, names, required fields).
- Add helper methods to DTO classes to encapsulate non-trivial field checks (e.g. `hasEnvironment()` for a nullable optional field) rather than repeating inline conditions in services.

## Style Rules
- Match existing file style:
  - `singleQuote: true`
  - trailing commas enabled
  - concise methods and minimal inline comments
- Avoid introducing new libraries or patterns when existing utilities/services already solve the problem.
- Keep changes surgical and scoped to the requested feature or fix.
- Private helper methods use a `_` prefix (e.g., `_getCollectionById`, `_listRequestsInDir`); follow this convention when adding helpers inside existing services.
- Use `randomUUID()` from the `crypto` (or `node:crypto`) built-in for ID generation — do not add third-party UUID libraries.
- Extract repeated guard patterns (filesystem checks, input validation) into a domain-scoped `*.utils.ts` file (e.g. `collections/fs.utils.ts`) when the same logic appears in more than one service. Do not duplicate them inline.

## Logging
- Use NestJS `Logger` (`import { Logger } from '@nestjs/common'`) scoped to the service class name — not `console.log`.
- Instantiate as: `private readonly logger = new Logger(MyService.name);`
- Log at `logger.log` for info, `logger.warn` for recoverable issues, `logger.error` for exceptions.

## Module Lifecycle
- Services that hold long-lived resources (streams, connection pools) must implement `OnModuleInit` / `OnModuleDestroy` from `@nestjs/common`.
- Release all resources (streams, timeouts, pool connections) inside `onModuleDestroy`.
- Do not use top-level `setInterval`/`setTimeout` in services; tie them to module lifecycle.

## Cross-Module Dependencies
- To use a service from another module, the providing module must export it and the consuming module must import that module.
- Example: `DatabasesModule` exports `DatabasesService`; `AiModule` and `SettingsModule` import `DatabasesModule`.
- Avoid circular module imports; restructure to a shared module if necessary.

## Settings and Runtime `.env` Mutation
- `SettingsService` owns read/write of the backend `.env` file for DB and AI credentials at runtime.
- When persisting a setting, write to the `.env` file **and** apply to `process.env` via `applyToProcessEnv()` — both steps are required.
- Never write `.env` keys directly from outside `SettingsService`; always go through its methods.
- Env keys for DB: `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`. For AI: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `AI_PROVIDER`, `AI_MODEL`, `LMSTUDIO_BASE_URL`, `LMSTUDIO_MODEL`.

## Sensitive Data
- Never return raw API keys or passwords in HTTP responses.
- Use the masking pattern: expose only a boolean flag (e.g., `passwordSet: boolean`, `openAIApiKeySet: boolean`) instead of the actual secret value.

## Streaming and SSE
- `ContainersService` streams Docker lifecycle events using RxJS `Subject` and `Observable`, surfaced via NestJS `MessageEvent` (SSE).
- When adding new streaming endpoints, follow the same RxJS `Subject` → `Observable` pattern and return `Observable<MessageEvent>` from the controller method.
- Clean up stream subscriptions and subjects in `onModuleDestroy`.

## AI Provider Conventions
- Supported providers: `openai`, `anthropic`, `lmstudio` (typed as `AIProvider` in `ai.service.ts`).
- AI credentials are read from `process.env` at call time (populated by `SettingsService`), not injected at module init.
- Prompt logs are persisted under `data/prompts/`; follow the existing `PromptLogListItem` / `PromptLogDetail` shape for new log entries.
- Use `Promise.all` when fetching from multiple providers in parallel (see `listProviderModels`).

## gRPC Request Conventions
- Requests have a `type` field (`'http'` | `'grpc'`); dispatch to `RequestHttpService` or `RequestGrpcService` accordingly.
- gRPC-specific fields: `serverAddress`, `service`, `protoContent`, `message`, `metadata`.
- Use `GrpcReflectionService` for server reflection; do not duplicate reflection logic in other services.

## Request Runner Behaviour
- `RunnerService` executes requests **sequentially** and stops the run on the first failure (`result.ok === false`).
- This applies to both folder and collection runs — preserve this behaviour unless explicitly asked to change it.

## Environment and Bootstrapping
- Keep `.env` loading behavior in `src/main.ts` compatible with both root and `backend/.env` usage.
- Respect current defaults (`PORT`, `CORS_ORIGIN`, `BODY_SIZE_LIMIT`) and avoid hardcoding environment-specific values.

## Testing and Verification
- For backend code changes, run the most targeted checks first:
  1. `npm run lint`
  2. `npm run test` (or focused spec when applicable)
  3. `npm run test:e2e` for route-level/integration-impacting changes
- Do not fix unrelated failing tests as part of an isolated task; note them separately.

## Safe Change Practices
- Do not perform destructive filesystem operations outside the request scope.
- Never delete or migrate existing `data/` structures unless explicitly requested.
- Preserve public behavior for existing endpoints unless a breaking change is explicitly requested.
