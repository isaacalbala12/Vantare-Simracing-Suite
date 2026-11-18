import assert from "node:assert/strict";
import type { Page } from "playwright-core";

/**
 * #2632. The sidebar carries more fixed rows than fit at 1280×720.
 *
 * Rules this pins, in Chromium (jsdom cannot measure):
 * - every navigation entry, «MÓDULOS» (Strategy, Engineer) included, stays
 *   complete: the navigation never gives height away and never scrolls;
 * - «PERFILES» is the only scrollable zone and never paints over the footer;
 * - the «hay más» cue is on exactly while the profile list has something left
 *   to scroll and turns off at the end.
 */
export async function checkSidebarProfiles(page: Page, base: string) {
  const viewport = page.viewportSize();
  try {
    for (const [width, height] of [
      [1440, 900],
      [1280, 800],
      [1280, 720],
    ]) {
      await page.setViewportSize({ width, height });
      await page.goto(`${base}?escena=visual-dark:launcher-base`);
      const sidebar = page.locator(".v-sidebar");
      if (
        (await sidebar.evaluate((node) =>
          node.classList.contains("v-sidebar--collapsed"),
        )) === true
      )
        await page
          .getByRole("button", {
            name: /^(Contraer o ampliar navegación|Contraer barra)$/,
            exact: true,
          })
          .first()
          .click();
      // Profiles only load while the sidebar is expanded; navigate afterwards.
      await page.locator(".v-sidebar-profiles").waitFor({ state: "attached" });
      await page.getByRole("button", { name: /^Launcher(, ?\d+)?$/ }).click();
      await page.locator(".v-launcher-page").waitFor({ state: "attached" });
      await page.evaluate(async () => {
        await document.fonts.ready;
        await new Promise<void>((done) =>
          requestAnimationFrame(() => requestAnimationFrame(() => done())),
        );
      });

      const measure = () =>
        page.evaluate(() => {
          const sidebar = document.querySelector<HTMLElement>(".v-sidebar");
          const footer =
            document.querySelector<HTMLElement>(".v-sidebar-footer");
          const section = document.querySelector<HTMLElement>(
            ".v-sidebar-profiles",
          );
          const list = document.querySelector<HTMLElement>(
            ".v-sidebar-profile-list",
          );
          if (!sidebar || !footer || !section || !list)
            throw new Error("Sidebar profiles missing");
          /** Height of `node` that survives every clipping ancestor. */
          const visibleHeight = (node: HTMLElement) => {
            const rect = node.getBoundingClientRect();
            let top = rect.top;
            let bottom = rect.bottom;
            for (
              let parent = node.parentElement;
              parent && parent !== sidebar;
              parent = parent.parentElement
            ) {
              const style = getComputedStyle(parent);
              if (
                style.overflowY === "visible" &&
                style.overflowX === "visible"
              )
                continue;
              const bounds = parent.getBoundingClientRect();
              top = Math.max(top, bounds.top);
              bottom = Math.min(bottom, bounds.bottom);
            }
            return Math.max(0, bottom - top);
          };
          const box = (node: Element) => {
            const rect = node.getBoundingClientRect();
            return {
              top: Math.round(rect.top * 10) / 10,
              bottom: Math.round(rect.bottom * 10) / 10,
              height: Math.round(rect.height * 10) / 10,
            };
          };
          const scrolls = (node: HTMLElement) => {
            const style = getComputedStyle(node);
            return (
              (style.overflowY === "auto" || style.overflowY === "scroll") &&
              node.scrollHeight > node.clientHeight + 1
            );
          };
          const nav = [
            ...document.querySelectorAll<HTMLElement>(
              ".v-nav-group button[data-nav]",
            ),
          ];
          const rows = [
            ...document.querySelectorAll<HTMLElement>(".v-sidebar-profile"),
          ];
          return {
            sidebar: box(sidebar),
            footer: box(footer),
            section: box(section),
            list: {
              ...box(list),
              clientHeight: list.clientHeight,
              scrollHeight: list.scrollHeight,
              scrollTop: list.scrollTop,
            },
            nav: nav.map((node) => ({
              label: node.textContent?.replace(/\s+/g, " ").trim() ?? "",
              ...box(node),
              visible: Math.round(visibleHeight(node) * 10) / 10,
            })),
            rows: rows.map((node) => ({
              label: node.textContent?.replace(/\s+/g, " ").trim() ?? "",
              ...box(node),
              visible: Math.round(visibleHeight(node) * 10) / 10,
            })),
            scrollers: [...sidebar.querySelectorAll<HTMLElement>("*")]
              .filter(scrolls)
              .map((node) => (node.getAttribute("class") ?? "").slice(0, 40)),
            more: section.dataset.more === "true",
            cue: (() => {
              const style = getComputedStyle(section, "::after");
              return {
                content: style.content,
                display: style.display,
                background: style.backgroundImage,
              };
            })(),
          };
        });

      const at = `${width}×${height}`;
      const first = await measure();
      assert.equal(
        (await page.locator(".v-sidebar-profile").count()) > 0,
        true,
        `Positive control: sidebar profiles must exist at ${at}`,
      );
      assert.ok(
        first.nav.length >= 8,
        `Positive control: the navigation must list every section at ${at}`,
      );
      for (const label of ["Strategy", "Engineer"])
        assert.ok(
          first.nav.some((item) => item.label.startsWith(label)),
          `Positive control: «${label}» must be in the navigation at ${at}`,
        );

      const lastNav = first.nav.at(-1);
      assert.ok(lastNav, `Positive control: navigation entries at ${at}`);
      // (a) Navigation stays complete: no entry clipped, out of the sidebar or
      // under the footer, at any size.
      assert.equal(
        first.section.top >= lastNav.bottom - 0.5,
        true,
        `${at}: «PERFILES» must start below the whole navigation`,
      );
      for (const item of first.nav) {
        assert.equal(
          item.visible,
          item.height,
          `${at}: navigation entry «${item.label}» is clipped (${item.visible} of ${item.height} px)`,
        );
        assert.ok(
          item.top >= first.sidebar.top - 0.5 &&
            item.bottom <= first.sidebar.bottom + 0.5,
          `${at}: navigation entry «${item.label}» leaves the sidebar`,
        );
        assert.ok(
          item.bottom <= first.footer.top + 0.5,
          `${at}: navigation entry «${item.label}» runs into the footer`,
        );
      }

      // (b) Only the profile list scrolls, and it never paints over the footer.
      for (const scroller of first.scrollers)
        assert.ok(
          scroller.includes("v-sidebar-profile-list"),
          `${at}: only the profile list may scroll inside the sidebar, found «${scroller}»`,
        );
      assert.ok(
        first.list.bottom <= first.footer.top + 0.5,
        `${at}: the profile list reaches into the footer (${first.list.bottom} > ${first.footer.top})`,
      );
      const rowHeight = first.rows[0]?.height ?? 0;
      // One whole profile must be visible at rest whenever there is room for it.
      // Below that (1280×720 today, see the sidebar compacting issue) the lane
      // is shorter than a row and no row can be complete.
      const wholeRowsFit = first.list.clientHeight >= rowHeight - 0.5;
      if (wholeRowsFit)
        assert.equal(
          first.rows[0].visible,
          rowHeight,
          `${at}: the first profile must be whole at rest (${first.rows[0].visible} of ${rowHeight} px)`,
        );

      // (c) The «hay más» cue is on exactly while there is more to scroll.
      const overflowing = first.list.scrollHeight > first.list.clientHeight + 1;
      assert.equal(
        first.more,
        overflowing,
        `${at}: the profile cue must match the overflow (${first.more} with ${first.list.scrollHeight}/${first.list.clientHeight})`,
      );
      const cuePainted =
        first.cue.content !== "none" && first.cue.display === "block";
      assert.equal(
        cuePainted,
        overflowing,
        `${at}: the profile cue gradient must be painted only with overflow (${first.cue.display}/${first.cue.content})`,
      );

      if (overflowing) {
        await page.evaluate(() => {
          const list = document.querySelector<HTMLElement>(
            ".v-sidebar-profile-list",
          );
          if (list) list.scrollTop = list.scrollHeight;
        });
        await page.waitForFunction(() => {
          const section = document.querySelector<HTMLElement>(
            ".v-sidebar-profiles",
          );
          return section?.dataset.more !== "true";
        });
        const end = await measure();
        assert.equal(
          end.more,
          false,
          `${at}: the profile cue must disappear once the list ends`,
        );
        assert.equal(
          end.cue.content !== "none" && end.cue.display === "block",
          false,
          `${at}: the cue gradient must disappear once the list ends`,
        );
        if (wholeRowsFit)
          assert.equal(
            end.rows.at(-1)?.visible,
            rowHeight,
            `${at}: the last profile must be whole at the end of the list`,
          );
      }
    }
  } finally {
    if (viewport) await page.setViewportSize(viewport);
  }
}
