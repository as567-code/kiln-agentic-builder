import { sql } from "drizzle-orm";
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const timestamp = (name: string) =>
  text(name).notNull().default(sql`CURRENT_TIMESTAMP`);

export const projects = sqliteTable(
  "projects",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    summary: text("summary").notNull().default(""),
    status: text("status").notNull().default("draft"),
    archived: integer("archived", { mode: "boolean" }).notNull().default(false),
    createdAt: timestamp("created_at"),
    updatedAt: timestamp("updated_at"),
  },
  (table) => [
    uniqueIndex("uq_projects_owner_slug").on(table.ownerId, table.slug),
    index("idx_projects_owner_updated").on(table.ownerId, table.updatedAt),
  ],
);

export const buildContracts = sqliteTable(
  "build_contracts",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    revision: integer("revision").notNull(),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    requirementsJson: text("requirements_json").notNull(),
    systemShapeJson: text("system_shape_json").notNull(),
    acceptanceChecksJson: text("acceptance_checks_json").notNull(),
    assumptionsJson: text("assumptions_json").notNull().default("[]"),
    status: text("status").notNull().default("draft"),
    approvedBy: text("approved_by"),
    approvedAt: text("approved_at"),
    createdAt: timestamp("created_at"),
  },
  (table) => [
    uniqueIndex("uq_build_contracts_project_revision").on(
      table.projectId,
      table.revision,
    ),
    index("idx_build_contracts_project_created").on(
      table.projectId,
      table.createdAt,
    ),
  ],
);

export const runs = sqliteTable(
  "runs",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    contractId: text("contract_id")
      .notNull()
      .references(() => buildContracts.id, { onDelete: "restrict" }),
    status: text("status").notNull().default("intake"),
    currentStep: text("current_step").notNull().default("intake"),
    progress: integer("progress").notNull().default(0),
    attempt: integer("attempt").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(3),
    budgetCents: integer("budget_cents").notNull().default(100),
    costCents: integer("cost_cents").notNull().default(0),
    cancellationRequested: integer("cancellation_requested", { mode: "boolean" })
      .notNull()
      .default(false),
    errorCode: text("error_code"),
    errorSummary: text("error_summary"),
    createdAt: timestamp("created_at"),
    updatedAt: timestamp("updated_at"),
    completedAt: text("completed_at"),
  },
  (table) => [
    index("idx_runs_project_created").on(table.projectId, table.createdAt),
    index("idx_runs_status_updated").on(table.status, table.updatedAt),
  ],
);

export const runSteps = sqliteTable(
  "run_steps",
  {
    id: text("id").primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    sequence: integer("sequence").notNull(),
    kind: text("kind").notNull(),
    state: text("state").notNull().default("waiting"),
    label: text("label").notNull(),
    detail: text("detail").notNull().default(""),
    evidenceJson: text("evidence_json").notNull().default("{}"),
    startedAt: text("started_at"),
    completedAt: text("completed_at"),
    createdAt: timestamp("created_at"),
  },
  (table) => [
    uniqueIndex("uq_run_steps_run_sequence").on(table.runId, table.sequence),
    index("idx_run_steps_run_state").on(table.runId, table.state),
  ],
);

export const implementationPlans = sqliteTable(
  "implementation_plans",
  {
    id: text("id").primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    revision: integer("revision").notNull().default(1),
    planJson: text("plan_json").notNull(),
    estimatedModelCents: integer("estimated_model_cents").notNull(),
    estimatedExecutionSeconds: integer("estimated_execution_seconds").notNull(),
    status: text("status").notNull().default("draft"),
    approvedBy: text("approved_by"),
    approvedAt: text("approved_at"),
    createdAt: timestamp("created_at"),
  },
  (table) => [
    uniqueIndex("uq_implementation_plans_run_revision").on(
      table.runId,
      table.revision,
    ),
    index("idx_implementation_plans_run_status").on(table.runId, table.status),
  ],
);

export const patches = sqliteTable(
  "patches",
  {
    id: text("id").primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    sequence: integer("sequence").notNull(),
    summary: text("summary").notNull(),
    patchHash: text("patch_hash").notNull(),
    filesChanged: integer("files_changed").notNull(),
    additions: integer("additions").notNull().default(0),
    deletions: integer("deletions").notNull().default(0),
    artifactKey: text("artifact_key").notNull(),
    createdAt: timestamp("created_at"),
  },
  (table) => [
    uniqueIndex("uq_patches_run_sequence").on(table.runId, table.sequence),
  ],
);

export const findings = sqliteTable(
  "findings",
  {
    id: text("id").primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    source: text("source").notNull(),
    category: text("category").notNull(),
    severity: text("severity").notNull(),
    title: text("title").notNull(),
    detail: text("detail").notNull().default(""),
    status: text("status").notNull().default("open"),
    fingerprint: text("fingerprint").notNull(),
    createdAt: timestamp("created_at"),
  },
  (table) => [
    uniqueIndex("uq_findings_run_fingerprint").on(table.runId, table.fingerprint),
    index("idx_findings_run_severity").on(table.runId, table.severity),
  ],
);

export const artifacts = sqliteTable(
  "artifacts",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    runId: text("run_id").references(() => runs.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    objectKey: text("object_key").notNull(),
    contentType: text("content_type").notNull(),
    sha256: text("sha256").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    createdAt: timestamp("created_at"),
    expiresAt: text("expires_at"),
  },
  (table) => [
    uniqueIndex("uq_artifacts_object_key").on(table.objectKey),
    index("idx_artifacts_owner_project").on(table.ownerId, table.projectId),
  ],
);

