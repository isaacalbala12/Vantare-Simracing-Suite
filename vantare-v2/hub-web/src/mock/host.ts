import scene from "../../fixtures/ajustes-base.json";
import coreScene from "../../fixtures/core-offline.json";
import demoIdentity from "../../fixtures/demo-identity.json";
import {
  type CoreStatus,
  HOST_PROTOCOL_VERSION,
  type HostToUi,
} from "../contract/generated/contract";
import { mockModules } from "../contract/generated/mocks";
import type { LauncherReviewResult } from "../contract/launcher-review-bridge";
import { isUiMessage } from "../contract/validation";
import { analysisScene } from "./analysis-scenes";
import type { MockContext } from "./context";
import { liveAccountScenes } from "./modules/account-license";
import { studioStateVisual } from "./studio-states";
import { studioFieldVisual } from "./studio-widget-scenes";
export const hello = scene as Extract<HostToUi, { kind: "hello" }>;
export function helloForScene(name?: string): typeof hello {
  if (
    name === "cuenta-sesion" ||
    name === "cuenta-founders" ||
    liveAccountScenes.includes(name ?? "") ||
    new RegExp(
      `^visual-(?:dark|light):(?:${liveAccountScenes.join("|")})$`,
    ).test(name ?? "") ||
    /^visual-(?:dark|light):cuenta-(?:sesion|founders)$/.test(name ?? "")
  )
    return { ...hello, demo: false };
  if (name?.startsWith("visual-"))
    return { ...hello, demoName: demoIdentity.name };
  return name === "componentes-incompatibles"
    ? { ...hello, version: HOST_PROTOCOL_VERSION + 1 }
    : name === "componentes-incompatibles-light"
      ? {
          ...hello,
          version: HOST_PROTOCOL_VERSION + 1,
          theme: { ...hello.theme, scheme: "light" },
        }
      : hello;
}
export function createMockHostWithTrustedReview(
  sceneName = "ajustes-base",
  emit: (message: HostToUi) => void = () => {},
  analysisClock = Date.now,
) {
  const requestedScene = sceneName;
  const visual =
    /^visual-(dark|light):(testing-tester-questionnaire-note(?:-rejected)?)$/.exec(
      sceneName,
    ) ??
    studioStateVisual.exec(sceneName) ??
    studioFieldVisual.exec(sceneName) ??
    /^visual-(dark|light):(launcher-review-(?:question|reviewing|trusted|declined|changed|expired|unavailable|too-long|blocked-lookalike|blocked-unusual-path|awaiting-confirmation))$/.exec(
      sceneName,
    ) ??
    /^visual-(dark|light):(launcher-notice-(?:completed|accepted|rejected|gap))$/.exec(
      sceneName,
    ) ??
    /^visual-(dark|light):(onboarding-(?:[0-7]|cuenta-(?:sesion|tester(?:-fecha)?|cargando|error)|correo-(?:sin-permiso|con-permiso|error)))$/.exec(
      sceneName,
    ) ??
    /^visual-(dark|light):(cuenta-(?:base|sesion|founders|cambio-sesion|tester(?:-caduca|-gracia|-nightly)?|pro-fecha|sin-verificar|transicion|compra-(?:completada|expira)|limite-dispositivos|bloqueada-(?:no-disponible|caducada|recuperar|reloj|revocada|actualizar))|acceso-(?:navegador-completa|correo-verificado)|acceso-(?:base|navegador|enlace-copiado|comprobando|cancelando|cerrando|cierre-incierto|error)|email-(?:formulario|codigo|crear-contrasena|consentimiento|autorizando|reiniciado|ocupado|espera)|privacidad-pendiente|privacidad-uso|inicio-(?:base|referencia|vacio|cargando|error|lanzando|sin-diseno)|ajustes-con-diseno|proximamente-base|roadmap-(?:base|published)|notificaciones-base|launcher-base|launcher-importado|launcher-ready|launcher-aplicaciones|launcher-escaneando|launcher-borrar-app|launcher-results-(?:many|mixed|final-pass|unsupported|unknown|accepted|rejected|finished|timeout|restart|gap|stale)|launcher-removal-(?:ready|owned|unknown|unsupported|accepted|rejected|failed|finished|timeout|gap|restart|conflict)|launcher-control-(?:ready|cancel|accepted|rejected|unknown|finished|no-steps|unsupported|closing|missing-document)|launcher-answer-(?:question|accepted|rejected(?:-account|-denied|-unavailable)?|finished|unknown|trust)|launcher-decision|launcher-shortcuts|launcher-offline|studio-canvas(?:-outside|-conflict|-readonly|-monitor|-monitor-missing|-monitor-unreadable)?|studio-base|studio-conservados|studio-bloqueado|studio-miniatura-ausente|studio-muchos|studio-pocos|studio-vacio|studio-oculto|studio-error|studio-protegido|studio-mostrando|studio-pro-bloqueado|testing-reference|testing-tester-reference|testing-tester-report-reference|testing-tester-questionnaires-reference|testing-tester-community-reference|calendar-reference|calendar-live-reference|calendar-launch-reference|calendar-ics-replace-reference|calendar-notice-reference)$/.exec(
      sceneName,
    );
  sceneName = visual?.[2] ?? sceneName;
  const core = structuredClone(coreScene) as CoreStatus;
  // Match the local GPUI reference bank; never changes access from the real host.
  if (visual)
    core.access = {
      verified: true,
      blocked: false,
      tester: true,
      calendar: true,
      engineer: true,
      strategy: true,
      analysis: true,
    };

  const notes: MockContext["notes"] = [];
  const context: MockContext = {
    emit,
    sceneName,
    visual,
    core,
    notes,
    note: (section, code) => {
      notes.push({ section, code });
    },
  };
  const handlers = mockModules.map((module) => module.create(context));
  const analysis = analysisScene(context, analysisClock);
  const dispatch = (value: unknown, trusted: boolean): HostToUi | null => {
    if (!isUiMessage(value)) return null;
    const review =
      value.kind === "reviewContentRequest" || value.kind === "reviewDecision";
    if (review !== trusted) return null;
    if (value.kind === "hello")
      return value.version === HOST_PROTOCOL_VERSION
        ? helloForScene(requestedScene)
        : null;
    const analysisReply = analysis?.(value);
    if (analysisReply !== undefined) return analysisReply;
    for (const handler of handlers) {
      const result = handler(value);
      if (result !== undefined) {
        if (
          context.onboarding &&
          value.kind === "request" &&
          value.request.method === "privacy.update"
        ) {
          context.onboarding.privacyFailed =
            result?.kind === "failure" &&
            ["io", "protected", "busy"].includes(result.error.kind);
          if (result?.kind === "failure")
            context.onboarding.privacyReady = false;
          if (result?.kind === "response")
            context.onboarding.privateConsent = false;
        }
        if (
          context.onboarding &&
          result?.kind === "response" &&
          (result.result.method === "privacy.get" ||
            result.result.method === "privacy.update")
        ) {
          const consent = result.result.value;
          context.onboarding.privacyReady =
            consent.crashesDecided &&
            consent.usageDecided &&
            !consent.protected &&
            !consent.cleanupPending &&
            !consent.cleanupBusy;
          if (context.onboarding.privacyReady)
            context.onboarding.privacyFailed = false;
        }
        return result;
      }
    }
    return value.kind === "request"
      ? { kind: "failure", id: value.id, error: { kind: "unsupported" } }
      : null;
  };
  return Object.assign((value: unknown) => dispatch(value, false), {
    trusted: (value: unknown) => dispatch(value, true),
    reviewTrust: async (ticket: string) =>
      (await context.reviewTrust?.(ticket)) ?? ("unavailable" as const),
  });
}
export function createMockHost(
  sceneName?: string,
  emit?: (message: HostToUi) => void,
  analysisClock?: () => number,
): ((value: unknown) => HostToUi | null) & {
  reviewTrust?: (ticket: string) => Promise<LauncherReviewResult>;
} {
  const dispatch = createMockHostWithTrustedReview(
    sceneName,
    emit,
    analysisClock,
  );
  return Object.assign((value: unknown) => dispatch(value), {
    reviewTrust: dispatch.reviewTrust,
  });
}
export const mockReply = (value: unknown) => createMockHost()(value);
