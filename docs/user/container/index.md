# Run DeepSeek Harness Web in a container

English | [中文](index.zh.md)

The dsh web container runs the browser surface of DeepSeek Harness without a checkout or a Node toolchain. Each image ships the built server and frontend on `node:22-slim` and publishes to this repository's GHCR namespace; the server listens on port 3080.

## Quick start

```sh
docker pull ghcr.io/opscalehub/deepseek-harness:latest
docker run -d --name dsh-web -p 3080:3080 -v dsh-data:/root/.dsh ghcr.io/opscalehub/deepseek-harness:latest
```

Open `http://localhost:3080`, choose a workspace, and [configure a model](../guide/providers.md). The [Web UI guide](../guide/) covers the rest of the workflow.

## What the image gives you

- The full web profile over the base harness, including the built frontend.
- A healthcheck, a pinned pnpm, and native modules compiled for the image.
- Profiles, sessions, and settings persisted under `/root/.dsh`.

## Data and configuration

The container stores all harness data under `/root/.dsh`. Mount a volume there, or set `DSH_HOME` to relocate it. Set `DSH_TELEMETRY_DISABLED=1` to disable telemetry.

## Secure the surface

The image defaults to binding all interfaces because the web surface can run code on the host. Restrict network access to the port, or run with `--host 127.0.0.1` to return to loopback.

## Build and publish

The [container README](../../../container/README.md) covers local builds, the GHCR publishing workflow, and every runtime detail.
