import type {
  AcceptanceCheck,
  Requirement,
  SystemShape,
} from "../../packages/contracts/src/contract.ts";
import type { PatchStage } from "../../packages/contracts/src/patch.ts";
import { badRequest } from "./api-error.ts";
import { isKilnId } from "./id.ts";
import { isRecord } from "./http.ts";

export type CreateProjectInput = {
  name: string;
  summary: string;
};

export type UpdateProjectInput = {
  name?: string;
  summary?: string;
};

export type ContractDraftInput = {
  title: string;
  summary: string;
  requirements: Requirement[];
  systemShape: SystemShape;
  acceptanceChecks: AcceptanceCheck[];
  assumptions: string[];
};

export type CreateRunInput = {
  contractId: string;
  budgetCents: number;
};

export type DraftBriefInput = {
  brief: string;
};

export type ProposePatchInput = {
  stage: PatchStage;
};

const identifier = /^[a-z][a-z0-9_]{0,62}$/;
const entityName = /^[A-Z][A-Za-z0-9]{0,62}$/;
const requirementId = /^req_[a-z0-9_]{1,58}$/;
const checkId = /^check_[a-z0-9_]{1,56}$/;
const apiPath = /^\/api\/[A-Za-z0-9_/{}/-]+$/;

export function parseCreateProject(
  value: Record<string, unknown>,
): CreateProjectInput {
  onlyKeys(value, ["name", "summary"]);
  return {
    name: text(value.name, "name", 2, 80),
    summary:
      value.summary === undefined ? "" : text(value.summary, "summary", 0, 500),
  };
}

export function parseUpdateProject(
  value: Record<string, unknown>,
): UpdateProjectInput {
  onlyKeys(value, ["name", "summary"]);
  if (value.name === undefined && value.summary === undefined) {
    badRequest("At least one editable field is required");
  }
  return {
    name: value.name === undefined ? undefined : text(value.name, "name", 2, 80),
    summary:
      value.summary === undefined
        ? undefined
        : text(value.summary, "summary", 0, 500),
  };
}

export function parseArchiveProject(value: Record<string, unknown>): boolean {
  onlyKeys(value, ["archived"]);
  if (typeof value.archived !== "boolean") {
    badRequest("archived must be a boolean");
  }
  return value.archived;
}

export function parseDeleteConfirmation(
  value: Record<string, unknown>,
): string {
  onlyKeys(value, ["confirmation"]);
  return text(value.confirmation, "confirmation", 1, 80);
}

export function parseContractDraft(
  value: Record<string, unknown>,
): ContractDraftInput {
  onlyKeys(value, [
    "title",
    "summary",
    "requirements",
    "systemShape",
    "acceptanceChecks",
    "assumptions",
  ]);

  const requirements = array(value.requirements, "requirements", 1, 12).map(
    (item, index): Requirement => {
      const row = record(item, `requirements[${index}]`);
      onlyKeys(row, ["id", "statement", "priority"]);
      const id = matchingText(row.id, `requirements[${index}].id`, requirementId);
      const priority = row.priority;
      if (priority !== "must" && priority !== "should" && priority !== "could") {
        badRequest(`requirements[${index}].priority is invalid`);
      }
      return {
        id,
        statement: text(row.statement, `requirements[${index}].statement`, 4, 240),
        priority,
      };
    },
  );
  rejectDuplicates(requirements.map((item) => item.id), "requirement IDs");

  const shapeRecord = record(value.systemShape, "systemShape");
  onlyKeys(shapeRecord, ["pages", "entities", "apiOperations"]);
  const pages = array(shapeRecord.pages, "systemShape.pages", 1, 12).map(
    (item, index) => text(item, `systemShape.pages[${index}]`, 1, 80),
  );
  rejectDuplicates(pages.map((page) => page.toLowerCase()), "page names");

  const entities = array(
    shapeRecord.entities,
    "systemShape.entities",
    1,
    12,
  ).map((item, entityIndex) => {
    const entity = record(item, `systemShape.entities[${entityIndex}]`);
    onlyKeys(entity, ["name", "fields"]);
    const fields = array(
      entity.fields,
      `systemShape.entities[${entityIndex}].fields`,
      1,
      32,
    ).map((fieldValue, fieldIndex) => {
      const field = record(
        fieldValue,
        `systemShape.entities[${entityIndex}].fields[${fieldIndex}]`,
      );
      onlyKeys(field, ["name", "type", "required"]);
      if (typeof field.required !== "boolean") {
        badRequest(
          `systemShape.entities[${entityIndex}].fields[${fieldIndex}].required must be a boolean`,
        );
      }
      return {
        name: matchingText(
          field.name,
          `systemShape.entities[${entityIndex}].fields[${fieldIndex}].name`,
          identifier,
        ),
        type: text(
          field.type,
          `systemShape.entities[${entityIndex}].fields[${fieldIndex}].type`,
          1,
          64,
        ),
        required: field.required,
      };
    });
    rejectDuplicates(
      fields.map((field) => field.name),
      `field names for entity ${String(entity.name)}`,
    );
    return {
      name: matchingText(
        entity.name,
        `systemShape.entities[${entityIndex}].name`,
        entityName,
      ),
      fields,
    };
  });
  rejectDuplicates(
    entities.map((entity) => entity.name.toLowerCase()),
    "entity names",
  );

  const apiOperations = array(
    shapeRecord.apiOperations,
    "systemShape.apiOperations",
    1,
    32,
  ).map((item, index) => {
    const operation = record(item, `systemShape.apiOperations[${index}]`);
    onlyKeys(operation, ["method", "path", "purpose"]);
    const methodValue = text(
      operation.method,
      `systemShape.apiOperations[${index}].method`,
      3,
      6,
    );
    if (
      methodValue !== "GET" &&
      methodValue !== "POST" &&
      methodValue !== "PUT" &&
      methodValue !== "PATCH" &&
      methodValue !== "DELETE"
    ) {
      badRequest(`systemShape.apiOperations[${index}].method is invalid`);
    }
    const method = methodValue as "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
    return {
      method,
      path: matchingText(
        operation.path,
        `systemShape.apiOperations[${index}].path`,
        apiPath,
      ),
      purpose: text(
        operation.purpose,
        `systemShape.apiOperations[${index}].purpose`,
        4,
        160,
      ),
    };
  });

  const knownRequirementIds = new Set(requirements.map((item) => item.id));
  const acceptanceChecks = array(
    value.acceptanceChecks,
    "acceptanceChecks",
    1,
    24,
  ).map((item, index): AcceptanceCheck => {
    const check = record(item, `acceptanceChecks[${index}]`);
    onlyKeys(check, ["id", "requirementId", "description", "kind"]);
    const requirement = matchingText(
      check.requirementId,
      `acceptanceChecks[${index}].requirementId`,
      requirementId,
    );
    if (!knownRequirementIds.has(requirement)) {
      badRequest(`acceptanceChecks[${index}] references an unknown requirement`);
    }
    const kind = check.kind;
    if (
      kind !== "browser" &&
      kind !== "api" &&
      kind !== "database" &&
      kind !== "accessibility" &&
      kind !== "security"
    ) {
      badRequest(`acceptanceChecks[${index}].kind is invalid`);
    }
    return {
      id: matchingText(check.id, `acceptanceChecks[${index}].id`, checkId),
      requirementId: requirement,
      description: text(
        check.description,
        `acceptanceChecks[${index}].description`,
        4,
        240,
      ),
      kind,
    };
  });
  rejectDuplicates(acceptanceChecks.map((item) => item.id), "acceptance check IDs");

  const assumptions = array(value.assumptions, "assumptions", 0, 8).map(
    (item, index) => text(item, `assumptions[${index}]`, 1, 240),
  );

  return {
    title: text(value.title, "title", 2, 80),
    summary: text(value.summary, "summary", 8, 500),
    requirements,
    systemShape: { pages, entities, apiOperations },
    acceptanceChecks,
    assumptions,
  };
}

