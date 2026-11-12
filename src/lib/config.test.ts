import { describe, expect, it } from "vitest";
import { PROXY_URL, proxyUrlFor } from "./config";

describe("proxyUrlFor", () => {
  it("builds the proxy URL for a target", () => {
    expect(proxyUrlFor("g1", "orders-api")).toBe(`${PROXY_URL}/g/g1/orders-api`);
  });

  it("encodes target names", () => {
    expect(proxyUrlFor("g1", "a b/c")).toBe(`${PROXY_URL}/g/g1/a%20b%2Fc`);
  });
});
