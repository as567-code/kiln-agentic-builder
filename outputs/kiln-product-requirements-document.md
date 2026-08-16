# Kiln — Verifiable Agentic App Builder

**Document:** Product Requirements Document

**Status:** Approved implementation baseline · hosted integrations pending

**Date:** August 16, 2026

**Product type:** Portfolio-grade full-stack developer platform

**Primary objective:** Demonstrate production-minded agentic software engineering to recruiters and engineers

## 1. Executive summary

Kiln turns a natural-language product brief into a tested, inspectable, and deployable full-stack web application. It does not try to reproduce an entire cloud IDE or support every programming language. Instead, it makes one workflow exceptionally convincing:

> Brief → build contract → approved plan → generated code → isolated execution → automated repair → verified preview → deployment

The product's defining idea is **verifiable generation**. Users never receive a mysterious code dump accompanied by a success message. They see the requirements the agent understood, the files it changed, the commands it ran, the tests and security checks it passed, and any remaining limitations.

This makes Kiln more than a polished chat interface. The project demonstrates agent orchestration, full-stack product engineering, untrusted-code isolation, durable state, observability, testing, deployment automation, and secure software development.

## 2. Product thesis

Most portfolio “AI app builders” look interchangeable: a large prompt box, purple gradients, fake terminal output, and a generated landing page. That presentation does not prove difficult engineering.

Kiln will differentiate itself through four product decisions:

1. **Evidence over magic.** Every completed build has a requirements checklist, code diff, test report, dependency report, and deployment record.
2. **Constrained competence.** The first release supports one high-quality full-stack blueprint rather than unreliable generation across arbitrary frameworks.
3. **Visible engineering.** Planning, file edits, builds, tests, repairs, and policy decisions appear in a structured run timeline—not an endless chat transcript.
4. **Security by architecture.** Generated code runs outside the application control plane with strict identity, resource, network, filesystem, and lifetime boundaries.

## 3. Goals

### Product goals

- Convert a short product brief into a working full-stack application.
- Let the user review and approve a structured build contract before code generation.
- Generate readable code through small, reviewable patches.
- Stream trustworthy build progress without exposing hidden model reasoning.
- Run generated code inside an isolated, disposable environment.
- Detect build, test, and runtime failures and attempt bounded self-repair.
- Provide a live preview, source browser, diff view, logs, and verification report.
- Export the project and deploy it through an explicit user-approved action.
- Remain visually distinctive, responsive, accessible, and polished enough for a live recruiter demo.

### Portfolio goals

- Demonstrate meaningful depth beyond an API wrapper.
- Produce defensible metrics through a reproducible evaluation suite.
- Make the architecture understandable within a 90-second demo.
- Give an interviewer several technical threads to explore: agent state machines, sandboxing, tenancy, streaming, deployment, security, testing, and design tradeoffs.

## 4. Non-goals for the first release

- Supporting every language, package manager, or framework.
- Real-time multi-user code collaboration.
- Building native mobile or desktop applications.
- Importing and autonomously modifying arbitrary production repositories.
- Giving the model unrestricted shell, network, cloud, or database access.
- Autonomous production deployment without explicit user approval.
- Running generated applications as a commercial multi-tenant hosting service.
- Claiming that generated applications are production-secure without review.
- Billing, enterprise administration, or formal compliance certification.

## 5. Target users

### Primary persona: technical builder

A student, founder, designer, or engineer who can describe an application but wants a working, editable starting point quickly. They value visibility into the code and do not want a black-box result.

### Secondary persona: technical evaluator

A recruiter or engineer evaluating the project. They need to understand its value in seconds and find credible engineering depth when they inspect further.

## 6. Core user journey

