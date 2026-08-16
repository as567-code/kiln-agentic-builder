import { requireApiPrincipal } from "../../../../../lib/server/auth.ts";
import { getKilnStore } from "../../../../../lib/server/db.ts";
import { handleApi, jsonData, readJsonObject } from "../../../../../lib/server/http.ts";
import { parseCreateRun } from "../../../../../lib/server/input.ts";
import {
  requireRouteId,
  type RouteContext,
} from "../../../../../lib/server/route-params.ts";

type Params = { projectId: string };

export async function GET(
  request: Request,
  context: RouteContext<Params>,
): Promise<Response> {
  return handleApi(request, async ({ requestId }) => {
    const principal = requireApiPrincipal(request);
    const { projectId: rawProjectId } = await context.params;
    const projectId = requireRouteId(rawProjectId, "prj");
    const runs = await getKilnStore().listRuns(principal.id, projectId);
    return jsonData({ runs }, requestId);
  });
}

export async function POST(
  request: Request,
  context: RouteContext<Params>,
): Promise<Response> {
  return handleApi(request, async ({ requestId }) => {
    const principal = requireApiPrincipal(request);
    const { projectId: rawProjectId } = await context.params;
    const projectId = requireRouteId(rawProjectId, "prj");
    const store = getKilnStore();
    await store.consumeRateLimit(principal.id, "runs.create", 8);
    const input = parseCreateRun(await readJsonObject(request));
    const run = await store.createRun(principal.id, projectId, input);
    return jsonData({ run }, requestId, { status: 201 });
  });
}
