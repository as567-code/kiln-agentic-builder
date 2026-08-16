import { requireApiPrincipal } from "../../../lib/server/auth.ts";
import { getKilnStore } from "../../../lib/server/db.ts";
import { handleApi, jsonData, readJsonObject } from "../../../lib/server/http.ts";
import { parseCreateProject } from "../../../lib/server/input.ts";

export async function GET(request: Request): Promise<Response> {
  return handleApi(request, async ({ requestId }) => {
    const principal = requireApiPrincipal(request);
    const projects = await getKilnStore().listProjects(principal.id);
    return jsonData({ projects }, requestId);
  });
}

export async function POST(request: Request): Promise<Response> {
  return handleApi(request, async ({ requestId }) => {
    const principal = requireApiPrincipal(request);
    const store = getKilnStore();
    await store.consumeRateLimit(principal.id, "projects.create", 12);
    const input = parseCreateProject(await readJsonObject(request));
    const project = await store.createProject(principal.id, input);
    return jsonData({ project }, requestId, { status: 201 });
  });
}
