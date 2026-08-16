import { resolve, sep } from "node:path";

const IMAGE =
  "ghcr.io/kiln-dev/react-fastapi-postgres-runner@sha256:" +
  "3b91b3fa5be8d89e7c633c1a3f01ea6497c0ce0f7d71826d27c07cf431aac001";

export function dockerRunArguments(input: {
  runId: string;
  workspace: string;
  workRoot: string;
}): string[] {
  if (!/^run_[a-f0-9]{32}$/.test(input.runId)) {
    throw new Error("Docker run ID is invalid");
  }
  const workRoot = resolve(input.workRoot);
  const workspace = resolve(input.workspace);
  if (workspace === workRoot || !workspace.startsWith(`${workRoot}${sep}`)) {
    throw new Error("Docker workspace must be a child of the configured work root");
  }
  return [
    "run",
    "--rm",
    "--name",
    `kiln-${input.runId.slice(4, 20)}`,
    "--network",
    "none",
    "--read-only",
    "--user",
    "10001:10001",
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges:true",
    "--pids-limit",
    "256",
    "--memory",
    "2g",
    "--memory-swap",
    "2g",
    "--cpus",
    "2",
    "--tmpfs",
    "/tmp:rw,noexec,nosuid,nodev,size=256m",
    "--mount",
    `type=bind,src=${workspace},dst=/workspace,rw`,
    "--workdir",
    "/workspace",
    IMAGE,
  ];
}
