import type { Page } from "playwright-core";

/** Check painted text bounds, not just accessible names or CSS declarations. */
export async function assertTestingConsentFits(
  page: Page,
  requireWrapping = false,
) {
  const labels = await page
    .locator(".v-testing .v-choice > span:not(.v-checkbox)")
    .evaluateAll((elements) =>
      elements.map((element) => {
        const range = document.createRange();
        range.selectNodeContents(element);
        const text = Array.from(range.getClientRects()).filter(
          (rect) => rect.width > 0 && rect.height > 0,
        );
        const parent = element.parentElement;
        if (!parent) return { lines: 0, fits: false };
        const bounds = [
          element.getBoundingClientRect(),
          parent.getBoundingClientRect(),
        ];
        return {
          lines: new Set(text.map((rect) => Math.round(rect.top))).size,
          fits:
            text.length > 0 &&
            bounds.every((box) =>
              text.every(
                (rect) =>
                  rect.left >= box.left - 1 &&
                  rect.right <= box.right + 1 &&
                  rect.top >= box.top - 1 &&
                  rect.bottom <= box.bottom + 1,
              ),
            ),
        };
      }),
    );
  if (!labels.length || labels.some((label) => !label.fits))
    throw new Error("Testing consent text is clipped");
  if (requireWrapping && !labels.some((label) => label.lines > 1))
    throw new Error("Long Testing consent did not wrap");
}
