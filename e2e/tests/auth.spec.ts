import { test, expect } from '@playwright/test';

test.describe('Authentication Flow', () => {
  const timestamp = Date.now();
  const testEmail = `testuser_${timestamp}@example.com`;
  const testPassword = 'password123!';

  test('should register a new user successfully', async ({ page }) => {
    await page.goto('http://localhost:3000/register');

    // Fill registration form
    await page.fill('#register-name', 'Playwright Tester');
    await page.fill('#register-email', testEmail);
    await page.fill('#register-password', testPassword);
    await page.fill('#register-confirm', testPassword);

    // Submit form
    await page.click('button[type="submit"]');

    // Expect to be redirected to dashboard
    await expect(page).toHaveURL('http://localhost:3000/dashboard');

    // Verify user is logged in (e.g., checking for logout button or profile)
    await expect(page.locator('text=Playwright Tester')).toBeVisible();
  });

  test('should fail registration with short password', async ({ page }) => {
    await page.goto('http://localhost:3000/register');

    await page.fill('#register-name', 'Bad Password');
    await page.fill('#register-email', `badpass_${timestamp}@example.com`);
    await page.fill('#register-password', '123');
    await page.fill('#register-confirm', '123');

    await page.click('button[type="submit"]');

    // Should stay on register page and show error
    await expect(page.locator('text=Password must be at least 8 characters')).toBeVisible();
    await expect(page).toHaveURL('http://localhost:3000/register');
  });

  test('should login an existing user successfully', async ({ page }) => {
    // First register the user to ensure they exist
    const loginEmail = `login_${timestamp}@example.com`;
    await page.goto('http://localhost:3000/register');
    await page.fill('#register-name', 'Login Tester');
    await page.fill('#register-email', loginEmail);
    await page.fill('#register-password', testPassword);
    await page.fill('#register-confirm', testPassword);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('http://localhost:3000/dashboard');

    // Logout
    await page.goto('http://localhost:3000/dashboard');
    // Assuming there is a user menu with logout, or clear localStorage
    await page.evaluate(() => {
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
    });
    
    // Login
    await page.goto('http://localhost:3000/login');
    await page.fill('#login-email', loginEmail);
    await page.fill('#login-password', testPassword);
    await page.click('button[type="submit"]');

    // Expect to be redirected to dashboard
    await expect(page).toHaveURL('http://localhost:3000/dashboard');
    await expect(page.locator('text=Login Tester')).toBeVisible();
  });

  test('should fail login with incorrect password', async ({ page }) => {
    await page.goto('http://localhost:3000/login');
    await page.fill('#login-email', `nonexistent_${timestamp}@example.com`);
    await page.fill('#login-password', 'wrongpassword');
    await page.click('button[type="submit"]');

    await expect(page.locator('text=Invalid email or password')).toBeVisible();
    await expect(page).toHaveURL('http://localhost:3000/login');
  });
});
