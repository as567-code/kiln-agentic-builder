import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { ApiError } from "../lib/server/api-error.ts";
import { requireApiPrincipal } from "../lib/server/auth.ts";
import { readJsonObject } from "../lib/server/http.ts";
import { parseContractDraft } from "../lib/server/input.ts";
import { KilnStore } from "../lib/server/store.ts";
import { verificationCheckIds } from "../packages/contracts/src/execution.ts";

type SqlValue = null | number | bigint | string;

class SqliteD1Statement {
  private readonly database: DatabaseSync;
  private readonly sql: string;
  private readonly values: SqlValue[];

  constructor(
    database: DatabaseSync,
    sql: string,
    values: SqlValue[] = [],
  ) {
    this.database = database;
    this.sql = sql;
    this.values = values;
  }

  bind(...values: unknown[]): SqliteD1Statement {
    return new SqliteD1Statement(this.database, this.sql, values.map(toSqlValue));
  }

  async first<T>(): Promise<T | null> {
    const row = this.database.prepare(this.sql).get(...this.values);
    return (row as T | undefined) ?? null;
  }

  async all<T>(): Promise<D1Result<T>> {
    return this.execute<T>();
  }

  execute<T>(): D1Result<T> {
    const statement = this.database.prepare(this.sql);
    const rows = statement.all(...this.values) as T[];
    return {
      results: rows,
      success: true,
      meta: {
        changed_db: true,
        changes: 0,
        duration: 0,
        last_row_id: 0,
        rows_read: rows.length,
        rows_written: 0,
        size_after: 0,
      },
    };
  }
}

class SqliteD1Database {
  readonly database = new DatabaseSync(":memory:", {
    enableForeignKeyConstraints: true,
  });

  constructor() {
    const migrations = [
      "../drizzle/0000_brief_skaar.sql",
      "../drizzle/0001_control_plane_depth.sql",
      "../drizzle/0002_implementation_plans.sql",
      "../drizzle/0003_snapshot_tombstones.sql",
      "../drizzle/0004_durable_execution_jobs.sql",
    ];
    for (const migration of migrations) {
      this.database.exec(readFileSync(new URL(migration, import.meta.url), "utf8"));
    }
  }

  prepare(sql: string): SqliteD1Statement {
    return new SqliteD1Statement(this.database, sql);
  }

  async batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const results = statements.map((statement) =>
        (statement as unknown as SqliteD1Statement).execute<T>(),
      );
      this.database.exec("COMMIT");
      return results;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  close(): void {
    this.database.close();
  }
}

const validContract = {
  title: "Inventory workspace",
  summary: "Track bakery ingredients and reorder levels with durable data.",
  requirements: [
    {
      id: "req_inventory",
      statement: "Track ingredient quantities and reorder thresholds",
      priority: "must",
    },
    {
      id: "req_accessibility",
      statement: "Support keyboard and mobile workflows",
      priority: "should",
    },
  ],
  systemShape: {
    pages: ["Overview", "Inventory"],
    entities: [
      {
        name: "Ingredient",
        fields: [
          { name: "name", type: "string", required: true },
          { name: "quantity", type: "decimal", required: true },
        ],
      },
    ],
    apiOperations: [
      { method: "GET", path: "/api/ingredients", purpose: "List ingredients" },
      { method: "POST", path: "/api/ingredients", purpose: "Create ingredient" },
    ],
  },
  acceptanceChecks: [
    {
      id: "check_inventory",
      requirementId: "req_inventory",
      description: "Ingredient records persist through the API",
      kind: "api",
    },
    {
      id: "check_accessibility",
      requirementId: "req_accessibility",
      description: "Primary flow passes keyboard checks",
      kind: "accessibility",
    },
  ],
  assumptions: ["Uses the maintained React and FastAPI blueprint"],
};