1. The user signs in and creates a project.
2. The user enters a brief, such as “Build a lightweight inventory tracker for a neighborhood bakery.”
3. Kiln converts the brief into a **Build Contract** containing features, entities, pages, API operations, assumptions, and acceptance tests.
4. Kiln asks no more than three high-value clarification questions when required.
5. The user edits or approves the contract.
6. The planner produces a staged implementation plan and estimated model/run budget.
7. After approval, the agent scaffolds the approved blueprint and applies incremental patches.
8. A sandbox installs pinned dependencies, runs migrations, performs static checks, builds the application, starts it, and runs smoke tests.
9. When verification fails, the agent receives sanitized diagnostics and may perform up to three repair attempts.
10. The user receives a live preview plus a Build Evidence report.
11. The user can inspect code, compare revisions, download the repository, or explicitly approve deployment.

## 7. Product experience and visual direction

### Design concept: “The engineering workbench”

Kiln should feel like a well-made technical instrument, not a generic AI dashboard.

- **Palette:** warm paper, charcoal ink, cobalt actions, and restrained safety colors for build state.
- **Typography:** Instrument Sans for interface text and IBM Plex Mono for code, logs, and identifiers.
- **Surfaces:** solid color planes, fine rules, tight alignment, and intentional density.
- **Avoid:** glassmorphism, glowing orbs, oversized gradients, excessive rounded cards, fake charts, animated typing gimmicks, and unexplained vanity metrics.
- **Motion:** short state transitions tied to real events—plan approval, patch application, test completion, preview readiness. Reduced-motion preferences must be respected.

### Main workspace

- **Top bar:** project identity, current run state, cost/budget indicator, export, and deploy.
- **Left panel:** Build Contract and file tree, switchable by tabs.
- **Center stage:** Preview, Code, Diff, and Architecture views.
- **Right panel:** structured run timeline showing actions, outputs, approvals, and evidence.
- **Bottom drawer:** build logs, tests, security findings, and resource usage.

The initial screen should provide a seeded example and a convincing completed run so evaluators can understand the system even if they do not initiate a costly generation.

### Signature interaction: Build Evidence

Every run ends with a compact evidence panel:

- Requirements satisfied
- Build status
- Automated tests passed/failed
- API and page smoke checks
- Dependency and static-analysis findings
- Repair attempts
- Runtime duration and resource usage
- Known limitations
- Deployment provenance

The interface must distinguish verified facts from model-authored summaries.

## 8. Functional requirements

### FR-1: Authentication and projects

- Support secure sign-in and sign-out.
- Users can create, rename, archive, export, and delete projects.
- Every project, run, file revision, artifact, and deployment is tenant-scoped.
- Destructive actions require confirmation and create an audit event.

### FR-2: Brief and Build Contract

- Accept a natural-language brief with optional visual/style preferences.
- Produce typed, schema-validated output rather than unstructured prose.
- Capture user stories, data entities, pages, API actions, constraints, and acceptance checks.
- Allow manual editing before approval.
- Preserve approved contract revisions.

### FR-3: Planning and approval

- Translate the approved contract into ordered implementation steps.
- Show which steps create files, change data models, execute code, access the network, or deploy.
- Estimate the run's model-call and execution budget.
- Require explicit approval before generation and before any public deployment.

### FR-4: Code generation

- Begin from a maintained full-stack blueprint.
- Generate file patches, not a single opaque repository response.
- Validate every model response against a typed schema.
- Keep a snapshot and diff for every accepted patch.
- Reject path traversal, binary writes, oversized files, and writes outside the workspace.
- Keep generated code formatted and lintable.

### FR-5: Supported application blueprint

The first release supports one opinionated target stack:

- React and TypeScript frontend
- FastAPI and Python backend
- PostgreSQL data layer with migrations
- REST API with generated OpenAPI schema
- Containerized local and hosted execution
- Seed data and health endpoint
- Unit tests plus end-to-end smoke tests

New blueprints must use the same interface and are post-MVP work.

### FR-6: Isolated build and runtime

- Create one disposable sandbox per run.
- Stream sanitized build output to the UI.
- Enforce CPU, memory, process, disk, log-size, and wall-clock limits.
- Use a non-root runtime, read-only base filesystem, isolated writable workspace, and default-deny network policy.
- Terminate idle and expired sandboxes automatically.
- Never expose the host container socket or platform credentials to generated code.

