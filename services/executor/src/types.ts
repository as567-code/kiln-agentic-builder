import type {
  ExecutionContract,
  VerificationCheckId,
} from "../../../packages/contracts/src/execution.ts";

export type GeneratedFile = {
  path: string;
  content: string;
  sha256: string;
};

export type CheckId = VerificationCheckId;

export type CheckEvidence = {
  checkId: CheckId;
  status: "passed" | "failed" | "timed_out";
  exitCode: number | null;
  durationMs: number;
  stdout: string;
  stderr: string;
  outputTruncated: boolean;
};

export type SandboxSpec = {
  runId: string;
  timeoutMs: number;
  vcpus: 1 | 2 | 4;
  ports: number[];
};

export interface IsolatedSandbox {
  readonly id: string;
  writeGeneratedFiles(files: GeneratedFile[]): Promise<void>;
  writeTrustedContract(contract: ExecutionContract): Promise<void>;
  lockNetwork(): Promise<void>;
  runCheck(checkId: CheckId): Promise<CheckEvidence>;
  previewUrl(port: number): string;
  stop(): Promise<void>;
}

export interface SandboxProvider {
  create(spec: SandboxSpec): Promise<IsolatedSandbox>;
}

export type { ExecutionContract };

export type VerificationReport = {
  provider: string;
  sandboxId: string;
  status: "passed" | "failed";
  checks: CheckEvidence[];
  startedAt: string;
  completedAt: string;
};
