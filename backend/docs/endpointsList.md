# Backend Endpoints

This file lists all API endpoints currently exposed by the backend (`NestJS`) controllers.

- Default local base URL: `http://localhost:3000`

## AI

| Method | Path                         | Description                                   | Bruno Request                    |
| ------ | ---------------------------- | --------------------------------------------- | -------------------------------- |
| GET    | `/ai/models`                 | List available OpenAI and Anthropic models    | `ai/getModels.bru`               |
| POST   | `/ai`                        | Generate text from a prompt                   | `ai/generate.bru`                |
| POST   | `/ai/sql`                    | Generate SQL from a natural-language question | `ai/generateSql.bru`             |
| POST   | `/ai/logs`                   | Analyze logs with AI                          | `ai/analyzeLogs.bru`             |
| GET    | `/ai/lmstudio/status`        | Get LM Studio server status                   | `ai/getLmStudioStatus.bru`       |
| GET    | `/ai/lmstudio/models/loaded` | List currently loaded LM Studio models        | `ai/getLmStudioLoadedModels.bru` |

## Collections

| Method | Path                      | Description                                  | Bruno Request                       |
| ------ | ------------------------- | -------------------------------------------- | ----------------------------------- |
| GET    | `/collections`            | List collections                             | `collections/getCollections.bru`    |
| POST   | `/collections`            | Create collection                            | `collections/createCollection.bru`  |
| POST   | `/collections/import`     | Import collection from uploaded files or zip | `collections/importCollection.bru`  |
| GET    | `/collections/:id`        | Get collection by ID                         | `collections/getCollectionById.bru` |
| GET    | `/collections/:id/export` | Export collection as zip (download)          | `collections/exportCollection.bru`  |
| PATCH  | `/collections/:id`        | Update collection                            | `collections/updateCollection.bru`  |
| DELETE | `/collections/:id`        | Delete collection                            | `collections/deleteCollection.bru`  |

## Containers

| Method    | Path                                | Description                                                                          | Bruno Request                              |
| --------- | ----------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------ |
| GET       | `/containers`                       | List containers                                                                      | `containers/getContainers.bru`             |
| GET       | `/containers/running`               | List running containers                                                              | `containers/getRunningContainers.bru`      |
| GET       | `/containers/stack/:stackName`      | List containers by stack name                                                        | `containers/getContainersByStack.bru`      |
| GET       | `/containers/nostack`               | List containers without stack                                                        | `containers/getContainersWithoutStack.bru` |
| GET       | `/containers/stackNames`            | List available stack names                                                           | `containers/getStackNames.bru`             |
| POST      | `/containers/:id/lifecycle/:action` | Control container lifecycle (`start`, `stop`, `restart`, `pause`, `unpause`, `kill`) | `containers/controlContainerLifecycle.bru` |
| GET (SSE) | `/containers/logs/stream/:id`       | Stream container logs (`text/event-stream`)                                          | `containers/streamContainerLogs.bru`       |
| GET (SSE) | `/containers/lifecycle/stream`      | Stream container lifecycle updates (`text/event-stream`)                             | `containers/streamContainerLifecycle.bru`  |

## Databases

| Method | Path                                        | Description               | Bruno Request                  |
| ------ | ------------------------------------------- | ------------------------- | ------------------------------ |
| POST   | `/databases/query`                          | Execute SQL query         | `databases/query.bru`          |
| PATCH  | `/databases/records`                        | Edit selected record      | `databases/editRecord.bru`     |
| POST   | `/databases/clone-local`                    | Clone source DB to local  | `databases/cloneLocalDb.bru`   |
| GET    | `/databases`                                | List databases            | `databases/getDatabases.bru`   |
| GET    | `/databases/:database/tables`               | List tables in a database | `databases/getTables.bru`      |
| GET    | `/databases/:database/tables/:table/schema` | Get table schema          | `databases/getTableSchema.bru` |

## Folders

