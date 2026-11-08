import { CONTROL_API_URL } from "./config";

export type FaultType = "latency" | "error" | "drop" | "corrupt";

export interface Garden {
  id: string;
  name: string;
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
      `Can't reach the control API at ${CONTROL_API_URL}. Check that it is running and allows this site (CORS_ORIGIN).`,
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
