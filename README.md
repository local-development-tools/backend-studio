# backend-studio

Developer cockpit for local backend systems: Docker container logs viewer, HTTP/gRPC API client with sharable collections, pub/sub message inspection, DB browsing.

## Quick Start

```bash
docker compose up --build        # foreground
docker compose up -d --build     # background
docker compose down              # stop
```

**URLs:** Frontend → http://localhost:5174 · Backend → http://localhost:3000

## LM Studio

Set env vars (defaults already in compose):

```
LMSTUDIO_BASE_URL=ws://host.docker.internal:1234
LMSTUDIO_MODEL=llama-3.2-3b-instruct
```

Start LM Studio server and load a model on the host before using `provider: "lmstudio"` endpoints. Use `GET /ai/lmstudio/status` to verify reachability from the container.

## Sample Database (PostgreSQL)

A small sample database named `sample_employee` is available for local testing.

```bash
docker compose -f docker-compose.dev.yml up -d
```

It creates demo tables with relations (for example: employees, departments, projects, employee_projects) so you can test joins quickly and see how your choosen AI model is managing with relations.

Use these connection settings in app Settings:

- Backend in Docker: 
```json
{
  "host": "host.docker.internal",
  "port": 5433,
  "database": "sample_employee",
  "username": "postgres",
  "password": "postgres",
}
```
- Backend running locally: 
```json
{
  "host": "localhost",
  "port": 5433,
  "database": "sample_employee",
  "username": "postgres",
  "password": "postgres",
}
```