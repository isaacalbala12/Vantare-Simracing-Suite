import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useI18n } from "../../i18n/I18nProvider";
import {
  Button,
  Fader,
  Icon,
  Seg,
  Select,
  SubtleStatus,
  Surface,
  Toggle,
  useToast,
} from "../../ui/orbit";
import type {
  EngineerNotification,
  EngineerOutputMode,
  EngineerStatus,
} from "../../engineer/engineer-types";
import { useOrbitSimStatus } from "../orbit/sim-status-context";
import { formatMessage } from "../orbit/format-message";
import {
  systemVoiceRuntime,
  wailsEngineerBridge,
  type EngineerBridge,
  type EngineerVoice,
  type VoiceRuntime,
} from "./engineer-orbit-bridge";
import {
  clockOf,
  ENGINEER_CATEGORIES,
  ENGINEER_OUTPUT_MODES,
  mergeMessages,
  modeOf,
  normalizeSensitivity,
  outputBadge,
  OUTPUT_MODE_LABEL_KEY,
  radioFeed,
  readVoicePrefs,
  writeVoicePrefs,
  SENSITIVITIES,
  type EngineerSensitivity,
  type RadioFilter,
} from "./engineer-orbit-model";
import "../../styles/orbit-engineer.css";

/** Estado de partida: el del servicio antes de que conteste `engineer:status`. */
const INITIAL_STATUS: EngineerStatus = {
  enabled: false,
  connected: false,
  source: "telemetry-core",
  presentationLifecycle: 0,
  spotterEnabled: false,
  spotterAvailability: { state: "disabled" },
  sensitivity: "normal",
  ttsCacheCount: 0,
  recentMessages: [],
  outputModes: {},
  subtitlesEnabled: false,
};

/** Los cuatro módulos de la fila superior (`06 § Ingeniero`). */
type ModuleId = "engineer" | "spotter" | "subtitles" | "liveStrategy";

function SpotterGlyph() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      focusable="false"
      height={20}
      stroke="currentColor"
      strokeLinecap="round"
      strokeWidth={1.6}
      viewBox="0 0 18 18"
      width={20}
    >
      <path d="M3 9h3M12 9h3M9 3v3M9 12v3" />
      <circle cx="9" cy="9" r="2.4" />
      <circle cx="9" cy="9" r="6" strokeDasharray="2 3" />
    </svg>
  );
}

function SubtitlesGlyph() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      focusable="false"
      height={20}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.6}
      viewBox="0 0 18 18"
      width={20}
    >
      <rect height="10" rx="2" width="13" x="2.5" y="4" />
      <path d="M5.5 8h7M5.5 10.5h4" />
    </svg>
  );
}

function SpeakerGlyph() {
  return (
    <svg
      aria-hidden="true"
      className="orbit-engineer__btn-ico"
      fill="none"
      focusable="false"
      height={14}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.5}
      viewBox="0 0 16 16"
      width={14}
    >
      <path d="M2.5 6v4h3l3.5 3V3L5.5 6z" />
      <path d="M11 5.5a3.5 3.5 0 0 1 0 5M12.8 3.5a6 6 0 0 1 0 9" />
    </svg>
  );
}

export interface EngineerOrbitPageProps {
  /** Configuración real del Ingeniero; contra Wails si no se inyecta. */
  bridge?: EngineerBridge;
  /** Motor de voz del sistema; se sustituye en tests y harness. */
  voices?: VoiceRuntime;
}

/**
 * Ingeniero de Command Orbit (`15-briefings/08-ingeniero.md`).
 *
 * Los módulos, la sensibilidad y las salidas por categoría escriben en la
 * misma configuración que `hub/pages/EngineerPage.tsx` (eventos
 * `engineer:*:set`); el feed son los mensajes reales del runtime. La voz y el
 * volumen no existen en `EngineerStatus`, así que son preferencia local del
 * reproductor de «Probar voz» y así se dice (`00-decisiones.md · D-68`).
 */
