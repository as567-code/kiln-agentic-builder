import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { pathToFileURL } from "node:url";
import { VercelSandboxProvider } from "./vercel-provider.ts";
import { parseExecutionContract } from "./contract.ts";
import { verifyGeneratedWorkspace } from "./runner.ts";
import { startExecutorWorker } from "./worker.ts";
import type { ExecutionContract, GeneratedFile } from "./types.ts";

const MAX_REQUEST_BYTES = 1200 * 1024;
const MAX_CONCURRENT_RUNS = 4;
const activeRuns = new Set<string>();

export const executorServer = createServer(async (request, response) => {
  const requestId = requestIdFor(request);
  setSecurityHeaders(response, requestId);
  try {
    const url = new URL(request.url ?? "/", "http://executor.internal");
    if (request.method === "GET" && url.pathname === "/healthz") {
      sendJson(response, 200, { status: "ok", service: "kiln-executor" });
      return;
    }
    if (request.method === "GET" && url.pathname === "/readyz") {
      const ready = Boolean(
        process.env.KILN_BLUEPRINT_SNAPSHOT_ID &&
          (process.env.VERCEL_OIDC_TOKEN ||
            (process.env.VERCEL_TOKEN &&
              process.env.VERCEL_TEAM_ID &&
              process.env.VERCEL_PROJECT_ID)),
      );
      sendJson(response, ready ? 200 : 503, {
        status: ready ? "ready" : "not_ready",
        provider: "vercel-sandbox",
      });
      return;
    }
    if (request.method !== "POST" || url.pathname !== "/v1/runs/verify") {
      sendJson(response, 404, { error: "not_found" });
      return;
    }
    requireServiceToken(request);
    if (request.headers["content-type"]?.split(";", 1)[0] !== "application/json") {
      sendJson(response, 415, { error: "unsupported_media_type" });
      return;
    }
    if (activeRuns.size >= MAX_CONCURRENT_RUNS) {
      sendJson(response, 503, { error: "executor_capacity_reached" });
      return;
    }
    const input = parseVerificationRequest(await readRequest(request));
    if (activeRuns.has(input.runId)) {
      sendJson(response, 409, { error: "run_already_active" });
      return;
    }
    activeRuns.add(input.runId);
    try {
      const report = await verifyGeneratedWorkspace({
        provider: new VercelSandboxProvider(),
        providerName: "vercel-firecracker",
        runId: input.runId,
        files: input.files,
        contract: input.contract,
      });
      sendJson(response, 200, report);
    } finally {
      activeRuns.delete(input.runId);
    }
  } catch (error) {
    const status = error instanceof ExecutorRequestError ? error.status : 502;
    console.error("Kiln executor request failed", {
      requestId,
      error: error instanceof Error ? error.name : "UnknownError",
    });
    sendJson(response, status, {
      error: status < 500 ? "invalid_request" : "execution_failed",
    });
  }
});

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const port = boundedPort(process.env.PORT);
  executorServer.listen(port, "127.0.0.1", () => {
    console.log(`Kiln executor listening on http://127.0.0.1:${port}`);
  });
  if (process.env.KILN_CONTROL_PLANE_URL) {
    const worker = startExecutorWorker();
    for (const signal of ["SIGINT", "SIGTERM"] as const) {
      process.once(signal, () => worker.abort());
    }
  }
}

class ExecutorRequestError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ExecutorRequestError";
    this.status = status;
  }
}

function parseVerificationRequest(value: unknown): {
  runId: string;
  files: GeneratedFile[];
  contract: ExecutionContract;
} {
  if (
    !isRecord(value) ||
    Object.keys(value).some((key) => !["runId", "files", "contract"].includes(key))
  ) {
    throw new ExecutorRequestError(400, "Request contains an unsupported field");
  }
  if (typeof value.runId !== "string" || !/^run_[a-f0-9]{32}$/.test(value.runId)) {
    throw new ExecutorRequestError(400, "Run ID is invalid");
  }
  if (!Array.isArray(value.files) || value.files.length < 1 || value.files.length > 40) {
    throw new ExecutorRequestError(400, "Files are invalid");
  }
  const files = value.files.map((item): GeneratedFile => {
    if (
      !isRecord(item) ||
      Object.keys(item).some((key) => !["path", "content", "sha256"].includes(key)) ||
      typeof item.path !== "string" ||
      typeof item.content !== "string" ||
      typeof item.sha256 !== "string"
    ) {
      throw new ExecutorRequestError(400, "A generated file is invalid");
    }
    return { path: item.path, content: item.content, sha256: item.sha256 };
  });
  try {
    return {
      runId: value.runId,
      files,
      contract: parseExecutionContract(value.contract),
    };
  } catch {
    throw new ExecutorRequestError(400, "Execution contract is invalid");
  }
}

async function readRequest(request: IncomingMessage): Promise<unknown> {
  const declared = Number(request.headers["content-length"] ?? "0");
  if (!Number.isSafeInteger(declared) || declared < 0 || declared > MAX_REQUEST_BYTES) {
    throw new ExecutorRequestError(413, "Request is too large");
  }
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of request) {
    const bytes = typeof chunk === "string" ? new TextEncoder().encode(chunk) : chunk;
    size += bytes.byteLength;
    if (size > MAX_REQUEST_BYTES) {
      throw new ExecutorRequestError(413, "Request is too large");
    }
    chunks.push(bytes);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new ExecutorRequestError(400, "Request body is not valid JSON");
  }
}

function requireServiceToken(request: IncomingMessage): void {
  const expected = process.env.KILN_EXECUTOR_SERVICE_TOKEN;
  const supplied = request.headers["x-kiln-service-token"];
  if (!expected || typeof supplied !== "string") {
    throw new ExecutorRequestError(401, "Service authentication failed");
  }
  const expectedBytes = Buffer.from(expected);
  const suppliedBytes = Buffer.from(supplied);
  if (
    expectedBytes.byteLength !== suppliedBytes.byteLength ||
    !timingSafeEqual(expectedBytes, suppliedBytes)
  ) {
    throw new ExecutorRequestError(401, "Service authentication failed");
  }
}

function requestIdFor(request: IncomingMessage): string {
  const value = request.headers["x-request-id"];
  return typeof value === "string" && /^[A-Za-z0-9._:-]{1,128}$/.test(value)
    ? value
    : `req_${crypto.randomUUID().replaceAll("-", "")}`;
}

function setSecurityHeaders(response: ServerResponse, requestId: string): void {
  response.setHeader("X-Request-Id", requestId);
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Referrer-Policy", "no-referrer");
}

function sendJson(response: ServerResponse, status: number, value: unknown): void {
  if (response.headersSent || response.writableEnded) return;
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(value));
}

function boundedPort(value: string | undefined): number {
  const port = Number(value ?? "8200");
  return Number.isInteger(port) && port >= 1024 && port <= 65_535 ? port : 8200;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
