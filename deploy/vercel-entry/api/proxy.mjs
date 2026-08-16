import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { request as httpsRequest } from "node:https";

const UPSTREAM_ORIGIN = "https://kiln-agentic-builder.alphaextremis.chatgpt.site";
const GUEST_COOKIE = "kiln_guest";
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

export default function handler(request, response) {
  const bypassToken = process.env.SITES_BYPASS_TOKEN;
  const guestCookieSecret = process.env.KILN_GUEST_COOKIE_SECRET;
  const publicProxyToken = process.env.KILN_PUBLIC_PROXY_TOKEN;
  if (!bypassToken || !guestCookieSecret || !publicProxyToken) {
    response.statusCode = 503;
    response.setHeader("content-type", "application/json; charset=utf-8");
    response.end(JSON.stringify({ error: "upstream_not_configured" }));
    return;
  }

  const incomingUrl = new URL(request.url ?? "/", "https://kiln.invalid");
  const publicOrigin = `https://${request.headers.host ?? "kiln-agentic-builder.vercel.app"}`;
  const incomingOrigin = request.headers.origin;
  if (
    !SAFE_METHODS.has(request.method ?? "GET") &&
    incomingOrigin &&
    incomingOrigin !== publicOrigin
  ) {
    response.statusCode = 403;
    response.setHeader("content-type", "application/json; charset=utf-8");
    response.end(JSON.stringify({ error: "cross_origin_request_rejected" }));
    return;
  }

  const guest = getGuestIdentity(request.headers.cookie, guestCookieSecret);
  const path = incomingUrl.searchParams.get("kiln_path") ?? "";
  incomingUrl.searchParams.delete("kiln_path");
  const upstreamUrl = new URL(`/${path}`, UPSTREAM_ORIGIN);
  upstreamUrl.search = incomingUrl.searchParams.toString();

  const upstreamHeaders = {};
  for (const [key, value] of Object.entries(request.headers)) {
    if (value !== undefined && !HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
      upstreamHeaders[key] = value;
    }
  }
  upstreamHeaders.host = upstreamUrl.host;
  upstreamHeaders["oai-sites-authorization"] = `Bearer ${bypassToken}`;
  upstreamHeaders["x-kiln-guest-id"] = guest.id;
  upstreamHeaders["x-kiln-proxy-token"] = publicProxyToken;
  upstreamHeaders["x-forwarded-host"] = request.headers.host ?? "";
  upstreamHeaders["x-forwarded-proto"] = "https";
  if (incomingOrigin) {
    upstreamHeaders.origin = UPSTREAM_ORIGIN;
    upstreamHeaders.referer = `${UPSTREAM_ORIGIN}/`;
  }

  const upstreamRequest = httpsRequest(
    upstreamUrl,
    {
      method: request.method,
      headers: upstreamHeaders,
    },
    (upstreamResponse) => {
      response.statusCode = upstreamResponse.statusCode ?? 502;
      if (upstreamResponse.statusMessage) {
        response.statusMessage = upstreamResponse.statusMessage;
      }
      const upstreamCookies = upstreamResponse.headers["set-cookie"] ?? [];
      for (const [key, value] of Object.entries(upstreamResponse.headers)) {
        if (value !== undefined && !HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
          if (key.toLowerCase() === "set-cookie") continue;
          response.setHeader(key, value);
        }
      }
      response.setHeader("set-cookie", [
        ...(Array.isArray(upstreamCookies) ? upstreamCookies : [upstreamCookies]),
        `${GUEST_COOKIE}=${guest.cookieValue}; Path=/; Max-Age=86400; HttpOnly; Secure; SameSite=Lax`,
      ]);
      response.setHeader("cache-control", "private, no-store");
      upstreamResponse.pipe(response);
    },
  );

  upstreamRequest.on("error", () => {
    if (response.headersSent) {
      response.destroy();
      return;
    }
    response.statusCode = 502;
    response.setHeader("content-type", "application/json; charset=utf-8");
    response.end(JSON.stringify({ error: "upstream_unavailable" }));
  });

  request.pipe(upstreamRequest);
}

function getGuestIdentity(cookieHeader, secret) {
  const cookies = Object.fromEntries(
    String(cookieHeader ?? "")
      .split(";")
      .map((part) => part.trim().split("="))
      .filter(([key, value]) => key && value),
  );
  const supplied = cookies[GUEST_COOKIE];
  if (supplied) {
    const separator = supplied.lastIndexOf(".");
    const guestId = supplied.slice(0, separator);
    const suppliedSignature = supplied.slice(separator + 1);
    if (/^gst_[a-f0-9]{32}$/.test(guestId) && signaturesMatch(suppliedSignature, sign(guestId, secret))) {
      return { id: guestId, cookieValue: supplied };
    }
  }

  const id = `gst_${randomUUID().replaceAll("-", "")}`;
  return { id, cookieValue: `${id}.${sign(id, secret)}` };
}

function sign(value, secret) {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function signaturesMatch(left, right) {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}
