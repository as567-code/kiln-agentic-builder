import { ApiError, conflict } from "../../../../../lib/server/api-error.ts";
import {
  digestText,
  getArtifactRepository,
} from "../../../../../lib/server/artifacts.ts";
import { requireApiPrincipal } from "../../../../../lib/server/auth.ts";
import { getKilnStore } from "../../../../../lib/server/db.ts";
import { handleApi, jsonData, readJsonObject } from "../../../../../lib/server/http.ts";
import {
  requireRouteId,
  type RouteContext,
} from "../../../../../lib/server/route-params.ts";

type Params = { runId: string };

export async function POST(
  request: Request,
  context: RouteContext<Params>,
): Promise<Response> {
  return handleApi(request, async ({ requestId }) => {
    const principal = requireApiPrincipal(request);
    const { runId: rawRunId } = await context.params;
    const runId = requireRouteId(rawRunId, "run");
    const body = await readJsonObject(request);
    if (Object.keys(body).length !== 0) {
      throw new ApiError(400, "invalid_request", "Verification requests must use an empty object");
    }
    const store = getKilnStore();
    await store.consumeRateLimit(principal.id, "verification.queue", 8);
    const snapshots = (await store.listCurrentFileSnapshots(principal.id, runId)).filter(
      (snapshot) => !snapshot.deleted,
    );
    if (snapshots.length === 0) {
      conflict("At least one generated source file is required", "source_required");
    }
    const artifacts = getArtifactRepository();
    const contract = await store.getRunContract(principal.id, runId);
    const files = await Promise.all(
      snapshots.map(async (snapshot) => {
        const content = await artifacts.getText(snapshot.objectKey);
        if ((await digestText(content)) !== snapshot.sha256) {
          throw new ApiError(
            500,
            "snapshot_integrity_failed",
            "A source snapshot failed its integrity check",
            false,
          );
        }
        return { path: snapshot.path, content, sha256: snapshot.sha256 };
      }),
    );
    const payload = await artifacts.putJson(
      `runs/${runId}/execution/input-${crypto.randomUUID()}.json`,
      {
        version: 1,
        runId,
        blueprint: "react-fastapi-postgres-v1",
        contract: {
          title: contract.title,
          requirementIds: contract.requirements.map((requirement) => requirement.id),
          entities: contract.systemShape.entities,
          apiOperations: contract.systemShape.apiOperations.map((operation) => ({
            method: operation.method,
            path: operation.path,
          })),
        },
        files,
      },
    );
    const result = await store.queueVerification(principal.id, runId, payload);
    return jsonData(result, requestId, { status: 202 });
  });
}
