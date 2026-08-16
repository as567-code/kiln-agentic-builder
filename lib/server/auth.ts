import { ApiError } from "./api-error.ts";

export type ApiPrincipal = {
  id: string;
  email: string;
  displayName: string;
  authSource: "chatgpt" | "local-development";
};

const USER_ID_HEADER = "oai-authenticated-user-id";
const USER_EMAIL_HEADER = "oai-authenticated-user-email";
const USER_FULL_NAME_HEADER = "oai-authenticated-user-full-name";
const USER_FULL_NAME_ENCODING_HEADER =
  "oai-authenticated-user-full-name-encoding";

export function requireApiPrincipal(request: Request): ApiPrincipal {
  const userId = boundedHeader(request.headers.get(USER_ID_HEADER), 128);
  const email = boundedHeader(request.headers.get(USER_EMAIL_HEADER), 320);

  if (userId && email) {
    const encodedName = boundedHeader(
      request.headers.get(USER_FULL_NAME_HEADER),
      512,
    );
    const displayName =
      encodedName &&
      request.headers.get(USER_FULL_NAME_ENCODING_HEADER) ===
        "percent-encoded-utf-8"
        ? safelyDecode(encodedName) ?? email
        : email;

    return {
      id: userId,
      email,
      displayName,
      authSource: "chatgpt",
    };
  }

  const url = new URL(request.url);
  const isLocal = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  const localBypassAllowed =
    process.env.NODE_ENV !== "production" ||
    process.env.KILN_ALLOW_LOCAL_AUTH === "1";

  if (isLocal && localBypassAllowed) {
    return {
      id: "usr_local_development",
      email: "developer@local.kiln",
      displayName: "Local developer",
      authSource: "local-development",
    };
  }

  throw new ApiError(401, "authentication_required", "Sign in is required");
}

function boundedHeader(value: string | null, maxLength: number): string | null {
  if (
    !value ||
    value.length > maxLength ||
    Array.from(value).some((character) => {
      const code = character.charCodeAt(0);
      return code < 32 || code === 127;
    })
  ) {
    return null;
  }
  return value;
}

function safelyDecode(value: string): string | null {
  try {
    const decoded = decodeURIComponent(value);
    return decoded.length <= 160 ? decoded : null;
  } catch {
    return null;
  }
}
