import { env } from "cloudflare:workers";
import {
  validatePatchDraft,
  type PatchDraft,
  type PatchStage,
} from "../../packages/contracts/src/patch.ts";
import { normalizeWorkspacePath } from "../../packages/contracts/src/policy.ts";
import { ApiError } from "./api-error.ts";
import { isRecord } from "./http.ts";
import { parseContractDraft, type ContractDraftInput } from "./input.ts";
import type { ContractRecord } from "./store.ts";

const MAX_UPSTREAM_BYTES = 128 * 1024;

export type ContractDraftResult = {
  draft: ContractDraftInput;
  clarificationQuestions: string[];
  provenance: {
    planner: string;
    model: string;
    providerRequestId: string | null;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
};

export type PatchDraftResult = {
  draft: PatchDraft;
  provenance: ContractDraftResult["provenance"];
};

export type RepairDiagnostic = {
  checkId: string;
  status: "failed" | "timed_out";
  exitCode: number | null;
  stdout: string;
  stderr: string;
  outputTruncated: boolean;
};

export function getOrchestratorClient(): OrchestratorClient {
  return new OrchestratorClient({
    baseUrl: env.KILN_ORCHESTRATOR_URL,
    serviceToken: env.KILN_SERVICE_TOKEN,
  });
}

export class OrchestratorClient {
  private readonly contractEndpoint: URL;
  private readonly patchEndpoint: URL;
  private readonly serviceToken: string;

  constructor(config: { baseUrl?: string; serviceToken?: string }) {
    if (!config.baseUrl || !config.serviceToken) {
      throw new ApiError(
        503,
        "orchestrator_unavailable",
        "The planning service is not configured",
      );
    }
    this.contractEndpoint = serviceEndpoint(config.baseUrl, "/v1/contracts/draft");
    this.patchEndpoint = serviceEndpoint(config.baseUrl, "/v1/patches/propose");
    this.serviceToken = config.serviceToken;
  }

  async draftContract(input: {
    projectId: string;
    brief: string;
    requestId: string;
  }): Promise<ContractDraftResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 35_000);
    let response: Response;
    try {
      response = await fetch(this.contractEndpoint, {
        method: "POST",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "content-type": "application/json",
          accept: "application/json",
          "x-kiln-service-token": this.serviceToken,
          "x-request-id": input.requestId,
        },
        body: JSON.stringify({
          project_id: input.projectId,
          brief: input.brief,
        }),
      });
    } catch (error) {
      if (error instanceof ApiError) throw error;
      console.error("Kiln orchestrator request failed", {
        error: error instanceof Error ? error.name : "UnknownError",
        detail: error instanceof Error ? error.message.slice(0, 240) : "unavailable",
      });
      throw new ApiError(
        502,
        "planner_request_failed",
        "The planning service could not be reached",
      );
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      throw new ApiError(
        502,
        "planner_request_failed",
        "The planning service could not produce a contract",
      );
    }
    const declaredLength = Number(response.headers.get("content-length") ?? "0");
    if (declaredLength > MAX_UPSTREAM_BYTES) {
      throw new ApiError(502, "planner_response_invalid", "Planning response is too large");
    }
    const body = await response.text();
    if (new TextEncoder().encode(body).byteLength > MAX_UPSTREAM_BYTES) {
      throw new ApiError(502, "planner_response_invalid", "Planning response is too large");
    }

    let payload: unknown;
    try {
      payload = JSON.parse(body);
    } catch {
      throw new ApiError(502, "planner_response_invalid", "Planning response is invalid");
    }
    return parsePlannerPayload(payload);
  }

  async proposePatch(input: {
    runId: string;
    sequence: number;
    stage: PatchStage;
    contract: ContractRecord;
    files: Array<{ path: string; sha256: string; content: string }>;
    targetPaths: string[];
    diagnostics?: RepairDiagnostic[];
    requestId: string;
  }): Promise<PatchDraftResult> {
    const targetPaths = normalizeTargetPaths(input.targetPaths, input.stage);
    const fileContext = validateFileContext(input.files);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 35_000);
    let response: Response;
    try {
      response = await fetch(this.patchEndpoint, {
        method: "POST",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "content-type": "application/json",
          accept: "application/json",
          "x-kiln-service-token": this.serviceToken,
          "x-request-id": input.requestId,
        },
        body: JSON.stringify({
          run_id: input.runId,
          sequence: input.sequence,
          stage: input.stage,
          contract: contractToWire(input.contract),
          files: fileContext,
          target_paths: targetPaths,
          diagnostics: (input.diagnostics ?? []).map((diagnostic) => ({
            check_id: diagnostic.checkId,
            status: diagnostic.status,
            exit_code: diagnostic.exitCode,
            stdout: diagnostic.stdout,
            stderr: diagnostic.stderr,
            output_truncated: diagnostic.outputTruncated,
          })),
        }),
      });
    } catch (error) {
      console.error("Kiln patch planner request failed", {
        error: error instanceof Error ? error.name : "UnknownError",
        detail: error instanceof Error ? error.message.slice(0, 240) : "unavailable",
      });
      throw new ApiError(
        502,
        "patch_planner_request_failed",
        "The planning service could not be reached",
      );
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      throw new ApiError(
        502,
        "patch_planner_request_failed",
        "The planning service could not produce a patch",
      );
    }
    const payload = await boundedJsonResponse(response, 1150 * 1024, "patch planner");
    return parsePatchPayload(
      payload,
      new Set(input.contract.requirements.map((item) => item.id)),
      new Set(targetPaths),
    );
  }
}

