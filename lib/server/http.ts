import { ApiError } from "./api-error.ts";

const MAX_JSON_BYTES = 64 * 1024;
const REQUEST_ID = /^[A-Za-z0-9._:-]{1,128}$/;

export type ApiContext = {
  requestId: string;
};

export async function handleApi(
  request: Request,
  handler: (context: ApiContext) => Promise<Response>,
): Promise<Response> {
  const suppliedRequestId = request.headers.get("x-request-id");
  const requestId =
    suppliedRequestId && REQUEST_ID.test(suppliedRequestId)
      ? suppliedRequestId
      : `req_${crypto.randomUUID().replaceAll("-", "")}`;

  try {
    const response = await handler({ requestId });
    return secureResponse(response, requestId);
  } catch (error) {
    if (error instanceof ApiError) {
      return secureResponse(
        Response.json(
          {
            error: {
              code: error.code,
              message: error.expose ? error.message : "Request failed",
            },
            requestId,
          },
          { status: error.status },
        ),
        requestId,
      );
    }

    console.error("Kiln API request failed", {
      requestId,
      error: error instanceof Error ? error.name : "UnknownError",
    });
    return secureResponse(
      Response.json(
        {
          error: {
            code: "internal_error",
            message: "The request could not be completed",
          },
          requestId,
        },
        { status: 500 },
      ),
      requestId,
    );
  }
}

export function jsonData(
  data: unknown,
  requestId: string,
  init: ResponseInit = {},
): Response {
  return Response.json(
    { data, meta: { requestId } },
    { ...init, headers: init.headers },
  );
}

export function assertMutationRequest(
  request: Request,
  maxJsonBytes = MAX_JSON_BYTES,
): void {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0];
  if (contentType !== "application/json") {
    throw new ApiError(
      415,
      "unsupported_media_type",
      "Content-Type must be application/json",
    );
  }

  const url = new URL(request.url);
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  if (origin && origin !== url.origin) {
    throw new ApiError(403, "origin_rejected", "Request origin is not allowed");
  }
  if (fetchSite === "cross-site") {
    throw new ApiError(403, "origin_rejected", "Cross-site mutations are not allowed");
  }

  const lengthHeader = request.headers.get("content-length");
  if (lengthHeader) {
    const length = Number(lengthHeader);
    if (!Number.isSafeInteger(length) || length < 0) {
      throw new ApiError(400, "invalid_content_length", "Invalid Content-Length");
    }
    if (length > maxJsonBytes) {
      throw new ApiError(413, "request_too_large", "Request body is too large");
    }
  }
}

export async function readJsonObject(
  request: Request,
  maxJsonBytes = MAX_JSON_BYTES,
): Promise<Record<string, unknown>> {
  assertMutationRequest(request, maxJsonBytes);
  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > maxJsonBytes) {
    throw new ApiError(413, "request_too_large", "Request body is too large");
  }

  let value: unknown;
  try {
    value = JSON.parse(body);
  } catch {
    throw new ApiError(400, "invalid_json", "Request body must be valid JSON");
  }
  if (!isRecord(value)) {
    throw new ApiError(400, "invalid_json_shape", "Request body must be an object");
  }
  return value;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function secureResponse(response: Response, requestId: string): Response {
  const headers = new Headers(response.headers);
  headers.set("x-request-id", requestId);
  headers.set("x-content-type-options", "nosniff");
  headers.set("cache-control", "no-store");
  headers.set("referrer-policy", "no-referrer");
  headers.set("cross-origin-resource-policy", "same-origin");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
