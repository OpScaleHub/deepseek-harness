# Agent Note: 为 OpScaleHub/deepseek-harness fork 精简 CI

Status: implemented

[English](2026-08-16-fork-ci-trim.md) | 中文

## 问题

OpScaleHub/deepseek-harness 是一个直接 fork,未加改动地继承了上游的每一个 GitHub Actions 工作流。其中几个工作流假定了只在 `deepseek-ai/deepseek-harness` 及其组织下才存在的状态:[ci.yml](../../../../.github/workflows/ci.yml) 中的企业级作业、原生 Windows 作业以及自托管待命作业都指向组织所有的 `dsh-ubuntu-24-04-*`/`dsh-windows-2025-*` 大型 runner 池,或是[CI 故障切换运行手册](2026-07-26-ci-failover-runbook.md)与[原生 Windows 拉取请求 CI 说明](2026-08-08-native-windows-pull-request-ci.md)中描述的自托管 `vm-backup`/`dsh-win-ci` 虚拟机;[issue-lifecycle.yml](../../../../.github/workflows/issue-lifecycle.yml) 硬编码了 `owner: deepseek-harness`,并需要 `DSH_ISSUE_APP_CLIENT_ID`/`DSH_ISSUE_APP_PRIVATE_KEY` 这套 GitHub App 凭据;[issue-policy.yml](../../../../.github/workflows/issue-policy.yml) 运行 `.github/issue-management/policy.mjs`,其 `config.json` 硬编码了组织 `deepseek-harness` 以及带有专属自定义字段与状态的 1 号 GitHub Project;[docs-pages.yml](../../../../.github/workflows/docs-pages.yml) 调用 `actions/configure-pages`,而该仓库若未启用 GitHub Pages,此调用必定失败。这五个前提在 fork 上全都不成立。该 fork 没有注册任何自托管 runner,也没有上游组织大型 runner 池的管理权限,于是每个拉取请求都会在企业级 Linux 作业和 `windows-native` 后排队 65 分钟以上,等待永远不会到来的容量,而 `issue-lifecycle` 与 `issue-policy` 则在每一次 issue 和拉取请求事件上都直接失败。

## 决定

[ci.yml](../../../../.github/workflows/ci.yml) 中由拉取请求触发的 `jobs:` 现在只剩两项:`static`(`pnpm run check:ci:static` —— 既有的静态/文档/knip/模块图聚合检查,涵盖了每次双语文档 PR 都会触发的翻译配对与 `docs:check` 门禁)和 `unit`(`pnpm run test`,未插桩的 Vitest 运行),二者都运行在普通的 `ubuntu-latest` 上,并使用 `setup-node` 内置的 `cache: pnpm`。它们取代了 `node-24`、`node-24-coverage`、`node-24-consumers`、`node-compat`、`python-sdk`、`python-runtime`、`windows`(Wine)、`wine-apt-cache` 以及 `windows-native`。`all-checks-passed.needs` 现在是 `[static, unit]`,其 `runs-on` 也从依 `DSH_CI_FAILOVER_LINUX` 选择的表达式简化为普通的 `ubuntu-latest`,因为根本没有可供选择的故障切换池。由 push 触发的自托管待命作业 `serial-linux-selfhosted` 与 `serial-windows` 被直接移除——这个 fork 上不存在可供演练的 `vm-backup` 或 `dsh-win-ci` 虚拟机。已经处于休眠状态的 `serial-linux`/`serial-macos`(`if: false`)以及仅靠 `workflow_dispatch` 触发的 `larger-runner-benchmark`/`consolidated-runner-benchmark` 予以保留:除非有人重新启用或手动触发,否则它们不产生任何开销,现已在各自位置加上简短注释说明这一点。文件顶部的并发注释,以及休眠的 `serial-linux` 作业内一处过时注释,都已改写,不再描述这个文件中已不存在的待命作业和企业级作业。