export function EngineerOrbitPage({ bridge, voices }: EngineerOrbitPageProps) {
  const { t } = useI18n();
  const toast = useToast();
  const sim = useOrbitSimStatus();
  const api = useMemo(() => bridge ?? wailsEngineerBridge, [bridge]);
  const voiceRuntime = useMemo(() => voices ?? systemVoiceRuntime, [voices]);

  const [status, setStatus] = useState<EngineerStatus>(INITIAL_STATUS);
  const [messages, setMessages] = useState<EngineerNotification[]>([]);
  const [filter, setFilter] = useState<RadioFilter>("all");
  const [voiceList, setVoiceList] = useState<EngineerVoice[]>(() => voiceRuntime.list());
  const [prefs, setPrefs] = useState(readVoicePrefs);

  useEffect(
    () =>
      api.subscribe(
        (next) => {
          setStatus(next);
          if (Array.isArray(next.recentMessages)) {
            setMessages((current) => mergeMessages(current, next.recentMessages));
          }
        },
        (notification) => setMessages((current) => mergeMessages(current, [notification])),
      ),
    [api],
  );

  // El motor del sistema publica el catálogo tarde (`voiceschanged`): la lista
  // arranca con lo que ya haya y se rehace cuando el motor avisa.
  useEffect(
    () => voiceRuntime.onChange(() => setVoiceList(voiceRuntime.list())),
    [voiceRuntime],
  );

  const savePrefs = useCallback((patch: Partial<typeof prefs>) => {
    setPrefs((current) => {
      const next = { ...current, ...patch };
      writeVoicePrefs(next);
      return next;
    });
  }, []);

  const voiceId = prefs.voiceId || voiceList[0]?.id || "";

  const testVoice = useCallback(() => {
    const spoke = voiceRuntime.speak(t("engineer.voice.sample"), {
      voiceId,
      volume: prefs.volume,
    });
    toast.show(
      t("engineer.testVoice"),
      spoke
        ? formatMessage(t("engineer.voice.playing"), {
            voice: voiceList.find((item) => item.id === voiceId)?.label ?? t("engineer.voice.default"),
            volume: Math.round(prefs.volume * 100),
          })
        : t("engineer.voice.noEngine"),
    );
  }, [prefs.volume, t, toast, voiceId, voiceList, voiceRuntime]);

  const modules: {
    id: ModuleId;
    on: boolean;
    glyph: ReactNode;
    disabled?: boolean;
    soon?: boolean;
    onChange?: (value: boolean) => void;
  }[] = [
    {
      id: "engineer",
      on: status.enabled,
      glyph: <Icon name="i-ingeniero" size={20} strokeWidth={1.6} />,
      onChange: (value) => api.setEnabled(value),
    },
    {
      id: "spotter",
      on: status.spotterEnabled,
      glyph: <SpotterGlyph />,
      onChange: (value) => api.setSpotterEnabled(value),
    },
    {
      id: "subtitles",
      on: status.subtitlesEnabled,
      glyph: <SubtitlesGlyph />,
      onChange: (value) => api.setSubtitlesEnabled(value),
    },
    {
      id: "liveStrategy",
      on: false,
      glyph: <Icon name="i-estrategia" size={20} strokeWidth={1.6} />,
      disabled: true,
      soon: true,
    },
  ];

  const feed = useMemo(() => radioFeed(messages, filter), [filter, messages]);
  const sensitivity = normalizeSensitivity(status.sensitivity);
  const simTone = sim === "connected" ? "ok" : sim === "searching" ? "attn" : "neutral";
  const simLabel =
    sim === "connected"
      ? t("engineer.source.live")
      : sim === "searching"
        ? t("engineer.source.searching")
        : t("engineer.source.offline");
  const spotterUnavailable =
    status.enabled &&
    status.spotterEnabled &&
    status.spotterAvailability?.state === "unavailable";
  const spotterUnavailableReason = status.spotterAvailability?.reason ?? "spatial";

  return (
    <div className="orbit-engineer" data-testid="orbit-engineer">
      <header className="orbit-engineer__head">
        <div className="orbit-engineer__head-copy">
          <span className="orbit-eyebrow">{t("engineer.eyebrow")}</span>
          <h2>{t("engineer.title")}</h2>
          <p>{t("engineer.lead")}</p>
        </div>
        <div className="orbit-engineer__actions">
          <Button data-testid="orbit-engineer-test-voice" onClick={testVoice} variant="ghost">
            <SpeakerGlyph />
            {t("engineer.testVoice")}
          </Button>
          <span data-testid="orbit-engineer-source">
            <SubtleStatus tone={simTone}>{simLabel}</SubtleStatus>
          </span>
        </div>
      </header>

      <div className="orbit-engineer__modules" data-testid="orbit-engineer-modules">
        {modules.map((module) => (
          <article
            className="orbit-eng-mod"
            data-on={module.on ? "true" : "false"}
            data-testid={`orbit-eng-mod-${module.id}`}
            key={module.id}
          >
            <span className="orbit-eng-mod__ico" data-testid={`orbit-eng-ico-${module.id}`}>
              {module.glyph}
            </span>
            <span className="orbit-eng-mod__copy">
              <b>{t(`engineer.modules.${module.id}`)}</b>
              <span>
                {t(`engineer.modules.${module.id}Hint`)}
                {module.soon ? <em> {t("engineer.modules.soon")}</em> : null}
              </span>
            </span>
            <Toggle
              className="orbit-eng-mod__toggle"
              disabled={module.disabled}
              label={t(`engineer.modules.${module.id}`)}
              onChange={(value) => module.onChange?.(value)}
              pressed={module.on}
            />
          </article>
        ))}
      </div>

      {spotterUnavailable ? (
        <div
          className="orbit-engineer__spotter-notice"
          data-testid="orbit-engineer-spotter-unavailable"
          role="status"
        >
          <span className="orbit-engineer__spotter-notice-icon"><SpotterGlyph /></span>
          <span>
            <b>{t("engineer.spotterUnavailable.title")}</b>
            <span>{t(`engineer.spotterUnavailable.${spotterUnavailableReason}`)}</span>
          </span>
        </div>
      ) : null}

      <div className="orbit-engineer__grid">
        <div className="orbit-engineer__left">
          <Surface
            aria-label={t("engineer.voice.title")}
            meta={
              voiceList.length
                ? formatMessage(t("engineer.voice.meta"), { n: voiceList.length })
                : t("engineer.voice.noneMeta")
            }
            title={t("engineer.voice.title")}
          >
            <div className="orbit-eng-settings">
              <div className="orbit-eng-row">
                <span className="orbit-eng-row__copy">
                  <b>{t("engineer.voice.voice")}</b>
                  <span>{t("engineer.voice.voiceHint")}</span>
                </span>
                {voiceList.length ? (
                  <Select
                    label={t("engineer.voice.voice")}
                    onChange={(value) => savePrefs({ voiceId: value })}
                    options={voiceList.map((voice) => ({ value: voice.id, label: voice.label }))}
                    value={voiceId}
                  />
                ) : (
                  <span className="orbit-eng-row__none">{t("engineer.voice.none")}</span>
                )}
              </div>

              <div className="orbit-eng-row">
                <span className="orbit-eng-row__copy">
                  <b>{t("engineer.voice.volume")}</b>
                  <span>{t("engineer.voice.volumeHint")}</span>
                </span>
                <span className="orbit-eng-volume">
                  <Fader value={prefs.volume} />
                  <input
                    aria-label={t("engineer.voice.volume")}
                    className="orbit-eng-volume__input"
                    data-testid="orbit-engineer-volume"
                    max={100}
                    min={0}
                    onChange={(event) =>
                      savePrefs({ volume: Number(event.currentTarget.value) / 100 })
                    }
                    step={1}
                    type="range"
                    value={Math.round(prefs.volume * 100)}
                  />
                </span>
              </div>

              <div className="orbit-eng-row">
                <span className="orbit-eng-row__copy">
                  <b>{t("engineer.voice.duck")}</b>
                  <span>{t("engineer.voice.duckHint")}</span>
                </span>
                {/* Sin control de volumen del juego no hay atenuación real:
                    el interruptor queda deshabilitado con el motivo a la vista
                    en vez de fingir un ajuste (auditoría D-94). */}
                <Toggle
                  disabled
                  label={t("engineer.voice.duck")}
                  onChange={() => undefined}
                  pressed={false}
                  title={t("engineer.voice.duckSoon")}
                />
              </div>

              <div className="orbit-eng-row">
                <span className="orbit-eng-row__copy">
                  <b>{t("engineer.voice.sensitivity")}</b>
                  <span>{t("engineer.voice.sensitivityHint")}</span>
                </span>
                <Seg<EngineerSensitivity>
                  label={t("engineer.voice.sensitivity")}
                  onChange={(value) => api.setSensitivity(value)}
                  options={SENSITIVITIES.map((value) => ({
                    value,
                    label: t(`engineer.voice.${value}`),
                  }))}
                  value={sensitivity}
                />
              </div>
            </div>
          </Surface>

          <Surface
            aria-label={t("engineer.outputs.title")}
            className="orbit-engineer__outputs"
            fill
            meta={t("engineer.outputs.meta")}
            title={t("engineer.outputs.title")}
          >
            <div className="orbit-eng-outputs" data-testid="orbit-engineer-outputs">
              {ENGINEER_CATEGORIES.map((category) => (
                <div
                  className="orbit-eng-out"
                  data-testid={`orbit-engineer-output-${category.id}`}
                  key={category.id}
                >
                  <span className="orbit-eng-out__k">
                    <i aria-hidden="true" style={{ background: category.color }} />
                    {t(category.labelKey)}
                  </span>
                  <Seg<EngineerOutputMode>
                    className="orbit-eng-out__seg"
                    label={t(category.labelKey)}
                    onChange={(mode) => api.setOutputMode(category.id, mode)}
                    options={ENGINEER_OUTPUT_MODES.map((mode) => ({
                      value: mode,
                      label: t(OUTPUT_MODE_LABEL_KEY[mode]),
                      title: t(`engineer.outputs.${mode}Hint`),
                    }))}
                    value={modeOf(status.outputModes, category.id)}
                  />
                </div>
              ))}
            </div>
          </Surface>
        </div>

        <Surface
          actions={
            <Seg<RadioFilter>
              label={t("engineer.radio.filter")}
              onChange={setFilter}
              options={[
                { value: "all", label: t("engineer.radio.all") },
                { value: "spotter", label: t("engineer.radio.spotter") },
                { value: "engineer", label: t("engineer.radio.engineer") },
              ]}
              value={filter}
            />
          }
          aria-label={t("engineer.radio.title")}
          className="orbit-engineer__radio"
          fill
          meta={
            status.connected
              ? formatMessage(t("engineer.radio.session"), { source: status.source })
              : t("engineer.radio.noSession")
          }
          title={t("engineer.radio.title")}
        >
          <ol className="orbit-eng-feed" data-testid="orbit-engineer-feed">
            {feed.map((message) => (
              <li
                className="orbit-rf"
                data-role={message.role}
                data-testid={`orbit-rf-${message.id}`}
                data-warn={message.severity === "warning" ? "true" : undefined}
                key={message.id}
              >
                <span className="orbit-rf__t">{clockOf(message.createdAt)}</span>
                <span aria-hidden="true" className="orbit-rf__ico">
                  {message.role === "spotter" ? t("engineer.radio.iniS") : t("engineer.radio.iniI")}
                </span>
                <span className="orbit-rf__copy">
                  <b>{message.text}</b>
                  <span>
                    {formatMessage(t("engineer.radio.detail"), {
                      category: message.category,
                      key: message.textKey,
                    })}
                  </span>
                </span>
                <span className="orbit-rf__out">
                  {outputBadge(modeOf(status.outputModes, message.category))}
                </span>
              </li>
            ))}
          </ol>
          {feed.length === 0 ? (
            <p className="orbit-eng-feed__empty" data-testid="orbit-engineer-feed-empty">
              {t("engineer.radio.empty")}
            </p>
          ) : null}
          <div className="orbit-eng-feed__foot">
            <span className="orbit-eng-feed__meta">{t("engineer.radio.source")}</span>
            <Button
              data-testid="orbit-engineer-export"
              onClick={() => toast.show(t("engineer.radio.export"), t("engineer.radio.exportSoon"))}
              size="sm"
              variant="ghost"
            >
              {t("engineer.radio.export")}
            </Button>
          </div>
        </Surface>
      </div>
    </div>
  );
}
