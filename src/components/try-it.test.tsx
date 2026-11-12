import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { proxyUrlFor } from "@/lib/config";
import { TryIt } from "./try-it";

/** A fake proxy: answers request n with the n-th entry, cycling. */
function fakeProxy(answers: Array<{ status: number; fault?: string } | "drop">) {
  let n = 0;
  const fetch = vi.fn(async (_url: string, _init?: RequestInit) => {
    const answer = answers[n++ % answers.length];
    if (answer === "drop") throw new TypeError("Failed to fetch");
    return new Response("{}", {
      status: answer.status,
      headers: answer.fault ? { "x-chaos-fault": answer.fault } : {},
    });
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

function legendCount(label: string) {
  const item = screen.getByText(label).closest("li")!;
  return within(item).getByText(/^\d+$/).textContent;
}

describe("TryIt", () => {
  it("sends the requests to the proxy and counts the outcomes", async () => {
    const fetch = fakeProxy([
      { status: 200 },
      { status: 200, fault: "latency" },
      { status: 503, fault: "error" },
      { status: 200, fault: "corrupt" },
      "drop",
    ]);
    const onRunComplete = vi.fn();
    const user = userEvent.setup();
    render(<TryIt gardenId="g1" targetName="orders-api" onRunComplete={onRunComplete} />);

    await user.selectOptions(screen.getByRole("combobox", { name: "Method" }), "POST");
    const path = screen.getByRole("textbox", { name: "Path on the target" });
    await user.clear(path);
    await user.type(path, "orders");
    await user.selectOptions(screen.getByRole("combobox", { name: "Requests" }), "10");
    await user.click(screen.getByRole("button", { name: "Send 10 requests" }));

    expect(await screen.findByRole("button", { name: "Send 10 requests" })).toBeEnabled();
    expect(onRunComplete).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledTimes(10);
    expect(fetch.mock.calls[0][0]).toBe(`${proxyUrlFor("g1", "orders-api")}/orders`);
    expect(fetch.mock.calls[0][1]).toMatchObject({ method: "POST" });

    expect(legendCount("Passed through")).toBe("2");
    expect(legendCount("Delayed")).toBe("2");
    expect(legendCount("Injected error")).toBe("2");
    expect(legendCount("Broken body")).toBe("2");
    expect(legendCount("No response")).toBe("2");
    expect(legendCount("Other failure")).toBe("0");
    expect(screen.getAllByRole("button", { name: /^Request \d+:/ })).toHaveLength(10);
    expect(screen.getByText(/means the connection was dropped/)).toBeInTheDocument();
  });

  it("explains requests refused by the rate limit", async () => {
    fakeProxy([{ status: 200 }, { status: 429, fault: "rate_limited" }]);
    const user = userEvent.setup();
    render(<TryIt gardenId="g1" targetName="api" />);
    await user.selectOptions(screen.getByRole("combobox", { name: "Requests" }), "10");
    await user.click(screen.getByRole("button", { name: "Send 10 requests" }));

    expect(await screen.findByText(/5 of 10 requests were refused by this garden/)).toBeInTheDocument();
    expect(legendCount("Other failure")).toBe("5");
  });

  it("describes a request when its stem is selected", async () => {
    fakeProxy([{ status: 503, fault: "latency,error" }]);
    const user = userEvent.setup();
    render(<TryIt gardenId="g1" targetName="api" />);
    await user.selectOptions(screen.getByRole("combobox", { name: "Requests" }), "10");
    await user.click(screen.getByRole("button", { name: "Send 10 requests" }));
    await screen.findByRole("button", { name: "Send 10 requests" });

    const stem = screen.getByRole("button", { name: /^Request 3: injected error, status 503/ });
    await user.click(stem);
    expect(stem).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(/x-chaos-fault: latency,error/)).toBeInTheDocument();
  });
});
