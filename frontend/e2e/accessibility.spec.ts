import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { newMember, openScreen, register } from './helpers';

/**
 * Accessibility, measured rather than assumed.
 *
 * Run against WCAG 2 A and AA. The rules are not decoration on a financial
 * product: a member who cannot read the contrast on their own balance, or who
 * reaches a form by keyboard and is told a field is "invalid" without being
 * told why, cannot use the platform — and in most jurisdictions that is also a
 * legal exposure, not merely a poor experience.
 *
 * Every violation is reported with the element and the rule, so a failure here
 * names the fix rather than just failing.
 */

const STANDARD = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

/** Runs axe and fails with a readable list rather than a wall of JSON. */
async function audit(page: import('@playwright/test').Page, label: string) {
  const { violations } = await new AxeBuilder({ page }).withTags(STANDARD).analyze();

  const readable = violations.map((v) => ({
    rule: v.id,
    impact: v.impact,
    help: v.help,
    nodes: v.nodes.slice(0, 3).map((n) => n.target.join(' ')),
  }));

  expect(readable, `${label} has accessibility violations:\n${JSON.stringify(readable, null, 2)}`)
    .toEqual([]);
}

test.describe('public pages', () => {
  for (const [label, path] of [
    ['the home page', '/'],
    ['the plans page', '/plans'],
    ['sign in', '/login'],
    ['register', '/register'],
    // The console sign-in is the highest-privilege form on the platform.
    ['the console sign-in', '/admin/login'],
  ] as const) {
    test(`${label} is accessible`, async ({ page }) => {
      await openScreen(page, path);
      await audit(page, label);
    });
  }
});

test.describe('the member area', () => {
  test('the dashboard is accessible', async ({ page }) => {
    await register(page, newMember());
    await openScreen(page, '/dashboard');
    await audit(page, 'the dashboard');
  });

  test('the wallet is accessible', async ({ page }) => {
    await register(page, newMember());
    await openScreen(page, '/wallet');
    await audit(page, 'the wallet');
  });

  test('the withdrawal screen is accessible', async ({ page }) => {
    await register(page, newMember());
    await openScreen(page, '/withdrawals');
    await audit(page, 'withdrawals');
  });
});

test.describe('keyboard only', () => {
  test('a member can sign in without a mouse', async ({ page }) => {
    /**
     * Not an axe rule — axe checks the markup, not whether the journey works.
     * A form can pass every static check and still be unusable if focus never
     * reaches the submit button.
     */
    const member = newMember();
    await register(page, member);
    await page.goto('/login');

    await page.keyboard.press('Tab');
    // Walk forward until focus lands in the email field, then fill by keyboard.
    for (let i = 0; i < 25; i += 1) {
      const isEmail = await page.evaluate(() => {
        const el = document.activeElement as HTMLInputElement | null;
        return el?.tagName === 'INPUT' && (el.type === 'email' || el.type === 'text');
      });
      if (isEmail) break;
      await page.keyboard.press('Tab');
    }

    await page.keyboard.type(member.email);
    await page.keyboard.press('Tab');
    await page.keyboard.type(member.password);
    await page.keyboard.press('Enter');

    await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
  });

  test('every control reached by Tab shows where focus is', async ({ page }) => {
    /**
     * Tabbed, not focused by script.
     *
     * An earlier version called `el.focus()` in a loop, which does not satisfy
     * the browser's `:focus-visible` heuristic — so it reported a missing ring
     * on a button that has one, and would have reported one on every button
     * styled that way. Pressing Tab is both the honest test and the thing a
     * keyboard user actually does.
     */
    await openScreen(page, '/login');
    await page.locator('body').click({ position: { x: 1, y: 1 } });

    const missing: string[] = [];
    const seen = new Set<string>();

    for (let i = 0; i < 20; i += 1) {
      await page.keyboard.press('Tab');

      const info = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return null;
        // Next injects its dev-mode error overlay into the tab order. It is
        // the framework's own furniture, not this application's markup.
        if (el.tagName.startsWith('NEXTJS-')) return null;

        const s = getComputedStyle(el);
        const ring =
          (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0) ||
          (s.boxShadow !== 'none' && s.boxShadow !== '');

        return {
          id: `${el.tagName}:${(el.getAttribute('name') ?? el.textContent ?? '').trim().slice(0, 24)}`,
          ring,
        };
      });

      if (!info || seen.has(info.id)) continue;
      seen.add(info.id);
      if (!info.ring) missing.push(info.id);
    }

    expect(seen.size, 'Tab reached no controls at all').toBeGreaterThan(2);
    expect(missing, `controls with no visible focus indicator: ${missing.join(', ')}`).toEqual([]);
  });
});
