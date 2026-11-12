import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ApiError, api, type Rule } from "@/lib/api";
import { RuleForm } from "./rule-form";

function setup() {
  const createRule = vi.spyOn(api, "createRule").mockImplementation(
    async (_g, _t, targetId, body) =>
      ({ id: "r1", targetId, ...body, probability: String(body.probability), enabled: true, createdAt: "" }) as Rule,
  );
  const onCreated = vi.fn();
  render(<RuleForm gardenId="g1" token="secret" targetId="t1" onCreated={onCreated} />);
  return { createRule, onCreated, user: userEvent.setup() };
}

describe("RuleForm", () => {
  it("adds an error rule with the defaults", async () => {
    const { createRule, onCreated, user } = setup();
    await user.click(screen.getByRole("button", { name: "Add rule" }));
    expect(createRule).toHaveBeenCalledWith("g1", "secret", "t1", {
      type: "error",
      method: "*",
      pathPattern: "/*",
      probability: 0.5,
      params: { status: 503 },
    });
    expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({ id: "r1" }));
  });

  it("sends a delay with its milliseconds, method and path", async () => {
    const { createRule, user } = setup();
    await user.click(screen.getByRole("radio", { name: "Delay" }));
    const ms = screen.getByRole("spinbutton", { name: /Delay \(ms/ });
    await user.clear(ms);
    await user.type(ms, "1200");
    await user.selectOptions(screen.getByRole("combobox", { name: "Method" }), "GET");
    const path = screen.getByRole("textbox", { name: "Path pattern" });
    await user.clear(path);
    await user.type(path, "/orders/:id");
    await user.click(screen.getByRole("button", { name: "Add rule" }));
    expect(createRule).toHaveBeenCalledWith("g1", "secret", "t1", {
      type: "latency",
      method: "GET",
      pathPattern: "/orders/:id",
      probability: 0.5,
      params: { ms: 1200 },
    });
  });

  it("sends no params for drop and corrupt, and only shows the fields a fault needs", async () => {
    const { createRule, user } = setup();
    expect(screen.getByRole("spinbutton", { name: /Status code/ })).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "Drop" }));
    expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add rule" }));
    expect(createRule.mock.calls[0][3]).toMatchObject({ type: "drop", params: {} });

    await user.click(screen.getByRole("radio", { name: "Corrupt" }));
    await user.click(screen.getByRole("button", { name: "Add rule" }));
    expect(createRule.mock.calls[1][3]).toMatchObject({ type: "corrupt", params: {} });
  });

  it("shows the API's error and keeps the form", async () => {
    const { createRule, onCreated, user } = setup();
    createRule.mockRejectedValueOnce(new ApiError(400, "status must not be greater than 599"));
    await user.click(screen.getByRole("button", { name: "Add rule" }));
    expect(screen.getByRole("alert")).toHaveTextContent("status must not be greater than 599");
    expect(onCreated).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Add rule" })).toBeEnabled();
  });
});
