import { expect, test, type Page } from "@playwright/test";

// Every control a visitor can see on /event, and inside the opened narrated
// demo player, must give a phone user a tap area of at least 40×40 CSS px at
// 390×844. The size checked is the element's own rendered box (what the
// browser hit-tests), measured after scrolling it into view, and the control
// must actually receive a tap at its centre.
//
// Only controls that are intentionally not shown are skipped: display:none,
// visibility:hidden, zero-size boxes, aria-hidden or inert subtrees,
// screen-reader-only clipping (≤1px), and off-canvas elements such as the skip
// link, which only slides into view on keyboard focus.
const MIN = 40;
const CONTROLS = "a[href], button, [role=button], [role=link], input:not([type=hidden]), select, textarea, summary";

type Offender = { label: string; width: number; height: number; reason: string };

/** Audits every visible control inside `scope` (the whole page when null). */
async function auditTargets(page: Page, scope: string | null) {
  return page.evaluate(
    ({ min, selector, scope }) => {
      const root = scope ? document.querySelector(scope) : document.body;
      if (!root) throw new Error(`scope ${scope} not found`);
      const intentionallyHidden = (el: Element) => {
        if (el.closest('[aria-hidden="true"], [inert]')) return true;
        const s = getComputedStyle(el);
        if (s.display === "none" || s.visibility === "hidden") return true;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return true;
        if (r.width <= 1 && r.height <= 1) return true;
        const top = r.top + scrollY;
        const left = r.left + scrollX;
        return top + r.height <= 0 || left + r.width <= 0 || left >= document.documentElement.scrollWidth;
      };
      const label = (el: Element) =>
        (el.getAttribute("aria-label") || el.textContent || el.getAttribute("href") || el.tagName).trim().replace(/\s+/g, " ").slice(0, 60);

      let checked = 0;
      const offenders: { label: string; width: number; height: number; reason: string }[] = [];
      for (const el of Array.from(root.querySelectorAll(selector))) {
        if (intentionallyHidden(el)) continue;
        checked++;
        el.scrollIntoView({ block: "center", inline: "center", behavior: "instant" });
        const r = el.getBoundingClientRect();
        const width = Math.round(r.width * 10) / 10;
        const height = Math.round(r.height * 10) / 10;
        if (r.width < min || r.height < min) {
          offenders.push({ label: label(el), width, height, reason: `smaller than ${min}×${min}px` });
          continue;
        }
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        if (!hit || !(hit === el || el.contains(hit))) offenders.push({ label: label(el), width, height, reason: "covered at its centre" });
      }
      return { checked, offenders };
    },
    { min: MIN, selector: CONTROLS, scope }
  );
}

function expectNoOffenders(checked: number, offenders: Offender[], minChecked: number) {
  expect(checked, "the controls should be on screen").toBeGreaterThanOrEqual(minChecked);
  expect(offenders, `${offenders.length} visible control(s) fail the ${MIN}×${MIN}px rule:\n${JSON.stringify(offenders, null, 2)}`).toEqual([]);
}

test.describe("/event tap targets on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: "reduce" });

  test("no visible control on the page is smaller than 40×40px at 390×844", async ({ page }) => {
    // Known failure: 26 controls are below 40px today (issue #6). Remove this
    // line in the change that fixes them; Playwright fails the run if the test
    // starts passing while it is still marked as failing.
    test.fail(true, "Tracked in issue #6");

    await page.goto("/event");
    await page.waitForLoadState("networkidle");
    const { checked, offenders } = await auditTargets(page, null);
    expectNoOffenders(checked, offenders, 10);
  });

  test("no visible control in the playing narrated demo is smaller than 40×40px at 390×844", async ({ page }) => {
    // Known failure: the 7 scene buttons in the player are 47.7×24px today
    // (issue #6). Remove this line in the change that fixes them.
    test.fail(true, "Tracked in issue #6");

    await page.goto("/event");
    await page.getByRole("button", { name: "Start 45-Second AI Experience" }).click();
    const dialog = page.getByRole("dialog", { name: "45-second AI experience" });
    await expect(dialog).toHaveAttribute("data-status", "playing", { timeout: 15_000 });
    await page.waitForTimeout(1000);
    const { checked, offenders } = await auditTargets(page, '[role="dialog"]');
    // Still playing after the audit: the audit itself must not break the show.
    await expect(dialog).toHaveAttribute("data-status", "playing");
    expectNoOffenders(checked, offenders, 8);
  });
});
