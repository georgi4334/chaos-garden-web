import { describe, expect, it, vi } from "vitest";
import { ApiError, api, logsApi } from "./api";
import { CONTROL_API_URL } from "./config";

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

/** Each call gets a fresh response, since a body can only be read once. */
function mockFetch(response: Response | Error) {
  const fn = vi.fn(async (_url: string, _init?: RequestInit) => {
    if (response instanceof Error) throw response;
    return response.clone();
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

async function caught(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  } catch (err) {
    if (err instanceof ApiError) return err;
    throw err;
  }
  throw new Error("expected an ApiError");
}

describe("api", () => {
  it("sends the admin token and a JSON body", async () => {
    const fetch = mockFetch(json(201, { id: "r1" }));
    await api.createRule("g1", "secret", "t1", {
      type: "error",
      method: "GET",
      pathPattern: "/*",
      probability: 0.5,
      params: { status: 503 },
    });
    expect(fetch).toHaveBeenCalledWith(`${CONTROL_API_URL}/gardens/g1/targets/t1/rules`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer secret" },
      body: JSON.stringify({ type: "error", method: "GET", pathPattern: "/*", probability: 0.5, params: { status: 503 } }),
    });
  });

  it("sends only the headers a call needs", async () => {
    const fetch = mockFetch(json(200, { id: "g1" }));
    await api.createGarden("Checkout");
    await api.getGarden("g1", "secret");
    expect(fetch.mock.calls[0][1]?.headers).toEqual({ "content-type": "application/json" });
    expect(fetch.mock.calls[1][1]).toMatchObject({ method: "GET", headers: { authorization: "Bearer secret" }, body: undefined });
  });

  it("returns undefined for 204 No Content", async () => {
    mockFetch(new Response(null, { status: 204 }));
    await expect(api.deleteGarden("g1", "secret")).resolves.toBeUndefined();
  });

  it("uses the API's error message, joining validation messages", async () => {
    mockFetch(json(400, { message: ["probability must not be greater than 1", "method is invalid"] }));
    const err = await caught(api.getGarden("g1", "secret"));
    expect(err.status).toBe(400);
    expect(err.message).toBe("probability must not be greater than 1, method is invalid");
  });

  it("falls back to a generic message", async () => {
    mockFetch(json(500, {}));
    expect((await caught(api.getGarden("g1", "secret"))).message).toBe("Request failed (500)");
  });

  it("explains an unreachable API", async () => {
    mockFetch(new TypeError("Failed to fetch"));
    const err = await caught(api.getGarden("g1", "secret"));
    expect(err.status).toBe(0);
    expect(err.message).toMatch(/Can't reach the control API.*waking up/);
  });

  it("treats a non-JSON page as a server waking up", async () => {
    mockFetch(new Response("<html>Service waking up</html>", { status: 200, headers: { "content-type": "text/html" } }));
    expect((await caught(api.getGarden("g1", "secret"))).message).toMatch(/unexpected response.*waking up/);
  });
});

describe("logsApi", () => {
  it("builds the request log query", async () => {
    const fetch = mockFetch(json(200, { items: [], nextBefore: null }));
    await logsApi.requests("g1", "secret", { targetId: "t1", limit: 20, before: "2026-11-12T10:00:00Z" });
    expect(fetch.mock.calls[0]).toContain(
      `${CONTROL_API_URL}/gardens/g1/requests?targetId=t1&limit=20&before=2026-11-12T10%3A00%3A00Z`,
    );
  });

  it("builds the stats query", async () => {
    const fetch = mockFetch(json(200, {}));
    await logsApi.stats("g1", "secret", { minutes: 15 });
    expect(fetch.mock.calls[0]).toContain(`${CONTROL_API_URL}/gardens/g1/stats?minutes=15`);
  });
});
