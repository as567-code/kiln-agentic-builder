import type { PatchStage } from "../../packages/contracts/src/patch.ts";

export const blueprintManifest = {
  id: "react-fastapi-postgres",
  version: "0.2.0",
  sourceManifestSha256:
    "8ba3c9f9d19556d6741eeb7446decfe0f4d327c5ea88ff7c956abcdb57f52057",
  sourcePath: "blueprints/react-fastapi-postgres",
  checks: [
    "frontend:typecheck",
    "backend:ruff",
    "backend:mypy",
    "backend:migrations",
    "frontend:build",
    "frontend:test",
    "backend:test",
    "contract:acceptance",
    "preview:smoke",
    "security:source",
  ],
  sandbox: {
    cpu: 2,
    memoryMb: 2048,
    diskMb: 4096,
    pids: 256,
    ttlSeconds: 600,
    network: "registry-allowlist",
  },
} as const;

const targets: Readonly<
  Record<Exclude<PatchStage, "repair">, readonly string[]>
> = {
  data: [
    "backend/app/generated_contract.py",
    "backend/alembic/versions/0002_generated_contract.py",
  ],
  api: ["backend/app/api/generated_contract.py"],
  interface: ["frontend/src/generated-contract.ts"],
};

export const generatedExtensionPaths = [
  ...targets.data,
  ...targets.api,
  ...targets.interface,
] as const;

export function targetsForStage(
  stage: PatchStage,
): string[] {
  if (stage === "repair") return [...generatedExtensionPaths];
  return [...targets[stage]];
}

export function languageForPath(path: string): string {
  if (path.endsWith(".py")) return "python";
  if (path.endsWith(".tsx")) return "tsx";
  if (path.endsWith(".ts")) return "typescript";
  if (path.endsWith(".css")) return "css";
  if (path.endsWith(".sql")) return "sql";
  if (path.endsWith(".json")) return "json";
  return "text";
}
