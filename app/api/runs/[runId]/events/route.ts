import { requireApiPrincipal } from "../../../../../lib/server/auth.ts";
import { ApiError } from "../../../../../lib/server/api-error.ts";
import { getKilnStore } from "../../../../../lib/server/db.ts";
import { handleApi } from "../../../../../lib/server/http.ts";
import {
  requireRouteId,
  type RouteContext,
} from "../../../../../lib/server/route-params.ts";

type Params = { runId: string };

export async function GET(
  request: Request,
  context: RouteContext<Params>,
): Promise<Response> {
  return handleApi(request, async () => {
    const principal = requireApiPrincipal(request);
    const { runId: rawRunId } = await context.params;
    const runId = requireRouteId(rawRunId, "run");
    const url = new URL(request.url);
    const cursorValue =
      url.searchParams.get("after") ?? request.headers.get("last-event-id") ?? "0";
    if (!/^\d{1,12}$/.test(cursorValue)) {
      throw new ApiError(400, "invalid_cursor", "Event cursor is invalid");
    }
    const afterSequence = Number(cursorValue);
    if (!Number.isSafeInteger(afterSequence)) {
      throw new ApiError(400, "invalid_cursor", "Event cursor is invalid");
    }

    const store = getKilnStore();
    await store.getRun(principal.id, runId);
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let cursor = afterSequence;
        const expiresAt = Date.now() + 25_000;
        try {
          controller.enqueue(encoder.encode("retry: 1500\n\n"));
          while (!request.signal.aborted && Date.now() < expiresAt) {
            const events = await store.listRunEvents(principal.id, runId, cursor);
            for (const event of events) {
              cursor = Math.max(cursor, event.sequence);
              controller.enqueue(encoder.encode(serializeEvent(event)));
            }
            controller.enqueue(encoder.encode(`: kiln heartbeat ${Date.now()}\n\n`));
            await waitForPoll(request.signal, 2_000);
          }
        } catch {
          // The client reconnects with Last-Event-ID; stream errors never alter run state.
        } finally {
          try {
            controller.close();
          } catch {
            // The browser may have already closed the stream.
          }
        }
      },
    });

    return new Response(stream, {
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-store, no-transform",
        connection: "keep-alive",
        "x-accel-buffering": "no",
      },
    });
  });
}

function serializeEvent(event: {
  id: string;
  runId: string;
  sequence: number;
  type: string;
  data: Record<string, unknown>;
  createdAt: string;
}): string {
  const eventType = /^[a-z0-9._-]{1,64}$/.test(event.type)
    ? event.type
    : "run.message";
  return `id: ${event.sequence}\nevent: ${eventType}\ndata: ${JSON.stringify({
    id: event.id,
    runId: event.runId,
    sequence: event.sequence,
    data: event.data,
    createdAt: event.createdAt,
  })}\n\n`;
}

function waitForPoll(signal: AbortSignal, milliseconds: number): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timeout);
      signal.removeEventListener("abort", finish);
      resolve();
    };
    const timeout = setTimeout(finish, milliseconds);
    signal.addEventListener("abort", finish, { once: true });
  });
}
