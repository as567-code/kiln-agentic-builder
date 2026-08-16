import { requireApiPrincipal } from "../../../../lib/server/auth.ts";
import { conflict } from "../../../../lib/server/api-error.ts";
import { getKilnStore } from "../../../../lib/server/db.ts";
import { handleApi, jsonData, readJsonObject } from "../../../../lib/server/http.ts";
import {
  parseDeleteConfirmation,
  parseUpdateProject,
} from "../../../../lib/server/input.ts";
import {
  requireRouteId,
  type RouteContext,
} from "../../../../lib/server/route-params.ts";

type Params = { projectId: string };

export async function GET(
  request: Request,
  context: RouteContext<Params>,
): Promise<Response> {
  return handleApi(request, async ({ requestId }) => {
    const principal = requireApiPrincipal(request);
    const { projectId: rawProjectId } = await context.params;
    const projectId = requireRouteId(rawProjectId, "prj");
    const store = getKilnStore();
    const [project, contracts, runs] = await Promise.all([
      store.getProject(principal.id, projectId),
      store.listContracts(principal.id, projectId),
      store.listRuns(principal.id, projectId),
    ]);
    return jsonData({ project, contracts, runs }, requestId);
  });
}

export async function PATCH(
  request: Request,
  context: RouteContext<Params>,
): Promise<Response> {
  return handleApi(request, async ({ requestId }) => {
    const principal = requireApiPrincipal(request);
    const { projectId: rawProjectId } = await context.params;
    const projectId = requireRouteId(rawProjectId, "prj");
    const store = getKilnStore();
    await store.consumeRateLimit(principal.id, "projects.update", 30);
    const input = parseUpdateProject(await readJsonObject(request));
    const project = await store.updateProject(principal.id, projectId, input);
    return jsonData({ project }, requestId);
  });
}

export async function DELETE(
  request: Request,
  context: RouteContext<Params>,
): Promise<Response> {
  return handleApi(request, async ({ requestId }) => {
    const principal = requireApiPrincipal(request);
    const { projectId: rawProjectId } = await context.params;
    const projectId = requireRouteId(rawProjectId, "prj");
    const store = getKilnStore();
    await store.consumeRateLimit(principal.id, "projects.delete", 6);
    const confirmation = parseDeleteConfirmation(await readJsonObject(request));
    const project = await store.getProject(principal.id, projectId);
    if (confirmation !== project.name) {
      conflict("Project name confirmation does not match", "confirmation_mismatch");
    }
    await store.deleteProject(principal.id, projectId);
    return jsonData({ deleted: true, projectId }, requestId);
  });
}
