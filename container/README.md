# dsh web container

English | [中文](README.zh.md)

Builds a self-contained image of the DeepSeek Harness web surface from a pinned repository commit. Each image ships the built server and frontend on `node:22-slim` and is published to this repository's GHCR namespace (`ghcr.io/opscalehub/deepseek-harness`). The image is a fork-local addition: upstream has no container build.

The runtime boots `apps/cli/src` through tsx and the Loader resolves workspace packages through `node_modules` at boot, so the image ships the full source tree and dependency store rather than a pruned bundle; the builder stage strips `.git` before the final copy.

## Differences from the product defaults

The product loopback-binds the web surface and rejects `--host 0.0.0.0` because the surface exposes remote code execution to anyone who can reach the port. The image applies [web-bind-all.patch.yml](web-bind-all.patch.yml) as a `--patch` overlay so the published port is reachable; binding all interfaces is an explicit operator decision. Pass `--host 127.0.0.1` to the container command to fall back to loopback.

## Run

```sh
docker run -d --name dsh-web -p 3080:3080 -v dsh-data:/root/.dsh ghcr.io/opscalehub/deepseek-harness:latest
```

Open http://localhost:3080, choose a workspace, and configure a model. The image exposes a healthcheck on the server URL; container orchestrators report readiness from it.

- Port 3080 is the web server's listen port (`EXPOSE` is informational).
- All harness data — profiles, sessions, settings — lives under `/root/.dsh`. Mount a volume there or set `DSH_HOME` to relocate it.
- Set `DSH_TELEMETRY_DISABLED=1` to disable telemetry.
- Model credentials are configured through the UI's Settings, not environment variables.

## Build

The [Makefile](Makefile) wraps the common commands; `make build` reproduces what the publishing workflow pushes.

```sh
make build                  # from container/: build ghcr.io/opscalehub/deepseek-harness:latest
make build REPO_REF=<sha>   # build one commit
make build-plain            # full BuildKit progress log (diagnose a failure)
make build-no-cache         # ignore every cache
```

The Containerfile takes two build args: `REPO_URL` (default upstream `deepseek-ai/deepseek-harness`) and `REPO_REF` (default `master`). A plain `docker build` therefore builds upstream HEAD; pass both args to build another repository or commit. The final stage copies the whole built tree, so the shipped image reflects the referenced commit, never the build context.

Layer caching is the design center: clone, install, and build are separate `RUN` steps, the pnpm store and node-gyp caches are BuildKit cache mounts, and `pnpm install` uses `--frozen-lockfile`. A rebuild with an unchanged referenced commit is fully cached; when the commit moves, install re-runs but reuses the cached store.

## Publish

[container-publish.yml](../.github/workflows/container-publish.yml) builds and pushes to this repository's GHCR namespace on every relevant event:

- `master` push or manual dispatch → `:latest` and `:sha-<short>`.
- `dsh-v*` tag push → `:<version>` (`dsh-v0.1.0-rc.5` → `0.1.0-rc.5`) and `:latest`.
- pull request → build-only validation, nothing published.

Authentication is the repo-scoped `GITHUB_TOKEN` with `packages: write`; no PAT or secrets are needed. The workflow passes `REPO_URL` and `REPO_REF` pointing at the fork and the exact commit, so the published image matches the commit being pushed. GHCR must be enabled for the repository and the package set to public before anonymous pulls work.

Publish manually with `make publish` after `docker login ghcr.io --username <user> --password <token>`, where the token is a PAT with `write:packages` or `gh auth token`.

## Upstreaming

The container additions — `Containerfile`, `.dockerignore`, `container/`, and the workflow — are self-contained and can be proposed upstream as a PR. The bind-all-interfaces overlay overrides a deliberate product safety decision, so an upstream version should keep that overlay opt-in rather than the default command.
