import type { ReactNode } from "react";
import { UpdateBanner } from "./UpdateBanner";
import { Topbar } from "./Topbar";
import { ScrollableMain } from "./ScrollableMain";
import { LauncherDock } from "./LauncherDock";
import { NAV_ITEMS, type Section } from "../navigation";

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
        <div className="max-w-[1920px] mx-auto px-4 sm:px-6 pt-6 pb-6 lg:pl-[84px]">
          <div className="grid grid-cols-1 xl:grid-cols-[260px_1fr] gap-6">
            <aside className="flex flex-col gap-5">
              <nav className="glass-panel rounded-xl p-3" aria-label="Navegación principal">
                <div className="px-2 py-1.5 mb-1">
                  <span className="v52-eyebrow text-[9px]">Navegación</span>
                </div>
                <div className="flex flex-col gap-0.5">
                  {NAV_ITEMS.map((item) => {
                    const active = item.id === activeSection;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        data-testid={`v52-sidebar-${item.id}`}
                        aria-current={active ? "page" : undefined}
                        onClick={() => onNavigate(item.id)}
                        className={[
                          "group flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-colors",
                          active
                            ? "bg-vantare-red-700/20 border border-vantare-red-500/30 text-white"
                            : "text-vantare-textMuted hover:text-white hover:bg-white/5 border border-transparent",
                        ].join(" ")}
                      >
                        <span className="font-semibold text-sm">{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              </nav>
            </aside>
            <main className="flex flex-col gap-5 min-w-0">{children}</main>
          </div>
        </div>
      </ScrollableMain>
    </div>
  );
}
