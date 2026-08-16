import { ApiError } from "../../../../../../lib/server/api-error.ts";
import { getArtifactRepository } from "../../../../../../lib/server/artifacts.ts";
import { getKilnStore } from "../../../../../../lib/server/db.ts";
import { handleApi, jsonData, readJsonObject } from "../../../../../../lib/server/http.ts";
import {
  requireRouteId,
  type RouteContext,
} from "../../../../../../lib/server/route-params.ts";
import { requireExecutorService, tokenHash } from "../../../../../../lib/server/service-auth.ts";
import { parseVerificationReport } from "../../../../../../lib/server/verification.ts";

type Params = { jobId: string };

export async function POST(
  request: Request,
  context: RouteContext<Params>,
): Promise<Response> {
  return handleApi(request, async ({ requestId }) => {
    await requireExecutorService(request);
    const { jobId: rawJobId } = await context.params;
    const jobId = requireRouteId(rawJobId, "job");
    const body = await readJsonObject(request, 320 * 1024);
    const extra = Object.keys(body).find((key) => key !== "leaseToken" && key !== "report");
    if (extra) throw new ApiError(400, "invalid_request", `Unexpected field: ${extra}`);
    if (
      typeof body.leaseToken !== "string" ||
      !/^lease_[a-f0-9]{64}$/.test(body.leaseToken)
    ) {
      throw new ApiError(400, "invalid_request", "Execution lease token is invalid");
    }
    const report = parseVerificationReport(body.report);
    const artifact = await getArtifactRepository().putJson(
      `jobs/${jobId}/verification-${crypto.randomUUID()}.json`,
      { version: 1, jobId, report },
    );
    const result = await getKilnStore().completeExecutionJob(
      jobId,
      await tokenHash(body.leaseToken),
      artifact,
      report,
    );
    return jsonData(result, requestId);
  });
}
