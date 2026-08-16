# Kiln Vercel entrypoint

This project keeps Kiln's public URL on Vercel while securely forwarding
requests to the Cloudflare-native control plane. The split preserves D1-backed
project state, R2-backed build artifacts, streaming run events, and same-origin
browser APIs.

The upstream address is intentionally versioned in `vercel.json` so deployment
changes are reviewable and rollbacks remain deterministic.

The upstream access token is stored only in Vercel's encrypted environment and
is injected by the server-side proxy; it is never shipped to the browser.