### FR-7: Verification and repair

- Run formatting, type checks, linting, dependency checks, migrations, build, unit tests, API health checks, and browser smoke tests.
- Convert failures into structured diagnostics.
- Permit at most three repair attempts per run.
- Prevent the repair agent from changing the approved contract or weakening tests/security policy without user approval.
- Stop safely and explain remaining failures when the budget or repair limit is reached.

### FR-8: Live workspace

- Preview the running application on an origin isolated from the platform.
- Browse and search files.
- View syntax-highlighted source and revision diffs.
- View sanitized commands, outputs, and test results.
- Show concise action summaries; do not expose or persist private chain-of-thought.
- Support cancellation at every long-running stage.

### FR-9: Export and deployment

- Download a complete repository archive with README, setup instructions, lockfiles, migrations, tests, Dockerfile, and environment-variable example.
- Optionally export to a user-authorized Git repository using minimum OAuth scopes.
- Deploy only after a human confirmation dialog describes the target, visibility, expected cost class, and required secrets.
- Support deployment status, logs, rollback to the prior successful artifact, and teardown.

### FR-10: Auditability and observability

- Assign a stable ID to every project, run, patch, tool action, test, artifact, and deployment.
- Record actor, scope, timestamp, policy decision, sanitized inputs, outcome, latency, and cost.
- Provide traces across model, workflow, sandbox, build, preview, and deployment boundaries.
- Redact tokens, cookies, connection strings, and user-designated secrets before persistence.

## 9. Agent workflow

The workflow is an explicit state machine. The model may propose actions, but application code owns state transitions and permissions.

```text
INTAKE
  → SPECIFY
  → CONTRACT_REVIEW
  → PLAN
  → USER_APPROVAL
  → SCAFFOLD
  → GENERATE_PATCHES
  → STATIC_CHECK
  → BUILD
  → TEST
  → PREVIEW
  → SECURITY_SCAN
  → READY
  → USER_DEPLOY_APPROVAL
  → DEPLOYED

Failure from STATIC_CHECK, BUILD, TEST, or PREVIEW:
  → DIAGNOSE → REPAIR_PATCH → retry, maximum 3 cycles
  → FAILED_WITH_EVIDENCE when exhausted
```

### Agent tool model

- Tools use typed inputs and outputs.
- Read-only and mutating tools are separate.
- File operations are workspace-scoped and path-normalized.
- Command execution occurs only inside the sandbox.
- Network requests pass through a policy-enforcing egress proxy.
- Package installation uses approved registries, lockfiles, size limits, and timeouts.
- High-impact actions—repository export, secret connection, public deployment, and teardown of retained resources—require user approval.
- The same deterministic authorization layer applies regardless of what the model requests.

## 10. Architecture and accepted MVP adaptations

### Control plane

- **Web application:** React, TypeScript, and an App Router-compatible Vinext runtime on Cloudflare Workers
- **UI foundation:** a custom accessible workbench interface with syntax-oriented source, diff, architecture, and evidence views
- **Agent/orchestration API:** FastAPI, Python, Pydantic, and authenticated server-to-server calls
- **Workflow durability:** a relational execution-job queue with atomic leases, retries, cancellation, and immutable events; Temporal remains an optional scale-stage adapter
- **Primary data store:** D1 relational storage through a portable repository boundary
- **Coordination:** persisted rate windows and ordered database events; no Redis dependency is required for the current single-region demo
- **Artifact store:** R2-compatible private object storage for source snapshots, execution payloads, verification reports, and repository exports
- **Streaming:** server-sent events with ordered event IDs, replay, heartbeat, and reconnect support
- **Model gateway:** deterministic offline planner plus an optional OpenAI structured-output adapter, both behind the same strict schemas

### Execution plane

