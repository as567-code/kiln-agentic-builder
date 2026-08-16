export type IdPrefix =
  | "prj"
  | "ctr"
  | "run"
  | "plan"
  | "step"
  | "evt"
  | "audit"
  | "rate"
  | "artifact"
  | "patch"
  | "finding"
  | "snapshot"
  | "sandbox"
  | "test"
  | "usage"
  | "job";

export function createId(prefix: IdPrefix): string {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;
}

export function isKilnId(value: unknown, prefix: IdPrefix): value is string {
  return (
    typeof value === "string" &&
    new RegExp(`^${prefix}_[a-f0-9]{32}$`).test(value)
  );
}
