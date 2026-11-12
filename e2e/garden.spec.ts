import { expect, test } from "@playwright/test";
import { FakeBackend } from "./fake-backend";

let backend: FakeBackend;

test.beforeEach(async ({ page }) => {
  backend = new FakeBackend();
  await backend.install(page);
});

test("create a garden, add a target and a rule, and see the fault in Try it and Activity", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Garden name").fill("Checkout flow");
  await page.getByRole("button", { name: "Create garden" }).click();

  await expect(page.getByRole("heading", { level: 1, name: "Checkout flow" })).toBeVisible();
  await expect(page.getByText("Save your admin token")).toBeVisible();

  await page.getByLabel("Name", { exact: true }).fill("orders-api");
  await page.getByLabel("Base URL").fill("https://api.example.com");
  await page.getByRole("button", { name: "Add target" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "orders-api" })).toBeVisible();
  const garden = [...backend.gardens.values()][0];
  await expect(page.getByText(`http://localhost:3100/g/${garden.id}/orders-api`, { exact: true })).toBeVisible();

  // An error rule on every POST /orders.
  const ruleForm = page.locator("form").filter({ has: page.getByRole("heading", { name: "Add a rule" }) });
  await ruleForm.getByRole("slider", { name: /How often/ }).fill("100");
  await ruleForm.getByRole("combobox", { name: "Method" }).selectOption("POST");
  await ruleForm.getByRole("textbox", { name: "Path pattern" }).fill("/orders");
  await ruleForm.getByRole("button", { name: "Add rule" }).click();
  await expect(page.getByText("Return 503 on 100% of POST requests matching /orders")).toBeVisible();

  const tryIt = page.getByRole("region", { name: "Try it" });
  await tryIt.getByRole("combobox", { name: "Method" }).selectOption("POST");
  await tryIt.getByRole("textbox", { name: "Path on the target" }).fill("/orders");
  await tryIt.getByRole("combobox", { name: "Requests" }).selectOption("10");
  await tryIt.getByRole("button", { name: "Send 10 requests" }).click();

  await expect(tryIt.getByRole("listitem").filter({ hasText: "Injected error" })).toContainText("10");
  await expect(tryIt.getByRole("listitem").filter({ hasText: "Passed through" })).toContainText("0");

  const activity = page.getByRole("region", { name: "Activity" });
  await expect(activity.getByText("Requests", { exact: true }).locator("..")).toContainText("10");
  await expect(activity.getByText("Hit by a fault").locator("..")).toContainText("100%");
});

test("a rule that is switched off stops firing", async ({ page }) => {
  const garden = backend.seedGarden("Search");
  await page.addInitScript((g) => {
    localStorage.setItem("chaos-garden:gardens", JSON.stringify([{ id: g.id, name: g.name, token: g.token }]));
  }, garden);
  backend.targets.push({ id: "t1", gardenId: garden.id, name: "search-api", baseUrl: "https://api.example.com", createdAt: "" });
  backend.rules.push({
    id: "r1", targetId: "t1", method: "*", pathPattern: "/*", type: "drop", probability: "1.000", params: {}, enabled: true, createdAt: "",
  });

  await page.goto(`/gardens/${garden.id}`);
  const tryIt = page.getByRole("region", { name: "Try it" });
  await tryIt.getByRole("combobox", { name: "Requests" }).selectOption("10");
  await tryIt.getByRole("button", { name: "Send 10 requests" }).click();
  await expect(tryIt.getByRole("listitem").filter({ hasText: "No response" })).toContainText("10");

  await page.getByRole("checkbox", { name: "On" }).uncheck();
  await expect.poll(() => backend.rules[0].enabled).toBe(false);
  await tryIt.getByRole("button", { name: "Send 10 requests" }).click();
  await expect(tryIt.getByRole("listitem").filter({ hasText: "Passed through" })).toContainText("10");
});

test("open a garden from another browser with its admin token", async ({ page }) => {
  const garden = backend.seedGarden("Shared garden", "the-right-token");
  await page.goto(`/gardens/${garden.id}`);
  await expect(page.getByRole("heading", { name: "Open this garden" })).toBeVisible();

  await page.getByLabel("Admin token").fill("a-wrong-token");
  await page.getByRole("button", { name: "Open garden" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toHaveText("That token doesn't open this garden.");

  await page.getByLabel("Admin token").fill("the-right-token");
  await page.getByRole("button", { name: "Open garden" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Shared garden" })).toBeVisible();

  await page.goto("/");
  await expect(page.getByRole("link", { name: /Shared garden/ })).toBeVisible();
});

test("explains when the control API can't be reached", async ({ page }) => {
  await page.route("http://localhost:3000/**", (route) => route.abort("connectionrefused"));
  await page.goto("/");
  await page.getByLabel("Garden name").fill("Offline");
  await page.getByRole("button", { name: "Create garden" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Can't reach the control API");
  await expect(page.getByRole("button", { name: "Create garden" })).toBeEnabled();
});
