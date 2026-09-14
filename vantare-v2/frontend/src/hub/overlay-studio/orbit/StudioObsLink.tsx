import { useState } from "react";
import { useI18n } from "../../../i18n/I18nProvider";
import { formatMessage } from "../../orbit/format-message";
import { Button, Input } from "../../../ui/orbit";
import { buildObsOverlayUrl, DEFAULT_OBS_BASE_URL } from "./obs-url";

export type StudioObsLinkProps = {
  /** Origen del servidor de overlays; useObsBaseUrl lo resuelve arriba. */
  baseUrl?: string;
  /** Fichero del perfil abierto en el editor (p. ej. mi-perfil.json). */
  profileFile?: string;
};

/** Copia al portapapeles; el clipboard API puede faltar segun el contexto. */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.style.cssText = "position:fixed;opacity:0;pointer-events:none";
    document.body.appendChild(area);
    area.select();
    try {
      return document.execCommand("copy");
    } catch {
      return false;
    } finally {
      area.remove();
    }
  }
}

/**
 * Pie del dock de ajustes del Studio: la URL local del Browser Source para el
 * perfil abierto, lista para copiar en OBS. Vive siempre bajo el inspector —
 * no depende de que haya un widget seleccionado.
 */
export function StudioObsLink({ baseUrl, profileFile }: StudioObsLinkProps): React.ReactElement {
  const { t } = useI18n();
  const url = buildObsOverlayUrl(baseUrl ?? DEFAULT_OBS_BASE_URL, profileFile);
  const instructions = formatMessage(t("studio.obs.instructions"), { url });
  const [copied, setCopied] = useState<"url" | "instructions" | null>(null);

  const copy = async (kind: "url" | "instructions", text: string) => {
    if (!(await copyText(text))) {
      return;
    }
    setCopied(kind);
    window.setTimeout(() => setCopied((current) => (current === kind ? null : current)), 2000);
  };

  return (
    <section
      aria-label={t("studio.obs.title")}
      className="orbit-studio-obs"
      data-testid="orbit-studio-obs"
    >
      <span className="orbit-eyebrow">{t("studio.obs.eyebrow")}</span>
      <p className="orbit-studio-obs__hint">{t("studio.obs.hint")}</p>
      <Input
        aria-label={t("studio.obs.url")}
        className="orbit-studio-obs__url"
        data-testid="orbit-studio-obs-url"
        onFocus={(event) => event.currentTarget.select()}
        readOnly
        value={url}
      />
      <div className="orbit-studio-obs__actions">
        <Button
          data-testid="orbit-studio-obs-copy"
          onClick={() => void copy("url", url)}
          size="sm"
          variant="primary"
        >
          {copied === "url" ? t("studio.obs.copied") : t("studio.obs.copy")}
        </Button>
        <Button
          data-testid="orbit-studio-obs-copy-instructions"
          onClick={() => void copy("instructions", instructions)}
          size="sm"
          variant="ghost"
        >
          {copied === "instructions"
            ? t("studio.obs.copiedInstructions")
            : t("studio.obs.copyInstructions")}
        </Button>
      </div>
    </section>
  );
}