- Separate executor service with no trust relationship to generated code.
- Rootless, capability-dropped, network-denied Docker policy for local infrastructure testing.
- Vercel Sandbox provider for disposable Firecracker microVM execution when hosted credentials are configured.
- Per-run identity, immutable input payload, resource quota, command allowlist, output bounds, automatic teardown, and expiring lease.
- Preview URLs are returned by the isolated provider and must remain on an origin separate from Kiln.

### Deployment plane

- The UI and domain model implement a revision-bound human approval contract covering destination, visibility, cost class, and required application secrets.
- A production deployment adapter must use short-lived server-side identity and accept only the exact verified artifact.
- Deployment credentials remain in the control-plane secret manager and never enter generated source, model context, the browser, or the sandbox.
- The current workspace intentionally has no cloud deployment credentials or external deployment adapter; it never fabricates a public deployment.

### Core data model

- `User`
- `Project`
- `BuildContract` and `BuildContractRevision`
- `Run` and `RunStep`
- `FileSnapshot` and `Patch`
- `SandboxSession`
- `TestRun` and `Finding`
- `Artifact`
- `Deployment`
- `AuditEvent`
- `UsageLedger`

## 11. Security requirements

Security requirements apply to the platform, generated applications, build pipeline, and development process. Security decisions must be documented in architecture decision records and tested as acceptance criteria.

### 11.1 Non-negotiable isolation rules

- Never execute generated code on the API host.
- Never mount the Docker daemon socket into a sandbox.
- Never run generated code as root or in a privileged container.
- Never share a writable filesystem between tenants or concurrent runs.
- Never place platform secrets, user tokens, or authorization rules in model prompts.
- Never use an LLM response as an authorization decision.
- Never give generated previews the same origin or cookies as the control plane.
- Never allow unrestricted outbound network access.
- Never allow an expired sandbox to remain addressable.

### 11.2 Sandbox controls

- Non-root UID/GID and dropped Linux capabilities.
- Read-only root filesystem with a quota-limited workspace and temporary directory.
- Seccomp plus AppArmor/SELinux where available.
- gVisor or microVM boundary in the hosted environment.
- CPU, memory, PID, file count, storage, bandwidth, output, and execution-time quotas.
- Default-deny egress; approved package registries through a logging proxy.
- Block access to private, link-local, metadata-service, and control-plane network ranges.
- Unique short-lived sandbox credentials and automatic revocation.
- Malware, fork-bomb, crypto-mining, port-scanning, and persistence-abuse tests.

### 11.3 Preview isolation

- Host each preview on a separate origin that does not inherit platform authentication cookies.
- Render previews in a sandboxed iframe with the minimum required capabilities.
- Apply a restrictive Content Security Policy and permissions policy.
- Prevent previews from navigating or framing the control plane.
- Treat all preview logs and application output as untrusted content and escape it before display.

### 11.4 Agent and prompt-injection controls

- Treat user prompts, generated files, dependency output, web content, and imported text as untrusted data.
- Grant the agent only the tools required for its current workflow state.
- Use granular tools instead of an unrestricted host shell.
- Enforce permissions, arguments, paths, quotas, and approval gates outside the model.
- Do not expose secrets to the model when a scoped server-side operation can perform the task.
- Tag content provenance and prevent untrusted content from silently becoming system instructions.
- Limit repair cycles, model tokens, tool calls, runtime, and spend per run.
- Log policy decisions and tool activity without storing hidden reasoning.

### 11.5 Application and tenancy security

- Server-side authorization on every tenant-owned resource.
- Random, non-sequential public identifiers.
- Database constraints and row-level security where practical.
- Secure, HTTP-only, same-site cookies; CSRF protection where applicable.
- Strict input schemas, output encoding, rate limiting, request-size limits, and idempotency keys.
- Encryption in transit and at rest through managed infrastructure.
- Cascade deletion and verifiable artifact cleanup when a user deletes a project.
- Automated tests for IDOR, privilege escalation, cross-project access, and websocket/SSE authorization.

### 11.6 Secrets and data handling

