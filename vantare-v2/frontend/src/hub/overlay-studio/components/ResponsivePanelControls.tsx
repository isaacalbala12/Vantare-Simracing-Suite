import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

export type StudioLayoutMode = "wide" | "medium" | "compact";
export type StudioDrawerId = "list" | "inspector" | null;

export function resolveStudioLayoutMode(viewportWidth: number): StudioLayoutMode {
  if (viewportWidth >= 1440) {
    return "wide";
  }
  if (viewportWidth >= 960) {
    return "medium";
  }
  return "compact";
}

export type ResponsivePanelControlsProps = {
  viewportWidth: number;
  selectedWidgetId: string | null;
  listPanel: ReactNode;
  canvasPanel: ReactNode;
  inspectorPanel: ReactNode;
  onDrawerChange?(drawer: StudioDrawerId): void;
};

function focusDrawer(container: HTMLElement): void {
  const focusable = container.querySelector<HTMLElement>(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
  );
  if (focusable) {
    focusable.focus();
    return;
  }
  container.tabIndex = -1;
  container.focus();
}

export function ResponsivePanelControls(props: ResponsivePanelControlsProps): React.ReactElement {
  const {
    viewportWidth,
    selectedWidgetId,
    listPanel,
    canvasPanel,
    inspectorPanel,
    onDrawerChange,
  } = props;
  const layoutMode = resolveStudioLayoutMode(viewportWidth);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [openDrawer, setOpenDrawer] = useState<StudioDrawerId>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const listDrawerRef = useRef<HTMLElement | null>(null);
  const inspectorDrawerRef = useRef<HTMLElement | null>(null);

  const setDrawer = useCallback(
    (drawer: StudioDrawerId) => {
      setOpenDrawer(drawer);
      onDrawerChange?.(drawer);
    },
    [onDrawerChange],
  );

  useEffect(() => {
    if (layoutMode !== "compact") {
      setDrawer(null);
      setInspectorOpen(false);
      return;
    }
    if (selectedWidgetId) {
      setDrawer("inspector");
    }
  }, [layoutMode, selectedWidgetId, setDrawer]);

  const rememberFocus = () => {
    restoreFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
  };

  useEffect(() => {
    if (layoutMode !== "compact" || !openDrawer) {
      return;
    }

    const drawerNode = openDrawer === "list" ? listDrawerRef.current : inspectorDrawerRef.current;
    if (drawerNode) {
      focusDrawer(drawerNode);
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      event.preventDefault();
      setDrawer(null);
      restoreFocusRef.current?.focus();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [layoutMode, openDrawer, setDrawer]);

  const openListDrawer = () => {
    if (layoutMode !== "compact") {
      return;
    }
    rememberFocus();
    setDrawer("list");
  };

  const openInspectorDrawer = () => {
    if (layoutMode === "compact") {
      rememberFocus();
      setDrawer("inspector");
      return;
    }
    if (layoutMode === "medium") {
      setInspectorOpen((open) => !open);
    }
  };

  return (
    <main
      data-testid="studio-responsive-grid"
      className="osv3-grid"
      data-layout-mode={layoutMode}
      data-inspector-open={layoutMode === "medium" ? String(inspectorOpen) : undefined}
      data-open-drawer={layoutMode === "compact" ? (openDrawer ?? "none") : undefined}
    >
      {layoutMode === "compact" ? (
        <div className="osv3-compact-toolbar" data-testid="studio-panel-drawer-toggle">
          <button type="button" data-testid="studio-list-drawer-toggle" onClick={openListDrawer}>
            Widgets
          </button>
          <button
            type="button"
            data-testid="studio-inspector-drawer-toggle"
            onClick={openInspectorDrawer}
          >
            Inspector
          </button>
        </div>
      ) : null}
      {layoutMode === "medium" ? (
        <button
          type="button"
          data-testid="studio-inspector-toggle"
          className="osv3-medium-inspector-toggle"
          onClick={openInspectorDrawer}
        >
          Inspector
        </button>
      ) : null}
      <div
        ref={listDrawerRef}
        data-testid="studio-list-drawer"
        className="osv3-list-drawer-host"
      >
        {listPanel}
      </div>
      <section data-testid="studio-canvas-slot" className="osv3-canvas-column">
        {canvasPanel}
      </section>
      <div
        ref={inspectorDrawerRef}
        data-testid="studio-inspector-drawer"
        className="osv3-inspector-drawer-host"
      >
        {inspectorPanel}
      </div>
    </main>
  );
}