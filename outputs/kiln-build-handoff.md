# Kiln build handoff

**Build status:** portfolio-ready local implementation

**Date:** August 16, 2026
**Local workbench:** http://localhost:3000

## Outcome

Kiln is now a working verifiable agentic app builder—not a static mockup. A user can submit a product brief, review a typed contract, approve an implementation plan, generate a bounded full-stack change set, queue it for isolated verification, inspect source and diffs, observe honest failure evidence, trigger a bounded repair, and export a complete runnable repository.

The interface uses a deliberate “engineering workbench” visual system: warm paper surfaces, dense technical typography, restrained cobalt actions, clear trust states, and responsive desktop/mobile layouts. Seeded demonstration data is always labeled as seeded; live runs start at 0 checks and cannot display a verified state without trusted evidence.

## Implemented journey

1. Create a tenant-scoped project from a plain-language brief.
2. Produce a strict Build Contract with requirements, entities, pages, API operations, assumptions, and acceptance checks.
3. Require human approval before planning.
4. Produce a capability-labeled implementation plan with cost/time estimates.
5. Require a second human approval before generation.
6. Generate exactly four allowlisted extension files against a pinned React + FastAPI + PostgreSQL blueprint.
7. Persist every patch, source snapshot, event, step, and audit record.
8. Queue an immutable execution payload through a leased executor protocol.
9. Accept verification facts only from the authenticated runner and only in the canonical ten-check order.
10. On failure, preserve a hashed report, block release, sanitize diagnostics, permit at most three four-file repairs, and re-queue verification.
11. Export JSON evidence at any state or a complete ZIP with generated source and `.kiln/` provenance.
12. Keep deployment locked until verification and show an honest approval preview instead of creating a fake cloud resource.

## Security built into the codebase

- Trusted control plane and untrusted execution plane are separate services.
- Tenant ownership is checked server-side on projects, contracts, runs, artifacts, audit streams, and exports.
- JSON mutations enforce same-origin requests, body limits, strict schemas, and rate windows.
- Service calls and executor completion use separate server-only tokens; lease tokens are stored only as hashes.
- Model output cannot authorize actions or write arbitrary paths.
- Traversal, absolute paths, binary output, stale hashes, protected files, oversized patches, and undeclared requirements are rejected.
- Generated code cannot replace the runner's command list or edit evaluators, tests, policy, workflows, or lockfiles.
- The hosted provider uses disposable Firecracker sandboxes; the local Docker policy is rootless, capability-dropped, network-denied, PID-limited, memory-limited, and read-only outside the workspace.
- Output is capped and redacts bearer tokens, API keys, passwords, secrets, and database URLs before persistence.
- A partial or failed check prefix can never unlock `ready` or deployment.
- Repository exports validate every source snapshot by SHA-256 and never copy process environments or provider credentials.

## Verification completed

- ESLint: passed
- Strict TypeScript: passed
- Production workbench build: passed
- Rendered HTML checks: 2 passed
- Node policy/control-plane tests: 19 passed
- Ruff lint and formatting: passed
- Strict mypy: passed
- FastAPI/orchestrator tests: 14 passed
- npm audit: no known vulnerabilities
- Locked Python dependency audit: no known vulnerabilities
- Gitleaks source scan: no leaks found; the same scanner is pinned in CI for full-history checks
- Generated volunteer workspace evaluation: all canonical stages passed
  - Ruff
  - strict mypy
  - Alembic migrations
  - frontend typecheck
  - Vitest
  - backend pytest
  - contract acceptance
  - source policy
  - production frontend build
  - preview smoke
- Controlled failure/repair drill: passed without executing generated code in the fixture

## Recruiter demo script

1. Start on Pantry Pilot and call out the explicit **Seeded verified example** label.
2. Select **Start another build** and submit the volunteer-scheduling brief.
3. Explain the contract gate, then approve it.
4. Review the capability-labeled plan and approve generation.
5. Show the four generated files in Code and Diff, then the architecture view.
6. Point out that the live evidence bar says 0/10 while the runner is queued.
7. Open Export and explain that every ZIP carries contract and SHA provenance.
8. Open Deploy on the seeded example to show the destination/visibility/cost/secrets approval contract and the explicit “no cloud credentials configured” statement.
9. If discussing failure handling, use the captured repair-evidence state: the runner's structured result—not an agent summary—blocked release and exposed repair attempt 1 of 3.

## Honest remaining boundary

Two external pieces are intentionally not claimed as complete in this local workspace:

1. **Hosted execution:** the Vercel Sandbox/Firecracker adapter is implemented, but this workspace has no Vercel credentials. Live generated runs therefore remain durably queued.
2. **External deployment and rollback:** the approval contract and domain boundary exist, but no cloud deployment adapter is configured.

The PRD's 30-prompt benchmark is also not complete; five golden fixtures exist today. The current passing evaluation supports a strong engineering demo but not a broad reliability percentage.

## Best next build phases

1. Configure hosted sandbox credentials and run the canonical ten checks through Firecracker.
2. Add a real private-preview deployment adapter, teardown, and rollback using short-lived identity.
3. Expand five golden contracts to 30 and publish measured first-run/three-repair reliability.
4. Add a concise marketing landing page and public case study after the technical workflow is hosted.
