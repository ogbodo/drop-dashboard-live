import { expect, test } from "@playwright/test";

/**
 * E2E coverage for the admin /login page.
 *
 * These specs intentionally avoid relying on valid admin credentials so they
 * can run against any environment whose Supabase config merely allows the
 * Next.js dev server to boot. Backend-dependent assertions are driven through
 * route interception so the outcome is deterministic regardless of the real
 * auth backend's response.
 */

const USERNAME_SELECTOR = 'input[autocomplete="username"]';
const PASSWORD_SELECTOR = 'input[type="password"]';
const SUBMIT_SELECTOR = 'button[type="submit"]';
const ERROR_SELECTOR = ".form-error";

test.describe("/login page", () => {
  test("renders the login form with username, password, and submit", async ({
    page,
  }) => {
    await page.goto("/login");

    const username = page.locator(USERNAME_SELECTOR);
    const password = page.locator(PASSWORD_SELECTOR);
    const submit = page.locator(SUBMIT_SELECTOR);

    await expect(username).toBeVisible();
    await expect(password).toBeVisible();
    await expect(submit).toBeVisible();

    // The page heading confirms we rendered the auth shell, not a redirect.
    await expect(
      page.getByRole("heading", { name: /sign in/i }),
    ).toBeVisible();
  });

  test("blocks submitting an empty form via HTML required validation", async ({
    page,
  }) => {
    await page.goto("/login");

    const username = page.locator(USERNAME_SELECTOR);
    let postAttempted = false;

    // If native validation works, the form never POSTs. Track any attempt so
    // we can prove the request was suppressed.
    await page.route("**/api/auth/login", async (route) => {
      postAttempted = true;
      await route.abort();
    });

    await page.locator(SUBMIT_SELECTOR).click();

    // No navigation should occur: we stay on /login...
    await expect(page).toHaveURL(/\/login(\?.*)?$/);
    // ...the inputs are still present (form not torn down or submitted)...
    await expect(username).toBeVisible();
    // ...and the browser flags the first required field as invalid.
    const usernameIsInvalid = await username.evaluate(
      (el) => !(el as HTMLInputElement).validity.valid,
    );
    expect(usernameIsInvalid).toBe(true);
    // ...and crucially, no login request was ever fired.
    expect(postAttempted).toBe(false);
  });

  test("shows a form error when credentials are rejected", async ({ page }) => {
    await page.goto("/login");

    // Do NOT assume a specific password. Drive the rejected-credentials path by
    // intercepting the login call and returning a realistic 401 error envelope,
    // then assert the UI surfaces an error. We also await the response to prove
    // the form actually called the endpoint.
    await page.route("**/api/auth/login", async (route) => {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "Invalid username or password." }),
      });
    });

    await page.locator(USERNAME_SELECTOR).fill("definitely-not-a-real-admin");
    await page.locator(PASSWORD_SELECTOR).fill("an-incorrect-password");

    const [response] = await Promise.all([
      page.waitForResponse("**/api/auth/login"),
      page.locator(SUBMIT_SELECTOR).click(),
    ]);

    expect(response.ok()).toBe(false);

    const error = page.locator(ERROR_SELECTOR);
    await expect(error).toBeVisible();
    // Some non-empty error text must be shown; we don't hardcode exact copy
    // beyond what we injected, only that the error surface is populated.
    await expect(error).not.toBeEmpty();

    // The failed login must not navigate away from /login.
    await expect(page).toHaveURL(/\/login(\?.*)?$/);
  });

  /**
   * Mock a successful auth response WITHOUT setting a real session cookie.
   *
   * After a successful login, components/login-form.tsx computes a redirect
   * target and calls router.replace(target). We verify the open-redirect guard
   * by capturing the actual navigation the client router requests: a correct
   * guard only ever navigates to a same-origin path, never to the attacker
   * host. We assert on that requested target rather than the final landed URL,
   * because the dashboard middleware (proxy.ts) will bounce an unauthenticated
   * "/" request back to "/login" — the post-login navigation, not the eventual
   * resting place, is what proves the guard worked.
   */
  const mockSuccessfulLogin = async (
    page: import("@playwright/test").Page,
  ): Promise<{ getAllRequestUrls: () => string[] }> => {
    await page.route("**/api/auth/login", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            authenticated: true,
            role: "admin",
            username: "qa-mock-admin",
          },
        }),
      });
    });

    // Record every request the page makes. A broken guard that fed the raw
    // `next` value into the router would surface here as a request whose host
    // is the attacker's — full-page navigation OR client-side RSC fetch.
    const allRequestUrls: string[] = [];
    page.on("request", (request) => {
      allRequestUrls.push(request.url());
    });

    return { getAllRequestUrls: () => allRequestUrls };
  };

  /**
   * After a successful login, Next's App Router navigates client-side via
   * router.replace() — there is no top-level document request, so the redirect
   * shows up as an RSC fetch (header `rsc: 1`) to the chosen destination and as
   * a History API URL change. We drive the login, then read the destination the
   * router actually targeted plus the settled URL bar, and assert both are
   * same-origin and never the attacker host. The malicious value may legitimately
   * persist only as the literal `next=` *query string* — never as a real host.
   */
  const submitAndAssertSameOrigin = async (
    page: import("@playwright/test").Page,
    baseURL: string | undefined,
    getAllRequestUrls: () => string[],
  ) => {
    const expectedOrigin = new URL(baseURL ?? "http://localhost:3100").origin;

    // Capture the first RSC navigation fetch the router issues post-login. This
    // is the destination the open-redirect guard resolved to.
    const destinationRequestPromise = page
      .waitForRequest(
        (request) => {
          const headers = request.headers();
          return (
            headers["rsc"] === "1" &&
            new URL(request.url()).origin === expectedOrigin
          );
        },
        { timeout: 15_000 },
      )
      .catch(() => null);

    await page.locator(USERNAME_SELECTOR).fill("qa-mock-admin");
    await page.locator(PASSWORD_SELECTOR).fill("mock-password");
    await page.locator(SUBMIT_SELECTOR).click();

    const destinationRequest = await destinationRequestPromise;

    // Let the URL bar settle after any middleware bounce.
    await page.waitForLoadState("networkidle").catch(() => {});

    // 1) The router's first chosen destination (RSC fetch) must be same-origin
    //    and resolve to the site root — the guard collapsed the bad target to "/".
    expect(
      destinationRequest,
      "expected the router to issue a same-origin RSC navigation after login",
    ).not.toBeNull();
    const destUrl = new URL(destinationRequest!.url());
    expect(destUrl.origin).toBe(expectedOrigin);
    expect(destUrl.hostname).not.toBe("evil.com");
    expect(destUrl.pathname).toBe("/");

    // 2) The settled URL must stay on our own origin.
    const settled = new URL(page.url());
    expect(settled.origin).toBe(expectedOrigin);
    expect(settled.hostname).not.toBe("evil.com");

    // 3) Defense in depth: across EVERY request the page made, none may have an
    //    attacker host. (evil.com appearing only inside a `next=` query string
    //    is harmless — we check the parsed hostname, not substring presence.)
    const offSiteRequest = getAllRequestUrls().find((raw) => {
      try {
        return new URL(raw).hostname === "evil.com";
      } catch {
        return false;
      }
    });
    expect(
      offSiteRequest,
      `no request may target evil.com; saw: ${offSiteRequest ?? "none"}`,
    ).toBeUndefined();
  };

  test("SECURITY: ignores an off-site https next= target and stays same-origin", async ({
    page,
    baseURL,
  }) => {
    // The open-redirect guard lives in components/login-form.tsx: on a
    // successful login it only honours a `next` value that starts with a single
    // "/" (rejecting protocol-relative "//" and absolute "https://" URLs),
    // otherwise it falls back to "/". Mock a successful auth response so the
    // redirect branch runs deterministically without real credentials.
    const { getAllRequestUrls } = await mockSuccessfulLogin(page);
    await page.goto("/login?next=https://evil.com");
    await submitAndAssertSameOrigin(page, baseURL, getAllRequestUrls);
  });

  test("SECURITY: ignores a protocol-relative next= target", async ({
    page,
    baseURL,
  }) => {
    // Protocol-relative URLs ("//evil.com") are the classic bypass for a naive
    // `startsWith('/')` check. The guard explicitly rejects them too (it also
    // checks `!startsWith('//')`), so this must also collapse to the site root.
    const { getAllRequestUrls } = await mockSuccessfulLogin(page);
    await page.goto("/login?next=//evil.com/phishing");
    await submitAndAssertSameOrigin(page, baseURL, getAllRequestUrls);
  });
});
