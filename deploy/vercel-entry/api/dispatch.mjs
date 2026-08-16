const SAFE_ORIGIN = /^https:\/\/[a-z0-9-]+(?:-[a-z0-9-]+)*\.vercel\.app$/;

export default async function handler(request, response) {
  response.setHeader("cache-control", "no-store");
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("x-content-type-options", "nosniff");
  if (request.method !== "POST") {
    response.statusCode = 405;
    response.setHeader("allow", "POST");
    response.end(
      JSON.stringify({
        error: { code: "method_not_allowed", message: "POST is required" },
      }),
    );
    return;
  }

  const origin = request.headers.origin;
  const expectedOrigin = `https://${request.headers.host ?? ""}`;
  if (!origin || origin !== expectedOrigin || !SAFE_ORIGIN.test(origin)) {
    response.statusCode = 403;
    response.end(
      JSON.stringify({
        error: {
          code: "cross_origin_request",
          message: "Request origin is not allowed",
        },
      }),
    );
    return;
  }

  const executorUrl = process.env.KILN_EXECUTOR_URL;
  const serviceToken = process.env.KILN_EXECUTOR_SERVICE_TOKEN;
  if (!executorUrl || !serviceToken) {
    response.statusCode = 503;
    response.end(
      JSON.stringify({
        error: {
          code: "executor_unavailable",
          message: "Verification is not configured",
        },
      }),
    );
    return;
  }

  try {
    const upstream = await fetch(new URL("/v1/jobs/dispatch", executorUrl), {
      method: "POST",
      redirect: "manual",
      signal: AbortSignal.timeout(295_000),
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "x-kiln-service-token": serviceToken,
        "x-request-id": boundedRequestId(request.headers["x-request-id"]),
      },
      body: "{}",
    });
    if (!upstream.ok) {
      response.statusCode = 502;
      response.end(
        JSON.stringify({
          error: {
            code: "execution_failed",
            message: "The isolated runner could not complete verification",
          },
        }),
      );
      return;
    }
    const result = await upstream.json();
    response.statusCode = 200;
    response.end(JSON.stringify({ data: result }));
  } catch {
    response.statusCode = 502;
    response.end(
      JSON.stringify({
        error: {
          code: "execution_failed",
          message: "The isolated runner could not be reached",
        },
      }),
    );
  }
}

function boundedRequestId(value) {
  return typeof value === "string" && /^[A-Za-z0-9._:-]{1,128}$/.test(value)
    ? value
    : `req_${crypto.randomUUID().replaceAll("-", "")}`;
}
