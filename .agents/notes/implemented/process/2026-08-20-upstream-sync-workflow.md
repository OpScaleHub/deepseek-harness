# Agent Note: Nightly image build straight from upstream HEAD, no PR or CI

Status: implemented

English | [中文](2026-08-20-upstream-sync-workflow.zh.md)

## Problem

OpScaleHub/deepseek-harness's stated purpose is a simplified consumption wrapper around upstream deepseek-ai/deepseek-harness: a prebuilt container published to `ghcr.io/opscalehub/deepseek-harness` plus a GitHub Pages landing page (`docs/index.html`). An earlier version of this decision merged upstream's `master` into this fork's `master` on a schedule, relying on the existing `pull_request`-triggered `ci.yml` and the push-triggered container-publish workflow to validate and republish the result. In practice, every sync attempt that needed a pull request (the conflict-resolution fallback) fired `ci.yml`, a container build, and GitHub's own Pages deployment — three automatic Actions runs — for a repository whose only two purposes are the image and the landing page, neither of which needs a general-purpose CI gate.

## Decision

[nightly-image-sync.yml](../../../../.github/workflows/nightly-image-sync.yml) is the only workflow in this repository. It has no `pull_request` and no `push` trigger — nothing here reacts to a pull request or an ordinary commit. On its nightly schedule (03:17 UTC) or manual dispatch, it resolves upstream's current `master` commit via `git ls-remote`, checks GHCR for a `sha-<short>` tag matching that commit, and — unless already published — builds and pushes `:latest` and `:sha-<short>` straight from that upstream commit, using this repository's checked-out `Containerfile` and `container/web-bind-all.patch.yml` as the only build inputs.

This fork's own `master` branch is no longer merged with upstream at all and plays no part in the build. `ci.yml` is deleted outright, not trimmed: this repository has no pull-request-gated tests, lint, or doc checks. `Containerfile` and `container/` are untouched — `REPO_URL`/`REPO_REF` passed by the workflow match the Containerfile's own upstream/`master` defaults, just pinned to an exact resolved commit for reproducible tagging.

## Alternatives considered

**Merge upstream into this fork's `master` (the prior design), and rely on `ci.yml` plus a conflict-resolution PR.** Rejected: it is the exact design this note replaces. Every conflict produced a pull request, and every pull request fired `ci.yml`, a container rebuild, and GitHub's automatic Pages deployment — Actions noise this repository's stated goal (a container image and a landing page, nothing else) does not need. Building straight from upstream's ref removes the merge, and with it the entire class of conflict a merge can produce.

**Keep a lightweight `pull_request` CI check for this repository's own two workflow/build files.** Rejected: the repository's only remaining editable surface — `Containerfile`, `container/`, `docs/index.html`, and this one workflow — is small enough to review by reading the diff; a dedicated check job would reintroduce exactly the automatic-Actions-run pattern this note removes for a benefit judged not worth it here.

**Track "already built this commit" with a repository variable or a committed state file instead of querying GHCR directly.** Rejected: querying `docker buildx imagetools inspect` against the `sha-<short>` tag needs no extra permission beyond the `packages: write` already granted, no extra file, and cannot drift from what is actually published — a state file or variable could silently disagree with GHCR's actual contents.

## Consequences

Every push and pull request to this repository, including edits to documentation, `Containerfile`, or this workflow itself, triggers zero Actions runs. GitHub's own Pages deployment (unrelated to any workflow file here) still runs on pushes that touch `docs/`; it is a platform feature of serving Pages from a branch, not something this repository's workflow configuration controls. The published image can lag upstream by up to one nightly cycle, and a manual `workflow_dispatch` is the only way to force an immediate rebuild.

The fork gives up per-pull-request enforcement of anything — tests, lint, doc consistency — for its own small surface; nothing here currently has any such surface beyond the workflow and the container build, both reviewable by reading the diff. If this fork's scope grows to include real product source changes again, reintroducing a `pull_request`-triggered check is a new decision, not a reversal of this one, since the two problems (verifying arbitrary source changes vs. republishing a container from a fixed upstream commit) are different.

[The fork-CI-trim note](2026-08-16-fork-ci-trim.md) documents an earlier, narrower trim of `ci.yml` and other upstream workflows; `ci.yml` itself is deleted by this note; the fork-CI-trim note is not rewritten to match, since it remains an accurate historical record of that intermediate state. Deleting `ci.yml` also breaks its inbound link from several Agent Notes — including [the fork-CI-trim note](2026-08-16-fork-ci-trim.md)'s own self-references — and from `docs/development.md`, all describing `ci.yml`'s job names and triggers — [the fork-CI-trim note](2026-08-16-fork-ci-trim.md)'s own "Consequences" section already declined to rewrite that same class of cross-reference when `ci.yml` was merely trimmed, for the same reason: their content remains accurate for upstream's own shipped workflow. This note follows that precedent rather than repairing each link.
