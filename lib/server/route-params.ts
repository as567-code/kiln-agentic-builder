import { notFound } from "./api-error.ts";
import { isKilnId, type IdPrefix } from "./id.ts";

export type RouteContext<T extends Record<string, string>> = {
  params: Promise<T>;
};

export function requireRouteId(value: string, prefix: IdPrefix): string {
  if (!isKilnId(value, prefix)) notFound();
  return value;
}
