export const verificationCheckIds = [
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
] as const;

export type VerificationCheckId = (typeof verificationCheckIds)[number];

export type ExecutionContract = {
  title: string;
  requirementIds: string[];
  entities: Array<{
    name: string;
    fields: Array<{ name: string; type: string; required: boolean }>;
  }>;
  apiOperations: Array<{
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
    path: string;
  }>;
};

const executionMethods = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);

export function parseExecutionContract(value: unknown): ExecutionContract {
  if (!isRecord(value) || hasExtraKeys(value, [
    "title",
    "requirementIds",
    "entities",
    "apiOperations",
  ])) {
    throw new InvalidExecutionContractError();
  }
  if (typeof value.title !== "string" || value.title.length < 2 || value.title.length > 80) {
    throw new InvalidExecutionContractError();
  }
  const requirementIds = stringIds(value.requirementIds);
  if (!Array.isArray(value.entities) || value.entities.length < 1 || value.entities.length > 12) {
    throw new InvalidExecutionContractError();
  }
  const entities = value.entities.map((entity) => {
    if (
      !isRecord(entity) ||
      hasExtraKeys(entity, ["name", "fields"]) ||
      typeof entity.name !== "string" ||
      !/^[A-Z][A-Za-z0-9]{0,62}$/.test(entity.name) ||
      !Array.isArray(entity.fields) ||
      entity.fields.length < 1 ||
      entity.fields.length > 32
    ) {
      throw new InvalidExecutionContractError();
    }
    const fields = entity.fields.map((field) => {
      if (
        !isRecord(field) ||
        hasExtraKeys(field, ["name", "type", "required"]) ||
        typeof field.name !== "string" ||
        !/^[a-z][a-z0-9_]{0,62}$/.test(field.name) ||
        typeof field.type !== "string" ||
        field.type.length < 1 ||
        field.type.length > 64 ||
        typeof field.required !== "boolean"
      ) {
        throw new InvalidExecutionContractError();
      }
      return { name: field.name, type: field.type, required: field.required };
    });
    return { name: entity.name, fields };
  });
  if (
    !Array.isArray(value.apiOperations) ||
    value.apiOperations.length < 1 ||
    value.apiOperations.length > 32
  ) {
    throw new InvalidExecutionContractError();
  }
  const apiOperations = value.apiOperations.map((operation) => {
    if (
      !isRecord(operation) ||
      hasExtraKeys(operation, ["method", "path"]) ||
      typeof operation.method !== "string" ||
      !executionMethods.has(operation.method) ||
      typeof operation.path !== "string" ||
      !/^\/api\/[A-Za-z0-9_/{}/-]+$/.test(operation.path)
    ) {
      throw new InvalidExecutionContractError();
    }
    return {
      method: operation.method as ExecutionContract["apiOperations"][number]["method"],
      path: operation.path,
    };
  });
  return { title: value.title, requirementIds, entities, apiOperations };
}

export class InvalidExecutionContractError extends Error {
  constructor() {
    super("Execution contract is invalid");
    this.name = "InvalidExecutionContractError";
  }
}

function stringIds(value: unknown): string[] {
  if (
    !Array.isArray(value) ||
    value.length < 1 ||
    value.length > 12 ||
    value.some((id) => typeof id !== "string" || !/^req_[a-z0-9_]{1,72}$/.test(id))
  ) {
    throw new InvalidExecutionContractError();
  }
  const ids = [...new Set(value as string[])];
  if (ids.length !== value.length) throw new InvalidExecutionContractError();
  return ids;
}

function hasExtraKeys(value: Record<string, unknown>, allowed: string[]): boolean {
  const set = new Set(allowed);
  return Object.keys(value).some((key) => !set.has(key));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
