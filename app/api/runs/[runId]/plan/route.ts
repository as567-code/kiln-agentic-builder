import { requireApiPrincipal } from "../../../../../lib/server/auth.ts";
import { getKilnStore } from "../../../../../lib/server/db.ts";
import { handleApi, jsonData } from "../../../../../lib/server/http.ts";
import {
  requireRouteId,
  type RouteContext,
} from "../../../../../lib/server/route-params.ts";

type Params = { runId: string };

export async function GET(
  request: Request,
  context: RouteContext<Params>,
): Promise<Response> {
  return handleApi(request, async ({ requestId }) => {
    const principal = requireApiPrincipal(request);
    const { runId: rawRunId } = await context.params;
    const runId = requireRouteId(rawRunId, "run");
    const plan = await getKilnStore().getPlan(principal.id, runId);
    return jsonData({ plan }, requestId);
  });
}