- Store secrets only in an external secret manager, never in source control or client bundles.
- Use separate development, test, preview, and production credentials.
- Prefer short-lived workload identity over static cloud keys.
- Redact secrets from prompts, tool output, telemetry, exception reports, and build logs.
- Scan commits and artifacts for secrets before push or deployment.
- Define retention limits for prompts, generated code, logs, and deleted artifacts.
- Make provider data-sharing and retention settings explicit in configuration.

### 11.7 Software supply-chain security

- Pin direct dependencies and commit lockfiles.
- Allow packages only from approved registries.
- Scan dependencies for known vulnerabilities and licenses.
- Generate an SBOM for platform releases and generated application artifacts.
- Scan source, containers, infrastructure configuration, and secrets in CI.
- Build releases from protected CI using short-lived identity.
- Preserve artifact hashes and provenance from verified source to deployment.
- Block deployment on critical findings; document and time-bound any accepted exception.

### 11.8 Secure development lifecycle

- Maintain a lightweight STRIDE threat model and abuse-case suite from Phase 0.
- Require code review for authentication, authorization, sandbox, secret, and deployment changes.
- Use branch protection, required checks, CODEOWNERS for sensitive paths, and dependency update automation.
- Run formatting, linting, type checks, unit tests, integration tests, SAST, dependency audit, secret scan, and container scan in CI.
- Keep production debug endpoints disabled.
- Document incident response, credential rotation, vulnerability reporting, backup restoration, and rollback procedures.
- Follow the outcomes in the NIST Secure Software Development Framework rather than treating security as a one-time test.

### 11.9 Concrete CI and release gates

- **Code quality:** TypeScript strict mode, ESLint, Ruff, and mypy/pyright must pass with no ignored errors in security-sensitive paths.
- **Testing:** Vitest, pytest, and Playwright cover unit, API integration, authorization, sandbox lifecycle, and the critical end-to-end journey.
- **Static analysis:** CodeQL and focused Semgrep rules scan first-party code; new high-severity findings block merging.
- **Dependencies:** Dependabot or Renovate keeps lockfiles current; OSV-Scanner blocks known critical vulnerabilities unless a documented exception exists.
- **Secrets:** Gitleaks runs locally through pre-commit and again in CI across the full commit range.
- **Containers and infrastructure:** Trivy scans images and infrastructure configuration; containers run as a fixed non-root UID and are tested for excessive capabilities.
- **Artifacts:** Syft produces an SBOM, artifact hashes are retained, and public release artifacts are signed with keyless CI identity where supported.
- **Dynamic checks:** OWASP ZAP baseline scans the deployed control plane; custom abuse tests exercise IDOR, prompt injection, egress policy, preview isolation, and quota exhaustion.
- **Coverage policy:** changed security-critical modules require meaningful tests and cannot reduce their established coverage threshold.
- **Release rule:** no public deployment with a failing required check, unresolved critical finding, missing provenance, or untested database migration.

## 12. Quality and evaluation strategy

Claims on the final resume must come from repeatable tests, not invented percentages.

### Golden evaluation set

Maintain at least 30 versioned prompts across:

- CRUD dashboards
- Booking and scheduling flows
- Inventory and order management
- Authenticated personal tools
- Data visualization applications
- Small workflow/automation applications

Each prompt includes deterministic acceptance checks for routes, forms, API behavior, persistence, validation, and responsive layout.

### Target metrics

- At least 70% of golden prompts reach a runnable preview without repair.
- At least 90% reach a runnable preview within three repair cycles.
- Median prompt-to-preview time under 120 seconds for the standard blueprint.
- 100% of runs terminate or expire within the configured sandbox lifetime.
- Zero cross-project authorization failures in the tenancy test suite.
- Zero critical source, dependency, secret, or container findings in a releasable build.
- Landing page and primary workspace meet WCAG 2.2 AA and score at least 90 in automated accessibility checks.
- A failed build always ends with actionable evidence rather than a false success state.

These are launch targets. They become portfolio claims only after the evaluation harness produces the corresponding results.

