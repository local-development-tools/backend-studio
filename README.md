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