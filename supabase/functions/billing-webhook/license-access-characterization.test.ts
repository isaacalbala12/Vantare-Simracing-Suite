// #1827 paso 0. Solo fixtures: normalizeGrants actual, no el contrato futuro.
import { normalizeGrants } from "../_shared/license-credential.ts";
import { deriveSubscriptionTransition, mergeRecoveryCycle } from "./subscription-lifecycle.ts";

const now = new Date("2026-10-31T12:00:00.000Z");
const future = "2026-11-01T12:00:00.000Z";
const past = "2026-10-30T12:00:00.000Z";
const pro = "vantare.plan.pro";
const nightly = "vantare.channel.nightly";
const founder = "vantare.plan.founders";
type Row = Parameters<typeof normalizeGrants>[0][number];
const grant = (capability = pro, valid_until: string | null = future, source_type = "subscription", provider = "polar"): Row =>
  ({ capability, valid_until, source_type, provider, environment: "production", source_id: "fixture-order" });
const paid = (key = pro, paid_through = future) => ({ key, paid_through });
const perpetual = (key: string) => ({ key, perpetual: true });
const ok = (grants: object[] = [], onlineCapabilities: string[] = []) => ({ ok: true, grants, onlineCapabilities });
function equal(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`actual=${JSON.stringify(actual)} expected=${JSON.stringify(expected)}`);
  }
}

// Una fila por forma de grant; recovery cambia en paso 1, las demás se conservan.
for (const [name, rows, expected] of [
  ["sin grants", [], ok()],
  ["Pro temporal", [grant()], ok([paid()])],
  ["Pro caducado", [grant(pro, past)], ok()],
  ["Pro frontera exacta", [grant(pro, now.toISOString())], ok()],
  ["Pro sin plazo inválido", [grant(pro, null)], { ok: false }],
  ["fecha inválida", [grant(pro, "bad-date")], { ok: false }],
  ["fuente ajena", [grant(pro, future, "manual")], { ok: false }],
  ["entorno ajeno", [{ ...grant(), environment: "sandbox" }], { ok: false }],
  ["legacy ignorado", [{ ...grant("unknown"), provider: "legacy", environment: "legacy" }], ok()],
  ["capability desconocida", [grant("unknown")], { ok: false }],
  ["gana plazo mayor posterior", [grant(pro, past), grant(pro, "2026-10-31T13:00:00.000Z"), grant()], ok([paid()])],
  ["Founders perpetuo de order", [grant(founder, null, "order")], ok([perpetual(founder)])],
  ["Founders temporal inválido", [grant(founder, future, "order")], { ok: false }],
  ["Founders subscription inválido", [grant(founder, null)], { ok: false }],
  ["Nightly perpetuo ligado a Founders", [grant(founder, null, "order"), grant(nightly, null, "order")], ok([perpetual(nightly), perpetual(founder)])],
  ["Nightly perpetuo sin Founders", [grant(nightly, null, "order")], { ok: false }],
  ["Nightly de otro pedido", [grant(founder, null, "order"), { ...grant(nightly, null, "order"), source_id: "other" }], { ok: false }],
  ["Plus temporal independiente", [grant(nightly), grant()], ok([paid(nightly), paid()])],
  ["Launch perpetuo", [grant("vantare.edition.launch_v1", null, "order")], ok([{ key: "vantare.edition.launch_v1", perpetual: true, scope_version: "launch_v1" }])],
  ["Launch temporal inválido", [grant("vantare.edition.launch_v1")], { ok: false }],
  ["módulo de soporte", [grant("vantare.module.engineer", null, "support", "vantare")], ok([perpetual("vantare.module.engineer")])],
  ["módulo temporal inválido", [grant("vantare.module.engineer", future, "support", "vantare")], { ok: false }],
  ["recovery vigente solo online; cambia en paso 1", [grant(pro, future, "subscription_recovery", "vantare")], ok([], [pro])],
  ["recovery vencido", [grant(pro, past, "subscription_recovery", "vantare")], ok()],
  ["recovery frontera exacta", [grant(pro, now.toISOString(), "subscription_recovery", "vantare")], ok()],
  ["recovery sin plazo inválido", [grant(pro, null, "subscription_recovery", "vantare")], { ok: false }],
  ["recovery Launch inválido", [grant("vantare.edition.launch_v1", future, "subscription_recovery", "vantare")], { ok: false }],
  ["pago intacto gana a recovery", [grant(), grant(pro, future, "subscription_recovery", "vantare")], ok([paid()])],
] satisfies [string, Row[], object][]) {
  Deno.test(`nightly normalizeGrants: ${name}`, () => equal(normalizeGrants(rows, now, "production"), expected));
}

// Estado → transición real → filas efectivas de fixture → normalizador real.
// No prueba process.ts ni SQL/RLS: esos filtros tienen sus propios gates.
for (const [status, cancelAtPeriodEnd, commercial, recovery] of [
  ["active", false, true, false],
  ["trialing", false, true, false],
  ["uncanceled", false, true, false],
  ["canceled", true, true, false],
  ["cancelled", true, true, false],
  ["canceled", false, false, false],
  ["past_due", false, false, true], // cambia en paso 1: hoy no se firma recovery.
  ["unpaid", false, false, false],
  ["revoked", false, false, false],
  ["incomplete", false, false, false],
  ["incomplete_expired", false, false, false],
  ["unknown", false, false, false],
] satisfies [string, boolean, boolean, boolean][]) {
  Deno.test(`nightly lifecycle/normalizeGrants: ${status}, cancelAtPeriodEnd=${cancelAtPeriodEnd}`, () => {
    const transition = deriveSubscriptionTransition({ status, cancelAtPeriodEnd, currentPeriodEnd: future,
      remoteModifiedAt: now.toISOString(), previous: { status: "active", paidThrough: past }, now });
    const rows: Row[] = [];
    if (transition.commercialGrant.status === "active") rows.push(grant(pro, transition.commercialGrant.validUntil));
    if (transition.recovery.action === "open") {
      const cycle = mergeRecoveryCycle(null, transition.recovery);
      rows.push(grant(pro, cycle.recoveryUntil, "subscription_recovery", "vantare"));
    }
    equal(normalizeGrants(rows, now, "production"), ok(commercial ? [paid()] : [], recovery ? [pro] : []));
  });
}
