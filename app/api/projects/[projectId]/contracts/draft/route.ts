import { requireApiPrincipal } from "../../../../../../lib/server/auth.ts";
import { getKilnStore } from "../../../../../../lib/server/db.ts";
import { handleApi, jsonData, readJsonObject } from "../../../../../../lib/server/http.ts";
import { parseDraftBrief } from "../../../../../../lib/server/input.ts";
import { getOrchestratorClient } from "../../../../../../lib/server/orchestrator.ts";
import {
  requireRouteId,
  type RouteContext,
} from "../../../../../../lib/server/route-params.ts";

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
    await store.getProject(principal.id, projectId);
    await store.consumeRateLimit(principal.id, "contracts.draft_model", 8);
    const { brief } = parseDraftBrief(await readJsonObject(request));
    const result = await getOrchestratorClient().draftContract({
      projectId,
      brief,
      requestId,
    });
    const contract = await store.createContract(
      principal.id,
      projectId,
      result.draft,
      result.provenance,
    );
    return jsonData(
      {
        contract,
        clarificationQuestions: result.clarificationQuestions,
        planner: {
          name: result.provenance.planner,
          model: result.provenance.model,
          providerRequestId: result.provenance.providerRequestId,
          usage: {
            inputTokens: result.provenance.inputTokens,
            outputTokens: result.provenance.outputTokens,
            totalTokens: result.provenance.totalTokens,
          },
        },
      },
      requestId,
      { status: 201 },
    );
  });
}
