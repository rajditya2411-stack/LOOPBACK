import { expect, test } from "@playwright/test";

test("captures primary authenticated workspace views", async ({ page }) => {
  const id = Date.now();
  await page.goto("/register");
  await page.fill("#register-name", "E2E Workspace User");
  await page.fill("#register-email", `workspace-${id}@example.com`);
  await page.fill("#register-password", "password123!");
  await page.fill("#register-confirm", "password123!");
  await page.click("button[type=submit]");
  await expect(page).toHaveURL(/dashboard/, { timeout: 15_000 });
  await page.screenshot({ path: "../frontend/public/screenshots/dashboard.png", fullPage: true });

  await page.goto("/tasks");
  await page.getByRole("button", { name: "New task" }).click();
  await page.getByRole("textbox", { name: "Title" }).fill("Move me across the board");
  await page.getByRole("dialog", { name: "New task" }).getByRole("button", { name: "Create task" }).click();
  await expect(page.getByText("Move me across the board")).toBeVisible();
  await page.screenshot({ path: "../frontend/public/screenshots/tasks.png", fullPage: true });

  await page.goto("/documents");
  await page.screenshot({ path: "../frontend/public/screenshots/documents.png", fullPage: true });
  await page.goto("/chat");
  await page.screenshot({ path: "../frontend/public/screenshots/chat.png", fullPage: true });
});
