# dsh web 容器

[English](README.md) | 中文

为 DeepSeek Harness web 界面构建一个自包含镜像，基于固定的仓库提交。每个镜像都基于 `node:22-slim` 提供构建好的服务端和前端，并发布到本仓库的 GHCR 命名空间（`ghcr.io/opscalehub/deepseek-harness`）。该镜像是 fork 本地新增内容：上游没有容器构建。

运行时通过 tsx 启动 `apps/cli/src`，Loader 在启动时通过 `node_modules` 解析工作区包，因此镜像打包完整的源码树和依赖存储，而不是裁剪后的 bundle；builder 阶段在最终拷贝前剥离 `.git`。

## 与产品默认行为的差异

产品默认将 web 界面绑定到回环地址，并拒绝 `--host 0.0.0.0`，因为该界面会把远程代码执行暴露给任何能访问该端口的人。镜像通过 `--patch` 覆盖 [web-bind-all.patch.yml](web-bind-all.patch.yml) 使发布端口可达；绑定所有网络接口是运维人员做出的明确决定。向容器命令传 `--host 127.0.0.1` 可回到仅回环绑定。

## 运行

```sh
docker run -d --name dsh-web -p 3080:3080 -v dsh-data:/root/.dsh ghcr.io/opscalehub/deepseek-harness:latest
```

打开 <http://localhost:3080>，选择一个工作区并配置模型。镜像在服务器 URL 上暴露健康检查；容器编排器据此报告就绪状态。

- 3080 端口是 web 服务器的监听端口（`EXPOSE` 仅作说明）。
- 所有 harness 数据——profile、会话、设置——都存放在 `/root/.dsh`。在那里挂载一个卷，或设置 `DSH_HOME` 改变位置。
- 设置 `DSH_TELEMETRY_DISABLED=1` 关闭遥测。
- 模型凭据通过界面中的「设置」配置，而不是环境变量。

## 构建

[Makefile](Makefile) 包装常用命令；`make build` 复现发布工作流推送的内容。

```sh
make build                  # from container/: build ghcr.io/opscalehub/deepseek-harness:latest
make build REPO_REF=<sha>   # build one commit
make build-plain            # full BuildKit progress log (diagnose a failure)
make build-no-cache         # ignore every cache
```

Containerfile 接受两个构建参数：`REPO_URL`（默认上游 `deepseek-ai/deepseek-harness`）和 `REPO_REF`（默认 `master`）。因此裸 `docker build` 构建上游 HEAD；传入两个参数可构建其他仓库或提交。最终阶段拷贝整个构建产物树，所以发布的镜像反映被引用的提交，而不是构建上下文。

分层缓存是设计的核心：克隆、安装、构建是独立的 `RUN` 步骤，pnpm store 和 node-gyp 缓存是 BuildKit 缓存挂载，`pnpm install` 使用 `--frozen-lockfile`。引用的提交不变时重构建会完全命中缓存；提交变化时安装会重新执行，但复用已缓存的 store。

## 发布

[nightly-image-sync.yml](../.github/workflows/nightly-image-sync.yml) 是本仓库唯一的工作流，也是唯一会发布镜像的东西。每晚一次，外加手动触发，它会解析上游 `deepseek-ai/deepseek-harness` 当前的 `master` 提交，除非该提交已经发布过，否则就基于它构建并推送 `:latest` 和 `:sha-<short>`。它没有 `pull_request` 或 `push` 触发器——本仓库中不会有任何东西针对拉取请求或普通提交运行。这个 fork 自己的 `master` 分支不参与构建：`REPO_URL`/`REPO_REF` 直接指向解析出的上游提交，与 Containerfile 自身的默认值一致。

认证使用仓库范围的 `GITHUB_TOKEN`，权限为 `packages: write`；无需 PAT 或密钥。匿名拉取前必须为仓库启用 GHCR，并将包设为公开。

手动发布：先 `docker login ghcr.io --username <user> --password <token>` 再 `make publish`，token 是带 `write:packages` 权限的 PAT，或 `gh auth token`。

## 回馈上游

容器相关新增内容——`Containerfile`、`.dockerignore`、`container/` 和工作流——是自包含的，可以作为 PR 提交到上游。绑定所有网络接口的覆盖层改写了产品做出的明确安全决定，因此上游版本应让该覆盖层保持可选，而不是作为默认命令。
