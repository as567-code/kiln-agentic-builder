export const contractStatuses = ["draft", "approved", "superseded"] as const;
export type ContractStatus = (typeof contractStatuses)[number];

export type Requirement = {
  id: string;
  statement: string;
  priority: "must" | "should" | "could";
};

export type SystemShape = {
  pages: string[];
  entities: Array<{
    name: string;
    fields: Array<{ name: string; type: string; required: boolean }>;
  }>;
  apiOperations: Array<{
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
    path: string;
    purpose: string;
  }>;
};

export type AcceptanceCheck = {
  id: string;
  requirementId: string;
  description: string;
  kind: "browser" | "api" | "database" | "accessibility" | "security";
};

export type BuildContract = {
  id: string;
  projectId: string;
  revision: number;
  title: string;
  summary: string;
  requirements: Requirement[];
  systemShape: SystemShape;
  acceptanceChecks: AcceptanceCheck[];
  assumptions: string[];
  status: ContractStatus;
};

export function isBuildContract(value: unknown): value is BuildContract {
  if (!isRecord(value)) return false;
  if (!isNonEmptyString(value.id) || !isNonEmptyString(value.projectId)) return false;
  if (!Number.isInteger(value.revision) || Number(value.revision) < 1) return false;
  if (!isNonEmptyString(value.title) || !isNonEmptyString(value.summary)) return false;
  if (!contractStatuses.includes(value.status as ContractStatus)) return false;
  if (!Array.isArray(value.requirements) || value.requirements.length === 0) return false;
  if (!Array.isArray(value.acceptanceChecks) || value.acceptanceChecks.length === 0) return false;
  if (!Array.isArray(value.assumptions) || !value.assumptions.every(isNonEmptyString)) return false;
  return isSystemShape(value.systemShape);
}

function isSystemShape(value: unknown): value is SystemShape {
  if (!isRecord(value)) return false;
  return (
    Array.isArray(value.pages) &&
    value.pages.every(isNonEmptyString) &&
    Array.isArray(value.entities) &&
    Array.isArray(value.apiOperations)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