test("persists an owned project, contract, run, events, and audit lifecycle", async (t) => {
  const adapter = new SqliteD1Database();
  t.after(() => adapter.close());
  const store = new KilnStore(adapter as unknown as D1Database);
  const ownerId = "usr_test_owner";

  const project = await store.createProject(ownerId, {
    name: "Pantry Pilot",
    summary: "Bakery inventory tracker",
  });
  assert.equal(project.ownerId, ownerId);
  assert.equal(project.archived, false);

  await assert.rejects(
    store.getProject("usr_other_tenant", project.id),
    (error) => error instanceof ApiError && error.status === 404,
  );

  const contract = await store.createContract(
    ownerId,
    project.id,
    parseContractDraft(validContract),
  );
  assert.equal(contract.revision, 1);
  assert.equal(contract.status, "draft");

  const approved = await store.approveContract(
    ownerId,
    project.id,
    contract.id,
  );
  assert.equal(approved.status, "approved");

  const run = await store.createRun(ownerId, project.id, {
    contractId: contract.id,
    budgetCents: 125,
  });
  assert.equal(run.status, "plan");

  const detail = await store.getRunDetails(ownerId, run.id);
  assert.equal(detail.plan.status, "draft");
  assert.equal(detail.plan.steps.length, 6);
  assert.equal(detail.steps.length, 5);
  assert.equal(detail.steps[1]?.state, "active");
  assert.deepEqual(
    (await store.listRunEvents(ownerId, run.id, 0)).map((event) => event.type),
    ["run.created"],
  );

  const approvedPlan = await store.approvePlan(ownerId, run.id);
  assert.equal(approvedPlan.plan.status, "approved");
  assert.equal(approvedPlan.run.status, "user_approval");

  const cancelled = await store.cancelRun(ownerId, run.id);
  assert.equal(cancelled.status, "cancelled");
  assert.equal(cancelled.cancellationRequested, true);
  assert.deepEqual(
    (await store.listRunEvents(ownerId, run.id, 1)).map((event) => event.type),
    ["plan.approved", "run.cancelled"],
  );

  const audit = await store.listAuditEvents(ownerId, project.id);
  assert.deepEqual(
    audit.map((event) => event.action),
    [
      "run.cancelled",
      "implementation_plan.approved",
      "run.created",
      "contract.approved",
      "contract.drafted",
      "project.created",
    ],
  );
});

test("enforces mutation rate windows", async (t) => {
  const adapter = new SqliteD1Database();
  t.after(() => adapter.close());
  const store = new KilnStore(adapter as unknown as D1Database);

  await store.consumeRateLimit("usr_rate_test", "build.create", 1);
  await assert.rejects(
    store.consumeRateLimit("usr_rate_test", "build.create", 1),
    (error) => error instanceof ApiError && error.status === 429,
  );
});