export function parseCreateRun(value: Record<string, unknown>): CreateRunInput {
  onlyKeys(value, ["contractId", "budgetCents"]);
  if (!isKilnId(value.contractId, "ctr")) {
    badRequest("contractId is invalid");
  }
  const budget = value.budgetCents ?? 100;
  if (!Number.isInteger(budget) || Number(budget) < 25 || Number(budget) > 2500) {
    badRequest("budgetCents must be an integer between 25 and 2500");
  }
  return { contractId: value.contractId, budgetCents: Number(budget) };
}

export function parseDraftBrief(value: Record<string, unknown>): DraftBriefInput {
  onlyKeys(value, ["brief"]);
  return { brief: text(value.brief, "brief", 20, 5000) };
}

export function parseProposePatch(
  value: Record<string, unknown>,
): ProposePatchInput {
  onlyKeys(value, ["stage"]);
  if (
    value.stage !== "data" &&
    value.stage !== "api" &&
    value.stage !== "interface" &&
    value.stage !== "repair"
  ) {
    badRequest("stage must be data, api, interface, or repair");
  }
  return { stage: value.stage };
}

function record(value: unknown, field: string): Record<string, unknown> {
  if (!isRecord(value)) badRequest(`${field} must be an object`);
  return value;
}

function array(
  value: unknown,
  field: string,
  minLength: number,
  maxLength: number,
): unknown[] {
  if (!Array.isArray(value) || value.length < minLength || value.length > maxLength) {
    badRequest(`${field} must contain between ${minLength} and ${maxLength} items`);
  }
  return value;
}

function text(
  value: unknown,
  field: string,
  minLength: number,
  maxLength: number,
): string {
  if (typeof value !== "string") badRequest(`${field} must be text`);
  const normalized = value.replace(/\r\n/g, "\n").trim();
  if (normalized.length < minLength || normalized.length > maxLength) {
    badRequest(`${field} must be between ${minLength} and ${maxLength} characters`);
  }
  if (
    Array.from(normalized).some((character) => {
      const code = character.charCodeAt(0);
      return (code < 32 && code !== 9 && code !== 10 && code !== 13) || code === 127;
    })
  ) {
    badRequest(`${field} contains unsupported control characters`);
  }
  return normalized;
}

function matchingText(
  value: unknown,
  field: string,
  pattern: RegExp,
): string {
  const normalized = text(value, field, 1, 240);
  if (!pattern.test(normalized)) badRequest(`${field} has an invalid format`);
  return normalized;
}

function onlyKeys(value: Record<string, unknown>, allowed: string[]): void {
  const allowedKeys = new Set(allowed);
  const unexpected = Object.keys(value).find((key) => !allowedKeys.has(key));
  if (unexpected) badRequest(`Unexpected field: ${unexpected}`);
}

function rejectDuplicates(values: string[], label: string): void {
  if (new Set(values).size !== values.length) {
    badRequest(`${label} must be unique`);
  }
}
