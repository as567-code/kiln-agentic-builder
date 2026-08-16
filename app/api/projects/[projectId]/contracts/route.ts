import { requireApiPrincipal } from "../../../../../lib/server/auth.ts";
import { getKilnStore } from "../../../../../lib/server/db.ts";
import { handleApi, jsonData, readJsonObject } from "../../../../../lib/server/http.ts";
import { parseContractDraft } from "../../../../../lib/server/input.ts";
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
    const contracts = await getKilnStore().listContracts(principal.id, projectId);
    return jsonData({ contracts }, requestId);
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
    await store.consumeRateLimit(principal.id, "contracts.create", 15);
    const input = parseContractDraft(await readJsonObject(request));
    const contract = await store.createContract(principal.id, projectId, input);
    return jsonData({ contract }, requestId, { status: 201 });
  });
}
