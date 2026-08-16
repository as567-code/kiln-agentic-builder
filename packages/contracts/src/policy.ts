import type { RunState } from "./run.ts";

export const agentTools = [
  "read_file",
  "list_files",
  "propose_patch",
  "apply_patch",
  "install_dependencies",
  "run_static_checks",
  "run_build",
  "run_tests",
  "start_preview",
  "run_security_scan",
] as const;

export type AgentTool = (typeof agentTools)[number];

const toolsByState: Readonly<Partial<Record<RunState, readonly AgentTool[]>>> = {
  specify: [],
  plan: ["list_files", "read_file"],
  scaffold: ["list_files", "propose_patch", "apply_patch"],
  generate_patches: ["list_files", "read_file", "propose_patch", "apply_patch"],
  static_check: ["run_static_checks"],
  build: ["install_dependencies", "run_build"],
  test: ["run_tests"],
  diagnose: ["list_files", "read_file"],
  repair_patch: ["list_files", "read_file", "propose_patch", "apply_patch"],
  preview: ["start_preview"],
  security_scan: ["run_security_scan"],
};

const protectedPaths = [
  ".git",
  ".github/workflows",
  ".kiln",
  ".env",
  ".env.local",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "requirements.lock",
  "poetry.lock",
  "SECURITY.md",
  "kiln.policy.json",
  "backend/tests/evaluation",
  "frontend/tests/evaluation",
] as const;

export function isToolAllowed(state: RunState, tool: AgentTool): boolean {
  return toolsByState[state]?.includes(tool) ?? false;
}

export function normalizeWorkspacePath(input: string): string {
  if (input.includes("\0")) throw new UnsafePathError(input, "contains a null byte");
  const slashPath = input.replaceAll("\\", "/");
  if (slashPath.startsWith("/") || /^[A-Za-z]:\//.test(slashPath)) {
    throw new UnsafePathError(input, "must be relative");
  }

  const parts = slashPath.split("/").filter((part) => part !== "" && part !== ".");
  if (parts.length === 0 || parts.some((part) => part === "..")) {
    throw new UnsafePathError(input, "escapes or omits the workspace path");
  }

  const normalized = parts.join("/");
  const lower = normalized.toLowerCase();
  if (
    protectedPaths.some(
      (protectedPath) =>
        lower === protectedPath.toLowerCase() ||
        lower.startsWith(`${protectedPath.toLowerCase()}/`),
    )
  ) {
    throw new UnsafePathError(input, "targets a protected path");
  }
  return normalized;
}

export class UnsafePathError extends Error {
  readonly path: string;
  readonly reason: string;

  constructor(path: string, reason: string) {
    super(`Unsafe workspace path: ${reason}`);
    this.name = "UnsafePathError";
    this.path = path;
    this.reason = reason;
  }
}
