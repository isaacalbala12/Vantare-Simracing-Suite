import { useState, type ReactNode } from "react";
import { UpdateBanner } from "./UpdateBanner";
import { Topbar } from "./Topbar";
import { HubSubnavSlotContext } from "./hub-subnav-slot";
import { ScrollableMain } from "./ScrollableMain";
import { LauncherDock } from "./LauncherDock";
import { type Section } from "../navigation";
import type { TelemetrySourceStatus } from "../../telemetry-transport/source-status";
import type { TestingCenterChannel } from "../testing-center/contracts";

type V52ShellProps = {
  activeSection: Section;
  onNavigate: (section: string) => void;
  version?: string | null;
  sourceStatus?: TelemetrySourceStatus | null;
  testingCenterChannel?: TestingCenterChannel | null;
  children: ReactNode;
};

export function V52Shell({
  activeSection,
  onNavigate,
  version,
  sourceStatus,
  testingCenterChannel,
  children,
}: V52ShellProps) {
  const [subnavSlot, setSubnavSlot] = useState<HTMLElement | null>(null);

  return (
    <div className="h-screen v52-shell-bg relative flex flex-col">
      <div className="v52-grain" />
      <div className="v52-vignette" />
      <Topbar
        activeSection={activeSection}
        onNavigate={onNavigate}
        version={version}
        sourceStatus={sourceStatus}
        testingCenterChannel={testingCenterChannel}
      />
      {/* Filled by HubSubnav when the active page has its own navigation, so a
          page's sections sit attached under the global nav instead of floating
          in the middle of the content. Empty otherwise: no slot, no gap. */}
      <div ref={setSubnavSlot} className="relative z-40 shrink-0" />
      <UpdateBanner />
      <LauncherDock onNavigate={onNavigate} />
      <ScrollableMain className="relative z-20 flex-1 pt-0">
        <div className="max-w-[1920px] mx-auto px-4 sm:px-6 pt-6 pb-6 lg:pl-[84px] flex flex-col h-full overflow-x-hidden">
          <main className="flex flex-col gap-5 min-w-0 flex-1 min-h-0">
            <HubSubnavSlotContext.Provider value={subnavSlot}>
              {children}
            </HubSubnavSlotContext.Provider>
          </main>
        </div>
      </ScrollableMain>
    </div>
  );
}
