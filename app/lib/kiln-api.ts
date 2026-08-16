export type ApiContract = {
  id: string;
  projectId: string;
  revision: number;
  title: string;
  summary: string;
  status: "draft" | "approved" | "superseded";
  requirements: Array<{
    id: string;
    statement: string;
    priority: "must" | "should" | "could";
  }>;
  systemShape: {
    pages: string[];
    entities: Array<{
      name: string;
      fields: Array<{ name: string; type: string; required: boolean }>;
    }>;
    apiOperations: Array<{
      method: string;
      path: string;
      purpose: string;
    }>;
  };
  acceptanceChecks: Array<{
    id: string;
    requirementId: string;
    description: string;
    kind: string;
  }>;
  assumptions: string[];
};

export type ApiPlan = {
  id: string;
  runId: string;
  contractId: string;
  revision: number;
  blueprint: string;
  steps: Array<{
    id: string;
    sequence: number;
    kind: string;
    title: string;
    description: string;
    capabilities: string[];
    touches: string[];
    estimatedSeconds: number;
  }>;
  estimatedModelCents: number;
  estimatedExecutionSeconds: number;
  risks: string[];
  status: "draft" | "approved";
};

export class KilnApiError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "KilnApiError";
    this.code = code;
  }
}

export async function postKiln<T>(path: string, body: object): Promise<T> {
  return requestKiln<T>(path, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

export async function getKiln<T>(path: string): Promise<T> {
  return requestKiln<T>(path, { method: "GET" });
}

async function requestKiln<T>(path: string, init: RequestInit): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("accept", "application/json");
  headers.set("x-request-id", `ui_${crypto.randomUUID().replaceAll("-", "")}`);
  const response = await fetch(path, {
    ...init,
    credentials: "same-origin",
    headers,
  });

  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = getError(payload);
    throw new KilnApiError(error.code, error.message);
  }
  if (!isRecord(payload) || !("data" in payload)) {
    throw new KilnApiError("invalid_response", "Kiln returned an invalid response");
  }
  return payload.data as T;
}

function getError(value: unknown): { code: string; message: string } {
  if (isRecord(value) && isRecord(value.error)) {
    const code = typeof value.error.code === "string" ? value.error.code : "request_failed";
    const message =
      typeof value.error.message === "string"
        ? value.error.message
        : "The request could not be completed";
    return { code, message };
  }
  return { code: "request_failed", message: "The request could not be completed" };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
