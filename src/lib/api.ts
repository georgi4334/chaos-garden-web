import { CONTROL_API_URL } from "./config";

export type FaultType = "latency" | "error" | "drop" | "corrupt";

export interface Garden {
  id: string;
  name: string;
  /** Proxy rate limit: sustained requests per second, and burst size. */
  rateLimitRps: number;
  rateLimitBurst: number;
  createdAt: string;
}

export interface Target {
  id: string;
  gardenId: string;
  name: string;
  baseUrl: string;
  createdAt: string;
}

export interface Rule {
  id: string;
  targetId: string;
  method: string;
  pathPattern: string;
  type: FaultType;
  /** The API returns Postgres numerics as strings, for example "0.500". */
  probability: string;
  params: Record<string, unknown>;
  enabled: boolean;
  createdAt: string;
}

export interface NewRule {
  type: FaultType;
  method: string;
  pathPattern: string;
  probability: number;
  params: Record<string, unknown>;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(
  path: string,
  options: { method?: string; token?: string; body?: unknown } = {},
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${CONTROL_API_URL}${path}`, {
      method: options.method ?? "GET",
      headers: {
        ...(options.body !== undefined && { "content-type": "application/json" }),
        ...(options.token && { authorization: `Bearer ${options.token}` }),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new ApiError(
      0,
      `Can't reach the control API at ${CONTROL_API_URL}. On a free hosting plan it may be waking up, which takes about a minute: try again shortly. Otherwise, check that it is running and allows this site (CORS_ORIGIN).`,
    );
  }
  // A platform's "starting up" page instead of the API's JSON.
  const isJson = (res.headers.get("content-type") ?? "").includes("application/json");
  if (res.status !== 204 && !isJson) {
    throw new ApiError(
      res.status,
      "The control API sent an unexpected response. If it runs on a free hosting plan it may be waking up, which takes about a minute: try again shortly.",
    );
  }

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const data = (await res.json()) as { message?: string | string[] };
      if (Array.isArray(data.message)) message = data.message.join(", ");
      else if (data.message) message = data.message;
    } catch {
      // keep the generic message
    }
    throw new ApiError(res.status, message);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  createGarden: (name: string) =>
    request<Garden & { adminToken: string }>("/gardens", { method: "POST", body: { name } }),
  getGarden: (id: string, token: string) => request<Garden>(`/gardens/${id}`, { token }),
  updateGarden: (
    id: string,
    token: string,
    body: Partial<Pick<Garden, "name" | "rateLimitRps" | "rateLimitBurst">>,
  ) => request<Garden>(`/gardens/${id}`, { method: "PATCH", token, body }),
  deleteGarden: (id: string, token: string) =>
    request<void>(`/gardens/${id}`, { method: "DELETE", token }),

  listTargets: (gardenId: string, token: string) =>
    request<Target[]>(`/gardens/${gardenId}/targets`, { token }),
  createTarget: (gardenId: string, token: string, body: { name: string; baseUrl: string }) =>
    request<Target>(`/gardens/${gardenId}/targets`, { method: "POST", token, body }),
  deleteTarget: (gardenId: string, token: string, targetId: string) =>
    request<void>(`/gardens/${gardenId}/targets/${targetId}`, { method: "DELETE", token }),

  listRules: (gardenId: string, token: string, targetId: string) =>
    request<Rule[]>(`/gardens/${gardenId}/targets/${targetId}/rules`, { token }),
  createRule: (gardenId: string, token: string, targetId: string, body: NewRule) =>
    request<Rule>(`/gardens/${gardenId}/targets/${targetId}/rules`, {
      method: "POST",
      token,
      body,
    }),
  setRuleEnabled: (
    gardenId: string,
    token: string,
    targetId: string,
    ruleId: string,
    enabled: boolean,
  ) =>
    request<Rule>(`/gardens/${gardenId}/targets/${targetId}/rules/${ruleId}`, {
      method: "PATCH",
      token,
      body: { enabled },
    }),
  deleteRule: (gardenId: string, token: string, targetId: string, ruleId: string) =>
    request<void>(`/gardens/${gardenId}/targets/${targetId}/rules/${ruleId}`, {
      method: "DELETE",
      token,
    }),
};

/** Outcomes as stored by the ingest service. */
export type LoggedOutcome =
  | "ok"
  | "slow"
  | "error"
  | "drop"
  | "corrupt"
  | "target_error"
  | "no_response"
  | "rate_limited";

export interface RequestLog {
  id: string;
  targetId: string;
  targetName: string;
  method: string;
  path: string;
  status: number | null;
  outcome: LoggedOutcome;
  durationMs: number;
  faults: string[];
  occurredAt: string;
}

export interface OutcomeCounts {
  total: number;
  ok: number;
  slow: number;
  error: number;
  drop: number;
  corrupt: number;
  targetError: number;
  noResponse: number;
  /** Refused by the garden's rate limit. Missing from older ingest services. */
  rateLimited?: number;
  avgDurationMs: number | null;
}

export interface Stats {
  from: string;
  to: string;
  totals: OutcomeCounts;
  buckets: Array<OutcomeCounts & { bucket: string }>;
}

export const logsApi = {
  requests: (
    gardenId: string,
    token: string,
    query: { targetId?: string; limit?: number; before?: string },
  ) => {
    const qs = new URLSearchParams();
    if (query.targetId) qs.set("targetId", query.targetId);
    if (query.limit) qs.set("limit", String(query.limit));
    if (query.before) qs.set("before", query.before);
    return request<{ items: RequestLog[]; nextBefore: string | null }>(
      `/gardens/${gardenId}/requests?${qs}`,
      { token },
    );
  },
  stats: (gardenId: string, token: string, query: { targetId?: string; minutes: number }) => {
    const qs = new URLSearchParams({ minutes: String(query.minutes) });
    if (query.targetId) qs.set("targetId", query.targetId);
    return request<Stats>(`/gardens/${gardenId}/stats?${qs}`, { token });
  },
};
