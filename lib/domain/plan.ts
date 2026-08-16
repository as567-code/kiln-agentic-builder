import type { BuildContract } from "../../packages/contracts/src/contract.ts";
import type {
  ImplementationPlan,
  ImplementationPlanStep,
} from "../../packages/contracts/src/plan.ts";

type PlanInput = {
  planId: string;
  runId: string;
  contract: Pick<
    BuildContract,
    "id" | "requirements" | "systemShape" | "acceptanceChecks"
  >;
  budgetCents: number;
};

export function buildImplementationPlan(input: PlanInput): ImplementationPlan {
  const requirementIds = input.contract.requirements.map((item) => item.id);
  const shape = input.contract.systemShape;
  const steps: ImplementationPlanStep[] = [
    {
      id: `${input.planId}_step_01`,
      sequence: 1,
      kind: "scaffold",
      title: "Materialize the maintained blueprint",
      description:
        "Copy the pinned React, FastAPI, PostgreSQL, migration, test, and container baseline into a disposable workspace.",
      capabilities: ["write_files", "registry_network"],
      touches: ["frontend/", "backend/", "compose.yaml", "README.md"],
      requirementIds: [],
      estimatedSeconds: 35,
    },
    {
      id: `${input.planId}_step_02`,
      sequence: 2,
      kind: "data",
      title: `Implement ${shape.entities.length} typed data ${shape.entities.length === 1 ? "entity" : "entities"}`,
      description:
        "Generate validated persistence models, ownership-safe repository operations, seed records, and forward-only migrations.",
      capabilities: ["write_files", "database_migration"],
      touches: ["backend/app/models.py", "backend/app/repositories/", "backend/alembic/"],
      requirementIds,
      estimatedSeconds: 25 + shape.entities.length * 8,
    },
    {
      id: `${input.planId}_step_03`,
      sequence: 3,
      kind: "api",
      title: `Build ${shape.apiOperations.length} contract-backed API operations`,
      description:
        "Implement request/response schemas, validated service methods, stable error envelopes, and API-level tests.",
      capabilities: ["write_files"],
      touches: ["backend/app/api/", "backend/app/schemas.py", "backend/tests/"],
      requirementIds,
      estimatedSeconds: 25 + shape.apiOperations.length * 6,
    },
    {
      id: `${input.planId}_step_04`,
      sequence: 4,
      kind: "interface",
      title: `Compose ${shape.pages.length} responsive product views`,
      description:
        "Build the primary user flow with a deliberate visual system, keyboard support, responsive behavior, and real API states.",
      capabilities: ["write_files"],
      touches: ["frontend/src/", "frontend/src/styles.css", "frontend/tests/"],
      requirementIds,
      estimatedSeconds: 35 + shape.pages.length * 8,
    },
    {
      id: `${input.planId}_step_05`,
      sequence: 5,
      kind: "verification",
      title: `Execute ${input.contract.acceptanceChecks.length} acceptance checks`,
      description:
        "Run formatting, types, lint, migrations, builds, unit/API checks, and browser smoke tests in the isolated runner.",
      capabilities: ["run_commands", "database_migration", "start_preview"],
      touches: ["trusted runner outputs only"],
      requirementIds,
      estimatedSeconds: 70 + input.contract.acceptanceChecks.length * 5,
    },
    {
      id: `${input.planId}_step_06`,
      sequence: 6,
      kind: "security",
      title: "Produce release-blocking security evidence",
      description:
        "Scan dependencies and source, verify policy invariants, redact logs, and block deployment on critical findings.",
      capabilities: ["run_commands"],
      touches: ["evidence/security.json", "evidence/sbom.json"],
      requirementIds,
      estimatedSeconds: 45,
    },
  ];
  const estimatedExecutionSeconds = steps.reduce(
    (total, step) => total + step.estimatedSeconds,
    0,
  );
  const complexity =
    shape.entities.length +
    shape.apiOperations.length +
    shape.pages.length +
    input.contract.acceptanceChecks.length;
  const estimatedModelCents = Math.min(
    input.budgetCents,
    Math.max(25, 12 + complexity * 3),
  );

  return {
    id: input.planId,
    runId: input.runId,
    contractId: input.contract.id,
    revision: 1,
    blueprint: "react-fastapi-postgres-v1",
    steps,
    estimatedModelCents,
    estimatedExecutionSeconds,
    risks: [
      "Generated code remains untrusted until every verification stage passes.",
      "Public deployment stays locked behind a separate revision-bound approval.",
      "Repair may change implementation files but cannot weaken the approved contract or tests.",
    ],
    status: "draft",
  };
}
