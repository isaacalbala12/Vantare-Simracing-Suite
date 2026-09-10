import { getWidgetRequiredFeature } from "./widget-definition";
import type { FeatureId } from "../../lib/access-policy";
import type {
  DesignSystemId,
  WidgetInstanceV3,
  WidgetType,
} from "./profile-document";

/**
 * Decisión nativa de acceso y marca por widget (ISA-1097/ISA-1105).
 *
 * El DTO lo emite Go y nunca contiene PII, tokens ni roles: solo derechos
 * verificados y modos de marca. El cliente no inventa derechos ni los
 * prolonga ante desconexiones; la caducidad (`validUntil`) la verifica el
 * lector en cada consumo.
 */
export type WidgetBrandMode = "required" | "optional" | "none";

export type WidgetPolicyWire = {
  revision: number;
  overlaysBasic: boolean;
  overlaysAdvanced: boolean;
  engineerAI: boolean;
  brandCrystal: WidgetBrandMode;
  brandEfficiency: WidgetBrandMode;
  brandOriginal: WidgetBrandMode;
  validUntil?: string;
};

const BRAND_MODES: readonly WidgetBrandMode[] = ["required", "optional", "none"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isBrandMode(value: unknown): value is WidgetBrandMode {
  return value === "required" || value === "optional" || value === "none";
}

/**
 * Valida el DTO nativo sin aceptar nada más: campos con tipo incorrecto,
 * revisiones no enteras/negativas o marcas desconocidas devuelven null.
 * Los campos desconocidos se ignoran (compatibilidad hacia delante) y nunca
 * se reenvían.
 */
export function parseWidgetPolicyWire(input: unknown): WidgetPolicyWire | null {
  if (!isRecord(input)) {
    return null;
  }
  const {
    revision,
    overlaysBasic,
    overlaysAdvanced,
    engineerAI,
    brandCrystal,
    brandEfficiency,
    brandOriginal,
    validUntil,
  } = input;
  if (
    typeof revision !== "number" ||
    !Number.isInteger(revision) ||
    revision < 0 ||
    typeof overlaysBasic !== "boolean" ||
    typeof overlaysAdvanced !== "boolean" ||
    typeof engineerAI !== "boolean" ||
    !isBrandMode(brandCrystal) ||
    !isBrandMode(brandEfficiency) ||
    !isBrandMode(brandOriginal)
  ) {
    return null;
  }
  const wire: WidgetPolicyWire = {
    revision,
    overlaysBasic,
    overlaysAdvanced,
    engineerAI,
    brandCrystal,
    brandEfficiency,
    brandOriginal,
  };
  if (validUntil !== undefined) {
    if (typeof validUntil !== "string" || Number.isNaN(Date.parse(validUntil))) {
      return null;
    }
    wire.validUntil = validUntil;
  }
  return wire;
}

/** Una política caducada no concede nada: el lector la trata como ausente. */
export function isWidgetPolicyExpired(
  policy: WidgetPolicyWire,
  nowMs: number = Date.now(),
): boolean {
  if (policy.validUntil === undefined) {
    return false;
  }
  return Date.parse(policy.validUntil) <= nowMs;
}

/** Política efectiva: null sin snapshot o con el snapshot caducado. */
export function resolveEffectiveWidgetPolicy(
  snapshot: WidgetPolicyWire | null | undefined,
  nowMs: number = Date.now(),
): WidgetPolicyWire | null {
  if (!snapshot || isWidgetPolicyExpired(snapshot, nowMs)) {
    return null;
  }
  return snapshot;
}

/**
 * Acceso por feature de widget/diseño según la política nativa. Sin snapshot
 * válido solo overlays.basic sigue abierto (fail-safe Free); ninguna otra
 * feature —ni siquiera con roles operativos antiguos— recupera premium.
 */
export function isFeatureAllowed(
  policy: WidgetPolicyWire | null | undefined,
  feature: FeatureId,
  nowMs: number = Date.now(),
): boolean {
  const effective = resolveEffectiveWidgetPolicy(policy, nowMs);
  if (!effective) {
    return feature === "overlays.basic";
  }
  switch (feature) {
    case "overlays.basic":
      return effective.overlaysBasic;
    case "overlays.advanced":
      return effective.overlaysAdvanced;
    case "engineer.ai":
      return effective.engineerAI;
    default:
      return false;
  }
}

/**
 * Acceso por tipo de widget según la política nativa. Sin política el
 * arranque es fail-safe: Standings/Pedals (overlays.basic) disponibles y el
 * resto bloqueado, igual que Free.
 */
export function isWidgetTypeAllowed(
  policy: WidgetPolicyWire | null | undefined,
  type: WidgetType,
  nowMs: number = Date.now(),
): boolean {
  let required: ReturnType<typeof getWidgetRequiredFeature>;
  try {
    required = getWidgetRequiredFeature(type);
  } catch {
    return false;
  }
  return isFeatureAllowed(policy, required, nowMs);
}

/**
 * Gate efectivo para catálogo/inspector/Studio/runtime: ÚNICA autoridad, la
 * política nativa vigente. Sin snapshot válido (ausente o caducado) NO hay
 * fallback a ninguna autoridad legacy de licencia: se aplica la misma matriz
 * Free básica del arranque fail-safe. Un contexto Owner/Pro antiguo nunca
 * recupera premium tras expirar la decisión nativa; solo un snapshot fresco
 * de Go devuelve derechos.
 */
export function resolveEffectiveWidgetGate(input: {
  policy: WidgetPolicyWire | null | undefined;
  type: WidgetType;
  nowMs?: number;
}): { allowed: boolean } {
  const effective = resolveEffectiveWidgetPolicy(input.policy, input.nowMs ?? Date.now());
  return { allowed: isWidgetTypeAllowed(effective, input.type) };
}

/** Modo de marca integrada por sistema visual. */
export function resolveBrandMode(
  policy: WidgetPolicyWire | null | undefined,
  systemId: DesignSystemId,
  nowMs: number = Date.now(),
): WidgetBrandMode {
  const effective = resolveEffectiveWidgetPolicy(policy, nowMs);
  if (!effective) {
    // Fail-safe de arranque: Crystal/Efficiency exigen marca, Original y los
    // demás sistemas conservan su política (ninguna impuesta desde aquí).
    return systemId === "vantare-crystal" || systemId === "vantare-functional"
      ? "required"
      : "none";
  }
  switch (systemId) {
    case "vantare-crystal":
      return effective.brandCrystal;
    case "vantare-functional":
      return effective.brandEfficiency;
    case "vantare-original":
      return effective.brandOriginal;
    default:
      return "none";
  }
}

export function resolveBrandVisible(input: {
  mode: WidgetBrandMode;
  showBrand?: boolean;
}): boolean {
  switch (input.mode) {
    case "required":
      return true;
    case "optional":
      return input.showBrand === true;
    case "none":
      return false;
  }
}

/**
 * Preferencia de marca del documento existente (base + overrides). Es solo
 * una preferencia, nunca autoridad: `required` la ignora y `none` la
 * descarta. Importar o conservar ajustes nunca otorga ni quita derechos.
 */
export function readBrandPreference(widget: WidgetInstanceV3): boolean {
  const base = widget.visual.baseSettings?.["showBrand"];
  const override = widget.visual.appearanceOverrides?.["showBrand"];
  const value = override !== undefined ? override : base;
  return value === true;
}

export function resolveWidgetBrandVisible(
  policy: WidgetPolicyWire | null | undefined,
  widget: WidgetInstanceV3,
  nowMs: number = Date.now(),
): boolean {
  return resolveBrandVisible({
    mode: resolveBrandMode(policy, widget.visual.systemId, nowMs),
    showBrand: readBrandPreference(widget),
  });
}

export { BRAND_MODES };
