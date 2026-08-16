import { env } from "cloudflare:workers";
import { ApiError } from "./api-error.ts";

export async function requireExecutorService(request: Request): Promise<void> {
  const expected = env.KILN_EXECUTOR_SERVICE_TOKEN;
  const supplied = request.headers.get("x-kiln-service-token");
  if (
    !expected ||
    expected.length < 16 ||
    expected.length > 256 ||
    !supplied ||
    supplied.length > 256
  ) {
    throw new ApiError(401, "service_authentication_failed", "Service authentication failed");
  }
  const [expectedHash, suppliedHash] = await Promise.all([
    sha256(expected),
    sha256(supplied),
  ]);
  let difference = 0;
  for (let index = 0; index < expectedHash.length; index += 1) {
    difference |= expectedHash[index]! ^ suppliedHash[index]!;
  }
  if (difference !== 0) {
    throw new ApiError(401, "service_authentication_failed", "Service authentication failed");
  }
}

export async function tokenHash(value: string): Promise<string> {
  const digest = await sha256(value);
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256(value: string): Promise<Uint8Array> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes).buffer);
  return new Uint8Array(digest);
}
