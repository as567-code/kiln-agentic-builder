import { Sandbox } from "@vercel/sandbox";
import { createHash } from "node:crypto";
import { normalizeWorkspacePath } from "../../../packages/contracts/src/policy.ts";
import {
  approvedCommand,
  assertApprovedCommand,
  installNetworkPolicy,
} from "./policy.ts";
import { sanitizeLog } from "./redaction.ts";
import type {
  CheckEvidence,
  CheckId,
  ExecutionContract,
  GeneratedFile,
  IsolatedSandbox,
  SandboxProvider,
  SandboxSpec,
} from "./types.ts";

const WORKSPACE = "/vercel/sandbox/workspace";
const MIN_TIMEOUT_MS = 60_000;
const MAX_TIMEOUT_MS = 10 * 60_000;
const MAX_FILES = 40;
const MAX_FILE_BYTES = 256 * 1024;
const MAX_TOTAL_BYTES = 1024 * 1024;
const CONTRACT_PATH = "/vercel/sandbox/kiln-contract.json";
const GENERATED_PATHS = new Set([
  "backend/app/generated_contract.py",
  "backend/app/api/generated_contract.py",
  "backend/alembic/versions/0002_generated_contract.py",
  "frontend/src/generated-contract.ts",
]);

export class VercelSandboxProvider implements SandboxProvider {
  async create(spec: SandboxSpec): Promise<IsolatedSandbox> {
    assertSandboxSpec(spec);
    const credentials = explicitCredentials();
    const common = {
      ...credentials,
      name: `kiln-${spec.runId.slice(4, 24)}-${crypto.randomUUID().slice(0, 8)}`,
      timeout: spec.timeoutMs,
      ports: spec.ports,
      resources: { vcpus: spec.vcpus },
      networkPolicy: installNetworkPolicy,
      persistent: false,
      env: {
        KILN_RUN_ID: spec.runId,
        KILN_CONTRACT_PATH: CONTRACT_PATH,
        CI: "1",
        NODE_ENV: "test",
        PYTHONDONTWRITEBYTECODE: "1",
      },
      tags: { product: "kiln", run: spec.runId.slice(4, 24) },
    } as const;
    const snapshotId = process.env.KILN_BLUEPRINT_SNAPSHOT_ID;
    const sandbox = snapshotId
      ? await Sandbox.create({
          ...common,
          source: { type: "snapshot", snapshotId },
        })
      : await Sandbox.create({ ...common, runtime: "node24" });
    return new VercelSandboxSession(sandbox);
  }
}

class VercelSandboxSession implements IsolatedSandbox {
  readonly id: string;
  private readonly sandbox: Sandbox;

  constructor(sandbox: Sandbox) {
    this.sandbox = sandbox;
    this.id = sandbox.name;
  }

  async writeGeneratedFiles(files: GeneratedFile[]): Promise<void> {
    const validated = validateGeneratedFiles(files);
    await this.sandbox.writeFiles(
      validated.map((file) => ({
        path: `${WORKSPACE}/${file.path}`,
        content: file.content,
        mode: 0o640,
      })),
    );
  }

  async writeTrustedContract(contract: ExecutionContract): Promise<void> {
    const content = JSON.stringify(contract);
    if (new TextEncoder().encode(content).byteLength > 64 * 1024) {
      throw new Error("Execution contract exceeds executor policy");
    }
    await this.sandbox.writeFiles([
      { path: CONTRACT_PATH, content, mode: 0o440 },
    ]);
  }

  async lockNetwork(): Promise<void> {
    await this.sandbox.updateNetworkPolicy("deny-all");
  }

  async runCheck(checkId: CheckId): Promise<CheckEvidence> {
    const command = approvedCommand(checkId);
    assertApprovedCommand(command);
    const started = Date.now();
    try {
      const result = await this.sandbox.runCommand({
        cmd: command.command,
        args: command.args,
        cwd: command.cwd,
        timeoutMs: command.timeoutMs,
      });
      const [stdoutRaw, stderrRaw] = await Promise.all([
        result.stdout(),
        result.stderr(),
      ]);
      const stdout = sanitizeLog(stdoutRaw);
      const stderr = sanitizeLog(stderrRaw);
      return {
        checkId,
        status: result.exitCode === 0 ? "passed" : "failed",
        exitCode: result.exitCode,
        durationMs: result.durationMs ?? Date.now() - started,
        stdout: stdout.text,
        stderr: stderr.text,
        outputTruncated: stdout.truncated || stderr.truncated,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Sandbox command failed";
      const sanitized = sanitizeLog(message);
      return {
        checkId,
        status: /timeout/i.test(message) ? "timed_out" : "failed",
        exitCode: null,
        durationMs: Date.now() - started,
        stdout: "",
        stderr: sanitized.text,
        outputTruncated: sanitized.truncated,
      };
    }
  }

  previewUrl(port: number): string {
    return this.sandbox.domain(port);
  }

  async stop(): Promise<void> {
    await this.sandbox.stop();
  }
}

function assertSandboxSpec(spec: SandboxSpec): void {
  if (!/^run_[a-f0-9]{32}$/.test(spec.runId)) {
    throw new Error("Executor run ID is invalid");
  }
  if (spec.timeoutMs < MIN_TIMEOUT_MS || spec.timeoutMs > MAX_TIMEOUT_MS) {
    throw new Error("Executor timeout is outside the allowed range");
  }
  if (![1, 2, 4].includes(spec.vcpus)) {
    throw new Error("Executor CPU request is outside the allowed range");
  }
  if (
    spec.ports.length > 2 ||
    new Set(spec.ports).size !== spec.ports.length ||
    spec.ports.some((port) => port !== 4173 && port !== 8000)
  ) {
    throw new Error("Executor port request is outside the allowlist");
  }
}

function validateGeneratedFiles(files: GeneratedFile[]): GeneratedFile[] {
  if (files.length < 1 || files.length > MAX_FILES) {
    throw new Error("Generated file count exceeds executor policy");
  }
  let totalBytes = 0;
  const paths = new Set<string>();
  return files.map((file) => {
    const path = normalizeWorkspacePath(file.path);
    if (!GENERATED_PATHS.has(path)) {
      throw new Error("Generated file path is outside the extension allowlist");
    }
    if (paths.has(path)) throw new Error("Generated file paths must be unique");
    paths.add(path);
    if (file.content.includes("\0")) throw new Error("Generated file contains a null byte");
    const bytes = new TextEncoder().encode(file.content).byteLength;
    totalBytes += bytes;
    if (bytes > MAX_FILE_BYTES || totalBytes > MAX_TOTAL_BYTES) {
      throw new Error("Generated file content exceeds executor policy");
    }
    const digest = createHash("sha256").update(file.content).digest("hex");
    if (digest !== file.sha256) throw new Error("Generated file hash is stale");
    return { path, content: file.content, sha256: file.sha256 };
  });
}

function explicitCredentials():
  | { token: string; teamId: string; projectId: string }
  | Record<string, never> {
  const token = process.env.VERCEL_TOKEN;
  const teamId = process.env.VERCEL_TEAM_ID;
  const projectId = process.env.VERCEL_PROJECT_ID;
  if (token && teamId && projectId) return { token, teamId, projectId };
  return {};
}
