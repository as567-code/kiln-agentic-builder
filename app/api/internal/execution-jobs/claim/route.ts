import { ApiError } from "../../../../../lib/server/api-error.ts";
import { getArtifactRepository } from "../../../../../lib/server/artifacts.ts";
import { getKilnStore } from "../../../../../lib/server/db.ts";
import { handleApi, isRecord, jsonData, readJsonObject } from "../../../../../lib/server/http.ts";
import { requireExecutorService, tokenHash } from "../../../../../lib/server/service-auth.ts";
import { parseExecutionContract } from "../../../../../packages/contracts/src/execution.ts";

export async function POST(request: Request): Promise<Response> {
  return handleApi(request, async ({ requestId }) => {
    await requireExecutorService(request);
    const body = await readJsonObject(request);
    if (Object.keys(body).length !== 0) {
      throw new ApiError(400, "invalid_request", "Claim requests must use an empty object");
    }
    const leaseToken = `lease_${crypto.randomUUID().replaceAll("-", "")}${crypto
      .randomUUID()
      .replaceAll("-", "")}`;
    const job = await getKilnStore().claimExecutionJob(await tokenHash(leaseToken));
    if (!job) return new Response(null, { status: 204 });
    const payload = await getArtifactRepository().getJson<unknown>(job.payloadArtifactKey);
    const execution = validateExecutionPayload(payload, job.runId);
    return jsonData(
      {
        job: {
          id: job.id,
          runId: job.runId,
          attempt: job.attempt,
          maxAttempts: job.maxAttempts,
          leaseExpiresAt: job.leaseExpiresAt,
        },
        leaseToken,
        files: execution.files,
        contract: execution.contract,
      },
      requestId,
    );
  });
}

function validateExecutionPayload(
  value: unknown,
  runId: string,
): {
  files: Array<{ path: string; content: string; sha256: string }>;
  contract: ReturnType<typeof parseExecutionContract>;
} {
  if (!isRecord(value) || value.version !== 1 || value.runId !== runId) {
    throw new ApiError(500, "execution_payload_invalid", "Execution payload is invalid", false);
  }
  if (!Array.isArray(value.files) || value.files.length < 1 || value.files.length > 40) {
    throw new ApiError(500, "execution_payload_invalid", "Execution payload is invalid", false);
  }
  let contract: ReturnType<typeof parseExecutionContract>;
  try {
    contract = parseExecutionContract(value.contract);
  } catch {
    throw new ApiError(500, "execution_payload_invalid", "Execution payload is invalid", false);
  }
  const files = value.files.map((item) => {
    if (
      !isRecord(item) ||
      typeof item.path !== "string" ||
      typeof item.content !== "string" ||
      typeof item.sha256 !== "string"
    ) {
      throw new ApiError(500, "execution_payload_invalid", "Execution payload is invalid", false);
    }
    return { path: item.path, content: item.content, sha256: item.sha256 };
  });
  return { files, contract };
}
