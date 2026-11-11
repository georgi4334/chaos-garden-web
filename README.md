# Chaos Garden: Dashboard

The web dashboard for Chaos Garden, a fault-injection platform for frontend developers. Create a garden, point it at an API, add rules that make requests slow, fail, vanish or arrive broken, then send requests through the proxy and watch what happens.

Built with Next.js, TypeScript and Tailwind. It talks to two other services directly from the browser:

- the [control API](https://github.com/georgi4334/backend) (gardens, targets, rules)
- the [fault proxy](https://github.com/georgi4334/chaos-garden-proxy) (the "Try it" panel sends requests through it)

## Run it

Start the control API (port 3000) and the proxy (port 3100) first, then:

```bash
npm install
cp .env.example .env.local
npm run dev        # http://localhost:3001
```

| Variable | Default | Meaning |
|---|---|---|
| `NEXT_PUBLIC_CONTROL_API_URL` | `http://localhost:3000` | control API base URL |
| `NEXT_PUBLIC_PROXY_URL` | `http://localhost:3100` | fault proxy base URL |

The control API only accepts browser calls from origins listed in its `CORS_ORIGIN` (default `http://localhost:3001`, which matches this app's dev port).

## How it works

- **No accounts.** Creating a garden returns an admin token once. It is stored in this browser's `localStorage`, so clearing site data loses access unless you copied the token. Anyone with access to the browser profile can use it.
- **The bed.** In "Try it", each request becomes a stem. Color and the shape on top show what happened (passed, delayed, injected error, no response, broken body, error from the target). Height shows response time on a log scale. A request with no HTTP response at all is shown as "No response", which means a dropped connection or an unreachable proxy.
- **Rules** are listed in creation order. Toggle them on and off without deleting them.
- **Activity** shows every request that went through the proxy for the selected target, from any app: request count, share hit by a fault, average time, the split by outcome, outcomes per minute (hover or use the arrow keys on the chart; "Show as table" lists the same numbers), and the most recent requests. It refreshes every 15 seconds, and right after a Try it run. It needs the control API's `/requests` and `/stats` endpoints and the ingest service; if those are unavailable, the section says so and the rest of the page keeps working.
- **Outcome colors** are validated as one palette for colorblind separation and contrast (see the comment in `src/app/globals.css`). Change them only by re-running a palette check.

## Scripts

```bash
npm run dev     # dev server on port 3001
npm run build   # production build
npm start       # serve the build on port 3001
npm run lint
```
