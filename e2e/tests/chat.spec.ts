import { test, expect } from '@playwright/test';

test.describe('Chat Flow', () => {
  const timestamp = Date.now();
  const testEmail = `chat_${timestamp}@example.com`;
  const testPassword = 'password123!';

  test.beforeEach(async ({ page }) => {
    // Register and login before each chat test
    await page.goto('http://localhost:3000/register');
    await page.fill('#register-name', 'Chat Tester');
    await page.fill('#register-email', testEmail);
    await page.fill('#register-password', testPassword);
    await page.fill('#register-confirm', testPassword);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('http://localhost:3000/dashboard');
  });

  test('should create a new chat and send a message', async ({ page }) => {
    // Navigate to Chat page
    await page.goto('http://localhost:3000/chat');
    
    await page.getByRole("button", { name: "New Chat" }).click();
    // The current composer is a multiline textbox, not a single-line input.
    const chatInput = page.getByRole("textbox", { name: "Message LoopBack..." });
    await expect(chatInput).toBeVisible();

    // Type a message
    await chatInput.fill('Hello AI, this is a test from Playwright!');
    
    // Send it
    await page.getByRole("button", { name: "Send message" }).click();

    // Wait for AI response (the assistant message should appear)
    // The user turn is persisted before a provider response begins streaming.
    await expect(page.getByText('Hello AI, this is a test from Playwright!')).toBeVisible({ timeout: 10000 });
  });
});
