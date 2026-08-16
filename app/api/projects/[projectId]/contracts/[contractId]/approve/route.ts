import { requireApiPrincipal } from "../../../../../../../lib/server/auth.ts";
import { badRequest } from "../../../../../../../lib/server/api-error.ts";
import { getKilnStore } from "../../../../../../../lib/server/db.ts";
import { handleApi, jsonData, readJsonObject } from "../../../../../../../lib/server/http.ts";
import {
  requireRouteId,
  type RouteContext,
} from "../../../../../../../lib/server/route-params.ts";

type Params = { projectId: string; contractId: string };

export async function POST(
  request: Request,
  context: RouteContext<Params>,
): Promise<Response> {
  return handleApi(request, async ({ requestId }) => {
    const principal = requireApiPrincipal(request);
    const { projectId: rawProjectId, contractId: rawContractId } =
      await context.params;
    const projectId = requireRouteId(rawProjectId, "prj");
    const contractId = requireRouteId(rawContractId, "ctr");
    const store = getKilnStore();
    await store.consumeRateLimit(principal.id, "contracts.approve", 12);
    const body = await readJsonObject(request);
    if (Object.keys(body).length !== 0) {
      badRequest("Approval requests must use an empty JSON object");
    }
    const contract = await store.approveContract(
      principal.id,
      projectId,
      contractId,
    );
    return jsonData({ contract }, requestId);
  });
}