test("records approved generation as immutable patches and source snapshots", async (t) => {
  const adapter = new SqliteD1Database();
  t.after(() => adapter.close());
  const store = new KilnStore(adapter as unknown as D1Database);
  const ownerId = "usr_patch_owner";
  const project = await store.createProject(ownerId, {
    name: "Volunteer Roster",
    summary: "Coordinate volunteer shifts",
  });
  const contract = await store.createContract(
    ownerId,
    project.id,
    parseContractDraft(validContract),
  );
  await store.approveContract(ownerId, project.id, contract.id);
  const run = await store.createRun(ownerId, project.id, {
    contractId: contract.id,
    budgetCents: 150,
  });
  await store.approvePlan(ownerId, run.id);

  const scaffolding = await store.startGeneration(ownerId, run.id);
  assert.equal(scaffolding.status, "scaffold");
  const generating = await store.completeScaffold(ownerId, run.id, {
    objectKey: `runs/${run.id}/blueprint/manifest.json`,
    contentType: "application/json",
    sha256: "a".repeat(64),
    sizeBytes: 320,
  });
  assert.equal(generating.status, "generate_patches");
  assert.equal(await store.nextPatchSequence(ownerId, run.id), 1);

  const sourcePath = "frontend/src/generated-contract.ts";
  const first = await store.recordPatch(ownerId, run.id, {
    sequence: 1,
    draft: {
      summary: "Add typed generated contract",
      rationale: "Keep generated scope tied to the approved contract",
      requirementIds: ["req_inventory"],
      changes: [
        {
          path: sourcePath,
          operation: "add",
          content: "export const contractVersion = 1;\n",
        },
      ],
    },
    artifact: {
      objectKey: `runs/${run.id}/patches/001.json`,
      contentType: "application/json",
      sha256: "b".repeat(64),
      sizeBytes: 512,
    },
    snapshots: [
      {
        path: sourcePath,
        objectKey: `runs/${run.id}/files/001/${sourcePath}`,
        contentType: "text/plain; charset=utf-8",
        sha256: "c".repeat(64),
        sizeBytes: 34,
        language: "typescript",
        deleted: false,
      },
    ],
    provenance: {
      planner: "test-planner",
      model: "test-model",
      providerRequestId: "resp_patch_1",
      inputTokens: 100,
      outputTokens: 80,
      totalTokens: 180,
    },
  });

  assert.equal(first.sequence, 1);
  assert.equal(first.patchHash, "b".repeat(64));
  assert.equal(await store.nextPatchSequence(ownerId, run.id), 2);
  const snapshots = await store.listLatestFileSnapshots(ownerId, run.id, [sourcePath]);
  assert.equal(snapshots.length, 1);
  assert.equal(snapshots[0]?.sha256, "c".repeat(64));
  assert.equal(snapshots[0]?.deleted, false);
  await assert.rejects(
    store.listLatestFileSnapshots("usr_other_tenant", run.id, [sourcePath]),
    (error) => error instanceof ApiError && error.status === 404,
  );
  assert.deepEqual(
    (await store.listRunEvents(ownerId, run.id, 0)).map((event) => event.type),
    [
      "run.created",
      "plan.approved",
      "generation.started",
      "scaffold.completed",
      "patch.accepted",
    ],
  );

  const queued = await store.queueVerification(ownerId, run.id, {
    objectKey: `runs/${run.id}/execution/input.json`,
    contentType: "application/json",
    sha256: "d".repeat(64),
    sizeBytes: 900,
  });
  assert.equal(queued.run.status, "static_check");
  assert.equal(queued.job.status, "queued");
  const leaseHash = "e".repeat(64);
  const claimed = await store.claimExecutionJob(leaseHash);
  assert.equal(claimed?.id, queued.job.id);
  assert.equal(claimed?.status, "leased");
  assert.equal(claimed?.attempt, 1);

  const completed = await store.completeExecutionJob(
    queued.job.id,
    leaseHash,
    {
      objectKey: `jobs/${queued.job.id}/verification.json`,
      contentType: "application/json",
      sha256: "f".repeat(64),
      sizeBytes: 1_400,
    },
    {
      provider: "test-firecracker",
      sandboxId: "sandbox_test",
      status: "passed",
      checks: verificationCheckIds.map((checkId) => ({
        checkId,
        status: "passed" as const,
        exitCode: 0,
        durationMs: 10,
        stdout: "ok",
        stderr: "",
        outputTruncated: false,
      })),
      startedAt: "2026-08-16T08:00:00.000Z",
      completedAt: "2026-08-16T08:00:01.000Z",
    },
  );
  assert.equal(completed.run.status, "ready");
  assert.equal(completed.job.status, "completed");
  const verifiedDetail = await store.getRunDetails(ownerId, run.id);
  assert.equal(verifiedDetail.tests.length, verificationCheckIds.length);
  assert.equal(verifiedDetail.executionJobs[0]?.status, "completed");
  assert.equal(
    verifiedDetail.artifacts.some((artifact) => artifact.kind === "verification_report"),
    true,
  );
});

