import type { WidgetComponentProps } from "../design-system";

/**
 * Reference Header for the "Vantare v3" design system. Demonstrates the
 * `WidgetComponentProps` contract: receives `data`, `appearance`, and an
 * optional `className`. Does NOT replace the production Standings Header
 * (B4 wires the registry to the widget). It exists to validate the API
 * and serve as a copy-pasteable template for new system components.
 *
 * The visual style here is intentionally minimal (just a centered time).
 * Real Vantare v3 work happens in B4.
 */
export const VantareV3StandingsHeader: React.FC<
  WidgetComponentProps<{ time?: string }>
> = ({ data, appearance, className }) => {
  return (
    <div
      data-testid="vantare-v3-standings-header"
      className={className}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "8px 12px",
        background: appearance.backgroundColor ?? "#111111",
        borderBottom: `1px solid ${appearance.borderColor}`,
        color: appearance.textColor,
        fontFamily: "Inter, sans-serif",
        fontSize: "14px",
        fontWeight: 600,
      }}
    >
      {data.time ?? "Vantare v3"}
    </div>
  );
};
