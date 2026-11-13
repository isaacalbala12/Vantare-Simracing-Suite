import type { Page } from "playwright-core";
import { afterEach, expect, it, vi } from "vitest";
import { openProfileRemovalWithKeyboard } from "../scripts/check-dialog-safety";

afterEach(() => vi.useRealTimers());

it("waits for the menu opening callback before selecting Remove and pressing Enter", async () => {
  vi.useFakeTimers();
  let active = "body";
  let enter = 0;
  let completeOpening = () => {};
  let announceVisible = () => {};
  const visible = new Promise<void>((resolve) => {
    announceVisible = resolve;
  });
  let attemptedFocus = () => {};
  const attempt = new Promise<void>((resolve) => {
    attemptedFocus = resolve;
  });
  function element(id: string) {
    return {
      focus: async () => {
        active = id;
        if (id === "Remove") attemptedFocus();
      },
      // Model the browser focus comparison without requiring a DOM in this tooling test.
      evaluate: async () => {
        if (id === "first menu item") attemptedFocus();
        return active === id;
      },
    };
  }
  const card = element("card");
  const first = element("first menu item");
  const remove = element("Remove");
  const cancel = element("Cancel confirmation");
  const menu = {
    waitFor: async () => {
      completeOpening = () => {
        active = "first menu item";
      };
      announceVisible();
    },
    getByRole: (_role: string, options?: { name: string }) =>
      options ? remove : { first: () => first },
  };
  const dialog = {
    waitFor: async () => {
      if (!enter) throw new Error("confirmation never opened");
    },
    getByRole: () => ({ first: () => cancel }),
  };
  const page = {
    locator: () => ({ first: () => card }),
    getByRole: (role: string) => (role === "menu" ? menu : dialog),
    keyboard: {
      press: async (key: string) => {
        if (key === "Enter") {
          enter++;
          if (active !== "Remove")
            throw new Error("Enter reached the wrong menu item");
          active = "Cancel confirmation";
        }
      },
    },
  } as unknown as Page;
  const opening = openProfileRemovalWithKeyboard(page);
  await visible;
  await attempt;
  // The menu is visible, but ProfileCardActions has not completed its opening yet.
  expect(enter).toBe(0);
  expect(active).toBe("card");
  completeOpening();
  await vi.runAllTimersAsync();
  await expect(opening).resolves.toBe(dialog);
  expect(enter).toBe(1);
  expect(active).toBe("Cancel confirmation");
});