## 13. Phased delivery plan

### Phase 0 — Product contract and security foundation

**Purpose:** Remove ambiguity before implementation.

**Deliverables**

- Approved PRD, architecture diagram, data-flow diagram, and initial ADRs.
- STRIDE threat model and prioritized abuse cases.
- Monorepo structure, local environment, CI baseline, dependency policy, and secret scanning.
- Full-stack generated-app blueprint with a known-good example.
- Evaluation prompt format and initial five golden prompts.

**Exit gate**

- Trust boundaries are documented.
- No generated code can execute on the control-plane host by design.
- CI blocks formatting, type, test, secret, and critical dependency failures.

### Phase 1 — Visual system and interactive product shell

**Purpose:** Establish a distinctive interface before complex backend work.

**Deliverables**

- Design tokens, typography, states, iconography, and responsive layout.
- Landing page, new-project flow, workspace shell, and seeded completed-run demo.
- Build Contract, timeline, preview, code, diff, and evidence mock states.
- Loading, empty, partial-failure, cancelled, and expired states.

**Exit gate**

- The product story is understandable within 30 seconds without narration.
- Primary flows work by keyboard and pass baseline accessibility checks.
- No placeholder dashboard cards or fake metrics remain.

### Phase 2 — Identity, tenancy, persistence, and run events

**Purpose:** Build the secure control-plane spine.

**Deliverables**

- Authentication, project CRUD, run records, revisions, audit events, and deletion.
- Tenant-scoped service layer and authorization test matrix.
- PostgreSQL migrations, object storage, Redis, and event streaming.
- Rate limits, idempotency, request limits, log redaction, and structured errors.

**Exit gate**

- Cross-user and cross-project access tests pass.
- Run state survives process restart.
- Secrets and session data do not appear in client payloads or logs.

### Phase 3 — Build Contract and planning agent

**Purpose:** Turn an ambiguous prompt into an approved, testable specification.

**Deliverables**

- Provider-agnostic model gateway.
- Schema-validated brief analysis and clarification flow.
- Editable Build Contract and version history.
- Deterministic workflow state machine, budget limits, cancellation, and approval gate.
- Planner evaluation cases covering malformed output, injection attempts, and unsupported scope.

**Exit gate**

- All model output is parsed through typed schemas.
- Unsupported requests fail clearly or are reduced to supported scope.
- Generation cannot begin without an approved contract.

### Phase 4 — Patch-based generation engine

**Purpose:** Create understandable code with durable history.

**Deliverables**

- Blueprint scaffolding and bounded file tools.
- Structured patch generation, validation, snapshotting, formatting, and diff UI.
- Dependency policy and lockfile handling.
- Architecture metadata derived from routes, entities, and services.

**Exit gate**

- Path traversal, oversized output, binary writes, and workspace escape attempts are rejected.
- Every accepted change has an actor, rationale summary, diff, and rollback snapshot.
- Generated repositories pass formatting and static parsing before execution.

### Phase 5 — Hardened sandbox and live preview

**Purpose:** Safely execute generated applications.

**Deliverables**

- Separate sandbox service and provider interface.
- Rootless local runner and hosted gVisor/microVM runner.
- Resource quotas, TTL enforcement, egress controls, log streaming, health checks, and cleanup.
- Isolated preview proxy and sandboxed preview frame.
- Security tests for network access, metadata endpoints, process abuse, output flooding, and stale sandboxes.

**Exit gate**

- Generated code has no route to platform secrets, private networks, other projects, or the host container runtime.
- Sandboxes terminate reliably on completion, cancellation, timeout, and worker failure.
- Preview content cannot access control-plane cookies or DOM.

### Phase 6 — Verification and bounded self-repair

**Purpose:** Make successful output measurable and failure honest.

**Deliverables**

- Lint, type, migration, build, unit, API, browser, dependency, and security checks.
- Structured diagnostic collector and repair loop.
- Maximum-attempt, token, cost, wall-clock, and tool-call budgets.
- Build Evidence UI and known-limitations reporting.
- Expanded 30-prompt evaluation harness and benchmark report.

