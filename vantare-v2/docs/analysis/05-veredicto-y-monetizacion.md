# Veredicto de Viabilidad y Monetización

## 1. ¿Es viable lanzar en 2 días?

Depende de qué se entiende por "lanzar":

### Escenario A — Beta pública FREE (`v0.1.0.x`, igual que `v0.1.0.0`): ✅ VIABLE
La app ya es una beta pública funcional. Para lanzar una beta free en 2 días basta con:
- Arreglar el **P0** (ENG-NOTIF-SSE) — 1 cambio pequeño y localizado.
- Arreglar los **P1 de código** que afectan free (onboarding blank #4, settings:save race #11, cast unsafe #14, gating de secciones #5).
- El gating free/paid ya está implementado y el usuario Free entra al Hub correctamente.

### Escenario B — Lanzamiento CON COBROS / pagos reales: ❌ NO VIABLE en 2 días
No es un bug de código; son dependencias externas que no se resuelven en 48h:
1. **Migración SQL inexistente** (TD-043 / stripe-audit §3 #1): 0 `.sql` en el repo; los RPCs `get_account_entitlements` / `reset_active_device` que el Go invoca no existen. Un usuario que pague realmente **nunca recibe sus entitlements** → cae a Free.
2. **Checkout no implementado** (stripe-audit §3 #2): `PaywallScreen.handleSubscribe` solo hace `setPendingPlan`. No hay Stripe JS, no hay Checkout Session.
3. **Edge Function no deployada ni con secretos** (stripe-audit §3 #3): `supabase/functions/stripe-webhook/` existe y está testeada, pero no está deployada y Stripe/Supabase no están configurados.
4. **Productos/Precios Stripe no creados** (stripe-audit §3 #4): price IDs son placeholders.
5. **Registro (`signUp`) ausente** (stripe-audit §11): `supabase-auth.ts` solo exporta `signInWithEmail`/`signOut`/`getSession`/`setSupabaseSession`/`signInWithOAuth`. Para una beta PÚBLICA esto es bloqueante: un usuario nuevo no puede darse de alta desde la app.

Estos 5 puntos requieren: acceso al proyecto Supabase, credenciales Stripe test, deploy de EF, y decisión de producto (signup abierto vs invite). Ninguno es código que se escriba en 2 días y se verifique de extremo a extremo.

## 2. Riesgos del lanzamiento (beta free)

- **P0 ENG-NOTIF-SSE**: si se lanza sin arreglar, la feature Ingeniero (prometida en `v0.1.0.0`) está rota en vivo. Es el riesgo #1.
- **P1 HUB-PROFILE-RACE / SETTINGS-SAVE-BYPASS**: race de concurrencia y bypass de validación de launcher. Riesgo bajo en uso normal (Wails serializa eventos), pero real con hotkeys concurrentes.
- **P1 SSE-NO-LIMIT / SSE-NO-AUTH**: DoS local y fuga de telemetría a procesos locales. Aceptable para beta privada con usuarios informados; debe cerrarse antes de beta pública amplia.
- **P1 i18n auth**: login/paywall en español solo. Si la beta free es multilenguaje (es/en/pt/it), es un hueco visible.
- **P2 CODESIGN**: sin firma, SmartScreen asusta. Aceptado para beta (hay aviso), pero es fricción.

## 3. Decisión recomendada

**Lanzar la beta free en 2 días** (Escenario A) corrigiendo P0 + P1 de código. **NO prometer pagos** en este lanzamiento: dejar el Paywall en modo "próximamente" (como hoy) y comunicar claramente que la beta es free. Esto es coherente con el estado real documentado en `stripe-licensing-status-audit.md`.

Si se quiere cobrar ya, el cronograma real es `AUTH-04 → SQL-01 → STRIPE-01 → DEPLOY-01 → CHECKOUT-01 → E2E-01` (ver ese doc, §7 y §414), que requiere acceso a Supabase/Stripe y varios días de trabajo + verificación manual real.