export const deployments = sqliteTable(
  "deployments",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    runId: text("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "restrict" }),
    artifactId: text("artifact_id")
      .notNull()
      .references(() => artifacts.id, { onDelete: "restrict" }),
    provider: text("provider").notNull(),
    providerRef: text("provider_ref"),
    visibility: text("visibility").notNull().default("private"),
    status: text("status").notNull().default("pending"),
    publicUrl: text("public_url"),
    approvedAt: text("approved_at").notNull(),
    createdAt: timestamp("created_at"),
    updatedAt: timestamp("updated_at"),
  },
  (table) => [
    index("idx_deployments_owner_project").on(table.ownerId, table.projectId),
  ],
);

export const auditEvents = sqliteTable(
  "audit_events",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    projectId: text("project_id"),
    actorType: text("actor_type").notNull(),
    action: text("action").notNull(),
    subjectType: text("subject_type").notNull(),
    subjectId: text("subject_id").notNull(),
    policyDecision: text("policy_decision").notNull(),
    metadataJson: text("metadata_json").notNull().default("{}"),
    createdAt: timestamp("created_at"),
  },
  (table) => [
    index("idx_audit_events_owner_created").on(table.ownerId, table.createdAt),
    index("idx_audit_events_project_created").on(table.projectId, table.createdAt),
  ],
);

export const runEvents = sqliteTable(
  "run_events",
  {
    id: text("id").primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    sequence: integer("sequence").notNull(),
    type: text("type").notNull(),
    dataJson: text("data_json").notNull().default("{}"),
    createdAt: timestamp("created_at"),
  },
  (table) => [
    uniqueIndex("uq_run_events_run_sequence").on(table.runId, table.sequence),
    index("idx_run_events_run_created").on(table.runId, table.createdAt),
  ],
);

export const fileSnapshots = sqliteTable(
  "file_snapshots",
  {
    id: text("id").primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    patchId: text("patch_id").references(() => patches.id, { onDelete: "set null" }),
    revision: integer("revision").notNull(),
    path: text("path").notNull(),
    objectKey: text("object_key").notNull(),
    sha256: text("sha256").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    language: text("language").notNull().default("text"),
    deleted: integer("deleted", { mode: "boolean" }).notNull().default(false),
    createdAt: timestamp("created_at"),
  },
  (table) => [
    uniqueIndex("uq_file_snapshots_run_path_revision").on(
      table.runId,
      table.path,
      table.revision,
    ),
    index("idx_file_snapshots_run_revision").on(table.runId, table.revision),
  ],
);

export const sandboxSessions = sqliteTable(
  "sandbox_sessions",
  {
    id: text("id").primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    providerRef: text("provider_ref"),
    status: text("status").notNull().default("provisioning"),
    previewUrl: text("preview_url"),
    expiresAt: text("expires_at").notNull(),
    createdAt: timestamp("created_at"),
    updatedAt: timestamp("updated_at"),
  },
  (table) => [
    uniqueIndex("uq_sandbox_sessions_run").on(table.runId),
    index("idx_sandbox_sessions_status_expiry").on(table.status, table.expiresAt),
  ],
);

export const testRuns = sqliteTable(
  "test_runs",
  {
    id: text("id").primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    status: text("status").notNull(),
    commandLabel: text("command_label").notNull(),
    passed: integer("passed").notNull().default(0),
    failed: integer("failed").notNull().default(0),
    durationMs: integer("duration_ms").notNull().default(0),
    reportArtifactId: text("report_artifact_id").references(() => artifacts.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at"),
  },
  (table) => [index("idx_test_runs_run_kind").on(table.runId, table.kind)],
);

export const usageLedger = sqliteTable(
  "usage_ledger",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    runId: text("run_id").references(() => runs.id, { onDelete: "cascade" }),
    category: text("category").notNull(),
    units: integer("units").notNull(),
    unitKind: text("unit_kind").notNull(),
    costMicros: integer("cost_micros").notNull().default(0),
    provider: text("provider"),
    createdAt: timestamp("created_at"),
  },
  (table) => [
    index("idx_usage_ledger_owner_created").on(table.ownerId, table.createdAt),
    index("idx_usage_ledger_run").on(table.runId),
  ],
);

export const apiRateWindows = sqliteTable(
  "api_rate_windows",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    bucket: text("bucket").notNull(),
    windowStart: text("window_start").notNull(),
    requestCount: integer("request_count").notNull().default(1),
    createdAt: timestamp("created_at"),
  },
  (table) => [
    uniqueIndex("uq_api_rate_windows_owner_bucket_window").on(
      table.ownerId,
      table.bucket,
      table.windowStart,
    ),
    index("idx_api_rate_windows_created").on(table.createdAt),
  ],
);

export const executionJobs = sqliteTable(
  "execution_jobs",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    runId: text("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    kind: text("kind").notNull().default("verify"),
    status: text("status").notNull().default("queued"),
    attempt: integer("attempt").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(3),
    payloadArtifactKey: text("payload_artifact_key").notNull(),
    resultArtifactKey: text("result_artifact_key"),
    leaseTokenHash: text("lease_token_hash"),
    leaseExpiresAt: text("lease_expires_at"),
    errorCode: text("error_code"),
    createdAt: timestamp("created_at"),
    updatedAt: timestamp("updated_at"),
    completedAt: text("completed_at"),
  },
  (table) => [
    index("idx_execution_jobs_claim").on(
      table.status,
      table.leaseExpiresAt,
      table.createdAt,
    ),
    index("idx_execution_jobs_run").on(table.runId, table.createdAt),
  ],
);