[issue-lifecycle.yml](../../../../.github/workflows/issue-lifecycle.yml) 与 [issue-policy.yml](../../../../.github/workflows/issue-policy.yml) 的作业主体保持不变,只是把 `issues`/`pull_request`/`pull_request_review` 触发器降为仅 `workflow_dispatch`,并附上注释,指出具体是哪些上游专属状态(GitHub App 凭据;硬编码的组织与 GitHub Project)在这个 fork 上行不通。[docs-pages.yml](../../../../.github/workflows/docs-pages.yml) 同样把带路径过滤的 `push` 触发器降为仅 `workflow_dispatch`,并注明:一旦仓库启用了 GitHub Pages,恢复 `push` 触发器就是重新启用的全部工作。[container-publish.yml](../../../../.github/workflows/container-publish.yml) 未作改动:它本就只通过仓库范围的 `GITHUB_TOKEN` 面向本仓库自己的 GHCR 命名空间,并且在 PR #1 中已按设计通过。

`release.yml`、`release-vendor.yml`、`sandbox.yml`、`landlock-run.yml`、`landlock-run-release.yml`、`e2b-e2e.yml`、`pi-ai-provider-e2e.yml`、`expected-filenames.yml`、`build-exe-for-python-sdk.yml` 以及 `e2e.yml` 均已审视并保持不变。`release.yml` 与 `release-vendor.yml` 在每个拉取请求和 master push 上运行,但始终只使用标准的 `ubuntu-24.04`,因此本就不会排队,可以正常通过。`sandbox.yml` 仅在 master push 时触发,其矩阵(`ubuntu-latest`、`ubuntu-24.04`、`ubuntu-24.04-arm`、`macos-latest`)全部是标准托管 runner。`landlock-run.yml` 的矩阵来自 `native/landlock-run/scripts/github-matrix.mjs`,该脚本只会给出 `ubuntu-24.04`/`ubuntu-24.04-arm`,且它按 `native/landlock-run/**` 做了路径过滤,而这个 fork 并不改动该路径。`landlock-run-release.yml`、`e2b-e2e.yml` 与 `pi-ai-provider-e2e.yml` 本就只依靠 `workflow_dispatch` 触发。`expected-filenames.yml` 按 golden 文件名做了路径过滤。`build-exe-for-python-sdk.yml` 的矩阵只使用 `ubuntu-latest`/`ubuntu-24.04-arm`/`macos-latest`;它今后唯一的自动触发方式是 `python-release-dry-run` 这个 PR 标签,而这个 fork 不会打这个标签。`e2e.yml` 会在每个拉取请求上运行,但其设计就是在缺少 `DEEPSEEK_API_KEY_EXTERNAL` 密钥时自行跳过并报告为成功,而这个 fork 上恰好没有这个密钥。

## 考虑过的替代方案

**修改 `.github/issue-management/config.json` 与 `policy.mjs`,让它们指向 `OpScaleHub/deepseek-harness`,而不是直接禁用 `issue-lifecycle`/`issue-policy`。** 已否决:这些脚本假定存在一个拥有专属自定义字段与状态集合的 GitHub Project(`projectNumber: 1`),外加一个专用的 GitHub App,而这些只在上游存在。复刻这一整套设施,与该 fork 所声明的“在此提 issue、由开发者代理实现、由本账号审核合并”的工作方式并不相称,而且该 fork 目前也没有这样的 Project。

**设置 `DSH_CI_FAILOVER_LINUX`/`DSH_CI_FAILOVER_WINDOWS` 仓库变量,把企业级作业和原生 Windows 作业重新定向,而不是直接移除。** 已否决:这两个变量各自只在两个上游专属的池之间切换(组织大型 runner 与自托管虚拟机),两个分支都指向这个 fork 上不存在的东西,因此不存在仅靠配置就能解决的方案。

