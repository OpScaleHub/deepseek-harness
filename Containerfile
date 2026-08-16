# syntax=docker/dockerfile:1

# DeepSeek Harness — dsh web server image.
# Builds from the public GitHub repo (no build context used beyond this file),
# so layer cache is the whole game: clone, install, and build are separate RUN
# steps, and the pnpm store / node-gyp caches are mounted across builds.

FROM node:22-slim AS builder

# Native modules (node-pty rebuilds from source; no linux-x64 prebuild ships
# with the patched 1.1.0) need python3/make/g++; git pulls the repo; pnpm is
# pinned to the repo's declared packageManager.
RUN apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates git python3 make g++ && \
    npm install -g pnpm@11.7.0 && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# The checkout the image is built from. CI points these at the publishing
# repository and its exact commit; the defaults keep a plain `docker build`
# on upstream HEAD.
ARG REPO_URL=https://github.com/deepseek-ai/deepseek-harness.git
ARG REPO_REF=master

# Layer 1: source checkout. Invalidates only when the referenced commit moves.
RUN git init -q . && \
    git remote add origin "$REPO_URL" && \
    git fetch --depth 1 origin "$REPO_REF" && \
    git checkout -q FETCH_HEAD

# Layer 2: dependency install. Re-runs only when the clone layer changes; the
# mounted caches make a re-run cheap (store hardlinks, no re-download).
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    --mount=type=cache,target=/root/.cache/node-gyp \
    pnpm install --frozen-lockfile

# Layer 3: compile all packages and build the web frontend.
RUN pnpm run build

# Layer 4: strip VCS metadata from the shipped tree.
RUN rm -rf .git

FROM node:22-slim

RUN npm install -g pnpm@11.7.0 && \
    npm cache clean --force && \
    rm -rf /root/.npm

WORKDIR /app

# The runtime boots apps/cli/src via tsx (the `dsh` script), resolving
# workspace packages through node_modules, so the full source + built tree
# must ship; the builder already stripped .git.
COPY --from=builder /app /app

# User data (profiles, sessions) lives under $DSH_HOME (~/.dsh by default).
VOLUME ["/root/.dsh"]

# Deployment overlay: the product loopback-binds the web surface and rejects
# `--host 0.0.0.0` (RCE exposure). This patch re-asserts the all-interfaces
# bind as an explicit operator decision so the published port is reachable.
COPY container/web-bind-all.patch.yml /app/container/web-bind-all.patch.yml

EXPOSE 3080

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3080').then(r => { if (!r.ok) process.exit(1) }).catch(() => process.exit(1))"

CMD ["pnpm", "dsh", "web", "--patch", "/app/container/web-bind-all.patch.yml"]
