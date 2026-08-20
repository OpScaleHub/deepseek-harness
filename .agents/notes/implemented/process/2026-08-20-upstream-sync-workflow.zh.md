# Agent Note: 在 fork 的 master 上做夜间上游同步

Status: implemented

[English](2026-08-20-upstream-sync-workflow.md) | 中文

## 问题

OpScaleHub/deepseek-harness 的既定目标,是围绕上游 deepseek-ai/deepseek-harness 做一层简化的消费封装:一个发布到 `ghcr.io/opscalehub/deepseek-harness` 的预构建容器,外加一个 GitHub Pages 落地页([docs/index.html](../../../../docs/index.html))。[container-publish.yml](../../../../.github/workflows/container-publish.yml) 已经能在每次触及真实代码的 master push 上重新构建并republish `:latest`,并且始终从本仓库自己钉住的提交构建(设计上刻意不直接使用上游 HEAD——细节见该工作流开头的注释)。但此前没有任何自动化把上游提交挪到这个 fork 的 master 上:`upstream`(`deepseek-ai/deepseek-harness`)只是一个配置好的 git remote,没有任何自动化去读取它,于是一个新的上游发布会一直不体现在已发布的镜像里,直到有人手动把它合并进来。这个 fork 相对上游也确实存在真实的分叉:[CI 精简说明](2026-08-16-fork-ci-trim.md)重写了 `ci.yml` 并禁用了若干仅上游需要的工作流,因此任何自动化都不能只做一次简单的快进合并;它必须能处理真正的三方合并,以及合并可能产生的冲突。

## 决定

[upstream-sync.yml](../../../../.github/workflows/upstream-sync.yml) 每晚(UTC 03:17)运行一次,外加 `workflow_dispatch`。它拉取 `upstream/master`,当 `master` 落后于它时执行 `git merge upstream/master --no-edit`。一次干净的合并会直接用默认的、拥有 `contents: write` 权限的 `GITHUB_TOKEN` push 到 `master`——`master` 没有配置分支保护,因此这次直接 push 无需任何 PAT 即可成功——而这次 push 正是与 `container-publish.yml` 之间唯一的衔接点:这个工作流本身不包含任何 Docker 或 GHCR 相关逻辑,它做的唯一一件事就是把提交移动到 `master` 上。一次产生冲突的合并绝不会被自动解决:工作流会原样暂存冲突后的目录树(`git add -A`,冲突标记原样保留、在 diff 中可见),把它提交到一个强制推送的 `upstream-sync` 分支,并针对 `master` 开出(或者说,在已存在时,由下一次运行更新)一个用于人工解决的 PR。这样可以避免这个 fork 自己刻意保留的分叉——CI 精简、落地页、`Containerfile`——被上游对同一批文件的改动悄悄覆盖掉。

## 考虑过的替代方案

**使用 GitHub 原生的“Sync fork”快进同步。** 直接否决:这个 fork 的 `master` 上存在分叉提交(CI 精简、文档、落地页),因此 `master` 并不是 `upstream/master` 的严格祖先,第一次分叉发生之后,快进合并就普遍不再可用。

**把 `master` 变基到 `upstream/master` 上,而不是合并。** 已否决:变基会重写每一个已经 push 出去、并且用于以 `github.sha` 构建镜像的 fork 本地提交的 SHA,导致每次同步都要对 `master` 做一次 `--force-with-lease` push。合并是仅追加的,永远不会重写某个已发布的 `:sha-<short>` 镜像标签所引用过的历史。

**即便合并是干净的,也总是先开一个 PR,交给人工点一下合并按钮。** 已根据本说明确认过的设计选择否决:选择在干净合并时直接 push,理由是这个 fork 明确的目标就是夜间零touch重建,而一次干净的合并(按定义,不与任何 fork 本地改动冲突)无论是否有人先点一下按钮,风险都是一样的。产生冲突的情形仍然总是会生成一个 PR。

**冲突时自动倾向于保留 fork 自己那一侧的版本来解决。** 已否决:对于那些这个 fork 本就是有意 fork 出来的文件(例如 `ci.yml`),悄悄丢弃冲突中上游那一侧的内容,恰恰会在最需要人工做出合并决定的文件上,违背这次同步存在的意义。

## 后果

当合并是干净的,一次上游发布会在一个夜间周期内落到这个 fork 的 `master` 上,并且 `container-publish.yml` 既有的 `paths-ignore` 仍然会在合并进来的提交只涉及 docs/website/examples 时跳过重新构建。这个工作流产生的合并提交会带有 `github-actions[bot]` 身份,并从此出现在 `master` 的历史里——这是预期行为,用来把一次上游同步合并与人工提交的合并区分开来。

这个 fork 放弃了在一次干净的上游合并发布之前对它做任何编辑评审;一次夜间的 `:latest` 重建有可能在任何人查看这份 diff 之前,就把一个上游的回归发布出去。日后如果给 `master` 启用分支保护,就需要重新审视这个工作流(直接 push 会开始失败),转而采用上面提到的“总是走 PR”的替代方案。

`upstream-sync` 分支在存在时,保存的是一棵带有未解决冲突标记的目录树——它永远不处于可构建状态,不能原样合并。解决它的人应当使用普通合并而不是 squash:squash 会让产生的提交脱离 `upstream/master` 的祖先关系,于是下一次夜间运行里 `git rev-list HEAD..upstream/master --count` 这一步检查,会认为同样这批上游提交仍然待处理,从而重新发起同一次合并。

除了 [CI 精简说明](2026-08-16-fork-ci-trim.md) 已经覆盖的那部分之外,本说明不审查也不处理这个 fork 之前任何其他本地分叉;更全面地审视此前的 fork 改动是否仍然需要保留,是一项单独的、尚未纳入范围的后续工作。
