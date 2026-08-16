# 容器化运行 DeepSeek Harness Web

[English](index.md) | 中文

dsh web 容器可以在没有检出源码、没有 Node 工具链的情况下运行 DeepSeek Harness 的浏览器界面。每个镜像都基于 `node:22-slim` 提供构建好的服务端和前端，并发布到本仓库的 GHCR 命名空间；服务端监听 3080 端口。

## 快速开始

```sh
docker pull ghcr.io/opscalehub/deepseek-harness:latest
docker run -d --name dsh-web -p 3080:3080 -v dsh-data:/root/.dsh ghcr.io/opscalehub/deepseek-harness:latest
```

打开 `http://localhost:3080`，选择一个工作区并[配置模型](../guide/providers.md)。[Web UI 指南](../guide/)覆盖其余工作流程。

## 镜像提供的内容

- 基于基础 harness 的完整 web profile，包括构建好的前端。
- 健康检查、固定版本的 pnpm，以及针对镜像编译的原生模块。
- 在 `/root/.dsh` 下持久化的 profile、会话和设置。

## 数据与配置

容器把所有 harness 数据存放在 `/root/.dsh`。在那里挂载一个卷，或设置 `DSH_HOME` 改变位置。设置 `DSH_TELEMETRY_DISABLED=1` 关闭遥测。

## 保障表面安全

镜像默认绑定所有网络接口，因为 web 表面可以在宿主机上运行代码。限制端口的网络访问，或用 `--host 127.0.0.1` 回到仅回环绑定。

## 构建与发布

[容器 README](../../../container/README.md) 介绍本地构建、GHCR 发布工作流以及全部运行时细节。