test("bounds repair patches and re-verifies from trusted failure evidence", async (t) => {
  const adapter = new SqliteD1Database();
  t.after(() => adapter.close());
  const store = new KilnStore(adapter as unknown as D1Database);
  const ownerId = "usr_repair_owner";
  const { runId, sourcePath } = await createGeneratedRun(store, ownerId);

  const firstQueue = await store.queueVerification(ownerId, runId, {
    objectKey: `runs/${runId}/execution/first.json`,
    contentType: "application/json",
    sha256: "d".repeat(64),
    sizeBytes: 900,
  });
  const firstLease = "e".repeat(64);
  await store.claimExecutionJob(firstLease);
  const failed = await store.completeExecutionJob(
    firstQueue.job.id,
    firstLease,
    {
      objectKey: `jobs/${firstQueue.job.id}/verification.json`,
      contentType: "application/json",
      sha256: "f".repeat(64),
      sizeBytes: 1_000,
    },
    {
      provider: "test-firecracker",
      sandboxId: "sandbox_failed",
      status: "failed",
      checks: [{
        checkId: verificationCheckIds[0],
        status: "failed",
        exitCode: 2,
        durationMs: 12,
        stdout: "",
        stderr: "typed diagnostic",
        outputTruncated: false,
      }],
      startedAt: "2026-08-16T08:00:00.000Z",
      completedAt: "2026-08-16T08:00:01.000Z",
    },
  );
  assert.equal(failed.run.status, "diagnose");

  const repairing = await store.beginRepair(ownerId, runId);
  assert.equal(repairing.status, "repair_patch");
  assert.equal(repairing.attempt, 1);
  await assert.rejects(
    store.beginRepair("usr_other_tenant", runId),
    (error) => error instanceof ApiError && error.status === 404,
  );
  await assert.rejects(
    store.queueVerification(ownerId, runId, {
      objectKey: `runs/${runId}/execution/missing-repair.json`,
      contentType: "application/json",
      sha256: "0".repeat(64),
      sizeBytes: 900,
    }),
    (error) => error instanceof ApiError && error.code === "repair_patch_required",
  );

  await store.recordPatch(ownerId, runId, {
    sequence: 2,
    draft: {
      summary: "Repair the typed generated contract",
      rationale: "Apply sanitized verification diagnostics without changing policy",
      requirementIds: ["req_inventory"],
      changes: [{
        path: sourcePath,
        operation: "replace",
        expectedSha256: "c".repeat(64),
        content: "export const contractVersion = 2;\n",
      }],
    },
    artifact: {
      objectKey: `runs/${runId}/patches/002.json`,
      contentType: "application/json",
      sha256: "1".repeat(64),
      sizeBytes: 520,
    },
    snapshots: [{
      path: sourcePath,
      objectKey: `runs/${runId}/files/002/${sourcePath}`,
      contentType: "text/plain; charset=utf-8",
      sha256: "2".repeat(64),
      sizeBytes: 34,
      language: "typescript",
      deleted: false,
    }],
    provenance: {
      planner: "test-repair-planner",
      model: "test-model",
      providerRequestId: "resp_repair_1",
      inputTokens: 80,
      outputTokens: 60,
      totalTokens: 140,
    },
  });

  const secondQueue = await store.queueVerification(ownerId, runId, {
    objectKey: `runs/${runId}/execution/repair-1.json`,
    contentType: "application/json",
    sha256: "3".repeat(64),
    sizeBytes: 940,
  });
  const secondLease = "4".repeat(64);
  await store.claimExecutionJob(secondLease);
  const repaired = await store.completeExecutionJob(
    secondQueue.job.id,
    secondLease,
    {
      objectKey: `jobs/${secondQueue.job.id}/verification.json`,
      contentType: "application/json",
      sha256: "5".repeat(64),
      sizeBytes: 1_500,
    },
    {
      provider: "test-firecracker",
      sandboxId: "sandbox_repaired",
      status: "passed",
      checks: verificationCheckIds.map((checkId) => ({
        checkId,
        status: "passed" as const,
        exitCode: 0,
        durationMs: 10,
        stdout: "ok",
        stderr: "",
        outputTruncated: false,
      })),
      startedAt: "2026-08-16T08:01:00.000Z",
      completedAt: "2026-08-16T08:01:02.000Z",
    },
  );
  assert.equal(repaired.run.status, "ready");
  assert.equal(repaired.run.progress, 100);
  const detail = await store.getRunDetails(ownerId, runId);
  assert.equal(detail.findings.every((finding) => finding.status === "resolved"), true);
  assert.equal(detail.executionJobs.length, 2);
  assert.equal(
    (await store.listRunEvents(ownerId, runId, 0)).some(
      (event) => event.type === "repair.started",
    ),
    true,
  );
});

