import { requireApiPrincipal } from "../../../../../lib/server/auth.ts";
import { getKilnStore } from "../../../../../lib/server/db.ts";
import { handleApi, jsonData, readJsonObject } from "../../../../../lib/server/http.ts";
import { parseArchiveProject } from "../../../../../lib/server/input.ts";
import {
  requireRouteId,
  type RouteContext,
} from "../../../../../lib/server/route-params.ts";

type Params = { projectId: string };

export async function POST(
  request: Request,
  context: RouteContext<Params>,
): Promise<Response> {
  return handleApi(request, async ({ requestId }) => {
    const principal = requireApiPrincipal(request);
    const { projectId: rawProjectId } = await context.params;
    const projectId = requireRouteId(rawProjectId, "prj");
    const store = getKilnStore();
    await store.consumeRateLimit(principal.id, "projects.archive", 20);
    const archived = parseArchiveProject(await readJsonObject(request));
    const project = await store.archiveProject(principal.id, projectId, archived);
    return jsonData({ project }, requestId);
  });
}