**Exit gate**

- Repair cannot silently remove tests, weaken security settings, or change approved requirements.
- The system reaches the launch reliability target or reports the measured shortfall transparently.
- No UI state labels a run successful without supporting checks.

### Phase 7 — Export, deployment, and rollback

**Purpose:** Complete the idea-to-public-URL story without excessive agency.

**Deliverables**

- Repository archive export and generated README.
- Minimum-scope Git authorization where enabled.
- Immutable build artifact, deployment adapter, progress events, public/private visibility control, and teardown.
- Human approval dialog, short-lived deployment identity, deployment audit trail, and rollback.

**Exit gate**

- Deployment cannot start from unverified source or without explicit approval.
- Cloud credentials never enter the sandbox, generated repository, model context, or browser.
- A prior successful artifact can be restored or the deployment safely removed.

### Phase 8 — Recruiter polish and launch hardening

**Purpose:** Turn a strong implementation into an exceptional portfolio artifact.

**Deliverables**

- Stable seeded demo and graceful degraded mode for provider outages.
- 90-second walkthrough, architecture diagram, benchmark methodology, security write-up, and engineering case study.
- Performance profiling, accessibility audit, cross-browser checks, backup/restore drill, and abuse testing.
- Public README with local setup, system tradeoffs, threat model summary, and reproducible evaluation command.

**Exit gate**

- A fresh evaluator can understand, run, and verify the project.
- The live demo recovers cleanly from model, worker, sandbox, and deployment failures.
- Resume bullets use only measured outcomes produced by the evaluation suite.

## 14. MVP, version 1, and stretch scope

### MVP

- Seeded demo plus real brief-to-contract flow
- One generated application blueprint
- Planning approval
- Patch-based generation
- Isolated build and preview
- Build/type/test evidence
- Up to three repair cycles
- Repository download

### Version 1

- Full authentication and project history
- Hosted hardened sandboxes
- Dependency/security evidence
- One-click deployment and rollback
- 30-prompt evaluation dashboard
- Architecture view and complete audit trail

### Stretch

- Existing-repository import with protected-file policy
- Additional blueprints
- Checkpointed user edits during a run
- Screenshot-to-component input
- Database schema editor
- Collaborative review comments
- Model comparison and routing based on evaluated task performance

## 15. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Scope expands into a full Replit clone | Enforce one blueprint and one excellent journey through V1. |
| Generated code is unreliable | Use a maintained scaffold, typed patches, deterministic checks, bounded repair, and a golden evaluation set. |
| Untrusted code compromises infrastructure | Separate execution plane, strong sandbox boundary, least privilege, network denial, quotas, TTLs, and adversarial tests. |
| Model or sandbox cost grows without limit | Per-run budgets, cancellation, caching, quotas, usage ledger, and seeded demo mode. |
| The interface looks like a template | Commit to the workbench visual system, real artifacts, restrained motion, and no decorative AI clichés. |
| A live demo fails | Keep a deterministic completed run, surface degradation honestly, and allow local replay of stored events. |
| Security controls create false confidence | Document assumptions, test controls, publish known limitations, and avoid “production-secure” claims. |
| Metrics become résumé fiction | Version the evaluation suite and generate claims only from recorded results. |

## 16. Definition of done

Kiln is complete when a new user can submit a supported brief, approve a Build Contract, watch a structured run, receive an isolated working preview, inspect every generated change, review test/security evidence, export the repository, and intentionally deploy or tear it down. The system must fail safely, preserve an audit trail, keep tenants and secrets isolated, and reproduce its published performance metrics through an automated evaluation suite.

## 17. Reference standards and product context

