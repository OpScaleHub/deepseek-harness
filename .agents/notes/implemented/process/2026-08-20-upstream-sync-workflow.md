# Agent Note: Nightly upstream sync onto the fork's master

Status: implemented

English | [中文](2026-08-20-upstream-sync-workflow.zh.md)

## Problem

OpScaleHub/deepseek-harness's stated purpose is a simplified consumption wrapper around upstream deepseek-ai/deepseek-harness: a prebuilt container published to `ghcr.io/opscalehub/deepseek-harness` plus a GitHub Pages landing page ([docs/index.html](../../../../docs/index.html)). [container-publish.yml](../../../../.github/workflows/container-publish.yml) already rebuilds and republishes `:latest` on every push to master that touches real code, from this repository's own pinned commit (never upstream HEAD directly, by design — see that workflow's header comment). But nothing moved upstream commits onto this fork's master in the first place: `upstream` (`deepseek-ai/deepseek-harness`) was a configured git remote with no automation reading it, so a new upstream release sat unreflected in the published image until someone manually merged it in. The fork has also diverged from upstream in real ways — [the CI trim note](2026-08-16-fork-ci-trim.md) rewrote `ci.yml` and disabled several upstream-only workflows — so a plain fast-forward "sync fork" cannot apply generally; any automation has to handle a true three-way merge and its possible conflicts.

## Decision

[upstream-sync.yml](../../../../.github/workflows/upstream-sync.yml) runs nightly (03:17 UTC) plus `workflow_dispatch`. It fetches `upstream/master`, and when `master` is behind it, runs `git merge upstream/master --no-edit`. A clean merge is pushed directly to `master` with the default `contents: write` `GITHUB_TOKEN` — `master` carries no branch protection, so this direct push succeeds without a PAT — and that push is the entire integration point with `container-publish.yml`: this workflow contains no Docker or GHCR logic of its own, it only ever moves commits onto `master`. A conflicting merge is never auto-resolved: the workflow stages the conflicted tree as-is (`git add -A`) so the markers are visible in the diff, commits it to a force-pushed `upstream-sync` branch, and opens (or leaves standing, updating on the next run) a PR against `master` for manual resolution. This keeps the fork's own deliberate divergences — the CI trim, the landing page, `Containerfile` — from ever being silently overwritten by an upstream change to the same files.

## Alternatives considered

**GitHub's native "Sync fork" fast-forward.** Rejected outright: the fork has diverged commits on `master` (CI trim, docs, landing page), so `master` is not a strict ancestor of `upstream/master` and a fast-forward is not generally available after the first divergence.

**Rebase `master` onto `upstream/master` instead of merging.** Rejected: rebasing rewrites every fork-local commit's SHA on a branch that's already pushed and builds images from `github.sha`, forcing a `--force-with-lease` push to `master` on every sync. A merge is append-only and never rewrites history already referenced by a published `:sha-<short>` image tag.

**Always open a PR, even for a clean merge, and let a human click merge.** Considered per the confirmed design choice for this note: rejected in favor of direct-push-on-clean-merge, since the fork's explicit goal is nightly zero-touch rebuilds and a clean merge (by definition, no conflicting fork-local change) carries the same risk whether a human clicks a button first or not. The conflict case still always produces a PR.

**Auto-resolve conflicts by preferring the fork's version of any conflicted file.** Rejected: silently dropping upstream's side of a conflict on files the fork intentionally forked (e.g. `ci.yml`) would defeat the sync's purpose for exactly the files most likely to need a deliberate merge decision.

## Consequences

An upstream release lands on this fork's `master` within one nightly cycle when the merge is clean, and `container-publish.yml`'s existing `paths-ignore` still skips a rebuild when the merged commits only touch docs/website/examples. Merge commits from this workflow carry the `github-actions[bot]` identity and appear in `master`'s history going forward — this is expected and distinguishes an upstream-sync merge from a hand-authored one.

The fork gives up any editorial review of a clean upstream merge before it publishes; a nightly `:latest` rebuild can ship an upstream regression before anyone looks at the diff. Enabling branch protection on `master` later would require revisiting this workflow (direct push would start failing) in favor of the "always via PR" alternative above.

The `upstream-sync` branch, when it exists, holds a conflicted tree with unresolved markers — it is never in a buildable state and must not be merged as-is. Whoever resolves it should merge normally rather than squash: squashing detaches the resulting commit from `upstream/master`'s ancestry, and the next nightly run's `git rev-list HEAD..upstream/master --count` check would then see the same upstream commits as still-pending and reopen the same merge.

This note does not audit or address any other prior fork-local divergence beyond the CI trim already covered by [the CI trim note](2026-08-16-fork-ci-trim.md); a broader look at whether other past fork changes are still wanted is a separate, not-yet-scoped follow-up.
