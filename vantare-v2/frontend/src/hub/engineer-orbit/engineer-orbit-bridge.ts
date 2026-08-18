/**
 * Puente del Ingeniero para Orbit (briefing 08).
 *
 * No inventa contrato: son exactamente los eventos que registra
 * `internal/app/engineer_bridge.go` y que ya usa `hub/pages/EngineerPage.tsx`.
 * La pantalla Orbit lee y escribe la misma configuración real; el puente solo
 * existe para poder inyectar un doble en tests y harnesses.
 */

import { Events } from "@wailsio/runtime";
import type {
  EngineerNotification,
  EngineerOutputMode,
  EngineerStatus,
} from "../../engineer/engineer-types";

export const ENGINEER_STATUS_REQUEST = "engineer:status:get";
export const ENGINEER_STATUS_EVENT = "engineer:status";
export const ENGINEER_NOTIFICATION_EVENT = "engineer:notification";

export interface EngineerBridge {
  /** Pide el estado y se suscribe a estado + mensajes. Devuelve la baja. */
  subscribe(
    onStatus: (status: EngineerStatus) => void,
    onNotification: (notification: EngineerNotification) => void,
  ): () => void;
  setEnabled(value: boolean): void;
  setSpotterEnabled(value: boolean): void;
  setSubtitlesEnabled(value: boolean): void;
  setSensitivity(value: string): void;
  setOutputMode(category: string, mode: EngineerOutputMode): void;
}

export const wailsEngineerBridge: EngineerBridge = {
  subscribe(onStatus, onNotification) {
    const offStatus = Events.On(ENGINEER_STATUS_EVENT, (event: { data?: unknown }) => {
      const payload = Array.isArray(event?.data) ? event.data[0] : event?.data;
      if (payload && typeof payload === "object") onStatus(payload as EngineerStatus);
    });
    const offNotification = Events.On(ENGINEER_NOTIFICATION_EVENT, (event: { data?: unknown }) => {
      const payload = Array.isArray(event?.data) ? event.data[0] : event?.data;
      if (payload && typeof payload === "object") {
        onNotification(payload as EngineerNotification);
      }
    });
    Events.Emit(ENGINEER_STATUS_REQUEST);
    return () => {
      offStatus?.();
      offNotification?.();
    };
  },
  setEnabled(value) {
    Events.Emit("engineer:enabled:set", value);
  },
  setSpotterEnabled(value) {
    Events.Emit("engineer:spotter:set", value);
  },
  setSubtitlesEnabled(value) {
    Events.Emit("engineer:subtitles:set", value);
  },
  setSensitivity(value) {
    Events.Emit("engineer:sensitivity:set", value);
  },
  setOutputMode(category, mode) {
    Events.Emit("engineer:output:set", { category, mode });
  },
};

/**
 * Voz del sistema.
 *
 * El contrato del Ingeniero no publica voz ni volumen (`EngineerStatus` no los
 * tiene, ver `00-decisiones.md · D-68`), pero la voz del sistema sí es real:
 * la sintetiza el propio motor de Windows a través del webview. «Probar voz»
 * habla de verdad con la voz y el volumen elegidos.
 */
export interface EngineerVoice {
  id: string;
  label: string;
}

export interface VoiceRuntime {
  list(): EngineerVoice[];
  /** Avisa cuando el motor termina de cargar el catálogo. */
  onChange(listener: () => void): () => void;
  /** `false` si el motor no está disponible. */
  speak(text: string, options: { voiceId: string; volume: number }): boolean;
}

export const systemVoiceRuntime: VoiceRuntime = {
  list() {
    const synth = typeof window === "undefined" ? undefined : window.speechSynthesis;
    if (!synth?.getVoices) return [];
    return synth.getVoices().map((voice) => ({
      id: voice.voiceURI,
      label: `${voice.name} · ${voice.lang}`,
    }));
  },
  onChange(listener) {
    const synth = typeof window === "undefined" ? undefined : window.speechSynthesis;
    if (!synth?.addEventListener) return () => undefined;
    synth.addEventListener("voiceschanged", listener);
    return () => synth.removeEventListener("voiceschanged", listener);
  },
  speak(text, { voiceId, volume }) {
    const synth = typeof window === "undefined" ? undefined : window.speechSynthesis;
    if (!synth?.speak || typeof SpeechSynthesisUtterance === "undefined") return false;
    const utterance = new SpeechSynthesisUtterance(text);
    const voice = synth.getVoices?.().find((item) => item.voiceURI === voiceId);
    if (voice) utterance.voice = voice;
    utterance.volume = Math.min(1, Math.max(0, volume));
    synth.cancel();
    synth.speak(utterance);
    return true;
  },
};
