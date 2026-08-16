import { VercelSandboxProvider } from "./vercel-provider.ts";
import { verifyGeneratedWorkspace } from "./runner.ts";
import { parseExecutionContract } from "./contract.ts";
import type { ExecutionContract, GeneratedFile } from "./types.ts";

const POLL_INTERVAL_MS = 3_000;

export function startExecutorWorker(): AbortController {
  const controller = new AbortController();
  void runLoop(controller.signal);
  return controller;
}

async function runLoop(signal: AbortSignal): Promise<void> {
  while (!signal.aborted) {
    try {
      const worked = await pollOnce(signal);
      if (worked) continue;
    } catch (error) {
      console.error("Kiln executor worker iteration failed", {
        error: error instanceof Error ? error.name : "UnknownError",
      });
    }
    await delay(POLL_INTERVAL_MS, signal);
  }
}

export async function pollOnce(signal: AbortSignal): Promise<boolean> {
  const config = workerConfig();
  const claimResponse = await fetch(new URL("/api/internal/execution-jobs/claim", config.baseUrl), {
    method: "POST",
    redirect: "manual",
    signal,
    headers: serviceHeaders(config.token),
    body: "{}",
  });
  if (claimResponse.status === 204) return false;
  if (!claimResponse.ok) throw new Error("Control plane rejected an execution claim");
  const claim = parseClaim(await claimResponse.json());
  const report = await verifyGeneratedWorkspace({
    provider: new VercelSandboxProvider(),
    providerName: "vercel-firecracker",
    runId: claim.job.runId,
    files: claim.files,
    contract: claim.contract,
  });
  if (report.status === "failed") {
    const failedCheck = report.checks.find((check) => check.status !== "passed");
    console.warn("Kiln isolated verification failed", {
      runId: claim.job.runId,
      check: failedCheck,
    });
  }
  const completionUrl = new URL(
    `/api/internal/execution-jobs/${claim.job.id}/complete`,
    config.baseUrl,
  );
  const completionResponse = await fetch(completionUrl, {
    method: "POST",
    redirect: "manual",
    signal,
    headers: serviceHeaders(config.token),
    body: JSON.stringify({ leaseToken: claim.leaseToken, report }),
  });
  if (!completionResponse.ok) {
    throw new Error("Control plane rejected execution evidence");
  }
  return true;
}

function parseClaim(value: unknown): {
  job: { id: string; runId: string };
  leaseToken: string;
  files: GeneratedFile[];
  contract: ExecutionContract;
} {
  if (!isRecord(value) || !isRecord(value.data)) throw new Error("Claim envelope is invalid");
  const data = value.data;
  if (
    !isRecord(data.job) ||
    typeof data.job.id !== "string" ||
    typeof data.job.runId !== "string" ||
    typeof data.leaseToken !== "string" ||
    !Array.isArray(data.files) ||
    !("contract" in data)
  ) {
    throw new Error("Claim payload is invalid");
  }
  const files = data.files.map((file): GeneratedFile => {
    if (
      !isRecord(file) ||
      typeof file.path !== "string" ||
      typeof file.content !== "string" ||
      typeof file.sha256 !== "string"
    ) {
      throw new Error("Claim source file is invalid");
    }
    return { path: file.path, content: file.content, sha256: file.sha256 };
  });
  return {
    job: { id: data.job.id, runId: data.job.runId },
    leaseToken: data.leaseToken,
    files,
    contract: parseExecutionContract(data.contract),
  };
}

function workerConfig(): { baseUrl: URL; token: string } {
  const rawUrl = process.env.KILN_CONTROL_PLANE_URL;
  const token = process.env.KILN_EXECUTOR_SERVICE_TOKEN;
  if (!rawUrl || !token || token.length < 16) {
    throw new Error("Executor worker is not configured");
  }
  const baseUrl = new URL(rawUrl);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(baseUrl.hostname);
  if (
    (baseUrl.protocol !== "https:" && !(local && baseUrl.protocol === "http:")) ||
    baseUrl.username ||
    baseUrl.password
  ) {
    throw new Error("Executor control-plane URL is not allowed");
  }
  return { baseUrl, token };
}

function serviceHeaders(token: string): Record<string, string> {
  return {
    "content-type": "application/json",
    accept: "application/json",
    "x-kiln-service-token": token,
    "x-request-id": `req_${crypto.randomUUID().replaceAll("-", "")}`,
  };
}

function delay(durationMs: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timeout = setTimeout(resolve, durationMs);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timeout);
        resolve();
      },
      { once: true },
    );
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
