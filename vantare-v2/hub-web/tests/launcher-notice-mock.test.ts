import { expect, it, vi } from "vitest";
import launcherFixture from "../fixtures/launcher-base.json";
import type { LauncherView } from "../src/contract/generated/contract";
import { isHostMessage } from "../src/contract/validation";
import type { MockContext } from "../src/mock/context";
import { createLauncherNoticeMock } from "../src/mock/launcher-notice";
import { launcherCompletionFeed } from "../src/shared/launcher-completion";
import {
  notificationCore,
  residentCompletionView,
} from "./helpers/launcher-completion";

it.each(["completed", "accepted", "rejected", "gap"])(
  "QA %s never reports ready from transport acceptance or a receipt",
  (state) => {
    const tasks: (() => void)[] = [];
    const emit = vi.fn();
    const context: MockContext = {
      sceneName: `launcher-notice-${state}`,
      visual: null,
      core: structuredClone(notificationCore),
      launcherData: structuredClone(launcherFixture) as LauncherView,
      notes: [],
      note: () => {},
      emit,
    };
    const view = residentCompletionView();
    createLauncherNoticeMock(context, view, (callback) => tasks.push(callback));
    const feed = launcherCompletionFeed(() => context.core.accountGeneration);
    expect(feed.observe(view)).toEqual([]);
    context.launchForNotice?.("creator");
    expect(emit).not.toHaveBeenCalled();
    tasks.shift()?.();
    expect(feed.observe(view)).toEqual([]);
    tasks.shift()?.();
    expect(feed.observe(view)).toHaveLength(state === "completed" ? 1 : 0);
    expect(feed.observe(view)).toEqual([]);
    for (const [message] of emit.mock.calls)
      expect(isHostMessage(message)).toBe(true);
  },
);
