import { normalizeWorkspacePath } from "./policy.ts";

export const patchStages = ["data", "api", "interface", "repair"] as const;
export type PatchStage = (typeof patchStages)[number];

export const patchOperations = ["add", "replace", "delete"] as const;
export type PatchOperation = (typeof patchOperations)[number];

export type PatchChange = {
  path: string;
  operation: PatchOperation;
  content?: string;
  expectedSha256?: string;
};

export type PatchDraft = {
  summary: string;
  rationale: string;
  requirementIds: string[];
  changes: PatchChange[];
};

export type PatchProposal = PatchDraft & {
  id: string;
  runId: string;
  sequence: number;
};

const MAX_CHANGES = 20;
const MAX_FILE_BYTES = 256 * 1024;
const MAX_PATCH_BYTES = 1024 * 1024;
const SHA256 = /^[a-f0-9]{64}$/;
const allowedExtensions = new Set([
  ".css",
  ".html",
  ".js",
  ".json",
  ".jsx",
  ".md",
  ".py",
  ".sql",
  ".toml",
  ".ts",
  ".tsx",
  ".txt",
  ".yaml",
  ".yml",
]);
const allowedExtensionlessFiles = new Set(["Dockerfile", "Makefile"]);

export class InvalidPatchProposalError extends Error {
  readonly field: string;

  constructor(field: string, message: string) {
    super(`Invalid patch proposal at ${field}: ${message}`);
    this.name = "InvalidPatchProposalError";
    this.field = field;
  }
}

export function validatePatchDraft(
  value: unknown,
  allowedRequirementIds: ReadonlySet<string>,
): PatchDraft {
  const draft = record(value, "proposal");
  onlyKeys(draft, ["summary", "rationale", "requirementIds", "changes"]);
  const summary = text(draft.summary, "summary", 4, 240);
  const rationale = text(draft.rationale, "rationale", 4, 500);
  const requirementIds = stringArray(
    draft.requirementIds,
    "requirementIds",
    1,
    12,
  );
  if (requirementIds.some((id) => !allowedRequirementIds.has(id))) {
    invalid("requirementIds", "contains an ID outside the approved contract");
  }
  if (new Set(requirementIds).size !== requirementIds.length) {
    invalid("requirementIds", "must be unique");
  }

  if (
    !Array.isArray(draft.changes) ||
    draft.changes.length < 1 ||
    draft.changes.length > MAX_CHANGES
  ) {
    invalid("changes", `must contain between 1 and ${MAX_CHANGES} file changes`);
  }
  let totalBytes = 0;
  const changes = draft.changes.map((rawChange, index): PatchChange => {
    const field = `changes[${index}]`;
    const change = record(rawChange, field);
    onlyKeys(change, ["path", "operation", "content", "expectedSha256"]);
    const path = normalizeWorkspacePath(text(change.path, `${field}.path`, 1, 240));
    assertTextFile(path, `${field}.path`);
    const operation = change.operation;
    if (!patchOperations.includes(operation as PatchOperation)) {
      invalid(`${field}.operation`, "is unsupported");
    }
    const typedOperation = operation as PatchOperation;
    const expectedSha256 =
      change.expectedSha256 === undefined
        ? undefined
        : text(change.expectedSha256, `${field}.expectedSha256`, 64, 64);

    if (typedOperation === "add" && expectedSha256 !== undefined) {
      invalid(`${field}.expectedSha256`, "must be omitted for a new file");
    }
    if (
      typedOperation !== "add" &&
      (!expectedSha256 || !SHA256.test(expectedSha256))
    ) {
      invalid(
        `${field}.expectedSha256`,
        "is required for replace and delete operations",
      );
    }
    if (typedOperation === "delete") {
      if (change.content !== undefined) {
        invalid(`${field}.content`, "must be omitted for a delete operation");
      }
      return { path, operation: typedOperation, expectedSha256 };
    }

    if (typeof change.content !== "string") {
      invalid(`${field}.content`, "is required for add and replace operations");
    }
    if (change.content.includes("\0")) {
      invalid(`${field}.content`, "contains a null byte");
    }
    const bytes = new TextEncoder().encode(change.content).byteLength;
    if (bytes > MAX_FILE_BYTES) {
      invalid(`${field}.content`, `exceeds ${MAX_FILE_BYTES} bytes`);
    }
    totalBytes += bytes;
    if (totalBytes > MAX_PATCH_BYTES) {
      invalid("changes", `exceeds ${MAX_PATCH_BYTES} total content bytes`);
    }
    return {
      path,
      operation: typedOperation,
      content: change.content.replace(/\r\n/g, "\n"),
      expectedSha256,
    };
  });

  if (new Set(changes.map((change) => change.path)).size !== changes.length) {
    invalid("changes", "cannot target the same path more than once");
  }
  return { summary, rationale, requirementIds, changes };
}

function assertTextFile(path: string, field: string): void {
  const name = path.split("/").at(-1) ?? path;
  if (allowedExtensionlessFiles.has(name)) return;
  const dot = name.lastIndexOf(".");
  const extension = dot >= 0 ? name.slice(dot).toLowerCase() : "";
  if (!allowedExtensions.has(extension)) {
    invalid(field, "targets a file type outside the text-code allowlist");
  }
}

function record(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    invalid(field, "must be an object");
  }
  return value as Record<string, unknown>;
}

function stringArray(
  value: unknown,
  field: string,
  minLength: number,
  maxLength: number,
): string[] {
  if (
    !Array.isArray(value) ||
    value.length < minLength ||
    value.length > maxLength
  ) {
    invalid(field, `must contain between ${minLength} and ${maxLength} items`);
  }
  return value.map((item, index) =>
    text(item, `${field}[${index}]`, 1, 80),
  );
}

function text(
  value: unknown,
  field: string,
  minLength: number,
  maxLength: number,
): string {
  if (typeof value !== "string") invalid(field, "must be text");
  const normalized = value.trim();
  if (normalized.length < minLength || normalized.length > maxLength) {
    invalid(field, `must be between ${minLength} and ${maxLength} characters`);
  }
  return normalized;
}

function onlyKeys(value: Record<string, unknown>, allowed: string[]): void {
  const allowedSet = new Set(allowed);
  const unexpected = Object.keys(value).find((key) => !allowedSet.has(key));
  if (unexpected) invalid(unexpected, "is not allowed");
}

function invalid(field: string, message: string): never {
  throw new InvalidPatchProposalError(field, message);
}