test("ends with evidence when the repair budget is exhausted", async (t) => {
  const adapter = new SqliteD1Database();
  t.after(() => adapter.close());
  const store = new KilnStore(adapter as unknown as D1Database);
  const ownerId = "usr_exhausted_owner";
  const { runId } = await createGeneratedRun(store, ownerId);
  adapter.database
    .prepare("UPDATE runs SET attempt = max_attempts WHERE id = ?")
    .run(runId);
  const queued = await store.queueVerification(ownerId, runId, {
    objectKey: `runs/${runId}/execution/exhausted.json`,
    contentType: "application/json",
    sha256: "6".repeat(64),
    sizeBytes: 900,
  });
  const lease = "7".repeat(64);
  await store.claimExecutionJob(lease);
  const result = await store.completeExecutionJob(
    queued.job.id,
    lease,
    {
      objectKey: `jobs/${queued.job.id}/verification.json`,
      contentType: "application/json",
      sha256: "8".repeat(64),
      sizeBytes: 1_000,
    },
    {
      provider: "test-firecracker",
      sandboxId: "sandbox_exhausted",
      status: "failed",
      checks: [{
        checkId: verificationCheckIds[0],
        status: "failed",
        exitCode: 2,
        durationMs: 12,
        stdout: "",
        stderr: "still failing",
        outputTruncated: false,
      }],
      startedAt: "2026-08-16T08:03:00.000Z",
      completedAt: "2026-08-16T08:03:01.000Z",
    },
  );
  assert.equal(result.run.status, "failed_with_evidence");
  assert.equal(result.run.progress, 100);
  assert.notEqual(result.run.completedAt, null);
  await assert.rejects(
    store.beginRepair(ownerId, runId),
    (error) => error instanceof ApiError && error.code === "repair_not_allowed",
  );
});

test("validates authenticated identity and rejects cross-origin JSON mutations", async () => {
  const authenticated = requireApiPrincipal(
    new Request("https://kiln.example/api/projects", {
      headers: {
        "oai-authenticated-user-id": "usr_authenticated",
        "oai-authenticated-user-email": "builder@example.test",
      },
    }),
  );
  assert.equal(authenticated.id, "usr_authenticated");
  assert.equal(authenticated.authSource, "chatgpt");

  const crossOrigin = new Request("https://kiln.example/api/projects", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://attacker.example",
    },
    body: JSON.stringify({ name: "Blocked" }),
  });
  await assert.rejects(
    readJsonObject(crossOrigin),
    (error) => error instanceof ApiError && error.status === 403,
  );
});

test("rejects contract fields that do not map to an approved requirement", () => {
  const invalid = structuredClone(validContract);
  invalid.acceptanceChecks[0]!.requirementId = "req_missing";
  assert.throws(
    () => parseContractDraft(invalid),
    (error) => error instanceof ApiError && error.code === "invalid_request",
  );
});

async function createGeneratedRun(
  store: KilnStore,
  ownerId: string,
): Promise<{ runId: string; sourcePath: string }> {
  const project = await store.createProject(ownerId, {
    name: "Repair workspace",
    summary: "Exercise the bounded repair lifecycle",
  });
  const contract = await store.createContract(
    ownerId,
    project.id,
    parseContractDraft(validContract),
  );
  await store.approveContract(ownerId, project.id, contract.id);
  const run = await store.createRun(ownerId, project.id, {
    contractId: contract.id,
    budgetCents: 150,
  });
  await store.approvePlan(ownerId, run.id);
  await store.startGeneration(ownerId, run.id);
  await store.completeScaffold(ownerId, run.id, {
    objectKey: `runs/${run.id}/blueprint/manifest.json`,
    contentType: "application/json",
    sha256: "a".repeat(64),
    sizeBytes: 320,
  });
  const sourcePath = "frontend/src/generated-contract.ts";
  await store.recordPatch(ownerId, run.id, {
    sequence: 1,
    draft: {
      summary: "Add typed generated contract",
      rationale: "Keep generated scope tied to the approved contract",
      requirementIds: ["req_inventory"],
      changes: [{
        path: sourcePath,
        operation: "add",
        content: "export const contractVersion = 1;\n",
      }],
    },
    artifact: {
      objectKey: `runs/${run.id}/patches/001.json`,
      contentType: "application/json",
      sha256: "b".repeat(64),
      sizeBytes: 512,
    },
    snapshots: [{
      path: sourcePath,
      objectKey: `runs/${run.id}/files/001/${sourcePath}`,
      contentType: "text/plain; charset=utf-8",
      sha256: "c".repeat(64),
      sizeBytes: 34,
      language: "typescript",
      deleted: false,
    }],
    provenance: {
      planner: "test-planner",
      model: "test-model",
      providerRequestId: "resp_patch_1",
      inputTokens: 100,
      outputTokens: 80,
      totalTokens: 180,
    },
  });
  return { runId: run.id, sourcePath };
}

function toSqlValue(value: unknown): SqlValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "bigint"
  ) {
    return value;
  }
  throw new TypeError(`Unsupported SQLite binding: ${typeof value}`);
}
