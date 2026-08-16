import { timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { pollOnce } from "../services/executor/src/worker.ts";

export default async function handler(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  response.setHeader("cache-control", "no-store");
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("x-content-type-options", "nosniff");
  const url = new URL(request.url ?? "/", "https://executor.invalid");
  const route = url.searchParams.get("kiln_route");

  if (request.method === "GET" && route === "healthz") {
    sendJson(response, 200, { status: "ok", service: "kiln-executor" });
    return;
  }
  if (request.method === "GET" && route === "readyz") {
    const ready = Boolean(
      process.env.KILN_BLUEPRINT_SNAPSHOT_ID &&
        process.env.KILN_CONTROL_PLANE_URL &&
        process.env.KILN_EXECUTOR_SERVICE_TOKEN,
    );
    sendJson(response, ready ? 200 : 503, {
      status: ready ? "ready" : "not_ready",
      provider: "vercel-sandbox",
    });
    return;
  }
  if (request.method !== "POST" || route !== "dispatch") {
    sendJson(response, 404, { error: "not_found" });
    return;
  }
  if (!hasValidServiceToken(request)) {
    sendJson(response, 401, { error: "service_authentication_failed" });
    return;
  }

  try {
    const worked = await pollOnce(AbortSignal.timeout(295_000));
    sendJson(response, 200, { worked });
  } catch (error) {
    console.error("Kiln executor dispatch failed", {
      error: error instanceof Error ? error.name : "UnknownError",
    });
    sendJson(response, 502, { error: "execution_failed" });
  }
}

function hasValidServiceToken(request: IncomingMessage): boolean {
  const expected = process.env.KILN_EXECUTOR_SERVICE_TOKEN;
  const supplied = request.headers["x-kiln-service-token"];
  if (!expected || typeof supplied !== "string") return false;
  const expectedBytes = Buffer.from(expected);
  const suppliedBytes = Buffer.from(supplied);
  return (
    expectedBytes.byteLength === suppliedBytes.byteLength &&
    timingSafeEqual(expectedBytes, suppliedBytes)
  );
}

function sendJson(response: ServerResponse, status: number, value: unknown): void {
  response.statusCode = status;
  response.end(JSON.stringify(value));
}
