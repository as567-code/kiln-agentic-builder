import { env } from "cloudflare:workers";
import { ApiError } from "./api-error.ts";
import { KilnStore } from "./store.ts";

export function getKilnStore(): KilnStore {
  if (!env.DB) {
    throw new ApiError(
      503,
      "database_unavailable",
      "Project storage is not configured",
    );
  }
  return new KilnStore(env.DB);
}
