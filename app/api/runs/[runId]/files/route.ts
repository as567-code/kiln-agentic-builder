import { ApiError } from "../../../../../lib/server/api-error.ts";
import {
  digestText,
  getArtifactRepository,
} from "../../../../../lib/server/artifacts.ts";
import { requireApiPrincipal } from "../../../../../lib/server/auth.ts";
import { getKilnStore } from "../../../../../lib/server/db.ts";
import { handleApi, jsonData } from "../../../../../lib/server/http.ts";
import {
  requireRouteId,
  type RouteContext,
} from "../../../../../lib/server/route-params.ts";
import { normalizeWorkspacePath } from "../../../../../packages/contracts/src/policy.ts";

type Params = { runId: string };

export async function GET(
  request: Request,
  context: RouteContext<Params>,
): Promise<Response> {
  return handleApi(request, async ({ requestId }) => {
    const principal = requireApiPrincipal(request);
    const { runId: rawRunId } = await context.params;
    const runId = requireRouteId(rawRunId, "run");
    const requestedPath = new URL(request.url).searchParams.get("path");
    const store = getKilnStore();

    if (!requestedPath) {
      const snapshots = await store.listCurrentFileSnapshots(principal.id, runId);
      return jsonData(
        {
          files: snapshots.map(publicSnapshot),
        },
        requestId,
      );
    }

    let path: string;
    try {
      path = normalizeWorkspacePath(requestedPath);
    } catch {
      throw new ApiError(400, "invalid_path", "Requested source path is not allowed");
    }
    const [snapshot] = await store.listLatestFileSnapshots(principal.id, runId, [path]);
    if (!snapshot || snapshot.deleted) {
      throw new ApiError(404, "source_not_found", "Source file was not found");
    }
    const content = await getArtifactRepository().getText(snapshot.objectKey);
    if ((await digestText(content)) !== snapshot.sha256) {
      throw new ApiError(
        500,
        "snapshot_integrity_failed",
        "A source snapshot failed its integrity check",
        false,
      );
    }
    return jsonData(
      { file: { ...publicSnapshot(snapshot), content } },
      requestId,
    );
  });
}

function publicSnapshot(snapshot: {
  id: string;
  patchId: string | null;
  revision: number;
  path: string;
  sha256: string;
  sizeBytes: number;
  language: string;
  deleted: boolean;
  createdAt: string;
}): Record<string, unknown> {
  return {
    id: snapshot.id,
    patchId: snapshot.patchId,
    revision: snapshot.revision,
    path: snapshot.path,
    sha256: snapshot.sha256,
    sizeBytes: snapshot.sizeBytes,
    language: snapshot.language,
    deleted: snapshot.deleted,
    createdAt: snapshot.createdAt,
  };
}
