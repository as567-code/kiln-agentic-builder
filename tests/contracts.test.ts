import assert from "node:assert/strict";
import test from "node:test";
import {
  InvalidPatchProposalError,
  InvalidExecutionContractError,
  UnsafePathError,
  assertTransition,
  canTransition,
  isToolAllowed,
  normalizeWorkspacePath,
  parseExecutionContract,
  validatePatchDraft,
} from "../packages/contracts/src/index.ts";

test("allows only declared run transitions", () => {
  assert.equal(canTransition("test", "preview"), true);
  assert.equal(canTransition("test", "deployed"), false);
  assert.throws(() => assertTransition("ready", "build"), /cannot transition/);
});

test("scopes tools to the active run state", () => {
  assert.equal(isToolAllowed("generate_patches", "apply_patch"), true);
  assert.equal(isToolAllowed("generate_patches", "run_build"), false);
  assert.equal(isToolAllowed("deploy_approval", "apply_patch"), false);
});

test("normalizes safe workspace paths", () => {
  assert.equal(normalizeWorkspacePath("src/./features/app.ts"), "src/features/app.ts");
  assert.equal(normalizeWorkspacePath("src\\features\\app.ts"), "src/features/app.ts");
});

test("rejects traversal, absolute, empty, and protected paths", () => {
  const unsafe = [
    "../secret",
    "src/../../secret",
    "/etc/passwd",
    "C:\\Windows\\system.ini",
    "",
    ".env",
    ".github/workflows/release.yml",
    "package-lock.json",
    "SECURITY.md",
    "backend/tests/evaluation/test_source_policy.py",
    "frontend/tests/evaluation/preview.spec.ts",
  ];

  for (const value of unsafe) {
    assert.throws(() => normalizeWorkspacePath(value), UnsafePathError);
  }
});

test("validates the stripped execution contract at the trust boundary", () => {
  const contract = parseExecutionContract({
    title: "Volunteer scheduling workspace",
    requirementIds: ["req_schedule", "req_capacity"],
    entities: [{
      name: "Shift",
      fields: [
        { name: "starts_at", type: "datetime", required: true },
        { name: "capacity", type: "integer", required: true },
      ],
    }],
    apiOperations: [
      { method: "GET", path: "/api/shifts" },
      { method: "POST", path: "/api/shifts" },
    ],
  });
  assert.equal(contract.entities[0]?.name, "Shift");
  assert.equal(contract.apiOperations.length, 2);

  assert.throws(
    () => parseExecutionContract({ ...contract, serviceToken: "must-not-cross" }),
    InvalidExecutionContractError,
  );
  assert.throws(
    () => parseExecutionContract({
      ...contract,
      apiOperations: [{ method: "CONNECT", path: "/api/internal" }],
    }),
    InvalidExecutionContractError,
  );
});

test("accepts bounded text patches tied to approved requirements", () => {
  const patch = validatePatchDraft(
    {
      summary: "Add the inventory route",
      rationale: "Implements the approved inventory listing requirement.",
      requirementIds: ["req_inventory"],
      changes: [
        {
          path: "backend/app/api/inventory.py",
          operation: "add",
          content: "def list_inventory():\n    return []\n",
        },
        {
          path: "frontend/src/App.tsx",
          operation: "replace",
          expectedSha256: "a".repeat(64),
          content: "export function App() { return <main>Inventory</main>; }\n",
        },
      ],
    },
    new Set(["req_inventory"]),
  );

  assert.equal(patch.changes.length, 2);
  assert.equal(patch.changes[0]?.path, "backend/app/api/inventory.py");
});

test("rejects patch paths, binaries, stale writes, and contract expansion", () => {
  const base = {
    summary: "Unsafe patch",
    rationale: "Attempts a write outside the bounded contract.",
    requirementIds: ["req_inventory"],
    changes: [
      {
        path: "frontend/src/App.tsx",
        operation: "replace",
        content: "export const value = 1;",
      },
    ],
  };

  assert.throws(
    () => validatePatchDraft(base, new Set(["req_inventory"])),
    InvalidPatchProposalError,
  );
  assert.throws(
    () =>
      validatePatchDraft(
        {
          ...base,
          changes: [{ path: "../escape.py", operation: "add", content: "pass" }],
        },
        new Set(["req_inventory"]),
      ),
    UnsafePathError,
  );
  assert.throws(
    () =>
      validatePatchDraft(
        {
          ...base,
          changes: [{ path: "public/logo.png", operation: "add", content: "not an image" }],
        },
        new Set(["req_inventory"]),
      ),
    InvalidPatchProposalError,
  );
  assert.throws(
    () => validatePatchDraft({ ...base, requirementIds: ["req_unapproved"] }, new Set(["req_inventory"])),
    InvalidPatchProposalError,
  );
});
