import type { ComponentType } from "react";
import type { WidgetAppearance } from "../../lib/profile";
import type { WidgetType } from "../../lib/widget-factory";
import type { DesignSystemTokens } from "../../overlay/widgets/widget-design-system";

/**
 * Props passed to any widget component (Header, Row, Footer) that a design
 * system provides. The `data` is widget-specific (e.g. a row object for the
 * Standings Row component). The `appearance` is the resolved `WidgetAppearance`
 * for the current widget (caller is responsible for calling resolveWidgetAppearance
 * before rendering).
 */
export type WidgetComponentProps<TData> = {
  data: TData;
  appearance: Required<WidgetAppearance>;
  className?: string;
};

/** A React component that renders a part of a widget (Header, Row, Footer). */
export type WidgetComponent<TData> = ComponentType<WidgetComponentProps<TData>>;

/**
 * The 3 parts a design system can contribute per widget type. All 3 are
 * optional: a system may provide only Header, only Row, etc. When a part is
 * missing, the widget's default implementation is used.
 */
export type WidgetComponents = {
  Header?: WidgetComponent<unknown>;
  Row?: WidgetComponent<unknown>;
  Footer?: WidgetComponent<unknown>;
};

/**
 * A design system bundles everything needed to render a widget under a given
 * visual identity: structural tokens, per-type color defaults, and optional
 * JSX components. Registered via `registerDesignSystem()` and looked up via
 * `lookupDesignSystem(id)`.
 */
export type DesignSystem = {
  /** Unique identifier. Used as `themeId` in `WidgetVariantConfig`. */
  id: string;
  /** Human-readable name shown in the gallery. */
  name: string;
  /** Short description shown in the gallery tooltip. */
  description?: string;
  /** Structural tokens (chrome, typography, radii, glow). */
  tokens: DesignSystemTokens;
  /** Per-widget-type color defaults. Missing types fall back to hardcoded defaults. */
  perWidgetAppearance: Partial<Record<WidgetType, WidgetAppearance>>;
  /** Optional JSX components. Missing types/parts fall back to widget defaults. */
  components: Partial<Record<WidgetType, WidgetComponents>>;
  /** Official designs contributed by this system. Filled in B4. */
  officialDesigns?: unknown[];
};
