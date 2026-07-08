import type { ReactNode } from "react";
import { UpdateBanner } from "./UpdateBanner";
import { Topbar } from "./Topbar";
import { ScrollableMain } from "./ScrollableMain";
import { LauncherDock } from "./LauncherDock";
import { type Section } from "../navigation";

type SourceStatus = {
  kind: string;
  name: string;
  live: boolean;
  available: boolean;
};

type V52ShellProps = {
  activeSection: Section;
  onNavigate: (section: string) => void;
  version?: string | null;
  sourceStatus?: SourceStatus | null;
  children: ReactNode;
};

export function V52Shell({
  activeSection,
  onNavigate,
  version,
  sourceStatus,
  children,
}: V52ShellProps) {
  return (
    <div className="h-screen v52-shell-bg relative flex flex-col">
      <div className="v52-grain" />
      <div className="v52-vignette" />
      <Topbar
        activeSection={activeSection}
        onNavigate={onNavigate}
        version={version}
        sourceStatus={sourceStatus}
      />
      <UpdateBanner />
      <LauncherDock onNavigate={onNavigate} />
      <ScrollableMain className="relative z-20 flex-1 pt-0">
        <div className="max-w-[1920px] mx-auto px-4 sm:px-6 pt-6 pb-6 lg:pl-[84px] flex flex-col h-full overflow-x-hidden">
          <main className="flex flex-col gap-5 min-w-0 flex-1 min-h-0">{children}</main>
        </div>
      </ScrollableMain>
    </div>
  );
}
