import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { dockerRunArguments } from "../services/executor/src/docker-policy.ts";
import {
  approvedCommand,
  assertApprovedCommand,
  blueprintChecks,
} from "../services/executor/src/policy.ts";
import { sanitizeLog } from "../services/executor/src/redaction.ts";
import { verifyGeneratedWorkspace } from "../services/executor/src/runner.ts";
import type {
  CheckEvidence,
  CheckId,
  ExecutionContract,
  GeneratedFile,
  IsolatedSandbox,
  SandboxProvider,
  SandboxSpec,
} from "../services/executor/src/types.ts";

class FakeSandbox implements IsolatedSandbox {
  readonly id = "sandbox_test";
  readonly calls: string[] = [];
  private readonly failAt?: CheckId;

  constructor(failAt?: CheckId) {
    this.failAt = failAt;
  }

  async writeGeneratedFiles(files: GeneratedFile[]): Promise<void> {
    assert.equal(files.length, 1);
    this.calls.push("write");
  }

  async writeTrustedContract(contract: ExecutionContract): Promise<void> {
    assert.equal(contract.title, "Volunteer scheduling");
    this.calls.push("write-contract");
  }

  async lockNetwork(): Promise<void> {
    this.calls.push("lock-network");
  }

  async runCheck(checkId: CheckId): Promise<CheckEvidence> {
    this.calls.push(`check:${checkId}`);
    const failed = checkId === this.failAt;
    return {
      checkId,
      status: failed ? "failed" : "passed",
      exitCode: failed ? 1 : 0,
      durationMs: 5,
      stdout: failed ? "" : "ok",
      stderr: failed ? "failed" : "",
      outputTruncated: false,
    };
  }

  previewUrl(port: number): string {
    return `https://sandbox.example.test:${port}`;
  }

  async stop(): Promise<void> {
    this.calls.push("stop");
  }
}

class FakeProvider implements SandboxProvider {
  readonly sandbox: FakeSandbox;
  spec?: SandboxSpec;

  constructor(failAt?: CheckId) {
    this.sandbox = new FakeSandbox(failAt);
  }

  async create(spec: SandboxSpec): Promise<IsolatedSandbox> {
    this.spec = spec;
    return this.sandbox;
  }
}

const content = "export const generated = true;\n";
const generatedFile: GeneratedFile = {
  path: "frontend/src/generated-contract.ts",
  content,
  sha256: createHash("sha256").update(content).digest("hex"),
};
const executionContract: ExecutionContract = {
  title: "Volunteer scheduling",
  requirementIds: ["req_schedule"],
  entities: [
    {
      name: "Shift",
      fields: [{ name: "capacity", type: "integer", required: true }],
    },
  ],
  apiOperations: [{ method: "GET", path: "/api/shifts" }],
};

test("runs only approved checks after network lockdown and always tears down", async () => {
  const provider = new FakeProvider();
  const report = await verifyGeneratedWorkspace({
    provider,
    providerName: "fake-microvm",
    runId: `run_${"a".repeat(32)}`,
    files: [generatedFile],
    contract: executionContract,
  });

  assert.equal(report.status, "passed");
  assert.equal(report.checks.length, blueprintChecks.length);
  assert.deepEqual(provider.sandbox.calls, [
    "write-contract",
    "write",
    "lock-network",
    ...blueprintChecks.map((check) => `check:${check}`),
    "stop",
  ]);
  assert.equal(provider.spec?.ports.length, 0);
});

test("stops verification at the first failure and still tears down", async () => {
  const provider = new FakeProvider("backend:ruff");
  const report = await verifyGeneratedWorkspace({
    provider,
    providerName: "fake-microvm",
    runId: `run_${"b".repeat(32)}`,
    files: [generatedFile],
    contract: executionContract,
  });

  assert.equal(report.status, "failed");
  assert.deepEqual(
    report.checks.map((check) => check.checkId),
    ["frontend:typecheck", "backend:ruff"],
  );
  assert.equal(provider.sandbox.calls.at(-1), "stop");
});

test("rejects mutated commands outside the deterministic allowlist", () => {
  const command = approvedCommand("frontend:test");
  assert.doesNotThrow(() => assertApprovedCommand(command));
  command.args = ["install", "untrusted-package"];
  assert.throws(() => assertApprovedCommand(command), /allowlist/);
});

test("builds a rootless, network-denied, capability-dropped Docker invocation", () => {
  const args = dockerRunArguments({
    runId: `run_${"c".repeat(32)}`,
    workRoot: "/var/lib/kiln/runs",
    workspace: `/var/lib/kiln/runs/run_${"c".repeat(32)}`,
  });

  assert.ok(args.includes("none"));
  assert.ok(args.includes("--read-only"));
  assert.ok(args.includes("ALL"));
  assert.ok(args.includes("no-new-privileges:true"));
  assert.match(args.at(-1) ?? "", /@sha256:[a-f0-9]{64}$/);
  assert.throws(
    () =>
      dockerRunArguments({
        runId: `run_${"d".repeat(32)}`,
        workRoot: "/var/lib/kiln/runs",
        workspace: "/var/lib/kiln/other",
      }),
    /child/,
  );
});

test("redacts credentials and caps untrusted logs", () => {
  const result = sanitizeLog(
    `Authorization: Bearer abcdefghijklmnopqrstuvwxyz\nDATABASE_URL=postgresql://user:pass@db/private\n${"x".repeat(70_000)}`,
  );
  assert.equal(result.truncated, true);
  assert.doesNotMatch(result.text, /abcdefghijklmnop/);
  assert.doesNotMatch(result.text, /user:pass/);
  assert.match(result.text, /OUTPUT TRUNCATED/);
});
