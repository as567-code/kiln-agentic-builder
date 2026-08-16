import { verificationCheckIds } from "../../../packages/contracts/src/execution.ts";
import type { CheckId } from "./types.ts";

export type ApprovedCommand = {
  checkId: CheckId;
  command: string;
  args: string[];
  cwd: string;
  timeoutMs: number;
};

const WORKSPACE = "/vercel/sandbox/workspace";

const commands: Readonly<Record<CheckId, ApprovedCommand>> = {
  "frontend:typecheck": {
    checkId: "frontend:typecheck",
    command: "npm",
    args: ["run", "typecheck"],
    cwd: `${WORKSPACE}/frontend`,
    timeoutMs: 60_000,
  },
  "frontend:test": {
    checkId: "frontend:test",
    command: "npm",
    args: ["test", "--", "--run"],
    cwd: `${WORKSPACE}/frontend`,
    timeoutMs: 90_000,
  },
  "frontend:build": {
    checkId: "frontend:build",
    command: "npm",
    args: ["run", "build"],
    cwd: `${WORKSPACE}/frontend`,
    timeoutMs: 120_000,
  },
  "backend:ruff": {
    checkId: "backend:ruff",
    command: "python",
    args: ["-m", "ruff", "check", "."],
    cwd: `${WORKSPACE}/backend`,
    timeoutMs: 60_000,
  },
  "backend:mypy": {
    checkId: "backend:mypy",
    command: "python",
    args: ["-m", "mypy", "app", "tests"],
    cwd: `${WORKSPACE}/backend`,
    timeoutMs: 90_000,
  },
  "backend:test": {
    checkId: "backend:test",
    command: "python",
    args: ["-m", "pytest", "-q"],
    cwd: `${WORKSPACE}/backend`,
    timeoutMs: 120_000,
  },
  "backend:migrations": {
    checkId: "backend:migrations",
    command: "python",
    args: ["-m", "alembic", "upgrade", "head"],
    cwd: `${WORKSPACE}/backend`,
    timeoutMs: 90_000,
  },
  "contract:acceptance": {
    checkId: "contract:acceptance",
    command: "python",
    args: ["-m", "pytest", "-q", "tests/evaluation/test_contract_acceptance.py"],
    cwd: `${WORKSPACE}/backend`,
    timeoutMs: 120_000,
  },
  "security:source": {
    checkId: "security:source",
    command: "python",
    args: ["-m", "pytest", "-q", "tests/evaluation/test_source_policy.py"],
    cwd: `${WORKSPACE}/backend`,
    timeoutMs: 60_000,
  },
  "preview:smoke": {
    checkId: "preview:smoke",
    command: "python",
    args: ["-m", "pytest", "-q", "tests/evaluation/test_preview_smoke.py"],
    cwd: `${WORKSPACE}/backend`,
    timeoutMs: 90_000,
  },
};

export const blueprintChecks: readonly CheckId[] = verificationCheckIds;

export function approvedCommand(checkId: CheckId): ApprovedCommand {
  const command = commands[checkId];
  return { ...command, args: [...command.args] };
}

export function assertApprovedCommand(value: ApprovedCommand): void {
  const expected = commands[value.checkId];
  if (
    value.command !== expected.command ||
    value.cwd !== expected.cwd ||
    value.timeoutMs !== expected.timeoutMs ||
    value.args.length !== expected.args.length ||
    value.args.some((argument, index) => argument !== expected.args[index])
  ) {
    throw new Error("Command does not match the executor allowlist");
  }
}

export const installNetworkPolicy = {
  allow: [
    "registry.npmjs.org",
    "*.npmjs.org",
    "pypi.org",
    "files.pythonhosted.org",
  ],
  subnets: {
    deny: [
      "10.0.0.0/8",
      "100.64.0.0/10",
      "169.254.0.0/16",
      "172.16.0.0/12",
      "192.168.0.0/16",
      "224.0.0.0/4",
      "::/0",
    ],
  },
};
