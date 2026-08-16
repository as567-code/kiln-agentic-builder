export const planCapabilities = [
  "write_files",
  "database_migration",
  "registry_network",
  "run_commands",
  "start_preview",
] as const;

export type PlanCapability = (typeof planCapabilities)[number];

export const planStepKinds = [
  "scaffold",
  "data",
  "api",
  "interface",
  "verification",
  "security",
] as const;

export type PlanStepKind = (typeof planStepKinds)[number];

export type ImplementationPlanStep = {
  id: string;
  sequence: number;
  kind: PlanStepKind;
  title: string;
  description: string;
  capabilities: PlanCapability[];
  touches: string[];
  requirementIds: string[];
  estimatedSeconds: number;
};

export type ImplementationPlan = {
  id: string;
  runId: string;
  contractId: string;
  revision: number;
  blueprint: "react-fastapi-postgres-v1";
  steps: ImplementationPlanStep[];
  estimatedModelCents: number;
  estimatedExecutionSeconds: number;
  risks: string[];
  status: "draft" | "approved";
};

export function isImplementationPlan(value: unknown): value is ImplementationPlan {
  if (!isRecord(value)) return false;
  if (
    typeof value.id !== "string" ||
    typeof value.runId !== "string" ||
    typeof value.contractId !== "string" ||
    value.blueprint !== "react-fastapi-postgres-v1" ||
    (value.status !== "draft" && value.status !== "approved") ||
    !Number.isInteger(value.revision) ||
    Number(value.revision) < 1 ||
    !Number.isInteger(value.estimatedModelCents) ||
    !Number.isInteger(value.estimatedExecutionSeconds) ||
    !Array.isArray(value.steps) ||
    value.steps.length < 1 ||
    value.steps.length > 12 ||
    !Array.isArray(value.risks) ||
    !value.risks.every(isBoundedString)
  ) {
    return false;
  }
  return value.steps.every((step, index) => isPlanStep(step, index + 1));
}

function isPlanStep(value: unknown, expectedSequence: number): boolean {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    value.sequence === expectedSequence &&
    planStepKinds.includes(value.kind as PlanStepKind) &&
    isBoundedString(value.title) &&
    isBoundedString(value.description) &&
    Array.isArray(value.capabilities) &&
    value.capabilities.every((item) =>
      planCapabilities.includes(item as PlanCapability),
    ) &&
    Array.isArray(value.touches) &&
    value.touches.every(isBoundedString) &&
    Array.isArray(value.requirementIds) &&
    value.requirementIds.every(isBoundedString) &&
    Number.isInteger(value.estimatedSeconds) &&
    Number(value.estimatedSeconds) > 0
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isBoundedString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 500;
}