| Method | Path                                 | Description                  | Bruno Request                          |
| ------ | ------------------------------------ | ---------------------------- | -------------------------------------- |
| GET    | `/collections/:collectionId/folders` | List folders by collection   | `folders/getFoldersByCollection.bru`   |
| GET    | `/folders/:id`                       | Get folder by ID             | `folders/getFolderById.bru`            |
| GET    | `/folders/:folderId/folders`         | List child folders in folder | `folders/getFoldersByFolder.bru`       |
| POST   | `/collections/:collectionId/folders` | Create folder in collection  | `folders/createFolderInCollection.bru` |
| POST   | `/folders/:folderId/folders`         | Create folder in folder      | `folders/createFolderInFolder.bru`     |
| POST   | `/folders`                           | Create root-level folder     | `folders/createRootFolder.bru`         |
| PATCH  | `/folders/:id`                       | Update folder                | `folders/updateFolder.bru`             |
| DELETE | `/folders/:id`                       | Delete folder                | `folders/deleteFolder.bru`             |

## Requests

| Method | Path                                       | Description                       | Bruno Request                                |
| ------ | ------------------------------------------ | --------------------------------- | -------------------------------------------- |
| GET    | `/requests`                                | List root-level requests          | `requests/listRootRequests.bru`              |
| POST   | `/http/requests`                           | Create root-level HTTP request    | `requests/createRootHttpRequest.bru`         |
| POST   | `/grpc/requests`                           | Create root-level gRPC request    | `requests/createRootGrpcRequest.bru`         |
| GET    | `/collections/:collectionId/requests`      | List requests in collection       | `requests/listRequestsByCollection.bru`      |
| POST   | `/collections/:collectionId/http/requests` | Create HTTP request in collection | `requests/createHttpRequestInCollection.bru` |
| POST   | `/collections/:collectionId/grpc/requests` | Create gRPC request in collection | `requests/createGrpcRequestInCollection.bru` |
| GET    | `/folders/:folderId/requests`              | List requests in folder           | `requests/listRequestsByFolder.bru`          |
| POST   | `/folders/:folderId/http/requests`         | Create HTTP request in folder     | `requests/createHttpRequestInFolder.bru`     |
| POST   | `/folders/:folderId/grpc/requests`         | Create gRPC request in folder     | `requests/createGrpcRequestInFolder.bru`     |
| GET    | `/requests/:id`                            | Get request by ID                 | `requests/getRequestById.bru`                |
| PATCH  | `/requests/:id`                            | Update request                    | `requests/updateRequest.bru`                 |
| DELETE | `/requests/:id`                            | Delete request                    | `requests/deleteRequest.bru`                 |
| POST   | `/requests/:id/run`                        | Run one request                   | `requests/runRequest.bru`                    |
| POST   | `/folders/:folderId/run`                   | Run all requests in folder        | `requests/runFolder.bru`                     |
| POST   | `/collections/:collectionId/run`           | Run all requests in collection    | `requests/runCollection.bru`                 |

## Settings

| Method | Path           | Description                     | Bruno Request                         |
| ------ | -------------- | ------------------------------- | ------------------------------------- |
| GET    | `/settings/db` | Get database settings           | `settings/getDatabaseSettings.bru`    |
| POST   | `/settings/db` | Create/update database settings | `settings/upsertDatabaseSettings.bru` |
| PATCH  | `/settings/db` | Update database settings        | `settings/updateDatabaseSettings.bru` |
| DELETE | `/settings/db` | Clear database settings         | `settings/clearDatabaseSettings.bru`  |
| GET    | `/settings/ai` | Get AI settings                 | `settings/getAiSettings.bru`          |
| POST   | `/settings/ai` | Create/update AI settings       | `settings/upsertAiSettings.bru`       |
| PATCH  | `/settings/ai` | Update AI settings              | `settings/updateAiSettings.bru`       |
| DELETE | `/settings/ai` | Clear AI settings               | `settings/clearAiSettings.bru`        |
