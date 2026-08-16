import { ApiError } from "../../../../../../lib/server/api-error.ts";
import {
  digestText,
  getArtifactRepository,
} from "../../../../../../lib/server/artifacts.ts";
import { requireApiPrincipal } from "../../../../../../lib/server/auth.ts";
import { getKilnStore } from "../../../../../../lib/server/db.ts";
import {
  handleApi,
  isRecord,
  jsonData,
} from "../../../../../../lib/server/http.ts";
import {
  requireRouteId,
  type RouteContext,
} from "../../../../../../lib/server/route-params.ts";

type Params = { runId: string; patchId: string };

export async function GET(
  request: Request,
  context: RouteContext<Params>,
): Promise<Response> {
  return handleApi(request, async ({ requestId }) => {
    const principal = requireApiPrincipal(request);
    const params = await context.params;
    const runId = requireRouteId(params.runId, "run");
    const patchId = requireRouteId(params.patchId, "patch");
    const patch = await getKilnStore().getPatch(principal.id, runId, patchId);
    const body = await getArtifactRepository().getText(patch.artifactKey, 1024 * 1024);
    if ((await digestText(body)) !== patch.patchHash) {
      throw new ApiError(
        500,
        "patch_integrity_failed",
        "Stored patch evidence failed its integrity check",
        false,
      );
    }
    let artifact: unknown;
    try {
      artifact = JSON.parse(body);
    } catch {
      throw new ApiError(
        500,
        "artifact_corrupt",
        "Stored patch evidence is not valid JSON",
        false,
      );
    }
    if (!isRecord(artifact) || artifact.runId !== runId || artifact.sequence !== patch.sequence) {
      throw new ApiError(
        500,
        "patch_integrity_failed",
        "Stored patch evidence does not match its database record",
        false,
      );
    }
    return jsonData({ patch, artifact }, requestId);
  });
}
