import type { Page, Route } from "@playwright/test";

/**
 * An in-memory stand-in for the control API, the fault proxy and the ingest
 * service, installed with page.route. The dashboard runs unchanged; only its
 * network calls are answered here, so these tests need no backend.
 *
 * The fake proxy fires every enabled rule whose method and path match, ignoring
 * probability, so results are deterministic. Rules with probability 0 never fire.
 */
export const CONTROL_API = "http://localhost:3000";
export const PROXY = "http://localhost:3100";

interface Garden { id: string; name: string; token: string; rateLimitRps: number; rateLimitBurst: number; createdAt: string }
interface Target { id: string; gardenId: string; name: string; baseUrl: string; createdAt: string }
interface Rule {
  id: string; targetId: string; method: string; pathPattern: string; type: "latency" | "error" | "drop" | "corrupt";
  probability: string; params: Record<string, unknown>; enabled: boolean; createdAt: string;
}
interface Log { id: string; targetId: string; targetName: string; method: string; path: string; status: number | null; outcome: string; durationMs: number; faults: string[]; occurredAt: string }

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, content-type, x-request-id",
  "access-control-allow-methods": "GET, POST, PATCH, PUT, DELETE, OPTIONS",
  "access-control-expose-headers": "x-chaos-fault, x-request-id",
};

export class FakeBackend {
  gardens = new Map<string, Garden>();
  targets: Target[] = [];
  rules: Rule[] = [];
  logs: Log[] = [];
  private seq = 0;

  private id(prefix: string) {
    this.seq++;
    return `${prefix}0000000-0000-4000-8000-${String(this.seq).padStart(12, "0")}`;
  }

  /** Adds a garden directly, as if created earlier. */
  seedGarden(name: string, token = "seed-token"): Garden {
    const garden = { id: this.id("a"), name, token, rateLimitRps: 10, rateLimitBurst: 20, createdAt: new Date().toISOString() };
    this.gardens.set(garden.id, garden);
    return garden;
  }

  async install(page: Page) {
    await page.route(`${CONTROL_API}/**`, (route) => this.control(route));
    await page.route(`${PROXY}/**`, (route) => this.proxy(route));
  }

