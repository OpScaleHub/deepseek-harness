import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import * as yaml from 'js-yaml'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '..')
const runnerPrivatePnpmDestination = '${{ runner.temp }}/setup-pnpm'

describe('CI workflow', () => {
  it('isolates every pnpm action setup destination per runner', () => {
    const workflow: unknown = yaml.load(readFileSync(resolve(root, '.github/workflows/ci.yml'), 'utf8'))
    if (!isRecord(workflow) || !isRecord(workflow.jobs)) throw new TypeError('CI workflow must define jobs')

    const setups = Object.entries(workflow.jobs).flatMap(([jobName, job]) => {
      if (!isRecord(job) || !Array.isArray(job.steps)) return []
      return job.steps.flatMap((step) => {
        if (!isRecord(step) || typeof step.uses !== 'string' || !step.uses.startsWith('pnpm/action-setup@')) return []
        return [{ jobName, step }]
      })
    })

    expect(setups.length).toBeGreaterThan(0)
    for (const { jobName, step } of setups) {
      expect(step, `${jobName} must not share pnpm/action-setup's default destination`).toMatchObject({
        with: { dest: runnerPrivatePnpmDestination },
      })
    }
  })

  // Fork-local: OpScaleHub/deepseek-harness has none of the organization-owned
  // larger-runner pools or self-hosted standby VMs the upstream enterprise,
  // Windows, Python, failover, serial-standby, and benchmark jobs require, so
  // ci.yml is exactly one job on a standard GitHub-hosted runner and exactly
  // one trigger (`pull_request`).
  // .agents/notes/implemented/process/2026-08-16-fork-ci-trim.md
  it('is exactly one pull-request job on a standard runner, with every removed upstream job and trigger absent', () => {
    const workflow = loadWorkflow('.github/workflows/ci.yml')
    if (!isRecord(workflow.jobs)) throw new TypeError('CI workflow must define jobs')

    expect(Object.keys(workflow.jobs)).toEqual(['ci'])
    expect(workflow.on).toEqual({ pull_request: null })

    const ci = workflowJob(workflow, 'ci')
    expect(ci['runs-on']).toBe('ubuntu-latest')
    expect(JSON.stringify(ci.steps)).toContain('pnpm run check:ci:static')
    expect(JSON.stringify(ci.steps)).toContain('pnpm run test')
  })

  it('cancels every superseded run unconditionally', () => {
    const workflow = loadWorkflow('.github/workflows/ci.yml')
    if (!isRecord(workflow.concurrency)) throw new TypeError('CI workflow must define a workflow-level concurrency block')

    expect(workflow.concurrency['cancel-in-progress']).toBe(true)
  })

  it('keeps supported LSP source under native Windows coverage', () => {
    const config = readFileSync(resolve(root, 'vitest.config.ts'), 'utf8')

    expect(config).not.toContain('packages/lsp/lsp-stdio/src/connection.ts')
    expect(config).not.toContain('packages/lsp/lsp-stdio/src/index.ts')
    expect(config).not.toContain('packages/lsp/lsp-stdio/src/instance.ts')
  })

  it('keeps every Vitest project process-isolated on native Windows', () => {
    const config = readFileSync(resolve(root, 'vitest.config.ts'), 'utf8')

    expect(config).not.toContain("pool: process.platform === 'win32' ? 'threads' : 'forks'")
    expect(config.match(/pool: 'forks'/g)).toHaveLength(2)
  })
})

// Fork-local: e2e.yml and e2b-e2e.yml are deleted, along with every other
// workflow beyond `ci.yml` and `container-publish.yml` — this fork ships one
// container image and needs no real-API or E2B live-suite CI.
// .agents/notes/implemented/process/2026-08-16-fork-ci-trim.md

// Fork-local: python-release.yml and build-exe-for-python-sdk.yml are
// deleted (this fork does not build or publish the Python SDK/runtime); the
// GitLab pipeline is untouched and keeps its own macOS deployment-target
// check, tested below.
describe('Python release workflows', () => {
  it('uses the shared macOS deployment-target check in GitLab', () => {
    const workflow = loadWorkflow('.gitlab-ci.yml')
    const runtimeWheel = workflow['.runtime-wheel']
    if (!isRecord(runtimeWheel) || !Array.isArray(runtimeWheel.script)) {
      throw new TypeError('GitLab CI must define the runtime wheel script')
    }
    const runtimeScript: unknown[] = runtimeWheel.script
    const macosCheck = runtimeScript.find(
      step => typeof step === 'string' && step.includes('PLATFORM" = macos-arm64'),
    )
    if (typeof macosCheck !== 'string') {
      throw new TypeError('GitLab CI must check the macOS deployment target')
    }

    expect(macosCheck).toContain('scripts/check-macos-deployment-target.py')
    expect(macosCheck).toContain('"$EXE" "$EXE-spawn-helper"')
  })
})

// Fork-local: release.yml, release-vendor.yml, issue-lifecycle.yml, and
// issue-policy.yml are deleted — this fork does not publish npm packages and
// does not run the upstream-only issue-management automation.
// .agents/notes/implemented/process/2026-08-16-fork-ci-trim.md

describe('Git hooks', () => {
  it('leaves frozen Agent Note sidecars to the archive verifier', () => {
    const lefthook = loadWorkflow('lefthook.yml')

    for (const hookName of ['pre-commit', 'pre-merge-commit']) {
      const hook = lefthook[hookName]
      if (!isRecord(hook) || !Array.isArray(hook.jobs)) {
        throw new TypeError(`lefthook must define ${hookName} jobs`)
      }
      const pairing: unknown = hook.jobs.find(
        (job: unknown) => isRecord(job) && job.name === 'translation pairing (staged records)',
      )

      expect(pairing).toMatchObject({ exclude: ['.agents/notes/archived/**'] })
    }
  })
})

function loadWorkflow(path: string): Record<string, unknown> {
  const workflow: unknown = yaml.load(readFileSync(resolve(root, path), 'utf8'))
  if (!isRecord(workflow)) throw new TypeError(`${path} must define a workflow`)
  return workflow
}

function workflowJob(workflow: Record<string, unknown>, job: string): Record<string, unknown> {
  if (!isRecord(workflow.jobs) || !isRecord(workflow.jobs[job])) {
    throw new TypeError(`workflow must define the ${job} job`)
  }
  return workflow.jobs[job]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