function parsePlannerPayload(value: unknown): ContractDraftResult {
  const payload = record(value, "response");
  const shape = record(payload.system_shape, "system_shape");
  const operations = list(shape.api_operations, "system_shape.api_operations").map(
    (item, index) => {
      const operation = record(item, `system_shape.api_operations[${index}]`);
      return {
        method: operation.method,
        path: operation.path,
        purpose: operation.purpose,
      };
    },
  );
  const checks = list(payload.acceptance_checks, "acceptance_checks").map(
    (item, index) => {
      const check = record(item, `acceptance_checks[${index}]`);
      return {
        id: check.id,
        requirementId: check.requirement_id,
        description: check.description,
        kind: check.kind,
      };
    },
  );
  const draft = parseContractDraft({
    title: payload.title,
    summary: payload.summary,
    requirements: payload.requirements,
    systemShape: {
      pages: shape.pages,
      entities: shape.entities,
      apiOperations: operations,
    },
    acceptanceChecks: checks,
    assumptions: payload.assumptions,
  });
  const usage = record(payload.usage, "usage");

  return {
    draft,
    clarificationQuestions: textList(
      payload.clarification_questions,
      "clarification_questions",
      3,
      240,
    ),
    provenance: {
      planner: boundedText(payload.planner, "planner", 100),
      model: boundedText(payload.model, "model", 100),
      providerRequestId:
        payload.provider_request_id === null
          ? null
          : boundedText(payload.provider_request_id, "provider_request_id", 160),
      inputTokens: nonNegativeInteger(usage.input_tokens, "usage.input_tokens"),
      outputTokens: nonNegativeInteger(usage.output_tokens, "usage.output_tokens"),
      totalTokens: nonNegativeInteger(usage.total_tokens, "usage.total_tokens"),
    },
  };
}

function serviceEndpoint(value: string, path: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ApiError(503, "orchestrator_misconfigured", "Planning service URL is invalid");
  }
  const localHost = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if ((url.protocol !== "https:" && !(localHost && url.protocol === "http:")) || url.username || url.password) {
    throw new ApiError(503, "orchestrator_misconfigured", "Planning service URL is not allowed");
  }
  url.pathname = `${url.pathname.replace(/\/$/, "")}${path}`;
  url.search = "";
  url.hash = "";
  return url;
}

async function boundedJsonResponse(
  response: Response,
  maxBytes: number,
  source: string,
): Promise<unknown> {
  const declaredLength = Number(response.headers.get("content-length") ?? "0");
  if (declaredLength > maxBytes) {
    throw new ApiError(502, "planner_response_invalid", `${source} response is too large`);
  }
  const body = await response.text();
  if (new TextEncoder().encode(body).byteLength > maxBytes) {
    throw new ApiError(502, "planner_response_invalid", `${source} response is too large`);
  }
  try {
    return JSON.parse(body);
  } catch {
    throw new ApiError(502, "planner_response_invalid", `${source} response is invalid`);
  }
}

