# Agent Note: 直接基于上游 HEAD 夜间构建镜像,不再有 PR 或 CI

Status: implemented

[English](2026-08-20-upstream-sync-workflow.md) | 中文

## 问题

OpScaleHub/deepseek-harness 的既定目标,是围绕上游 deepseek-ai/deepseek-harness 做一层简化的消费封装:一个发布到 `ghcr.io/opscalehub/deepseek-harness` 的预构建容器,外加一个 GitHub Pages 落地页(`docs/index.html`)。这个决定的早期版本,是按计划把上游的 `master` 合并进这个 fork 自己的 `master`,依赖既有的、由 `pull_request` 触发的 `ci.yml`,以及由 push 触发的容器发布工作流来验证并重新发布合并结果。实际情况是,每一次需要走拉取请求(冲突时的回退方案)的同步,都会触发 `ci.yml`、一次容器构建,以及 GitHub 自身的 Pages 部署——对于一个只有镜像和落地页这两个目的的仓库来说,这是三次自动的 Actions 运行,而这两个目的都不需要一个通用的 CI 门禁。

## 决定

[nightly-image-sync.yml](../../../../.github/workflows/nightly-image-sync.yml) 是本仓库唯一的工作流。它没有 `pull_request` 触发器,也没有 `push` 触发器——本仓库中不会有任何东西针对拉取请求或普通提交运行。在它的夜间计划(UTC 03:17)或手动触发时,它通过 `git ls-remote` 解析上游当前的 `master` 提交,在 GHCR 中检查是否已存在与该提交对应的 `sha-<short>` 标签,除非已经发布过,否则就直接基于该上游提交构建并推送 `:latest` 和 `:sha-<short>`,使用的唯一构建输入是本仓库检出的 `Containerfile` 和 `container/web-bind-all.patch.yml`。

这个 fork 自己的 `master` 分支不再与上游做任何合并,也不参与构建。`ci.yml` 被彻底删除,而不是精简:本仓库不再有任何由拉取请求触发的测试、lint 或文档检查。`Containerfile` 与 `container/` 未作改动——工作流传入的 `REPO_URL`/`REPO_REF` 与 Containerfile 自身面向上游 `master` 的默认值一致,只是为了可复现的标签而钉死在一个精确解析出的提交上。

## 考虑过的替代方案

**把上游合并进这个 fork 自己的 `master`(此前的设计),依靠 `ci.yml` 加一个冲突时的解决 PR。** 已否决:这正是本说明所取代的那个设计。每一次冲突都会产生一个拉取请求,而每一个拉取请求都会触发 `ci.yml`、一次容器重建,以及 GitHub 自动的 Pages 部署——这是这个仓库明确目标(只有一个容器镜像和一个落地页,别无其他)并不需要的 Actions 噪音。直接基于上游的引用构建,去掉了合并这一步,也就连带去掉了合并可能产生的整整一类冲突。

**为本仓库自己的这两个工作流/构建文件保留一个轻量级的 `pull_request` CI 检查。** 已否决:本仓库唯一剩下的可编辑内容——`Containerfile`、`container/`、`docs/index.html`,以及这一个工作流——规模小到足以直接读 diff 来审查;专门为此设一个检查作业,只会重新引入本说明想要去掉的那种自动 Actions 运行模式,而在这里权衡下来并不值得。

**用一个仓库变量或一个提交进仓库的状态文件,来跟踪“这个提交是否已经构建过”,而不是直接查询 GHCR。** 已否决:对 `sha-<short>` 标签执行 `docker buildx imagetools inspect` 不需要在已有的 `packages: write` 之外再要任何权限,不需要额外文件,也不可能与实际发布的内容出现分歧——一个状态文件或变量则可能悄悄地与 GHCR 的真实内容不一致。

## 后果

对本仓库的每一次 push 和拉取请求——包括对文档、`Containerfile` 或这个工作流本身的编辑——触发的 Actions 运行数都是零。GitHub 自身的 Pages 部署(与这里的任何工作流文件无关)仍然会在触及 `docs/` 的 push 上运行;这是从某个分支部署 Pages 这项平台功能本身的行为,不受本仓库工作流配置的控制。发布的镜像相对上游最多可能滞后一个夜间周期,手动 `workflow_dispatch` 是立即强制重建的唯一方式。

这个 fork 放弃了对自己这一小块内容的逐拉取请求强制检查——测试、lint、文档一致性;除了这个工作流和容器构建本身之外,目前也没有任何这样的内容需要检查,而这两者都可以通过直接读 diff 来审查。如果这个 fork 的范围以后重新扩展到包含真正的产品源码改动,重新引入一个由 `pull_request` 触发的检查将是一个新的决定,而不是对本决定的推翻,因为这两个问题(校验任意的源码改动,与基于一个固定的上游提交重新发布一个容器)并不是同一个问题。

[fork CI 精简说明](2026-08-16-fork-ci-trim.md) 记录的是更早、范围更窄的一次对 `ci.yml` 及其他上游工作流的精简;`ci.yml` 本身被本说明彻底删除;fork CI 精简说明并未因此改写,因为它作为那个中间状态的历史记录依旧准确。删除 `ci.yml` 也使得若干篇 Agent Note——包括[fork CI 精简说明](2026-08-16-fork-ci-trim.md)自身的引用——以及 `docs/development.md` 中指向它、用来描述 `ci.yml` 作业名称与触发器的链接失效——[fork CI 精简说明](2026-08-16-fork-ci-trim.md)自己的“后果”一节,在 `ci.yml` 只是被精简、还没有被删除时,就已经因为同样的理由拒绝改写这一类交叉引用:它们的内容对上游自己已上线的工作流依旧准确。本说明遵循这一先例,不逐一修复这些链接。
