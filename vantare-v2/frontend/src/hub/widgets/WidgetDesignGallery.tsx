import type { WidgetConfig } from "../../lib/profile";
import { useI18n } from "../../i18n/I18nProvider";
import {
  listOfficialDesigns,
  type OfficialDesign,
} from "./widget-design-gallery";

type WidgetDesignGalleryProps = {
  widget: WidgetConfig | null;
  onApplyDesign: (design: OfficialDesign) => void;
  applyingDesignId?: string | null;
  activeDesignId?: string | null;
  testId?: string;
};

export function WidgetDesignGallery({
  widget,
  onApplyDesign,
  applyingDesignId = null,
  activeDesignId = null,
  testId = "widget-design-gallery",
}: WidgetDesignGalleryProps) {
  const { t } = useI18n();
  if (!widget) return null;

  const designs = listOfficialDesigns(widget.type);

  return (
    <div
      className="border-t border-white/5 p-2"
      data-testid={testId}
      data-widget-type={widget.type}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="font-mono text-[10px] uppercase tracking-widest text-vantare-textDim">
          {t("studio.officialDesigns")} · {widget.type}
        </span>
        <span className="font-mono text-[10px] text-vantare-textDim/60">
          {designs.length} {t("studio.available")}
        </span>
      </div>

      {designs.length === 0 ? (
        <p
          className="font-mono text-[10px] text-vantare-textDim/60 py-1"
          data-testid="widget-design-empty"
        >
          {t("studio.noOfficialDesigns")}
        </p>
      ) : (
        <ul className="space-y-0.5" data-testid="widget-design-list">
          {designs.map((design) => {
            const isApplying = applyingDesignId === design.id;
            const isActive = activeDesignId === design.id;
            return (
              <li
                key={design.id}
                data-testid={`widget-design-item-${design.id}`}
                data-design-type={design.widgetType}
                data-design-active={isActive ? "true" : "false"}
                className="flex items-center gap-1.5 rounded px-1.5 py-1 hover:bg-white/5"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-mono text-[10px] text-white truncate">
                    {design.name}
                  </p>
                  <p className="font-mono text-[10px] text-vantare-textDim/70 truncate">
                    {design.description}
                  </p>
                </div>
                {isActive ? (
                  <span
                    data-testid={`widget-design-active-${design.id}`}
                    className="font-mono text-[10px] font-bold uppercase tracking-widest text-emerald-400"
                  >
                    {t("studio.active")}
                  </span>
                ) : (
                  <button
                    type="button"
                    data-testid={`widget-design-apply-${design.id}`}
                    onClick={() => onApplyDesign(design)}
                    disabled={isApplying}
                    className="text-emerald-400 hover:text-emerald-300 font-mono text-[10px] cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                    title={t("studio.applyDesign")}
                  >
                    {isApplying ? "..." : t("studio.apply")}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