function parsePatchPayload(
  value: unknown,
  requirementIds: ReadonlySet<string>,
  targetPaths: ReadonlySet<string>,
): PatchDraftResult {
  const payload = record(value, "response");
  const changes = list(payload.changes, "changes").map((item, index) => {
    const change = record(item, `changes[${index}]`);
    return {
      path: change.path,
      operation: change.operation,
      content: change.content === null ? undefined : change.content,
      expectedSha256:
        change.expected_sha256 === null ? undefined : change.expected_sha256,
    };
  });
  let draft: PatchDraft;
  try {
    draft = validatePatchDraft(
      {
        summary: payload.summary,
        rationale: payload.rationale,
        requirementIds: payload.requirement_ids,
        changes,
      },
      requirementIds,
    );
  } catch {
    invalid("patch");
  }
  if (draft.changes.some((change) => !targetPaths.has(change.path))) {
    invalid("changes.path");
  }
  const usage = record(payload.usage, "usage");
  return {
    draft,
    provenance: {
      planner: boundedText(payload.planner, "planner", 100),
      model: boundedText(payload.model, "model", 100),
      providerRequestId:
        payload.provider_request_id === null
          ? null
          : boundedText(payload.provider_request_id, "provider_request_id", 160),
      inputTokens: nonNegativeInteger(usage.input_tokens, "usage.input_tokens"),
      outputTokens: nonNegativeInteger(usage.output_tokens, "usage.output_tokens"),
      totalTokens: nonNegativeInteger(usage.total_tokens, "usage.total_tokens"),
    },
  };
}

function contractToWire(contract: ContractRecord): Record<string, unknown> {
  return {
    title: contract.title,
    summary: contract.summary,
    requirements: contract.requirements,
    system_shape: {
      pages: contract.systemShape.pages,
      entities: contract.systemShape.entities,
      api_operations: contract.systemShape.apiOperations,
    },
    acceptance_checks: contract.acceptanceChecks.map((check) => ({
      id: check.id,
      requirement_id: check.requirementId,
      description: check.description,
      kind: check.kind,
    })),
    assumptions: contract.assumptions,
    clarification_questions: [],
  };
}

function normalizeTargetPaths(paths: string[], stage: PatchStage): string[] {
  if (paths.length < 1 || paths.length > 20) invalid("target_paths");
  const normalized = paths.map(normalizeWorkspacePath);
  if (new Set(normalized).size !== normalized.length) invalid("target_paths");
  if (stage === "repair" && normalized.some(isTestOrPolicyPath)) {
    throw new ApiError(
      409,
      "repair_scope_rejected",
      "Repair patches cannot modify tests or security policy",
    );
  }
  return normalized;
}

function validateFileContext(
  files: Array<{ path: string; sha256: string; content: string }>,
): Array<{ path: string; sha256: string; content: string }> {
  if (files.length > 40) invalid("files");
  let totalBytes = 0;
  return files.map((file) => {
    const path = normalizeWorkspacePath(file.path);
    if (!/^[a-f0-9]{64}$/.test(file.sha256)) invalid("files.sha256");
    const bytes = new TextEncoder().encode(file.content).byteLength;
    totalBytes += bytes;
    if (bytes > 12_000 || totalBytes > 200_000 || file.content.includes("\0")) {
      invalid("files.content");
    }
    return { path, sha256: file.sha256, content: file.content };
  });
}

function isTestOrPolicyPath(path: string): boolean {
  const lower = path.toLowerCase();
  return (
    lower.split("/").includes("tests") ||
    lower.includes(".test.") ||
    lower.includes(".spec.") ||
    lower === "security.md" ||
    lower === "kiln.policy.json"
  );
}

function record(value: unknown, field: string): Record<string, unknown> {
  if (!isRecord(value)) invalid(field);
  return value;
}

function list(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) invalid(field);
  return value;
}

function textList(
  value: unknown,
  field: string,
  maxItems: number,
  maxLength: number,
): string[] {
  const values = list(value, field);
  if (values.length > maxItems) invalid(field);
  return values.map((item, index) => boundedText(item, `${field}[${index}]`, maxLength));
}

function boundedText(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== "string" || value.length < 1 || value.length > maxLength) {
    invalid(field);
  }
  return value;
}

function nonNegativeInteger(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) invalid(field);
  return Number(value);
}

function invalid(field: string): never {
  throw new ApiError(
    502,
    "planner_response_invalid",
    `Planning response failed validation at ${field}`,
  );
}