**直接删除 `issue-lifecycle.yml`、`issue-policy.yml` 与 `docs-pages.yml`,而不是将其限制为仅 `workflow_dispatch`。** 已否决:保留文件但使其处于不生效状态,意味着日后重新启用其中任何一个(接入 OpScaleHub 自有的 GitHub App 与 Project、启用 Pages)只是一次配置变更加上恢复一处 `on:` 配置,而不必重新添加已删除的作业逻辑,这也保住了[该 issue 所述目标](https://github.com/OpScaleHub/deepseek-harness/issues/2)——与上游保持可合并性。

**在 `ubuntu-latest` 上不分片地跑完被移除的 coverage/consumers/node-compat/Windows 系列检查,而不是把它们从拉取请求触发器中去掉。** 已否决:这些门禁的 worker 数量(`DSH_COVERAGE_MAX_WORKERS`、`DSH_SNAPSHOT_MAX_CONCURRENCY` 等)是针对 16 核池调优的,在标准 runner 上不插桩地跑,只会让这个明确追求“快速、精简、始终能给出结论”的 fork 的拉取请求延迟成倍增加。`pnpm run test` 用远少得多的时间覆盖了同样的产品代码;`check:ci:coverage`、`check:ci:consumers`、`check:node-compat` 与 `check:ci:windows-complete` 仍是 `package.json` 中未作任何改动的脚本,贡献者依旧可以在本地运行,若日后这个 fork 具备了同等的 runner 容量,后续 PR 也可以原样把它们重新接回 `ci.yml`。

## 后果

这个 fork 上的拉取请求现在能得到一个真实、快速、始终能给出结论的验证结果(`static` + `unit`,均运行在标准 runner 上),而不再排队等待永远不会到位的容量。issue 与拉取请求事件不再由 `issue-lifecycle`/`issue-policy` 产生自动失败的检查。`container-publish.yml` 依旧照旧在 master push 与 `dsh-v*` 标签上构建并发布 `ghcr.io/opscalehub/deepseek-harness`。

该 fork 放弃了对拉取请求的自动强制执行:按文件 100% 的覆盖率阈值、Node 22.19/26 兼容性矩阵、无密钥 Python SDK 套件,以及 Windows 的两条通道(Wine 阻塞与原生完整)。底层的门禁脚本均未改动,因此每一项都仍可手动运行(`pnpm run check:ci:coverage`、`check:node-compat`、`check:ci:windows-complete`、`check:ci:consumers`),并且一旦 runner 容量发生变化,也可以原样恢复进 `ci.yml`。在启用 GitHub Pages 并恢复 `push` 触发器之前,`docs-pages.yml` 不会再在文档变更时自动部署文档站点。

`.github/workflows/ci.yml`、`issue-lifecycle.yml`、`issue-policy.yml` 与 `docs-pages.yml` 现在是对上游所有文件的 fork 本地覆盖。日后从 `deepseek-ai/deepseek-harness` 合并/变基、涉及这四个文件的历史时,应保留这个 fork 的版本,并手动重新应用任何确实是新增的上游作业或门禁,而不是整体采用上游文件。

这是对[让已实现的 Agent Note 与实际上线内容保持一致](../AGENTS.md)这条规则的一次有边界、经过权衡的例外:本次改动未编辑[CI 故障切换运行手册](2026-07-26-ci-failover-runbook.md)、[原生 Windows 拉取请求 CI 说明](2026-08-08-native-windows-pull-request-ci.md)以及 [pnpm/action-setup 缓存说明](2026-07-26-pnpm-action-setup-for-symmetric-ci-caching.md),它们仍会提到这个 fork 自己的 `ci.yml` 中已不存在的作业(`node-24`、`node-compat`、`windows-native`、`serial-windows` 等)。为了迁就一个 fork 本地的运维选择,去重写三份互相大量引用的上游调查记录,本身就会制造出[起因 issue](https://github.com/OpScaleHub/deepseek-harness/issues/2) 要求这份说明避免的那种协调冲突;三者也都未被归档,因为其内容对上游自己已上线的 `ci.yml` 依旧准确。在未来的协调工作恢复相应容量、或有意取代它们之前,应把它们对作业名称的引用理解为描述上游的设计,而不是这个 fork 的 `ci.yml`。`container-publish.yml` 及其 `web-bind-all.patch.yml` 覆盖层没有上游对应物,也就无需协调策略。
