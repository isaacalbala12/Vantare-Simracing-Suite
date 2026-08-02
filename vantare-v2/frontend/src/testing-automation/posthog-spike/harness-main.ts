import posthog from "posthog-js/dist/module.full.no-external";

import {
  createSanitizedException,
  sanitizeCapturePayload,
  sanitizeUrl,
} from "./privacy";

type CapturedEvent = Record<string, unknown>;

interface SpikeState {
  diagnostics: Record<string, unknown>;
  events: CapturedEvent[];
  ready: boolean;
  status: string;
}

declare global {
  interface Window {
    __posthogSpike: SpikeState;
  }
}

const query = new URLSearchParams(window.location.search);
const apiHost = query.get("apiHost") ?? "http://127.0.0.1:5187";
window.history.replaceState({}, "", sanitizeUrl(window.location.href));
const state: SpikeState = {
  diagnostics: {},
  events: [],
  ready: false,
  status: "booting",
};
window.__posthogSpike = state;

const statusOutput = requiredElement<HTMLOutputElement>("status");
const eventCountOutput = requiredElement<HTMLOutputElement>("event-count");
const responsivenessOutput =
  requiredElement<HTMLOutputElement>("responsiveness-count");

function requiredElement<T extends HTMLElement>(testId: string): T {
  const element = document.querySelector<T>(`[data-testid="${testId}"]`);
  if (!element) {
    throw new Error(`Missing spike element: ${testId}`);
  }
  return element;
}

function setStatus(value: string): void {
  state.status = value;
  statusOutput.value = value;
}

function onClick(testId: string, handler: () => void): void {
  requiredElement<HTMLButtonElement>(testId).addEventListener("click", handler);
}

let initialized = false;
let client: ReturnType<typeof posthog.init> | undefined;

function requiredClient(): NonNullable<typeof client> {
  if (!client) {
    throw new Error("PostHog spike used before consent initialization");
  }
  return client;
}

function initializePostHog(): void {
  if (initialized) return;
  initialized = true;
  client = posthog.init("phc_vantare_synthetic_spike_only", {
    api_host: apiHost,
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: false,
    advanced_disable_feature_flags: true,
    advanced_disable_feature_flags_on_first_load: true,
    disable_external_dependency_loading: true,
    disable_session_recording: true,
    disable_surveys: true,
    disable_capture_url_hashes: true,
    mask_personal_data_properties: true,
    opt_out_capturing_by_default: false,
    opt_out_persistence_by_default: false,
    opt_out_useragent_filter: true,
    persistence: "memory",
    person_profiles: "never",
    request_batching: false,
    get_current_url: (defaultUrl) => sanitizeUrl(defaultUrl),
    session_recording: {
      maskAllInputs: true,
      maskTextSelector: "*",
      recordCrossOriginIframes: false,
      recordHeaders: false,
      recordBody: false,
    },
    before_send: (event) =>
      sanitizeCapturePayload(
        event as unknown as Record<string, unknown>,
      ) as unknown as typeof event,
    loaded: () => {
      state.diagnostics.loadedCallback = true;
    },
  });
  requiredClient().on("eventCaptured", (event: CapturedEvent) => {
    state.events.push(event);
    eventCountOutput.value = String(state.events.length);
  });
}

onClick("consent", () => {
  initializePostHog();
  requiredClient().opt_in_capturing({ captureEventName: false });
  state.diagnostics.capturingAfterConsent = requiredClient().is_capturing();
  state.diagnostics.optedIn = requiredClient().has_opted_in_capturing();
  state.diagnostics.optedOut = requiredClient().has_opted_out_capturing();
  setStatus("consented");
});

onClick("start-recording", () => {
  requiredClient().startSessionRecording({ sampling: true });
  setStatus("recording");
});

onClick("capture-error", () => {
  const captureResult = requiredClient().capture("synthetic_error_triggered", {
    app_version: "0.1.0.2",
    operating_system: "Windows",
    renderer: "WebView2-compatible Chromium harness",
    email: "tester@example.invalid",
    authToken: "SYNTHETIC_EVENT_TOKEN_SECRET",
  });
  state.diagnostics.captureReturned = Boolean(captureResult);
  requiredClient().captureException(
    createSanitizedException(
      new Error(
        "Synthetic failure for tester@example.invalid with SYNTHETIC_EXCEPTION_SECRET",
      ),
    ),
    {
      app_version: "0.1.0.2",
      operating_system: "Windows",
      renderer: "WebView2-compatible Chromium harness",
    },
  );
  setStatus("error-captured");
});

onClick("stop-recording", () => {
  requiredClient().stopSessionRecording();
  setStatus("recording-stopped");
});

onClick("opt-out", () => {
  requiredClient().opt_out_capturing();
  setStatus("opted-out");
});

onClick("offline-capture", () => {
  requiredClient().capture("synthetic_offline_event", {
    app_version: "0.1.0.2",
    operating_system: "Windows",
  });
  setStatus("offline-call-returned");
});

let responsivenessCount = 0;
onClick("responsiveness", () => {
  responsivenessCount += 1;
  responsivenessOutput.value = String(responsivenessCount);
});

state.ready = true;
setStatus("ready-uninitialized");
