import { useI18n } from "./I18nProvider";
import type { Locale } from "./i18n";

export function LanguageSelector() {
  const { locale, setLocale, t, options } = useI18n();
  const selectId = "vantare-language-select";

  return (
    <div className="flex items-center gap-2">
      <label
        htmlFor={selectId}
        className="text-[10px] font-bold uppercase tracking-[.08em] text-vantare-textDim"
      >
        {t("language.selector.label")}
      </label>
      <select
        id={selectId}
        data-testid="language-selector"
        value={locale}
        onChange={(e) => setLocale(e.target.value as Locale)}
        className="cursor-pointer rounded-md border border-white/10 bg-black/40 px-2 py-1 text-[10px] font-semibold text-white"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