  private reply(route: Route, status: number, body?: unknown, headers: Record<string, string> = {}) {
    return route.fulfill({
      status,
      headers: { ...CORS, ...(body === undefined ? {} : { "content-type": "application/json" }), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  private publicGarden({ token: _token, ...garden }: Garden) {
    return garden;
  }

  private control(route: Route) {
    const req = route.request();
    if (req.method() === "OPTIONS") return this.reply(route, 204);
    const url = new URL(req.url());
    const parts = url.pathname.split("/").filter(Boolean);
    const body = req.postData() ? JSON.parse(req.postData()!) : {};

    if (parts[0] !== "gardens") return this.reply(route, 404, { message: "Not found" });
    if (parts.length === 1 && req.method() === "POST") {
      const garden = { ...this.seedGarden(body.name, `token-${this.seq}`) };
      return this.reply(route, 201, { ...this.publicGarden(garden), adminToken: garden.token });
    }

    const garden = this.gardens.get(parts[1]);
    if (!garden) return this.reply(route, 404, { message: "Garden not found" });
    if (req.headers()["authorization"] !== `Bearer ${garden.token}`) return this.reply(route, 401, { message: "Invalid admin token" });

    const [, , section, targetId, sub, ruleId] = parts;
    if (!section) {
      if (req.method() === "PATCH") Object.assign(garden, body);
      if (req.method() === "DELETE") {
        this.gardens.delete(garden.id);
        return this.reply(route, 204);
      }
      return this.reply(route, 200, this.publicGarden(garden));
    }
    if (section === "targets" && !targetId) {
      if (req.method() === "POST") {
        const target = { id: this.id("b"), gardenId: garden.id, name: body.name, baseUrl: body.baseUrl, createdAt: new Date().toISOString() };
        this.targets.push(target);
        return this.reply(route, 201, target);
      }
      return this.reply(route, 200, this.targets.filter((t) => t.gardenId === garden.id));
    }
    if (section === "targets" && sub === "rules") {
      if (!ruleId && req.method() === "POST") {
        const rule: Rule = { id: this.id("c"), targetId, ...body, probability: Number(body.probability).toFixed(3), enabled: true, createdAt: new Date().toISOString() };
        this.rules.push(rule);
        return this.reply(route, 201, rule);
      }
      if (!ruleId) return this.reply(route, 200, this.rules.filter((r) => r.targetId === targetId));
      const rule = this.rules.find((r) => r.id === ruleId)!;
      if (req.method() === "DELETE") {
        this.rules = this.rules.filter((r) => r !== rule);
        return this.reply(route, 204);
      }
      Object.assign(rule, body);
      return this.reply(route, 200, rule);
    }
    if (section === "requests") {
      const items = this.logs.filter((l) => l.targetId === url.searchParams.get("targetId")).reverse();
      return this.reply(route, 200, { items, nextBefore: null });
    }
    if (section === "stats") return this.reply(route, 200, this.stats(url.searchParams.get("targetId")!));
    return this.reply(route, 404, { message: "Not found" });
  }

  private stats(targetId: string) {
    const logs = this.logs.filter((l) => l.targetId === targetId);
    const minute = new Date(Math.floor(Date.now() / 60_000) * 60_000).toISOString();
    const count = (outcome: string) => logs.filter((l) => l.outcome === outcome).length;
    const totals = {
      total: logs.length, ok: count("ok"), slow: count("slow"), error: count("error"), drop: count("drop"),
      corrupt: count("corrupt"), targetError: count("target_error"), noResponse: count("no_response"), rateLimited: 0,
      avgDurationMs: logs.length ? Math.round(logs.reduce((s, l) => s + l.durationMs, 0) / logs.length) : null,
    };
    return { from: minute, to: minute, totals, buckets: logs.length ? [{ bucket: minute, ...totals }] : [] };
  }

  private proxy(route: Route) {
    const req = route.request();
    if (req.method() === "OPTIONS") return this.reply(route, 204);
    const [, gardenId, targetName, ...rest] = new URL(req.url()).pathname.split("/").filter(Boolean);
    const path = `/${rest.join("/")}`;
    const target = this.targets.find((t) => t.gardenId === gardenId && t.name === targetName);
    if (!target) return this.reply(route, 404, { error: "target_not_found" });

    const fired = this.rules.filter(
      (r) => r.targetId === target.id && r.enabled && Number(r.probability) > 0 &&
        (r.method === "*" || r.method === req.method()) && matches(r.pathPattern, path),
    );
    const failure = fired.find((r) => r.type !== "latency");
    const faults = [...(fired.some((r) => r.type === "latency") ? ["latency"] : []), ...(failure ? [failure.type] : [])];
    const log = (status: number | null, outcome: string) =>
      this.logs.push({
        id: this.id("d"), targetId: target.id, targetName, method: req.method(), path, status, outcome,
        durationMs: 40, faults, occurredAt: new Date().toISOString(),
      });

    const headers: Record<string, string> = faults.length ? { "x-chaos-fault": faults.join(",") } : {};
    if (failure?.type === "drop") {
      log(null, "drop");
      return route.abort("connectionreset");
    }
    if (failure?.type === "error") {
      const status = Number(failure.params.status);
      log(status, "error");
      return this.reply(route, status, { error: "chaos_garden_injected_error" }, headers);
    }
    if (failure?.type === "corrupt") {
      log(200, "corrupt");
      return route.fulfill({ status: 200, headers: { ...CORS, ...headers }, body: '{"orders":[{"id":1' });
    }
    log(200, faults.includes("latency") ? "slow" : "ok");
    return this.reply(route, 200, { ok: true }, headers);
  }
}

/** The proxy's pattern rules: `*` matches any run of characters, `:name` one segment. */
function matches(pattern: string, path: string) {
  const regex = pattern
    .split(/(\*|:[A-Za-z0-9_]+)/)
    .map((part) => (part === "*" ? ".*" : part.startsWith(":") ? "[^/]+" : part.replace(/[.+?^${}()|[\]\\]/g, "\\$&")))
    .join("");
  return new RegExp(`^${regex}$`).test(path);
}
