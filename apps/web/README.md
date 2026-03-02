# app-web

Basic Next.js frontend for Executor v2 control plane.

- Uses `@executor-v2/control-plane` Effect HttpApi client
- Uses Effect Atom (`@effect-atom/atom`, `@effect-atom/atom-react`) for query state

Run:

- `bun run --cwd apps/web dev`
- Open `http://127.0.0.1:3000`

By default, browser control-plane API calls go through the same-origin proxy at
`/api/control-plane`.

The proxy forwards to the first available upstream value in:
`CONTROL_PLANE_SERVER_BASE_URL`, `CONTROL_PLANE_UPSTREAM_URL`, `NEXT_PUBLIC_CONVEX_URL`, `CONVEX_URL`.
If none are set, fallback is `http://127.0.0.1:8788`.

If needed, `NEXT_PUBLIC_CONTROL_PLANE_BASE_URL` can override the browser base URL.

MCP install URL generation:

- Derives from existing control-plane/frontend config.
- Prioritizes server-side `CONTROL_PLANE_UPSTREAM_URL` (or server/base control-plane URL) when available.
- In local dev, defaults to direct Convex MCP URL: `http://127.0.0.1:8788/v1/mcp?...`

WorkOS auth setup (optional but recommended):

- `WORKOS_CLIENT_ID`
- `WORKOS_API_KEY`
- `WORKOS_COOKIE_PASSWORD` (32+ chars)
- `WORKOS_REDIRECT_URI` or `NEXT_PUBLIC_WORKOS_REDIRECT_URI` (for example `http://localhost:4312/callback`)

When WorkOS is configured, the app requires sign-in and the server proxy forwards the authenticated WorkOS access token to control-plane as a bearer token (`Authorization: Bearer ...`).