- Replit's current product direction validates the value of prompt-to-app generation, integrated services, self-testing, and deployment: [Replit Agent](https://replit.com/products/agent) and [Replit for software engineers](https://replit.com/usecases/software-engineers).
- Agent permissions and approval boundaries follow OWASP's guidance on [excessive agency](https://genai.owasp.org/llmrisk/llm062025-excessive-agency/) and [system-prompt leakage](https://genai.owasp.org/llmrisk/llm072025-system-prompt-leakage/).
- Secure development requirements are organized around [NIST SP 800-218, Secure Software Development Framework](https://csrc.nist.gov/pubs/sp/800/218/final).
- Local sandbox hardening begins with [Docker rootless mode](https://docs.docker.com/engine/security/rootless/); hosted execution should add a stronger isolation boundary such as [gVisor](https://gvisor.dev/).

## 18. Implementation decision

This PRD is the approved implementation contract. The one-blueprint scope, deterministic authorization layer, execution-plane separation, evidence-owned release gate, bounded repair budget, and explicit deployment approval are binding constraints. Launch targets remain targets until the versioned benchmark produces measured results.

## 19. Implementation status — August 16, 2026

| Phase | Status | Evidence and remaining work |
|---|---|---|
| Phase 0 — Product and security foundation | Complete | Architecture/data-flow documents, four ADRs, STRIDE model, abuse catalog, CI, dependency policy, generated-app blueprint, and five golden fixtures are present. |
| Phase 1 — Visual system and shell | Core complete | The responsive workbench, seeded demo, contract, timeline, preview, code, diff, architecture, evidence, loading, queued, failed, repaired, and cancelled states are implemented. A separate marketing landing page is intentionally deferred. |
| Phase 2 — Identity and durable control plane | Complete for current host | App-provided identity, tenant-scoped D1 repositories, R2-compatible artifacts, audit events, atomic mutations, rate windows, SSE replay/heartbeat, and cancellation are implemented. |
| Phase 3 — Contract and planning | Complete | Typed brief-to-contract and plan schemas, deterministic fallback, optional structured model adapter, immutable approvals, budget, and explicit state policy are implemented. |
| Phase 4 — Patch generation | Complete for the maintained blueprint | Generation is limited to four contract-backed extension paths with SHA preconditions, protected paths, typed proposals, snapshots, diffs, and audit history. |
| Phase 5 — Isolated execution | Provider complete; hosted credentials pending | The executor protocol, deterministic command allowlist, rootless Docker policy, Vercel Firecracker provider, quotas, redaction, teardown, and lease model exist. This workspace cannot claim a hosted run without Vercel credentials. |
| Phase 6 — Verification and repair | Core complete; benchmark expansion pending | Ten trusted checks, evidence persistence, sanitized diagnostics, hard three-attempt repair, failure terminal state, and a reproducible full generated-workspace evaluation are implemented. The golden set contains five fixtures, not the target 30. |
| Phase 7 — Export and deployment | Export complete; deployment pending | The full repository ZIP, README, lockfiles, migrations, tests, containers, immutable contract, evaluator-safe contract, and SHA provenance are implemented. External Git export, cloud deployment, rollback, and teardown need provider configuration and adapters. |
| Phase 8 — Recruiter polish | In progress | Desktop/mobile visual verification, a 90-second demo path, security write-up, setup guide, and handoff are complete. Public hosting, cross-browser matrix, automated WCAG score, and the 30-prompt benchmark remain launch work. |

### Verified implementation facts

- Platform lint, strict TypeScript, production build, render checks, and 19 Node policy/control-plane tests pass.
- Ruff, Ruff formatting, strict mypy, and 14 orchestrator tests pass.
- npm and locked Python dependency audits report no known vulnerabilities at the time of this implementation pass.
- A fresh exported generated application passes frontend/backend types, Ruff, mypy, migrations, Vitest, pytest, contract acceptance, source policy, production build, and preview smoke checks.
- A controlled no-code failure fixture proved that Kiln records hashed evidence, blocks release, exposes repair, limits the attempt budget, patches only the four allowed files, and queues a fresh verification job.

These facts describe this tested revision only. They are not reliability percentages and should not be converted into broader résumé claims without the planned benchmark.
