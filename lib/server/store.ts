import type {
  AcceptanceCheck,
  Requirement,
  SystemShape,
} from "../../packages/contracts/src/contract.ts";
import {
  isImplementationPlan,
  type ImplementationPlan,
} from "../../packages/contracts/src/plan.ts";
import type { PatchDraft } from "../../packages/contracts/src/patch.ts";
import { canTransition, isRunState } from "../../packages/contracts/src/run.ts";
import { buildImplementationPlan } from "../domain/plan.ts";
import { ApiError, conflict, notFound } from "./api-error.ts";
import { createId } from "./id.ts";
import type {
  ContractDraftInput,
  CreateProjectInput,
  CreateRunInput,
  UpdateProjectInput,
} from "./input.ts";

type ProjectRow = {
  id: string;
  ownerId: string;
  name: string;
  slug: string;
  summary: string;
  status: string;
  archived: number;
  createdAt: string;
  updatedAt: string;
};

type ContractRow = {
  id: string;
  projectId: string;
  revision: number;
  title: string;
  summary: string;
  requirementsJson: string;
  systemShapeJson: string;
  acceptanceChecksJson: string;
  assumptionsJson: string;
  status: string;
  approvedBy: string | null;
  approvedAt: string | null;
  createdAt: string;
};

type RunRow = {
  id: string;
  projectId: string;
  contractId: string;
  status: string;
  currentStep: string;
  progress: number;
  attempt: number;
  maxAttempts: number;
  budgetCents: number;
  costCents: number;
  cancellationRequested: number;
  errorCode: string | null;
  errorSummary: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

type RunStepRow = {
  id: string;
  runId: string;
  sequence: number;
  kind: string;
  state: string;
  label: string;
  detail: string;
  evidenceJson: string;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
};

type PlanRow = {
  id: string;
  runId: string;
  revision: number;
  planJson: string;
  estimatedModelCents: number;
  estimatedExecutionSeconds: number;
  status: string;
  approvedBy: string | null;
  approvedAt: string | null;
  createdAt: string;
};

type FindingRow = {
  id: string;
  runId: string;
  source: string;
  category: string;
  severity: string;
  title: string;
  detail: string;
  status: string;
  fingerprint: string;
  createdAt: string;
};

type PatchRow = {
  id: string;
  runId: string;
  sequence: number;
  summary: string;
  patchHash: string;
  filesChanged: number;
  additions: number;
  deletions: number;
  artifactKey: string;
  createdAt: string;
};

type FileSnapshotRow = {
  id: string;
  runId: string;
  patchId: string | null;
  revision: number;
  path: string;
  objectKey: string;
  sha256: string;
  sizeBytes: number;
  language: string;
  deleted: number;
  createdAt: string;
};

type ArtifactRow = {
  id: string;
  ownerId: string;
  projectId: string;
  runId: string | null;
  kind: string;
  objectKey: string;
  contentType: string;
  sha256: string;
  sizeBytes: number;
  createdAt: string;
  expiresAt: string | null;
};

type TestRunRow = {
  id: string;
  runId: string;
  kind: string;
  status: string;
  commandLabel: string;
  passed: number;
  failed: number;
  durationMs: number;
  reportArtifactId: string | null;
  createdAt: string;
};

type RunEventRow = {
  id: string;
  runId: string;
  sequence: number;
  type: string;
  dataJson: string;
  createdAt: string;
};

type ExecutionJobRow = {
  id: string;
  ownerId: string;
  projectId: string;
  runId: string;
  kind: string;
  status: string;
  attempt: number;
  maxAttempts: number;
  payloadArtifactKey: string;
  resultArtifactKey: string | null;
  leaseTokenHash: string | null;
  leaseExpiresAt: string | null;
  errorCode: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

type AuditRow = {
  id: string;
  ownerId: string;
  projectId: string | null;
  actorType: string;
  action: string;
  subjectType: string;
  subjectId: string;
  policyDecision: string;
  metadataJson: string;
  createdAt: string;
};

export type ProjectRecord = Omit<ProjectRow, "archived"> & { archived: boolean };
export type ContractRecord = Omit<
  ContractRow,
  | "requirementsJson"
  | "systemShapeJson"
  | "acceptanceChecksJson"
  | "assumptionsJson"
> & {
  requirements: Requirement[];
  systemShape: SystemShape;
  acceptanceChecks: AcceptanceCheck[];
  assumptions: string[];
};
export type RunRecord = Omit<RunRow, "cancellationRequested"> & {
  cancellationRequested: boolean;
};
export type RunEventRecord = Omit<RunEventRow, "dataJson"> & {
  data: Record<string, unknown>;
};
export type PlanRecord = ImplementationPlan & {
  approvedBy: string | null;
  approvedAt: string | null;
  createdAt: string;
};
export type PatchRecord = PatchRow;
export type FileSnapshotRecord = Omit<FileSnapshotRow, "deleted"> & {
  deleted: boolean;
};
export type ExecutionJobRecord = Omit<ExecutionJobRow, "leaseTokenHash">;

export type ContractProvenance = {
  planner: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export type StoredArtifactInput = {
  objectKey: string;
  contentType: string;
  sha256: string;
  sizeBytes: number;
};

export type PatchProvenance = ContractProvenance & {
  providerRequestId: string | null;
};

export type VerificationCheckInput = {
  checkId: string;
  status: "passed" | "failed" | "timed_out";
  exitCode: number | null;
  durationMs: number;
  stdout: string;
  stderr: string;
  outputTruncated: boolean;
};

export type VerificationReportInput = {
  provider: string;
  sandboxId: string;
  status: "passed" | "failed";
  checks: VerificationCheckInput[];
  startedAt: string;
  completedAt: string;
};

const projectColumns = `
  id, owner_id AS ownerId, name, slug, summary, status, archived,
  created_at AS createdAt, updated_at AS updatedAt
`;
const contractColumns = `
  id, project_id AS projectId, revision, title, summary,
  requirements_json AS requirementsJson,
  system_shape_json AS systemShapeJson,
  acceptance_checks_json AS acceptanceChecksJson,
  assumptions_json AS assumptionsJson,
  status, approved_by AS approvedBy, approved_at AS approvedAt,
  created_at AS createdAt
`;
const runColumns = `
  id, project_id AS projectId, contract_id AS contractId, status,
  current_step AS currentStep, progress, attempt, max_attempts AS maxAttempts,
  budget_cents AS budgetCents, cost_cents AS costCents,
  cancellation_requested AS cancellationRequested,
  error_code AS errorCode, error_summary AS errorSummary,
  created_at AS createdAt, updated_at AS updatedAt,
  completed_at AS completedAt
`;
const ownedContractColumns = `
  c.id, c.project_id AS projectId, c.revision, c.title, c.summary,
  c.requirements_json AS requirementsJson,
  c.system_shape_json AS systemShapeJson,
  c.acceptance_checks_json AS acceptanceChecksJson,
  c.assumptions_json AS assumptionsJson,
  c.status, c.approved_by AS approvedBy, c.approved_at AS approvedAt,
  c.created_at AS createdAt
`;
const ownedRunColumns = `
  r.id, r.project_id AS projectId, r.contract_id AS contractId, r.status,
  r.current_step AS currentStep, r.progress, r.attempt,
  r.max_attempts AS maxAttempts, r.budget_cents AS budgetCents,
  r.cost_cents AS costCents,
  r.cancellation_requested AS cancellationRequested,
  r.error_code AS errorCode, r.error_summary AS errorSummary,
  r.created_at AS createdAt, r.updated_at AS updatedAt,
  r.completed_at AS completedAt
`;

export class KilnStore {
  private readonly db: D1Database;

  constructor(db: D1Database) {
    this.db = db;
  }

  async consumeRateLimit(
    ownerId: string,
    bucket: string,
    limit: number,
  ): Promise<void> {
    const now = new Date();
    now.setUTCSeconds(0, 0);
    const row = await this.db
      .prepare(
        `INSERT INTO api_rate_windows
          (id, owner_id, bucket, window_start, request_count)
         VALUES (?, ?, ?, ?, 1)
         ON CONFLICT(owner_id, bucket, window_start)
         DO UPDATE SET request_count = request_count + 1
         RETURNING request_count AS requestCount`,
      )
      .bind(createId("rate"), ownerId, bucket, now.toISOString())
      .first<{ requestCount: number }>();

    if (!row) {
      throw new ApiError(503, "rate_limit_unavailable", "Request cannot be admitted");
    }
    if (row.requestCount > limit) {
      throw new ApiError(429, "rate_limit_exceeded", "Too many requests; try again shortly");
    }
  }

  async listProjects(ownerId: string): Promise<ProjectRecord[]> {
    const result = await this.db
      .prepare(
        `SELECT ${projectColumns} FROM projects
         WHERE owner_id = ? ORDER BY archived ASC, updated_at DESC LIMIT 50`,
      )
      .bind(ownerId)
      .all<ProjectRow>();
    return result.results.map(toProject);
  }

  async getProject(ownerId: string, projectId: string): Promise<ProjectRecord> {
    const row = await this.db
      .prepare(
        `SELECT ${projectColumns} FROM projects WHERE id = ? AND owner_id = ?`,
      )
      .bind(projectId, ownerId)
      .first<ProjectRow>();
    if (!row) notFound("Project");
    return toProject(row);
  }

  async createProject(
    ownerId: string,
    input: CreateProjectInput,
  ): Promise<ProjectRecord> {
    const id = createId("prj");
    const slug = `${slugify(input.name)}-${id.slice(-6)}`;
    const statements = [
      this.db
        .prepare(
          `INSERT INTO projects (id, owner_id, name, slug, summary)
           VALUES (?, ?, ?, ?, ?)
           RETURNING ${projectColumns}`,
        )
        .bind(id, ownerId, input.name, slug, input.summary),
      auditStatement(this.db, {
        ownerId,
        projectId: id,
        action: "project.created",
        subjectType: "project",
        subjectId: id,
        metadata: { slug },
      }),
    ];
    const results = await this.db.batch(statements);
    const row = firstBatchRow<ProjectRow>(results[0]);
    if (!row) throw new ApiError(500, "write_failed", "Project could not be created", false);
    return toProject(row);
  }

  async updateProject(
    ownerId: string,
    projectId: string,
    input: UpdateProjectInput,
  ): Promise<ProjectRecord> {
    const existing = await this.getProject(ownerId, projectId);
    const name = input.name ?? existing.name;
    const summary = input.summary ?? existing.summary;
    const statements = [
      this.db
        .prepare(
          `UPDATE projects SET name = ?, summary = ?, updated_at = CURRENT_TIMESTAMP
           WHERE id = ? AND owner_id = ? RETURNING ${projectColumns}`,
        )
        .bind(name, summary, projectId, ownerId),
      auditStatement(this.db, {
        ownerId,
        projectId,
        action: "project.updated",
        subjectType: "project",
        subjectId: projectId,
        metadata: { fields: Object.keys(input) },
      }),
    ];
    const results = await this.db.batch(statements);
    const row = firstBatchRow<ProjectRow>(results[0]);
    if (!row) notFound("Project");
    return toProject(row);
  }

  async archiveProject(
    ownerId: string,
    projectId: string,
    archived: boolean,
  ): Promise<ProjectRecord> {
    const statements = [
      this.db
        .prepare(
          `UPDATE projects SET archived = ?, updated_at = CURRENT_TIMESTAMP
           WHERE id = ? AND owner_id = ? RETURNING ${projectColumns}`,
        )
        .bind(archived ? 1 : 0, projectId, ownerId),
      auditStatement(this.db, {
        ownerId,
        projectId,
        action: archived ? "project.archived" : "project.restored",
        subjectType: "project",
        subjectId: projectId,
        metadata: {},
      }),
    ];
    const results = await this.db.batch(statements);
    const row = firstBatchRow<ProjectRow>(results[0]);
    if (!row) notFound("Project");
    return toProject(row);
  }

  async deleteProject(ownerId: string, projectId: string): Promise<void> {
    const project = await this.getProject(ownerId, projectId);
    const statements = [
      auditStatement(this.db, {
        ownerId,
        projectId,
        action: "project.deleted",
        subjectType: "project",
        subjectId: projectId,
        metadata: { name: project.name, slug: project.slug },
      }),
      this.db
        .prepare("DELETE FROM projects WHERE id = ? AND owner_id = ? RETURNING id")
        .bind(projectId, ownerId),
    ];
    const results = await this.db.batch(statements);
    if (!firstBatchRow<{ id: string }>(results[1])) notFound("Project");
  }

  async listContracts(ownerId: string, projectId: string): Promise<ContractRecord[]> {
    await this.getProject(ownerId, projectId);
    const result = await this.db
      .prepare(
        `SELECT ${contractColumns} FROM build_contracts
         WHERE project_id = ? ORDER BY revision DESC LIMIT 50`,
      )
      .bind(projectId)
      .all<ContractRow>();
    return result.results.map(toContract);
  }

  async createContract(
    ownerId: string,
    projectId: string,
    input: ContractDraftInput,
    provenance?: ContractProvenance,
  ): Promise<ContractRecord> {
    const id = createId("ctr");
    const insert = this.db
      .prepare(
        `INSERT INTO build_contracts (
          id, project_id, revision, title, summary, requirements_json,
          system_shape_json, acceptance_checks_json, assumptions_json, status
        )
        SELECT ?, p.id,
          COALESCE((SELECT MAX(revision) FROM build_contracts WHERE project_id = p.id), 0) + 1,
          ?, ?, ?, ?, ?, ?, 'draft'
        FROM projects p WHERE p.id = ? AND p.owner_id = ? AND p.archived = 0
        RETURNING ${contractColumns}`,
      )
      .bind(
        id,
        input.title,
        input.summary,
        JSON.stringify(input.requirements),
        JSON.stringify(input.systemShape),
        JSON.stringify(input.acceptanceChecks),
        JSON.stringify(input.assumptions),
        projectId,
        ownerId,
      );
    const statements: D1PreparedStatement[] = [
      insert,
      auditStatement(this.db, {
        ownerId,
        projectId,
        action: "contract.drafted",
        subjectType: "build_contract",
        subjectId: id,
        metadata: {
          requirements: input.requirements.length,
          acceptanceChecks: input.acceptanceChecks.length,
          ...(provenance
            ? {
                planner: provenance.planner,
                model: provenance.model,
                totalTokens: provenance.totalTokens,
              }
            : {}),
        },
        requireOwnedProject: true,
      }),
    ];
    if (provenance) {
      statements.push(
        this.db
          .prepare(
            `INSERT INTO usage_ledger (
              id, owner_id, project_id, category, units, unit_kind,
              cost_micros, provider
            )
            SELECT ?, ?, p.id, 'model.contract_draft', ?, 'tokens', 0, ?
            FROM projects p WHERE p.id = ? AND p.owner_id = ?`,
          )
          .bind(
            createId("usage"),
            ownerId,
            provenance.totalTokens,
            provenance.model,
            projectId,
            ownerId,
          ),
      );
    }
    const results = await this.db.batch(statements);
    const row = firstBatchRow<ContractRow>(results[0]);
    if (!row) notFound("Project");
    return toContract(row);
  }

  async approveContract(
    ownerId: string,
    projectId: string,
    contractId: string,
  ): Promise<ContractRecord> {
    const existing = await this.getContract(ownerId, projectId, contractId);
    if (existing.status === "superseded") {
      conflict("A superseded contract cannot be approved", "contract_superseded");
    }

    const results = await this.db.batch([
      this.db
        .prepare(
          `UPDATE build_contracts SET status = 'superseded'
           WHERE project_id = ? AND id <> ? AND status = 'approved'`,
        )
        .bind(projectId, contractId),
      this.db
        .prepare(
          `UPDATE build_contracts
           SET status = 'approved', approved_by = ?,
               approved_at = COALESCE(approved_at, CURRENT_TIMESTAMP)
           WHERE id = ? AND project_id = ?
             AND EXISTS (SELECT 1 FROM projects WHERE id = ? AND owner_id = ?)
           RETURNING ${contractColumns}`,
        )
        .bind(ownerId, contractId, projectId, projectId, ownerId),
      auditStatement(this.db, {
        ownerId,
        projectId,
        action: "contract.approved",
        subjectType: "build_contract",
        subjectId: contractId,
        metadata: { revision: existing.revision },
        requireOwnedProject: true,
      }),
    ]);
    const row = firstBatchRow<ContractRow>(results[1]);
    if (!row) notFound("Build contract");
    return toContract(row);
  }

  async listRuns(ownerId: string, projectId: string): Promise<RunRecord[]> {
    await this.getProject(ownerId, projectId);
    const result = await this.db
      .prepare(
        `SELECT ${runColumns} FROM runs
         WHERE project_id = ? ORDER BY created_at DESC LIMIT 50`,
      )
      .bind(projectId)
      .all<RunRow>();
    return result.results.map(toRun);
  }

  async createRun(
    ownerId: string,
    projectId: string,
    input: CreateRunInput,
  ): Promise<RunRecord> {
    const contract = await this.getContract(ownerId, projectId, input.contractId);
    if (contract.status !== "approved") {
      conflict("The selected build contract is not approved", "contract_not_approved");
    }
    const runId = createId("run");
    const planId = createId("plan");
    const plan = buildImplementationPlan({
      planId,
      runId,
      contract,
      budgetCents: input.budgetCents,
    });
    const insertRun = this.db
      .prepare(
        `INSERT INTO runs (
          id, project_id, contract_id, status, current_step, progress,
          budget_cents
        )
        SELECT ?, p.id, c.id, 'plan', 'plan', 20, ?
        FROM build_contracts c
        JOIN projects p ON p.id = c.project_id
        WHERE c.id = ? AND c.project_id = ? AND c.status = 'approved'
          AND p.owner_id = ? AND p.archived = 0
        RETURNING ${runColumns}`,
      )
      .bind(runId, input.budgetCents, input.contractId, projectId, ownerId);

    const stepDefinitions = [
      [1, "contract", "done", "Contract approved", "Approved build contract is immutable"],
      [2, "plan", "active", "Review implementation plan", "Awaiting explicit generation approval"],
      [3, "scaffold", "waiting", "Scaffold application", "Supported blueprint only"],
      [4, "verification", "waiting", "Run verification", "Deterministic checks and bounded repair"],
      [5, "security", "waiting", "Security review", "Policy and dependency evidence"],
    ] as const;

    const stepStatements = stepDefinitions.map(([sequence, kind, state, label, detail]) =>
      this.db
        .prepare(
          `INSERT INTO run_steps (id, run_id, sequence, kind, state, label, detail)
           SELECT ?, ?, ?, ?, ?, ?, ?
           WHERE EXISTS (
             SELECT 1 FROM runs r JOIN projects p ON p.id = r.project_id
             WHERE r.id = ? AND p.owner_id = ?
           )`,
        )
        .bind(
          createId("step"),
          runId,
          sequence,
          kind,
          state,
          label,
          detail,
          runId,
          ownerId,
        ),
    );

    const results = await this.db.batch([
      insertRun,
      this.db
        .prepare(
          `INSERT INTO implementation_plans (
            id, run_id, revision, plan_json, estimated_model_cents,
            estimated_execution_seconds, status
          )
          SELECT ?, ?, 1, ?, ?, ?, 'draft'
          WHERE EXISTS (SELECT 1 FROM runs WHERE id = ?)`
        )
        .bind(
          planId,
          runId,
          JSON.stringify(plan),
          plan.estimatedModelCents,
          plan.estimatedExecutionSeconds,
          runId,
        ),
      ...stepStatements,
      this.db
        .prepare(
          `INSERT INTO run_events (id, run_id, sequence, type, data_json)
           SELECT ?, ?, 1, 'run.created', ?
           WHERE EXISTS (SELECT 1 FROM runs WHERE id = ?)`,
        )
        .bind(
          createId("evt"),
          runId,
          JSON.stringify({ state: "plan", progress: 20, planId }),
          runId,
        ),
      auditStatement(this.db, {
        ownerId,
        projectId,
        action: "run.created",
        subjectType: "run",
        subjectId: runId,
        metadata: { contractId: input.contractId, budgetCents: input.budgetCents },
        requireOwnedProject: true,
      }),
    ]);

    const row = firstBatchRow<RunRow>(results[0]);
    if (!row) {
      throw new ApiError(
        409,
        "run_not_allowed",
        "An approved contract for an active project is required",
      );
    }
    return toRun(row);
  }

  async getRun(ownerId: string, runId: string): Promise<RunRecord> {
    const row = await this.db
      .prepare(
        `SELECT ${ownedRunColumns} FROM runs r
         JOIN projects p ON p.id = r.project_id
         WHERE r.id = ? AND p.owner_id = ?`,
      )
      .bind(runId, ownerId)
      .first<RunRow>();
    if (!row) notFound("Run");
    return toRun(row);
  }

  async getRunContract(ownerId: string, runId: string): Promise<ContractRecord> {
    const row = await this.db
      .prepare(
        `SELECT ${ownedContractColumns} FROM build_contracts c
         JOIN runs r ON r.contract_id = c.id
         JOIN projects p ON p.id = r.project_id
         WHERE r.id = ? AND p.owner_id = ?`,
      )
      .bind(runId, ownerId)
      .first<ContractRow>();
    if (!row) notFound("Run");
    return toContract(row);
  }

  async getRunDetails(ownerId: string, runId: string): Promise<{
    run: RunRecord;
    plan: PlanRecord;
    steps: Array<Omit<RunStepRow, "evidenceJson"> & { evidence: Record<string, unknown> }>;
    findings: FindingRow[];
    patches: PatchRow[];
    artifacts: ArtifactRow[];
    tests: TestRunRow[];
    executionJobs: ExecutionJobRecord[];
  }> {
    const run = await this.getRun(ownerId, runId);
    const [plan, steps, findings, patches, artifacts, tests, executionJobs] = await Promise.all([
      this.getPlan(ownerId, runId),
      this.db
        .prepare(
          `SELECT id, run_id AS runId, sequence, kind, state, label, detail,
             evidence_json AS evidenceJson, started_at AS startedAt,
             completed_at AS completedAt, created_at AS createdAt
           FROM run_steps WHERE run_id = ? ORDER BY sequence`,
        )
        .bind(runId)
        .all<RunStepRow>(),
      this.db
        .prepare(
          `SELECT id, run_id AS runId, source, category, severity, title, detail,
             status, fingerprint, created_at AS createdAt
           FROM findings WHERE run_id = ? ORDER BY created_at`,
        )
        .bind(runId)
        .all<FindingRow>(),
      this.db
        .prepare(
          `SELECT id, run_id AS runId, sequence, summary, patch_hash AS patchHash,
             files_changed AS filesChanged, additions, deletions,
             artifact_key AS artifactKey, created_at AS createdAt
           FROM patches WHERE run_id = ? ORDER BY sequence`,
        )
        .bind(runId)
        .all<PatchRow>(),
      this.db
        .prepare(
          `SELECT id, owner_id AS ownerId, project_id AS projectId, run_id AS runId,
             kind, object_key AS objectKey, content_type AS contentType, sha256,
             size_bytes AS sizeBytes, created_at AS createdAt, expires_at AS expiresAt
           FROM artifacts WHERE run_id = ? AND owner_id = ? ORDER BY created_at`,
        )
        .bind(runId, ownerId)
        .all<ArtifactRow>(),
      this.db
        .prepare(
          `SELECT id, run_id AS runId, kind, status,
             command_label AS commandLabel, passed, failed,
             duration_ms AS durationMs, report_artifact_id AS reportArtifactId,
             created_at AS createdAt
           FROM test_runs WHERE run_id = ? ORDER BY created_at, id`,
        )
        .bind(runId)
        .all<TestRunRow>(),
      this.db
        .prepare(
          `SELECT id, owner_id AS ownerId, project_id AS projectId,
             run_id AS runId, kind, status, attempt, max_attempts AS maxAttempts,
             payload_artifact_key AS payloadArtifactKey,
             result_artifact_key AS resultArtifactKey,
             lease_token_hash AS leaseTokenHash,
             lease_expires_at AS leaseExpiresAt, error_code AS errorCode,
             created_at AS createdAt, updated_at AS updatedAt,
             completed_at AS completedAt
           FROM execution_jobs WHERE run_id = ? AND owner_id = ?
           ORDER BY created_at`,
        )
        .bind(runId, ownerId)
        .all<ExecutionJobRow>(),
    ]);
    return {
      run,
      plan,
      steps: steps.results.map((step) => ({
        ...omit(step, "evidenceJson"),
        evidence: parseJsonRecord(step.evidenceJson),
      })),
      findings: findings.results,
      patches: patches.results,
      artifacts: artifacts.results,
      tests: tests.results,
      executionJobs: executionJobs.results.map(publicExecutionJob),
    };
  }

  async getPlan(ownerId: string, runId: string): Promise<PlanRecord> {
    const row = await this.db
      .prepare(
        `SELECT ip.id, ip.run_id AS runId, ip.revision,
           ip.plan_json AS planJson,
           ip.estimated_model_cents AS estimatedModelCents,
           ip.estimated_execution_seconds AS estimatedExecutionSeconds,
           ip.status, ip.approved_by AS approvedBy, ip.approved_at AS approvedAt,
           ip.created_at AS createdAt
         FROM implementation_plans ip
         JOIN runs r ON r.id = ip.run_id
         JOIN projects p ON p.id = r.project_id
         WHERE ip.run_id = ? AND p.owner_id = ?
         ORDER BY ip.revision DESC LIMIT 1`,
      )
      .bind(runId, ownerId)
      .first<PlanRow>();
    if (!row) notFound("Implementation plan");
    return toPlan(row);
  }

  async approvePlan(
    ownerId: string,
    runId: string,
  ): Promise<{ run: RunRecord; plan: PlanRecord }> {
    const existingRun = await this.getRun(ownerId, runId);
    const existingPlan = await this.getPlan(ownerId, runId);
    if (existingRun.status === "user_approval" && existingPlan.status === "approved") {
      return { run: existingRun, plan: existingPlan };
    }
    if (existingRun.status !== "plan" || !canTransition("plan", "user_approval")) {
      conflict("This implementation plan can no longer be approved", "plan_not_approvable");
    }

    const results = await this.db.batch([
      this.db
        .prepare(
          `UPDATE implementation_plans
           SET status = 'approved', approved_by = ?, approved_at = CURRENT_TIMESTAMP
           WHERE id = ? AND run_id = ? AND status = 'draft'
             AND EXISTS (
               SELECT 1 FROM runs r JOIN projects p ON p.id = r.project_id
               WHERE r.id = ? AND r.status = 'plan' AND p.owner_id = ?
             )
           RETURNING id, run_id AS runId, revision, plan_json AS planJson,
             estimated_model_cents AS estimatedModelCents,
             estimated_execution_seconds AS estimatedExecutionSeconds,
             status, approved_by AS approvedBy, approved_at AS approvedAt,
             created_at AS createdAt`,
        )
        .bind(ownerId, existingPlan.id, runId, runId, ownerId),
      this.db
        .prepare(
          `UPDATE runs SET status = 'user_approval', current_step = 'user_approval',
             progress = 25, updated_at = CURRENT_TIMESTAMP
           WHERE id = ? AND status = 'plan'
             AND EXISTS (
               SELECT 1 FROM projects p WHERE p.id = runs.project_id AND p.owner_id = ?
             )
           RETURNING ${runColumns}`,
        )
        .bind(runId, ownerId),
      this.db
        .prepare(
          `UPDATE run_steps SET state = 'done', detail = 'Implementation plan approved',
             completed_at = CURRENT_TIMESTAMP
           WHERE run_id = ? AND kind = 'plan'`,
        )
        .bind(runId),
      this.db
        .prepare(
          `INSERT INTO run_events (id, run_id, sequence, type, data_json)
           SELECT ?, r.id,
             COALESCE((SELECT MAX(sequence) FROM run_events WHERE run_id = r.id), 0) + 1,
             'plan.approved', ?
           FROM runs r JOIN projects p ON p.id = r.project_id
           WHERE r.id = ? AND r.status = 'user_approval' AND p.owner_id = ?`,
        )
        .bind(
          createId("evt"),
          JSON.stringify({ planId: existingPlan.id, revision: existingPlan.revision }),
          runId,
          ownerId,
        ),
      auditStatement(this.db, {
        ownerId,
        projectId: existingRun.projectId,
        action: "implementation_plan.approved",
        subjectType: "implementation_plan",
        subjectId: existingPlan.id,
        metadata: { runId, revision: existingPlan.revision },
        requireOwnedProject: true,
      }),
    ]);
    const planRow = firstBatchRow<PlanRow>(results[0]);
    const runRow = firstBatchRow<RunRow>(results[1]);
    if (!planRow || !runRow) {
      conflict("Run state changed; refresh and try again", "stale_run_state");
    }
    return { run: toRun(runRow), plan: toPlan(planRow) };
  }

  async startGeneration(ownerId: string, runId: string): Promise<RunRecord> {
    const existing = await this.getRun(ownerId, runId);
    if (existing.status === "scaffold" || existing.status === "generate_patches") {
      return existing;
    }
    if (existing.status !== "user_approval") {
      conflict("Generation is not available in the current run state", "generation_not_allowed");
    }
    const plan = await this.getPlan(ownerId, runId);
    if (plan.status !== "approved") {
      conflict("The implementation plan must be approved first", "plan_not_approved");
    }

    const results = await this.db.batch([
      this.db
        .prepare(
          `UPDATE runs SET status = 'scaffold', current_step = 'scaffold',
             progress = 30, updated_at = CURRENT_TIMESTAMP
           WHERE id = ? AND status = 'user_approval'
             AND EXISTS (
               SELECT 1 FROM projects p WHERE p.id = runs.project_id AND p.owner_id = ?
             )
           RETURNING ${runColumns}`,
        )
        .bind(runId, ownerId),
      this.db
        .prepare(
          `UPDATE run_steps SET state = 'active', started_at = CURRENT_TIMESTAMP,
             detail = 'Materializing pinned blueprint in artifact storage'
           WHERE run_id = ? AND kind = 'scaffold' AND state = 'waiting'`,
        )
        .bind(runId),
      this.db
        .prepare(
          `INSERT INTO run_events (id, run_id, sequence, type, data_json)
           SELECT ?, r.id,
             COALESCE((SELECT MAX(sequence) FROM run_events WHERE run_id = r.id), 0) + 1,
             'generation.started', ?
           FROM runs r JOIN projects p ON p.id = r.project_id
           WHERE r.id = ? AND r.status = 'scaffold' AND p.owner_id = ?`,
        )
        .bind(
          createId("evt"),
          JSON.stringify({ state: "scaffold", blueprint: "react-fastapi-postgres-v1" }),
          runId,
          ownerId,
        ),
      auditStatement(this.db, {
        ownerId,
        projectId: existing.projectId,
        action: "generation.started",
        subjectType: "run",
        subjectId: runId,
        metadata: { planId: plan.id, planRevision: plan.revision },
        requireOwnedProject: true,
      }),
    ]);
    const row = firstBatchRow<RunRow>(results[0]);
    if (!row) conflict("Run state changed; refresh and try again", "stale_run_state");
    return toRun(row);
  }

  async completeScaffold(
    ownerId: string,
    runId: string,
    artifact: StoredArtifactInput,
  ): Promise<RunRecord> {
    const existing = await this.getRun(ownerId, runId);
    if (existing.status === "generate_patches") return existing;
    if (existing.status !== "scaffold") {
      conflict("The blueprint cannot be recorded in the current run state", "scaffold_not_active");
    }
    const artifactId = createId("artifact");
    const results = await this.db.batch([
      this.db
        .prepare(
          `INSERT INTO artifacts (
             id, owner_id, project_id, run_id, kind, object_key,
             content_type, sha256, size_bytes, expires_at
           )
           SELECT ?, ?, r.project_id, r.id, 'blueprint_manifest', ?, ?, ?, ?,
             datetime('now', '+30 days')
           FROM runs r JOIN projects p ON p.id = r.project_id
           WHERE r.id = ? AND r.status = 'scaffold' AND p.owner_id = ?`,
        )
        .bind(
          artifactId,
          ownerId,
          artifact.objectKey,
          artifact.contentType,
          artifact.sha256,
          artifact.sizeBytes,
          runId,
          ownerId,
        ),
      this.db
        .prepare(
          `UPDATE runs SET status = 'generate_patches', current_step = 'generate_patches',
             progress = 38, updated_at = CURRENT_TIMESTAMP
           WHERE id = ? AND status = 'scaffold'
             AND EXISTS (
               SELECT 1 FROM projects p WHERE p.id = runs.project_id AND p.owner_id = ?
             )
           RETURNING ${runColumns}`,
        )
        .bind(runId, ownerId),
      this.db
        .prepare(
          `UPDATE run_steps SET state = 'done', completed_at = CURRENT_TIMESTAMP,
             detail = 'Pinned blueprint manifest stored with SHA-256 provenance'
           WHERE run_id = ? AND kind = 'scaffold'`,
        )
        .bind(runId),
      this.db
        .prepare(
          `INSERT INTO run_events (id, run_id, sequence, type, data_json)
           SELECT ?, r.id,
             COALESCE((SELECT MAX(sequence) FROM run_events WHERE run_id = r.id), 0) + 1,
             'scaffold.completed', ?
           FROM runs r JOIN projects p ON p.id = r.project_id
           WHERE r.id = ? AND r.status = 'generate_patches' AND p.owner_id = ?`,
        )
        .bind(
          createId("evt"),
          JSON.stringify({ artifactId, sha256: artifact.sha256 }),
          runId,
          ownerId,
        ),
      auditStatement(this.db, {
        ownerId,
        projectId: existing.projectId,
        action: "blueprint.materialized",
        subjectType: "artifact",
        subjectId: artifactId,
        metadata: { runId, sha256: artifact.sha256 },
        requireOwnedProject: true,
      }),
    ]);
    const row = firstBatchRow<RunRow>(results[1]);
    if (!row) conflict("Run state changed; refresh and try again", "stale_run_state");
    return toRun(row);
  }

  async nextPatchSequence(ownerId: string, runId: string): Promise<number> {
    const run = await this.getRun(ownerId, runId);
    if (run.status !== "generate_patches" && run.status !== "repair_patch") {
      conflict("Patch generation is not active", "patch_generation_not_active");
    }
    const row = await this.db
      .prepare(
        `SELECT COALESCE(MAX(sequence), 0) + 1 AS sequence
         FROM patches WHERE run_id = ?`,
      )
      .bind(runId)
      .first<{ sequence: number }>();
    return row?.sequence ?? 1;
  }

  async listLatestFileSnapshots(
    ownerId: string,
    runId: string,
    paths: string[],
  ): Promise<FileSnapshotRecord[]> {
    await this.getRun(ownerId, runId);
    if (paths.length === 0) return [];
    const placeholders = paths.map(() => "?").join(", ");
    const result = await this.db
      .prepare(
        `SELECT fs.id, fs.run_id AS runId, fs.patch_id AS patchId,
           fs.revision, fs.path, fs.object_key AS objectKey, fs.sha256,
           fs.size_bytes AS sizeBytes, fs.language, fs.deleted,
           fs.created_at AS createdAt
         FROM file_snapshots fs
         JOIN (
           SELECT path, MAX(revision) AS revision FROM file_snapshots
           WHERE run_id = ? AND path IN (${placeholders}) GROUP BY path
         ) latest ON latest.path = fs.path AND latest.revision = fs.revision
         WHERE fs.run_id = ? ORDER BY fs.path`,
      )
      .bind(runId, ...paths, runId)
      .all<FileSnapshotRow>();
    return result.results.map((row) => ({ ...row, deleted: Boolean(row.deleted) }));
  }

  async listCurrentFileSnapshots(
    ownerId: string,
    runId: string,
  ): Promise<FileSnapshotRecord[]> {
    await this.getRun(ownerId, runId);
    const result = await this.db
      .prepare(
        `SELECT fs.id, fs.run_id AS runId, fs.patch_id AS patchId,
           fs.revision, fs.path, fs.object_key AS objectKey, fs.sha256,
           fs.size_bytes AS sizeBytes, fs.language, fs.deleted,
           fs.created_at AS createdAt
         FROM file_snapshots fs
         JOIN (
           SELECT path, MAX(revision) AS revision FROM file_snapshots
           WHERE run_id = ? GROUP BY path
         ) latest ON latest.path = fs.path AND latest.revision = fs.revision
         WHERE fs.run_id = ? ORDER BY fs.path`,
      )
      .bind(runId, runId)
      .all<FileSnapshotRow>();
    return result.results.map((row) => ({ ...row, deleted: Boolean(row.deleted) }));
  }

  async getPatch(
    ownerId: string,
    runId: string,
    patchId: string,
  ): Promise<PatchRecord> {
    const row = await this.db
      .prepare(
        `SELECT pa.id, pa.run_id AS runId, pa.sequence, pa.summary,
           pa.patch_hash AS patchHash, pa.files_changed AS filesChanged,
           pa.additions, pa.deletions, pa.artifact_key AS artifactKey,
           pa.created_at AS createdAt
         FROM patches pa
         JOIN runs r ON r.id = pa.run_id
         JOIN projects p ON p.id = r.project_id
         WHERE pa.id = ? AND pa.run_id = ? AND p.owner_id = ?`,
      )
      .bind(patchId, runId, ownerId)
      .first<PatchRow>();
    if (!row) notFound("Patch");
    return row;
  }

  async recordPatch(
    ownerId: string,
    runId: string,
    input: {
      sequence: number;
      draft: PatchDraft;
      artifact: StoredArtifactInput;
      snapshots: Array<
        StoredArtifactInput & { path: string; language: string; deleted: boolean }
      >;
      provenance: PatchProvenance;
    },
  ): Promise<PatchRecord> {
    const run = await this.getRun(ownerId, runId);
    if (run.status !== "generate_patches" && run.status !== "repair_patch") {
      conflict("Patch generation is not active", "patch_generation_not_active");
    }
    const patchId = createId("patch");
    const artifactId = createId("artifact");
    const additions = input.draft.changes.reduce(
      (total, change) => total + (change.content?.split("\n").length ?? 0),
      0,
    );
    const deletions = input.draft.changes.filter(
      (change) => change.operation === "delete",
    ).length;
    const insertPatch = this.db
      .prepare(
        `INSERT INTO patches (
           id, run_id, sequence, summary, patch_hash, files_changed,
           additions, deletions, artifact_key
         )
         SELECT ?, r.id, ?, ?, ?, ?, ?, ?, ?
         FROM runs r JOIN projects p ON p.id = r.project_id
         WHERE r.id = ? AND r.status IN ('generate_patches', 'repair_patch')
           AND p.owner_id = ?
         RETURNING id, run_id AS runId, sequence, summary,
           patch_hash AS patchHash, files_changed AS filesChanged,
           additions, deletions, artifact_key AS artifactKey,
           created_at AS createdAt`,
      )
      .bind(
        patchId,
        input.sequence,
        input.draft.summary,
        input.artifact.sha256,
        input.draft.changes.length,
        additions,
        deletions,
        input.artifact.objectKey,
        runId,
        ownerId,
      );
    const snapshotStatements = input.snapshots.map((snapshot) =>
      this.db
        .prepare(
          `INSERT INTO file_snapshots (
             id, run_id, patch_id, revision, path, object_key,
             sha256, size_bytes, language, deleted
           )
           SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
           WHERE EXISTS (SELECT 1 FROM patches WHERE id = ? AND run_id = ?)`,
        )
        .bind(
          createId("snapshot"),
          runId,
          patchId,
          input.sequence,
          snapshot.path,
          snapshot.objectKey,
          snapshot.sha256,
          snapshot.sizeBytes,
          snapshot.language,
          snapshot.deleted ? 1 : 0,
          patchId,
          runId,
        ),
    );
    const progress = run.status === "repair_patch"
      ? 72
      : Math.min(58, 38 + input.sequence * 6);
    const results = await this.db.batch([
      insertPatch,
      this.db
        .prepare(
          `INSERT INTO artifacts (
             id, owner_id, project_id, run_id, kind, object_key,
             content_type, sha256, size_bytes, expires_at
           )
           SELECT ?, ?, r.project_id, r.id, 'patch', ?, ?, ?, ?,
             datetime('now', '+30 days')
           FROM runs r JOIN projects p ON p.id = r.project_id
           WHERE r.id = ? AND p.owner_id = ?
             AND EXISTS (SELECT 1 FROM patches WHERE id = ?)`
        )
        .bind(
          artifactId,
          ownerId,
          input.artifact.objectKey,
          input.artifact.contentType,
          input.artifact.sha256,
          input.artifact.sizeBytes,
          runId,
          ownerId,
          patchId,
        ),
      ...snapshotStatements,
      this.db
        .prepare(
          `INSERT INTO usage_ledger (
             id, owner_id, project_id, run_id, category, units,
             unit_kind, cost_micros, provider
           )
           SELECT ?, ?, r.project_id, r.id, 'model.patch_proposal', ?,
             'tokens', 0, ?
           FROM runs r JOIN projects p ON p.id = r.project_id
           WHERE r.id = ? AND p.owner_id = ?
             AND EXISTS (SELECT 1 FROM patches WHERE id = ?)`
        )
        .bind(
          createId("usage"),
          ownerId,
          input.provenance.totalTokens,
          input.provenance.model,
          runId,
          ownerId,
          patchId,
        ),
      this.db
        .prepare(
          `UPDATE runs SET progress = ?, updated_at = CURRENT_TIMESTAMP
           WHERE id = ? AND status IN ('generate_patches', 'repair_patch')`,
        )
        .bind(progress, runId),
      this.db
        .prepare(
          `INSERT INTO run_events (id, run_id, sequence, type, data_json)
           SELECT ?, r.id,
             COALESCE((SELECT MAX(sequence) FROM run_events WHERE run_id = r.id), 0) + 1,
             'patch.accepted', ?
           FROM runs r WHERE r.id = ?
             AND EXISTS (SELECT 1 FROM patches WHERE id = ?)`
        )
        .bind(
          createId("evt"),
          JSON.stringify({
            patchId,
            sequence: input.sequence,
            filesChanged: input.draft.changes.length,
            sha256: input.artifact.sha256,
            requirementIds: input.draft.requirementIds,
          }),
          runId,
          patchId,
        ),
      auditStatement(this.db, {
        ownerId,
        projectId: run.projectId,
        action: "patch.accepted",
        subjectType: "patch",
        subjectId: patchId,
        metadata: {
          runId,
          sequence: input.sequence,
          sha256: input.artifact.sha256,
          planner: input.provenance.planner,
          model: input.provenance.model,
          providerRequestId: input.provenance.providerRequestId,
        },
        requireOwnedProject: true,
      }),
    ]);
    const row = firstBatchRow<PatchRow>(results[0]);
    if (!row) conflict("Run state changed; patch was not accepted", "stale_run_state");
    return row;
  }

  async beginRepair(ownerId: string, runId: string): Promise<RunRecord> {
    const existing = await this.getRun(ownerId, runId);
    if (existing.status === "repair_patch") return existing;
    if (existing.status !== "diagnose") {
      conflict("Repair is not available in the current run state", "repair_not_allowed");
    }
    if (existing.attempt >= existing.maxAttempts) {
      conflict("The bounded repair limit has been reached", "repair_limit_reached");
    }
    if (!canTransition("diagnose", "repair_patch")) {
      conflict("Repair produced an invalid run transition", "invalid_run_transition");
    }
    const nextAttempt = existing.attempt + 1;
    const results = await this.db.batch([
      this.db
        .prepare(
          `UPDATE runs SET status = 'repair_patch', current_step = 'repair_patch',
             progress = 70, attempt = attempt + 1,
             updated_at = CURRENT_TIMESTAMP
           WHERE id = ? AND status = 'diagnose' AND attempt < max_attempts
             AND EXISTS (
               SELECT 1 FROM projects p WHERE p.id = runs.project_id AND p.owner_id = ?
             )
           RETURNING ${runColumns}`,
        )
        .bind(runId, ownerId),
      this.db
        .prepare(
          `UPDATE run_steps SET state = 'active', started_at = CURRENT_TIMESTAMP,
             completed_at = NULL, detail = ?, evidence_json = '{}'
           WHERE run_id = ? AND kind = 'verification'`,
        )
        .bind(`Applying bounded repair attempt ${nextAttempt} of ${existing.maxAttempts}`, runId),
      this.db
        .prepare(
          `UPDATE run_steps SET state = 'waiting', started_at = NULL,
             completed_at = NULL, detail = 'Waiting for repaired verification',
             evidence_json = '{}'
           WHERE run_id = ? AND kind = 'security'`,
        )
        .bind(runId),
      this.db
        .prepare(
          `UPDATE findings SET status = 'repairing'
           WHERE run_id = ? AND status = 'open'`,
        )
        .bind(runId),
      this.db
        .prepare(
          `INSERT INTO run_events (id, run_id, sequence, type, data_json)
           SELECT ?, r.id,
             COALESCE((SELECT MAX(sequence) FROM run_events WHERE run_id = r.id), 0) + 1,
             'repair.started', ?
           FROM runs r JOIN projects p ON p.id = r.project_id
           WHERE r.id = ? AND r.status = 'repair_patch' AND p.owner_id = ?`,
        )
        .bind(
          createId("evt"),
          JSON.stringify({ attempt: nextAttempt, maxAttempts: existing.maxAttempts }),
          runId,
          ownerId,
        ),
      auditStatement(this.db, {
        ownerId,
        projectId: existing.projectId,
        action: "repair.started",
        subjectType: "run",
        subjectId: runId,
        metadata: { attempt: nextAttempt, maxAttempts: existing.maxAttempts },
        requireOwnedProject: true,
      }),
    ]);
    const row = firstBatchRow<RunRow>(results[0]);
    if (!row) conflict("Run state changed; repair was not started", "stale_run_state");
    return toRun(row);
  }

  async queueVerification(
    ownerId: string,
    runId: string,
    payload: StoredArtifactInput,
  ): Promise<{ run: RunRecord; job: ExecutionJobRecord }> {
    const existingRun = await this.getRun(ownerId, runId);
    if (existingRun.status === "static_check") {
      const existingJob = await this.db
        .prepare(
          `SELECT id, owner_id AS ownerId, project_id AS projectId,
             run_id AS runId, kind, status, attempt, max_attempts AS maxAttempts,
             payload_artifact_key AS payloadArtifactKey,
             result_artifact_key AS resultArtifactKey,
             lease_token_hash AS leaseTokenHash,
             lease_expires_at AS leaseExpiresAt, error_code AS errorCode,
             created_at AS createdAt, updated_at AS updatedAt,
             completed_at AS completedAt
           FROM execution_jobs
           WHERE run_id = ? AND owner_id = ? AND status IN ('queued', 'leased')
           ORDER BY created_at DESC LIMIT 1`,
        )
        .bind(runId, ownerId)
        .first<ExecutionJobRow>();
      if (existingJob) {
        return { run: existingRun, job: publicExecutionJob(existingJob) };
      }
    }
    if (
      existingRun.status !== "generate_patches" &&
      existingRun.status !== "repair_patch"
    ) {
      conflict("Verification is not available in the current run state", "verification_not_allowed");
    }
    if (existingRun.status === "repair_patch") {
      const repairEvents = await this.db
        .prepare(
          `SELECT
             MAX(CASE WHEN type = 'repair.started' THEN sequence END) AS repairSequence,
             MAX(CASE WHEN type = 'patch.accepted' THEN sequence END) AS patchSequence
           FROM run_events WHERE run_id = ?`,
        )
        .bind(runId)
        .first<{ repairSequence: number | null; patchSequence: number | null }>();
      if (
        !repairEvents?.repairSequence ||
        !repairEvents.patchSequence ||
        repairEvents.patchSequence <= repairEvents.repairSequence
      ) {
        conflict(
          "An accepted repair patch is required before re-verification",
          "repair_patch_required",
        );
      }
    }
    const patchCount = await this.db
      .prepare("SELECT COUNT(*) AS count FROM patches WHERE run_id = ?")
      .bind(runId)
      .first<{ count: number }>();
    if (!patchCount || patchCount.count < 1) {
      conflict("At least one accepted patch is required", "patch_required");
    }
    const jobId = createId("job");
    const artifactId = createId("artifact");
    const results = await this.db.batch([
      this.db
        .prepare(
          `UPDATE runs SET status = 'static_check', current_step = 'static_check',
             progress = 60, updated_at = CURRENT_TIMESTAMP
           WHERE id = ? AND status IN ('generate_patches', 'repair_patch')
             AND EXISTS (
               SELECT 1 FROM projects p WHERE p.id = runs.project_id AND p.owner_id = ?
             )
           RETURNING ${runColumns}`,
        )
        .bind(runId, ownerId),
      this.db
        .prepare(
          `INSERT INTO artifacts (
             id, owner_id, project_id, run_id, kind, object_key,
             content_type, sha256, size_bytes, expires_at
           )
           SELECT ?, ?, r.project_id, r.id, 'execution_input', ?, ?, ?, ?,
             datetime('now', '+7 days')
           FROM runs r JOIN projects p ON p.id = r.project_id
           WHERE r.id = ? AND r.status = 'static_check' AND p.owner_id = ?`,
        )
        .bind(
          artifactId,
          ownerId,
          payload.objectKey,
          payload.contentType,
          payload.sha256,
          payload.sizeBytes,
          runId,
          ownerId,
        ),
      this.db
        .prepare(
          `INSERT INTO execution_jobs (
             id, owner_id, project_id, run_id, kind, status,
             payload_artifact_key, max_attempts
           )
           SELECT ?, ?, r.project_id, r.id, 'verify', 'queued', ?, 3
           FROM runs r JOIN projects p ON p.id = r.project_id
           WHERE r.id = ? AND r.status = 'static_check' AND p.owner_id = ?
             AND NOT EXISTS (
               SELECT 1 FROM execution_jobs ej
               WHERE ej.run_id = r.id AND ej.status IN ('queued', 'leased')
             )
           RETURNING id, owner_id AS ownerId, project_id AS projectId,
             run_id AS runId, kind, status, attempt, max_attempts AS maxAttempts,
             payload_artifact_key AS payloadArtifactKey,
             result_artifact_key AS resultArtifactKey,
             lease_token_hash AS leaseTokenHash,
             lease_expires_at AS leaseExpiresAt, error_code AS errorCode,
             created_at AS createdAt, updated_at AS updatedAt,
             completed_at AS completedAt`,
        )
        .bind(jobId, ownerId, payload.objectKey, runId, ownerId),
      this.db
        .prepare(
          `UPDATE run_steps SET state = 'active',
             started_at = COALESCE(started_at, CURRENT_TIMESTAMP), completed_at = NULL,
             detail = 'Queued on the isolated verification runner'
           WHERE run_id = ? AND kind = 'verification' AND state <> 'done'`,
        )
        .bind(runId),
      this.db
        .prepare(
          `INSERT INTO run_events (id, run_id, sequence, type, data_json)
           SELECT ?, r.id,
             COALESCE((SELECT MAX(sequence) FROM run_events WHERE run_id = r.id), 0) + 1,
             'verification.queued', ?
           FROM runs r WHERE r.id = ? AND r.status = 'static_check'
             AND EXISTS (SELECT 1 FROM execution_jobs WHERE id = ?)`,
        )
        .bind(
          createId("evt"),
          JSON.stringify({ jobId, payloadSha256: payload.sha256 }),
          runId,
          jobId,
        ),
      auditStatement(this.db, {
        ownerId,
        projectId: existingRun.projectId,
        action: "verification.queued",
        subjectType: "execution_job",
        subjectId: jobId,
        metadata: { runId, payloadSha256: payload.sha256 },
        requireOwnedProject: true,
      }),
    ]);
    const runRow = firstBatchRow<RunRow>(results[0]);
    const jobRow = firstBatchRow<ExecutionJobRow>(results[2]);
    if (!runRow || !jobRow) {
      conflict("Run state changed; verification was not queued", "stale_run_state");
    }
    return { run: toRun(runRow), job: publicExecutionJob(jobRow) };
  }

  async claimExecutionJob(
    leaseTokenHash: string,
  ): Promise<ExecutionJobRecord | null> {
    const row = await this.db
      .prepare(
        `UPDATE execution_jobs
         SET status = 'leased', attempt = attempt + 1,
           lease_token_hash = ?, lease_expires_at = datetime('now', '+12 minutes'),
           updated_at = CURRENT_TIMESTAMP
         WHERE id = (
           SELECT ej.id FROM execution_jobs ej
           JOIN runs r ON r.id = ej.run_id
           WHERE (
               ej.status = 'queued'
               OR (ej.status = 'leased' AND ej.lease_expires_at <= CURRENT_TIMESTAMP)
             )
             AND ej.attempt < ej.max_attempts
             AND r.status = 'static_check'
             AND r.cancellation_requested = 0
           ORDER BY ej.created_at LIMIT 1
         )
         RETURNING id, owner_id AS ownerId, project_id AS projectId,
           run_id AS runId, kind, status, attempt, max_attempts AS maxAttempts,
           payload_artifact_key AS payloadArtifactKey,
           result_artifact_key AS resultArtifactKey,
           lease_token_hash AS leaseTokenHash,
           lease_expires_at AS leaseExpiresAt, error_code AS errorCode,
           created_at AS createdAt, updated_at AS updatedAt,
           completed_at AS completedAt`,
      )
      .bind(leaseTokenHash)
      .first<ExecutionJobRow>();
    return row ? publicExecutionJob(row) : null;
  }

  async completeExecutionJob(
    jobId: string,
    leaseTokenHash: string,
    artifact: StoredArtifactInput,
    report: VerificationReportInput,
  ): Promise<{ run: RunRecord; job: ExecutionJobRecord }> {
    const job = await this.db
      .prepare(
        `SELECT id, owner_id AS ownerId, project_id AS projectId,
           run_id AS runId, kind, status, attempt, max_attempts AS maxAttempts,
           payload_artifact_key AS payloadArtifactKey,
           result_artifact_key AS resultArtifactKey,
           lease_token_hash AS leaseTokenHash,
           lease_expires_at AS leaseExpiresAt, error_code AS errorCode,
           created_at AS createdAt, updated_at AS updatedAt,
           completed_at AS completedAt
         FROM execution_jobs
         WHERE id = ? AND status = 'leased' AND lease_token_hash = ?
           AND lease_expires_at > CURRENT_TIMESTAMP`,
      )
      .bind(jobId, leaseTokenHash)
      .first<ExecutionJobRow>();
    if (!job) notFound("Execution lease");
    const existingRun = await this.getRun(job.ownerId, job.runId);
    if (existingRun.status !== "static_check") {
      conflict("The run no longer accepts execution results", "stale_run_state");
    }
    const artifactId = createId("artifact");
    const passed = report.status === "passed" && report.checks.every(
      (check) => check.status === "passed",
    );
    const exhausted = !passed && existingRun.attempt >= existingRun.maxAttempts;
    const targetState = passed
      ? "ready"
      : exhausted
        ? "failed_with_evidence"
        : "diagnose";
    const progress = passed || exhausted ? 100 : 68;
    const successfulPath = ["build", "test", "preview", "security_scan", "ready"] as const;
    if (
      (passed &&
        (!canTransition("static_check", "build") ||
          !canTransition("build", "test") ||
          !canTransition("test", "preview") ||
          !canTransition("preview", "security_scan") ||
          !canTransition("security_scan", "ready"))) ||
      (!passed &&
        (!canTransition("static_check", "diagnose") ||
          (exhausted && !canTransition("diagnose", "failed_with_evidence"))))
    ) {
      conflict("Verification produced an invalid run transition", "invalid_run_transition");
    }
    const testStatements = report.checks.map((check) =>
      this.db
        .prepare(
          `INSERT INTO test_runs (
             id, run_id, kind, status, command_label, passed,
             failed, duration_ms, report_artifact_id
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          createId("test"),
          job.runId,
          check.checkId.split(":", 1)[0],
          check.status,
          check.checkId,
          check.status === "passed" ? 1 : 0,
          check.status === "passed" ? 0 : 1,
          check.durationMs,
          artifactId,
        ),
    );
    const failure = report.checks.find((check) => check.status !== "passed");
    const enteredStates: readonly string[] = passed
      ? successfulPath
      : exhausted
        ? ["diagnose", "failed_with_evidence"]
        : ["diagnose"];
    const stateEventStatements = enteredStates.map((state) =>
      this.db
        .prepare(
          `INSERT INTO run_events (id, run_id, sequence, type, data_json)
           SELECT ?, r.id,
             COALESCE((SELECT MAX(sequence) FROM run_events WHERE run_id = r.id), 0) + 1,
             'state.entered', ?
           FROM runs r WHERE r.id = ? AND r.status = ?`,
        )
        .bind(
          createId("evt"),
          JSON.stringify({ state, source: "verification_report", jobId }),
          job.runId,
          targetState,
        ),
    );
    const securityCheck = report.checks.find((check) => check.checkId === "security:source");
    const statements: D1PreparedStatement[] = [
      this.db
        .prepare(
          `INSERT INTO artifacts (
             id, owner_id, project_id, run_id, kind, object_key,
             content_type, sha256, size_bytes, expires_at
           ) VALUES (?, ?, ?, ?, 'verification_report', ?, ?, ?, ?,
             datetime('now', '+30 days'))`,
        )
        .bind(
          artifactId,
          job.ownerId,
          job.projectId,
          job.runId,
          artifact.objectKey,
          artifact.contentType,
          artifact.sha256,
          artifact.sizeBytes,
        ),
      ...testStatements,
      this.db
        .prepare(
          `UPDATE execution_jobs SET status = 'completed', result_artifact_key = ?,
             lease_token_hash = NULL, lease_expires_at = NULL,
             completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
           WHERE id = ? AND status = 'leased' AND lease_token_hash = ?
           RETURNING id, owner_id AS ownerId, project_id AS projectId,
             run_id AS runId, kind, status, attempt, max_attempts AS maxAttempts,
             payload_artifact_key AS payloadArtifactKey,
             result_artifact_key AS resultArtifactKey,
             lease_token_hash AS leaseTokenHash,
             lease_expires_at AS leaseExpiresAt, error_code AS errorCode,
             created_at AS createdAt, updated_at AS updatedAt,
             completed_at AS completedAt`,
        )
        .bind(artifact.objectKey, jobId, leaseTokenHash),
      this.db
        .prepare(
          `UPDATE runs SET status = ?, current_step = ?, progress = ?,
             error_code = ?, error_summary = ?,
             completed_at = CASE WHEN ? = 'failed_with_evidence'
               THEN CURRENT_TIMESTAMP ELSE completed_at END,
             updated_at = CURRENT_TIMESTAMP
           WHERE id = ? AND status = 'static_check'
           RETURNING ${runColumns}`,
        )
        .bind(
          targetState,
          targetState,
          progress,
          passed ? null : failure?.checkId ?? "verification_failed",
          passed
            ? null
            : exhausted
              ? "Repair limit reached; inspect the trusted verification report"
              : "Trusted verification failed; bounded repair is available",
          targetState,
          job.runId,
        ),
      this.db
        .prepare(
          `UPDATE run_steps SET state = ?, completed_at = CURRENT_TIMESTAMP,
             detail = ?, evidence_json = ?
           WHERE run_id = ? AND kind = 'verification'`,
        )
        .bind(
          passed ? "done" : "failed",
          passed
            ? `${report.checks.length} isolated checks passed`
            : `Stopped at ${failure?.checkId ?? "unknown check"}`,
          JSON.stringify({
            artifactId,
            sha256: artifact.sha256,
            provider: report.provider,
            sandboxId: report.sandboxId,
            passed: report.checks.filter((check) => check.status === "passed").length,
            failed: report.checks.filter((check) => check.status !== "passed").length,
          }),
          job.runId,
        ),
      ...(securityCheck
        ? [
            this.db
              .prepare(
                `UPDATE run_steps SET state = ?, started_at = COALESCE(started_at, CURRENT_TIMESTAMP),
                   completed_at = CURRENT_TIMESTAMP, detail = ?, evidence_json = ?
                 WHERE run_id = ? AND kind = 'security'`,
              )
              .bind(
                securityCheck.status === "passed" ? "done" : "failed",
                securityCheck.status === "passed"
                  ? "Trusted source policy passed in the isolated runner"
                  : "Trusted source policy blocked release",
                JSON.stringify({
                  checkId: securityCheck.checkId,
                  status: securityCheck.status,
                  artifactId,
                }),
                job.runId,
              ),
          ]
        : []),
      ...(passed
        ? [
            this.db
              .prepare(
                `UPDATE findings SET status = 'resolved'
                 WHERE run_id = ? AND status IN ('open', 'repairing')`,
              )
              .bind(job.runId),
          ]
        : [
            this.db
              .prepare(
                `UPDATE findings SET status = 'superseded'
                 WHERE run_id = ? AND status = 'repairing'`,
              )
              .bind(job.runId),
          ]),
      ...stateEventStatements,
      this.db
        .prepare(
          `INSERT INTO run_events (id, run_id, sequence, type, data_json)
           SELECT ?, r.id,
             COALESCE((SELECT MAX(sequence) FROM run_events WHERE run_id = r.id), 0) + 1,
             'verification.completed', ?
           FROM runs r WHERE r.id = ? AND r.status = ?`,
        )
        .bind(
          createId("evt"),
          JSON.stringify({
            jobId,
            status: report.status,
            state: targetState,
            artifactId,
            checks: report.checks.map((check) => ({
              checkId: check.checkId,
              status: check.status,
              durationMs: check.durationMs,
            })),
          }),
          job.runId,
          targetState,
        ),
      auditStatement(this.db, {
        ownerId: job.ownerId,
        projectId: job.projectId,
        actorType: "service",
        action: "verification.completed",
        subjectType: "execution_job",
        subjectId: jobId,
        metadata: {
          runId: job.runId,
          status: report.status,
          targetState,
          artifactSha256: artifact.sha256,
          provider: report.provider,
        },
        requireOwnedProject: true,
      }),
    ];
    if (!passed) {
      statements.push(
        this.db
          .prepare(
            `INSERT OR IGNORE INTO findings (
               id, run_id, source, category, severity, title,
               detail, status, fingerprint
             ) VALUES (?, ?, 'isolated_runner', 'verification', 'high', ?, ?,
               'open', ?)`
          )
          .bind(
            createId("finding"),
            job.runId,
            `Verification failed at ${failure?.checkId ?? "unknown check"}`,
            exhausted
              ? "The bounded repair limit was reached. Review the sanitized verification artifact."
              : "Review the sanitized verification artifact before a bounded repair.",
            `verification:${failure?.checkId ?? "unknown"}:${artifact.sha256}`,
          ),
      );
    }
    const results = await this.db.batch(statements);
    const jobRow = firstBatchRow<ExecutionJobRow>(results[1 + testStatements.length]);
    const runRow = firstBatchRow<RunRow>(results[2 + testStatements.length]);
    if (!jobRow || !runRow) {
      conflict("Execution lease changed before completion", "stale_execution_lease");
    }
    return { run: toRun(runRow), job: publicExecutionJob(jobRow) };
  }

  async recordRepositoryExport(
    ownerId: string,
    runId: string,
    artifact: StoredArtifactInput,
  ): Promise<{ artifactId: string }> {
    const run = await this.getRun(ownerId, runId);
    const artifactId = createId("artifact");
    const results = await this.db.batch([
      this.db
        .prepare(
          `INSERT INTO artifacts (
             id, owner_id, project_id, run_id, kind, object_key,
             content_type, sha256, size_bytes, expires_at
           )
           SELECT ?, ?, r.project_id, r.id, 'repository_export', ?, ?, ?, ?,
             datetime('now', '+30 days')
           FROM runs r JOIN projects p ON p.id = r.project_id
           WHERE r.id = ? AND p.owner_id = ?
           RETURNING id`,
        )
        .bind(
          artifactId,
          ownerId,
          artifact.objectKey,
          artifact.contentType,
          artifact.sha256,
          artifact.sizeBytes,
          runId,
          ownerId,
        ),
      this.db
        .prepare(
          `INSERT INTO run_events (id, run_id, sequence, type, data_json)
           SELECT ?, r.id,
             COALESCE((SELECT MAX(sequence) FROM run_events WHERE run_id = r.id), 0) + 1,
             'repository.exported', ?
           FROM runs r JOIN projects p ON p.id = r.project_id
           WHERE r.id = ? AND p.owner_id = ?`,
        )
        .bind(
          createId("evt"),
          JSON.stringify({
            artifactId,
            sha256: artifact.sha256,
            sizeBytes: artifact.sizeBytes,
            runStatus: run.status,
          }),
          runId,
          ownerId,
        ),
      auditStatement(this.db, {
        ownerId,
        projectId: run.projectId,
        action: "repository.exported",
        subjectType: "artifact",
        subjectId: artifactId,
        metadata: {
          runId,
          sha256: artifact.sha256,
          sizeBytes: artifact.sizeBytes,
          runStatus: run.status,
        },
        requireOwnedProject: true,
      }),
    ]);
    if (!firstBatchRow<{ id: string }>(results[0])) {
      conflict("Run state changed; export was not recorded", "stale_run_state");
    }
    return { artifactId };
  }

  async cancelRun(ownerId: string, runId: string): Promise<RunRecord> {
    const existing = await this.getRun(ownerId, runId);
    if (existing.status === "cancelled") return existing;
    if (!isRunState(existing.status) || !canTransition(existing.status, "cancelled")) {
      conflict("This run can no longer be cancelled", "run_not_cancellable");
    }

    const results = await this.db.batch([
      this.db
        .prepare(
          `UPDATE runs SET status = 'cancelled', current_step = 'cancelled',
             cancellation_requested = 1, completed_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
           WHERE id = ? AND status = ?
             AND EXISTS (
               SELECT 1 FROM projects p WHERE p.id = runs.project_id AND p.owner_id = ?
             )
           RETURNING ${runColumns}`,
        )
        .bind(runId, existing.status, ownerId),
      this.db
        .prepare(
          `UPDATE execution_jobs SET status = 'cancelled',
             lease_token_hash = NULL, lease_expires_at = NULL,
             completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
           WHERE run_id = ? AND status IN ('queued', 'leased')`,
        )
        .bind(runId),
      this.db
        .prepare(
          `INSERT INTO run_events (id, run_id, sequence, type, data_json)
           SELECT ?, r.id,
             COALESCE((SELECT MAX(sequence) FROM run_events WHERE run_id = r.id), 0) + 1,
             'run.cancelled', ?
           FROM runs r JOIN projects p ON p.id = r.project_id
           WHERE r.id = ? AND r.status = 'cancelled' AND p.owner_id = ?`,
        )
        .bind(
          createId("evt"),
          JSON.stringify({ previousState: existing.status, safeTeardownRequested: true }),
          runId,
          ownerId,
        ),
      auditStatement(this.db, {
        ownerId,
        projectId: existing.projectId,
        action: "run.cancelled",
        subjectType: "run",
        subjectId: runId,
        metadata: { previousState: existing.status },
        requireOwnedProject: true,
      }),
    ]);
    const row = firstBatchRow<RunRow>(results[0]);
    if (!row) conflict("Run state changed; refresh and try again", "stale_run_state");
    return toRun(row);
  }

  async listRunEvents(
    ownerId: string,
    runId: string,
    afterSequence: number,
  ): Promise<RunEventRecord[]> {
    await this.getRun(ownerId, runId);
    const result = await this.db
      .prepare(
        `SELECT e.id, e.run_id AS runId, e.sequence, e.type,
           e.data_json AS dataJson, e.created_at AS createdAt
         FROM run_events e WHERE e.run_id = ? AND e.sequence > ?
         ORDER BY e.sequence LIMIT 100`,
      )
      .bind(runId, afterSequence)
      .all<RunEventRow>();
    return result.results.map((event) => ({
      ...omit(event, "dataJson"),
      data: parseJsonRecord(event.dataJson),
    }));
  }

  async listArtifacts(ownerId: string, projectId: string): Promise<ArtifactRow[]> {
    await this.getProject(ownerId, projectId);
    const result = await this.db
      .prepare(
        `SELECT id, owner_id AS ownerId, project_id AS projectId, run_id AS runId,
           kind, object_key AS objectKey, content_type AS contentType, sha256,
           size_bytes AS sizeBytes, created_at AS createdAt, expires_at AS expiresAt
         FROM artifacts WHERE owner_id = ? AND project_id = ?
         ORDER BY created_at DESC LIMIT 100`,
      )
      .bind(ownerId, projectId)
      .all<ArtifactRow>();
    return result.results;
  }

  async listAuditEvents(ownerId: string, projectId: string): Promise<Array<
    Omit<AuditRow, "metadataJson"> & { metadata: Record<string, unknown> }
  >> {
    await this.getProject(ownerId, projectId);
    const result = await this.db
      .prepare(
        `SELECT id, owner_id AS ownerId, project_id AS projectId,
           actor_type AS actorType, action, subject_type AS subjectType,
           subject_id AS subjectId, policy_decision AS policyDecision,
           metadata_json AS metadataJson, created_at AS createdAt
         FROM audit_events WHERE owner_id = ? AND project_id = ?
         ORDER BY created_at DESC LIMIT 100`,
      )
      .bind(ownerId, projectId)
      .all<AuditRow>();
    return result.results.map((event) => ({
      ...omit(event, "metadataJson"),
      metadata: parseJsonRecord(event.metadataJson),
    }));
  }

  private async getContract(
    ownerId: string,
    projectId: string,
    contractId: string,
  ): Promise<ContractRecord> {
    const row = await this.db
      .prepare(
        `SELECT ${ownedContractColumns} FROM build_contracts c
         JOIN projects p ON p.id = c.project_id
         WHERE c.id = ? AND c.project_id = ? AND p.owner_id = ?`,
      )
      .bind(contractId, projectId, ownerId)
      .first<ContractRow>();
    if (!row) notFound("Build contract");
    return toContract(row);
  }
}

type AuditInput = {
  ownerId: string;
  projectId: string | null;
  action: string;
  subjectType: string;
  subjectId: string;
  metadata: Record<string, unknown>;
  requireOwnedProject?: boolean;
  actorType?: "user" | "service" | "system";
};

function auditStatement(db: D1Database, input: AuditInput): D1PreparedStatement {
  if (input.requireOwnedProject && input.projectId) {
    return db
      .prepare(
        `INSERT INTO audit_events (
          id, owner_id, project_id, actor_type, action, subject_type,
          subject_id, policy_decision, metadata_json
        )
        SELECT ?, ?, p.id, ?, ?, ?, ?, 'allow', ?
        FROM projects p WHERE p.id = ? AND p.owner_id = ?`,
      )
      .bind(
        createId("audit"),
        input.ownerId,
        input.actorType ?? "user",
        input.action,
        input.subjectType,
        input.subjectId,
        JSON.stringify(input.metadata),
        input.projectId,
        input.ownerId,
      );
  }
  return db
    .prepare(
      `INSERT INTO audit_events (
        id, owner_id, project_id, actor_type, action, subject_type,
        subject_id, policy_decision, metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'allow', ?)`,
    )
    .bind(
      createId("audit"),
      input.ownerId,
      input.projectId,
      input.actorType ?? "user",
      input.action,
      input.subjectType,
      input.subjectId,
      JSON.stringify(input.metadata),
    );
}

function toProject(row: ProjectRow): ProjectRecord {
  return { ...row, archived: Boolean(row.archived) };
}

function toContract(row: ContractRow): ContractRecord {
  return {
    ...omit(
      row,
      "requirementsJson",
      "systemShapeJson",
      "acceptanceChecksJson",
      "assumptionsJson",
    ),
    requirements: parseJsonArray<Requirement>(row.requirementsJson),
    systemShape: parseJsonObject<SystemShape>(row.systemShapeJson),
    acceptanceChecks: parseJsonArray<AcceptanceCheck>(row.acceptanceChecksJson),
    assumptions: parseJsonArray<string>(row.assumptionsJson),
  };
}

function toRun(row: RunRow): RunRecord {
  return { ...row, cancellationRequested: Boolean(row.cancellationRequested) };
}

function toPlan(row: PlanRow): PlanRecord {
  const parsed: unknown = JSON.parse(row.planJson);
  if (!isImplementationPlan(parsed)) {
    throw new Error("Stored implementation plan failed validation");
  }
  if (row.status !== "draft" && row.status !== "approved") {
    throw new Error("Stored implementation plan has an invalid status");
  }
  return {
    ...parsed,
    status: row.status,
    estimatedModelCents: row.estimatedModelCents,
    estimatedExecutionSeconds: row.estimatedExecutionSeconds,
    approvedBy: row.approvedBy,
    approvedAt: row.approvedAt,
    createdAt: row.createdAt,
  };
}

function publicExecutionJob(row: ExecutionJobRow): ExecutionJobRecord {
  return omit(row, "leaseTokenHash");
}

function firstBatchRow<T>(result: D1Result<unknown>): T | null {
  return (result.results[0] as T | undefined) ?? null;
}

function parseJsonArray<T>(value: string): T[] {
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed)) throw new Error("Stored JSON is not an array");
  return parsed as T[];
}

function parseJsonRecord(value: string): Record<string, unknown> {
  return parseJsonObject<Record<string, unknown>>(value);
}

function parseJsonObject<T extends object>(value: string): T {
  const parsed: unknown = JSON.parse(value);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Stored JSON is not an object");
  }
  return parsed as T;
}

function omit<T extends object, K extends keyof T>(
  value: T,
  ...keys: K[]
): Omit<T, K> {
  const copy = { ...value };
  for (const key of keys) delete copy[key];
  return copy;
}

function slugify(value: string): string {
  const slug = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 52)
    .replace(/-$/g, "");
  return slug || "project";
}
