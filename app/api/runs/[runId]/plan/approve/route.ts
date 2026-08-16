import { badRequest } from "../../../../../../lib/server/api-error.ts";
import { requireApiPrincipal } from "../../../../../../lib/server/auth.ts";
import { getKilnStore } from "../../../../../../lib/server/db.ts";
import {
  handleApi,
  jsonData,
  readJsonObject,
} from "../../../../../../lib/server/http.ts";
import {
  requireRouteId,
  type RouteContext,
} from "../../../../../../lib/server/route-params.ts";

type Params = { runId: string };

export async function POST(
  request: Request,
  context: RouteContext<Params>,
): Promise<Response> {
  return handleApi(request, async ({ requestId }) => {
    const principal = requireApiPrincipal(request);
    const { runId: rawRunId } = await context.params;
    const runId = requireRouteId(rawRunId, "run");
    const store = getKilnStore();
    await store.consumeRateLimit(principal.id, "plans.approve", 12);
    const body = await readJsonObject(request);
    if (Object.keys(body).length !== 0) {
      badRequest("Plan approval requests must use an empty JSON object");
    }
    const result = await store.approvePlan(principal.id, runId);
    return jsonData(result, requestId);
  });
}
