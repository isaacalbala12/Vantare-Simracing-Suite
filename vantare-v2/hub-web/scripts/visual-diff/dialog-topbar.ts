import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Locator, Page } from "playwright-core";
import {
  checkProfileContextKeys,
  openProfileRemovalWithKeyboard,
} from "../check-dialog-safety.ts";
import { checkNativeAccessLayer } from "../check-native-access-layer.ts";
import { until } from "../wait-for.ts";
import { accessScenes } from "./access.ts";
import { launcherScenes } from "./launcher.ts";
import { onboardingScenes } from "./onboarding.ts";
import { privacyScenes } from "./privacy.ts";
import type { VisualScene } from "./scenes.ts";
import { studioScenes } from "./studio.ts";

async function chrome(page: Page) {
  return page.evaluate(() => {
    const controls = document.querySelector(".v-window-controls");
    const buttons = [
      ...(controls?.querySelectorAll<HTMLButtonElement>("button") ?? []),
    ];
    const header = document.querySelector<HTMLElement>(
      ".v-titlebar,.v-gate-titlebar,.v-ob-header",
    );
    const rect = header?.getBoundingClientRect();
    const hit = rect
      ? document.elementFromPoint(rect.left + 8, rect.top + 8)
      : null;
    return {
      controls:
        buttons.length === 3 &&
        buttons.every((button) => {
          const r = button.getBoundingClientRect();
          const hit = document.elementFromPoint(
            r.x + r.width / 2,
            r.y + r.height / 2,
          );
          return (
            !!hit &&
            button.contains(hit) &&
            !button.closest('[inert],[aria-hidden="true"]')
          );
        }),
      drag:
        !!header &&
        !!hit &&
        header.contains(hit) &&
        getComputedStyle(header).getPropertyValue("-webkit-app-region") ===
          "drag",
      backgroundInert: [
        ...document.querySelectorAll<HTMLElement>(
          ".v-shell-main,.v-context,.v-sidebar",
        ),
      ].every((node) => node.inert),
    };
  });
}
async function record(page: Page, id: string) {
  const root = process.env.VANTARE_DIALOG_AUDIT_ROOT;
  assert.ok(root);
  const phase = process.env.VANTARE_DIALOG_AUDIT_PHASE ?? "before";
  const scheme = await page.evaluate(
    () => document.documentElement.dataset.scheme ?? "unknown",
  );
  await mkdir(join(root, phase), { recursive: true });
  const evidence = await chrome(page);
  await writeFile(
    join(root, phase, `${id}-${scheme}.json`),
    JSON.stringify(evidence, null, 2),
  );
  return evidence;
}
async function check(
  page: Page,
  id: string,
  trigger?: Locator,
  blocking = true,
) {
  const result = await record(page, id);
  if (process.env.VANTARE_DIALOG_AUDIT_PHASE !== "after") return;
  assert.ok(result.controls, `${id}: window controls are covered or inert`);
  assert.ok(result.drag, `${id}: titlebar drag area is covered`);
  for (const button of await page.locator(".v-window-controls button").all()) {
    await button.focus();
    assert.ok(await button.evaluate((node) => node === document.activeElement));
  }
  if (blocking) {
    assert.ok(result.backgroundInert, `${id}: background remains interactive`);
    await page
      .getByRole("dialog")
      .or(page.getByRole("alertdialog"))
      .last()
      .focus();
    for (let i = 0; i < 18; i++) {
      await page.keyboard.press("Tab");
      assert.ok(
        await page.evaluate(
          () =>
            !!document.activeElement?.closest(
              '[data-window-dialog="screen"],.v-window-controls,.v-positioner',
            ),
        ),
        `${id}: focus escaped`,
      );
    }
    await page.evaluate(() => {
      const probe = document.createElement("output");
      probe.hidden = true;
      probe.id = "dialog-shortcut-probe";
      probe.dataset.count = "0";
      const listener = (event: KeyboardEvent) => {
        if (event.ctrlKey && ["l", "s", "k"].includes(event.key.toLowerCase()))
          probe.dataset.count = String(Number(probe.dataset.count) + 1);
      };
      window.addEventListener("keydown", listener);
      probe.addEventListener("cleanup", () =>
        window.removeEventListener("keydown", listener),
      );
      document.body.append(probe);
    });
    await page.keyboard.press("Control+l");
    await page.keyboard.press("Control+s");
    if (!(await page.locator("[data-command-palette]").count()))
      await page.keyboard.press("Control+k");
    const escaped = await page.evaluate(() => {
      const probe = document.getElementById("dialog-shortcut-probe");
      const count = Number(probe?.dataset.count);
      probe?.dispatchEvent(new Event("cleanup"));
      probe?.remove();
      return count;
    });
    assert.equal(escaped, 0, `${id}: a global shortcut reached the background`);
  }
  if (trigger) {
    await page
      .getByRole("dialog")
      .or(page.getByRole("alertdialog"))
      .last()
      .focus()
      .catch(() => {});
    await page.keyboard.press("Escape");
    await until(
      async () =>
        page
          .getByRole("dialog")
          .or(page.getByRole("alertdialog"))
          .count()
          .then((count) => count === 0),
      5000,
      `${id}: Escape closes`,
    );
    await until(
      async () => trigger.evaluate((node) => node === document.activeElement),
      5000,
      `${id}: focus returns to origin`,
    );
  }
  const root = process.env.VANTARE_DIALOG_AUDIT_ROOT;
  assert.ok(root);
  const scheme = await page.evaluate(
    () => document.documentElement.dataset.scheme,
  );
  await writeFile(
    join(root, "after", `${id}-${scheme}.checks.json`),
    JSON.stringify(
      {
        ...result,
        captionFocus: true,
        ...(blocking ? { tabCycle: true, launchSaveSearchBlocked: true } : {}),
        ...(trigger ? { escapeCloses: true, focusReturns: true } : {}),
      },
      null,
      2,
    ),
  );
}
async function launcher(page: Page) {
  await launcherScenes["launcher-base"].prepare(page);
}
const scenes: Record<string, VisualScene> = {};
for (const action of ["Eliminar", "Duplicar"]) {
  const id = action === "Eliminar" ? "launcher-remove" : "launcher-duplicate";
  scenes[`dialog-topbar-${id}`] = {
    mock: "launcher-base",
    async prepare(page) {
      await launcher(page);
      await page
        .locator(".v-launcher-profile")
        .first()
        .click({ button: "right" });
      await page.getByRole("menuitem", { name: action, exact: true }).click();
      await page.getByRole("dialog").waitFor();
    },
    async cleanup(page) {
      await check(page, id, page.locator(".v-launcher-profile").first());
      await page.keyboard.press("Escape");
    },
  };
}
scenes["dialog-topbar-launcher-discard"] = {
  mock: "launcher-ready",
  async prepare(page) {
    await launcher(page);
    await page
      .getByRole("button", { name: "Editar perfil", exact: true })
      .click();
    await page
      .getByRole("textbox", { name: "Nombre", exact: true })
      .fill("Perfil QA sin guardar");
    await page.keyboard.press("Escape");
    await page.getByRole("alertdialog").waitFor();
  },
  async cleanup(page) {
    await check(
      page,
      "launcher-discard",
      page.getByRole("textbox", { name: "Nombre", exact: true }),
    );
  },
};
scenes["dialog-topbar-app-remove"] = {
  mock: "launcher-borrar-app",
  async prepare(page) {
    await launcher(page);
    await page.getByRole("tab", { name: "Aplicaciones", exact: true }).click();
    await page
      .getByRole("button", { name: /^Eliminar / })
      .first()
      .click();
    await page.getByRole("dialog").waitFor();
  },
  async cleanup(page) {
    await check(
      page,
      "app-remove",
      page.getByRole("button", { name: /^Eliminar / }).first(),
    );
  },
};
scenes["dialog-topbar-studio-remove"] = {
  mock: "studio-base",
  async prepare(page) {
    await studioScenes["studio-base"].prepare(page);
    await page.getByRole("button", { name: "Delta", exact: true }).focus();
    await page.keyboard.press("Delete");
    await page
      .getByRole("dialog", { name: "Eliminar widget", exact: true })
      .waitFor();
  },
  async cleanup(page) {
    await check(
      page,
      "studio-remove",
      page.getByRole("button", { name: "Delta", exact: true }),
    );
  },
};
scenes["dialog-topbar-account-reset"] = {
  mock: "cuenta-sesion",
  async prepare(page) {
    await page.getByRole("button", { name: "Cuenta", exact: true }).click();
    await page
      .getByRole("button", { name: "Restablecer dispositivo", exact: true })
      .click();
    await page.getByRole("alertdialog").waitFor();
  },
  async cleanup(page) {
    await check(
      page,
      "account-reset",
      page.getByRole("button", {
        name: "Restablecer dispositivo",
        exact: true,
      }),
    );
  },
};
scenes["dialog-topbar-commands"] = {
  mock: "ajustes-con-diseno",
  async prepare(page) {
    await page.locator('.v-search input[type="search"]').focus();
    await page.keyboard.press("Control+k");
    await page.getByRole("dialog").waitFor();
  },
  async cleanup(page) {
    if (process.env.VANTARE_DIALOG_AUDIT_PHASE === "after")
      await checkNativeAccessLayer(page);
    await check(
      page,
      "commands",
      page.locator('.v-search input[type="search"]'),
    );
  },
};
for (const [kind, button, section] of [
  ["app-arguments", "Restablecer argumentos", "Launcher"],
  ["profile-arguments", "Confirmar argumentos", "Launcher"],
  ["report-discard", "Confirmar borrador", "Testing Center"],
  ["report-close", "Confirmar borrador", "Testing Center"],
  ["alert", "Abrir confirmación", "Ajustes"],
] as const) {
  const id = `dialog-topbar-${kind}`;
  scenes[id] = {
    mock: "ajustes-con-diseno",
    async prepare(page) {
      const url = new URL(page.url());
      url.searchParams.set("dialog-fixture", kind);
      await page.goto(url.href);
      if (section !== "Ajustes")
        await page
          .getByRole("navigation", { name: "Navegación principal" })
          .getByRole("button", { name: section, exact: true })
          .click();
      await page.getByRole("button", { name: button, exact: true }).click();
      await page.getByRole("alertdialog").waitFor();
    },
    async cleanup(page) {
      await check(
        page,
        kind,
        page.getByRole("button", { name: button, exact: true }),
      );
    },
  };
}
scenes["dialog-topbar-notifications"] = {
  mock: "notificaciones-base",
  async prepare(page) {
    await page
      .getByRole("button", { name: "Notificaciones", exact: true })
      .click();
    await page.locator(".v-notifications--compact").waitFor();
  },
  async cleanup(page) {
    if (process.env.VANTARE_DIALOG_AUDIT_PHASE === "after") {
      await page
        .getByRole("dialog", { name: "Notificaciones", exact: true })
        .focus();
      await page.keyboard.press("Escape");
      const bell = page.getByRole("button", {
        name: "Notificaciones",
        exact: true,
      });
      await until(
        async () => bell.evaluate((node) => node === document.activeElement),
        5000,
        "notification focus returns",
      );
      await bell.click();
      await page.locator(".v-notifications--compact").waitFor();
    }
    await check(page, "notifications", undefined, false);
  },
};
for (const id of ["privacidad-pendiente", "privacidad-uso"]) {
  const base = privacyScenes[id];
  scenes[`dialog-topbar-${id}`] = {
    ...base,
    async cleanup(page) {
      await check(page, id, undefined, false);
    },
  };
}
scenes["dialog-topbar-settings-select"] = {
  mock: "ajustes-con-diseno",
  async prepare(page) {
    await page.getByRole("tab", { name: "Apariencia", exact: true }).click();
    await page.getByRole("combobox").first().click();
    await page.getByRole("listbox").waitFor();
  },
  async cleanup(page) {
    if (process.env.VANTARE_DIALOG_AUDIT_PHASE === "after") {
      await page.keyboard.press("Escape");
      const trigger = page.getByRole("combobox").first();
      await until(
        async () => trigger.evaluate((node) => node === document.activeElement),
        5000,
        "select focus returns",
      );
      await page.getByRole("listbox").waitFor({ state: "hidden" });
      await trigger.click();
      await page.getByRole("listbox").waitFor();
    }
    await check(page, "settings-select", undefined, false);
  },
};
scenes["dialog-topbar-resident"] = {
  mock: "launcher-decision",
  async prepare(page) {
    await launcherScenes["launcher-decision"].prepare(page);
  },
  async cleanup(page) {
    await check(page, "resident", undefined, false);
  },
};
export const dialogTopbarScenes = scenes;
scenes["dialog-topbar-context-menu"] = {
  mock: "launcher-base",
  async prepare(page) {
    await launcher(page);
    await page.locator(".v-launcher-profile").first().focus();
    await page.keyboard.press("Shift+F10");
    await page.getByRole("menu").waitFor();
  },
  async cleanup(page) {
    await record(page, "context-menu");
    if (process.env.VANTARE_DIALOG_AUDIT_PHASE !== "after") return;
    await checkProfileContextKeys(page);
    await page.keyboard.press("Shift+F10");
    await page.getByRole("menu").waitFor();
    const card = page.locator(".v-launcher-profile").first();
    const items = page.getByRole("menuitem");
    await items.first().focus();
    await page.keyboard.press("End");
    assert.ok(
      await items.last().evaluate((node) => node === document.activeElement),
    );
    await page.keyboard.press("Home");
    assert.ok(
      await items.first().evaluate((node) => node === document.activeElement),
    );
    await page.keyboard.press("ArrowDown");
    assert.ok(
      await items.nth(1).evaluate((node) => node === document.activeElement),
    );
    await page.keyboard.press("Escape");
    await page.getByRole("menu").waitFor({ state: "hidden" });
    await until(
      async () => card.evaluate((node) => node === document.activeElement),
      5000,
      "context menu returns focus",
    );
    await page.keyboard.press("Shift+F10");
    await page.getByRole("menu").waitFor();
    await check(page, "context-menu", undefined, false);
  },
};
scenes["dialog-topbar-access"] = {
  ...accessScenes["acceso-base"],
  async cleanup(page) {
    await check(page, "access", undefined, false);
  },
};
scenes["dialog-topbar-onboarding"] = {
  ...onboardingScenes["onboarding-0"],
  async cleanup(page) {
    await check(page, "onboarding", undefined, false);
  },
};
scenes["dialog-topbar-resident-covered"] = {
  mock: "launcher-decision",
  async prepare(page) {
    await launcherScenes["launcher-decision"].prepare(page);
    await page.keyboard.press("Control+k");
    await page.locator('[data-window-dialog="screen"]').waitFor();
  },
  async cleanup(page) {
    if (process.env.VANTARE_DIALOG_AUDIT_PHASE === "after")
      assert.ok(
        await page
          .locator('[data-window-dialog="notice"]')
          .evaluate((node) => node.hasAttribute("inert")),
      );
    await check(page, "resident-covered");
    await page.keyboard.press("Control+k");
    if (process.env.VANTARE_DIALOG_AUDIT_PHASE === "after") {
      await page
        .locator('[data-window-dialog="screen"]')
        .waitFor({ state: "hidden" });
      assert.ok(
        await page
          .locator('[data-window-dialog="notice"]')
          .evaluate((node) => !node.hasAttribute("inert")),
      );
    }
  },
};
scenes["dialog-topbar-toast-covered"] = {
  mock: "launcher-base",
  async prepare(page) {
    await launcher(page);
    // Only the local mock is running: this produces its acknowledgement toast,
    // never a real launcher request or process.
    await page.keyboard.press("Control+l");
    await page.locator(".v-toast").waitFor();
    await page.keyboard.press("Control+k");
    await page.locator('[data-window-dialog="screen"]').waitFor();
  },
  async cleanup(page) {
    if (process.env.VANTARE_DIALOG_AUDIT_PHASE === "after") {
      if (process.env.VANTARE_VERIFY_SPANISH_ALTGR === "1") {
        const { checkSpanishAltGr } = await import("../check-spanish-altgr.ts");
        await checkSpanishAltGr(page);
      }
      const close = page.locator(".v-toast button").first();
      await close.focus();
      assert.ok(
        await close.evaluate(
          (node) => node === document.activeElement && !node.closest("[inert]"),
        ),
      );
      await close.click();
      await page.locator(".v-toast").waitFor({ state: "hidden" });
    }
    await check(page, "toast-covered");
    await page.keyboard.press("Control+k");
    if (process.env.VANTARE_DIALOG_AUDIT_PHASE === "after") {
      await page
        .locator('[data-window-dialog="screen"]')
        .waitFor({ state: "hidden" });
      await checkProfileContextKeys(page);
      await openProfileRemovalWithKeyboard(page);
      await page.keyboard.press("Escape");
    }
  },
};
