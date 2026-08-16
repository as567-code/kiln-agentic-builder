import { strToU8, zipSync } from "fflate";
import type { ContractRecord, RunRecord } from "./store.ts";

const BLUEPRINT_PREFIX = "../../blueprints/react-fastapi-postgres/";
const MAX_EXPORT_BYTES = 12 * 1024 * 1024;

const rawBlueprintFiles = import.meta.glob<string>(
  [
    "../../blueprints/react-fastapi-postgres/**/*",
    "!../../blueprints/react-fastapi-postgres/**/node_modules/**",
    "!../../blueprints/react-fastapi-postgres/**/dist/**",
    "!../../blueprints/react-fastapi-postgres/**/.mypy_cache/**",
    "!../../blueprints/react-fastapi-postgres/**/.ruff_cache/**",
    "!../../blueprints/react-fastapi-postgres/**/.pytest_cache/**",
    "!../../blueprints/react-fastapi-postgres/**/__pycache__/**",
    "!../../blueprints/react-fastapi-postgres/**/*.pyc",
    "!../../blueprints/react-fastapi-postgres/**/*.tsbuildinfo",
  ],
  { query: "?raw", import: "default", eager: true },
);

export type ExportSourceFile = {
  path: string;
  content: string;
  sha256: string;
};

export function buildRepositoryArchive(input: {
  contract: ContractRecord;
  run: RunRecord;
  files: ExportSourceFile[];
  exportedAt: string;
}): Uint8Array {
  const entries: Record<string, Uint8Array> = {};
  for (const [modulePath, content] of Object.entries(rawBlueprintFiles)) {
    const path = modulePath.startsWith(BLUEPRINT_PREFIX)
      ? modulePath.slice(BLUEPRINT_PREFIX.length)
      : "";
    if (!path || path.includes("..") || path.startsWith("/")) continue;
    entries[path] = strToU8(content);
  }
  for (const file of input.files) {
    entries[file.path] = strToU8(file.content);
  }
  entries[".env.example"] = strToU8([
    "POSTGRES_DB=pantry",
    "POSTGRES_USER=pantry",
    "POSTGRES_PASSWORD=replace-with-a-long-random-password",
    "DATABASE_URL=postgresql+psycopg://pantry:replace-with-a-long-random-password@db:5432/pantry",
    "ALLOWED_ORIGINS=http://localhost:4173",
    "VITE_API_URL=http://localhost:8000",
    "",
  ].join("\n"));

  const baseReadme = new TextDecoder().decode(entries["README.md"] ?? new Uint8Array());
  entries["README.md"] = strToU8(generatedReadme(input, baseReadme));
  entries[".kiln/contract.json"] = strToU8(JSON.stringify({
    id: input.contract.id,
    revision: input.contract.revision,
    title: input.contract.title,
    summary: input.contract.summary,
    requirements: input.contract.requirements,
    systemShape: input.contract.systemShape,
    acceptanceChecks: input.contract.acceptanceChecks,
    assumptions: input.contract.assumptions,
  }, null, 2));
  entries[".kiln/execution-contract.json"] = strToU8(JSON.stringify({
    title: input.contract.title,
    requirementIds: input.contract.requirements.map((requirement) => requirement.id),
    entities: input.contract.systemShape.entities,
    apiOperations: input.contract.systemShape.apiOperations.map((operation) => ({
      method: operation.method,
      path: operation.path,
    })),
  }));
  entries[".kiln/provenance.json"] = strToU8(JSON.stringify({
    schemaVersion: 1,
    runId: input.run.id,
    contractId: input.run.contractId,
    contractRevision: input.contract.revision,
    runStatus: input.run.status,
    repairAttempts: input.run.attempt,
    exportedAt: input.exportedAt,
    generatedFiles: input.files.map((file) => ({
      path: file.path,
      sha256: file.sha256,
    })),
    statement: input.run.status === "ready"
      ? "This archive was exported from a run with persisted trusted verification evidence."
      : "This archive was exported before Kiln recorded a fully verified release gate.",
  }, null, 2));

  const archive = zipSync(entries, { level: 6 });
  if (archive.byteLength > MAX_EXPORT_BYTES) {
    throw new RepositoryExportTooLargeError();
  }
  return archive;
}

export class RepositoryExportTooLargeError extends Error {
  constructor() {
    super("Repository export exceeds its policy limit");
    this.name = "RepositoryExportTooLargeError";
  }
}

function generatedReadme(
  input: {
    contract: ContractRecord;
    run: RunRecord;
    exportedAt: string;
  },
  baseReadme: string,
): string {
  const requirements = input.contract.requirements
    .map((requirement) => `- ${requirement.statement}`)
    .join("\n");
  const verification = input.run.status === "ready"
    ? "Verified: the source associated with this run passed Kiln's trusted release gate."
    : `Not release-verified: the run was exported in state \`${input.run.status}\`.`;
  return `# ${input.contract.title}\n\n${input.contract.summary}\n\n${verification}\n\n## Approved requirements\n\n${requirements}\n\n## Kiln provenance\n\n- Run: \`${input.run.id}\`\n- Contract revision: ${input.contract.revision}\n- Repair attempts: ${input.run.attempt} of ${input.run.maxAttempts}\n- Exported: ${input.exportedAt}\n\nThe immutable contract, evaluator-safe execution contract, and generated-file hashes are stored in \`.kiln/\`. Kiln does not include provider credentials or control-plane secrets in exports.\n\n---\n\n${baseReadme.trim()}\n`;
}
