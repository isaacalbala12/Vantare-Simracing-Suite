# ISA-1105 — Acceso y marca por widget en React (microplan y evidencia)

Hijo de #1097 (autorizado por Isaac 2026-09-10). Rama
`vantareapp/isa-1105-widget-access-branding-ui`, worktree
`C:/tmp/vantare-isa1105/vantare-v2`, base `6ae58f6e` (#1103 sobre
#1083@87cef39a). Solo frontend + docs propios; Go/cmd del ejecutor nativo en
`C:/tmp/vantare-isa1097`. Sin commit/push/PR/merge hasta revisión final del padre.

## 1. Contrato consumido (provisional nativo, confirmado por coordinador)

`WidgetPolicyWire { revision, overlaysBasic, overlaysAdvanced, engineerAI,
brandCrystal|Efficiency|Original: 'required'|'optional'|'none',
validUntil?: RFC3339 }`. Sin PII/tokens/roles. Wails:
`Events.Emit('widget-policy:get')` tras suscribirse a
`widget-policy:snapshot` + `widget-policy:changed` (mismo event bridge, sin
bindings nuevos). OBS: SSE `/api/widget-policy/stream`, primer evento
`widget-policy:snapshot` autoritativo; luego `changed` solo mayor en esa
conexión. `validUntil` = próxima fecha que cambia acceso/marca (cero =
ausente). Expiración/logout los emite Go.

## 2. Decisiones de diseño (solución más sencilla)

- Una sola autoridad: con snapshot vigente manda; sin él, Free básica.
  Ningún fallback a licencia legacy (revisor: un access Owner antiguo nunca
  recupera premium).
- `WidgetVisualHost` sigue puro y compartido: recibe `brandVisible?: boolean`
  y lo inyecta en settings (ambos paths); sin definir, comportamiento previo.
  Renderers nunca ven licencia/permisos/transporte/posición.
- Preferencia `showBrand` en el documento (toggle de inspector, default
  false): `required` la ignora, `optional` la exige, `none` la descarta.
  Importar/conservar ajustes nunca otorga ni quita derechos.
- Catálogo muestra candados (no oculta), inspector/dispatch/guardado aplican
  el mismo gate; mover/conservar/eliminar bloqueados siempre permitido.
- Runtime Desktop/OBS filtra ANTES de crear `RuntimeWidgetFrame` (sin
  suscripción de telemetría); el documento se conserva íntegro.
- Caducidad: temporizador por tramos (tope 2^31-1 ms) que publica copia con
  nueva identidad para que `useSyncExternalStore` remonte en fail-safe sin
  frames; el adaptador pide snapshot fresco, no prolonga premium.
- Denegación nativa al guardar (`code: 'widget-access-denied'` + widgetIds)
  se mapea SOLO por code al aviso traducido existente (Studio e InPlace
  comparten cliente); otros errores intactos, sin comparar messages.
- Marca: banda propia de 22px con cabecera oculta (mismo lenguaje que
  info-band, logo ajustado a 18px en banda); Pedals Crystal lleva micro-chip
  absoluto y discreto. Sin efectos ni animación nuevos; Original intacto.
- Una conexión por raíz de app; remontajes idempotentes; callbacks tardíos
  ignorados por instancia (SSE) y generación (Wails).

## 3. Archivos

Congelados para revisión (lógica, no tocar hasta feedback): ver reporte de
congelado — `overlay/core/widget-policy*`, `use-widget-policy.ts`,
`widget-definition.ts` (Delta advanced), `WidgetVisualHost.tsx`,
`hub/overlay-studio/{access,state/studio-context,state/studio-provider,state/studio-profile-client,catalog,inspector/orbit/canvas}`,
`overlay/edit/InPlace*`, `overlay/runtime/*`, `CompositeApp/ObsOverlayApp`,
`standings-frame-layout.ts`, `functional-standings-layout.ts`, y sus tests
(326 PASS).

Abiertos (marca/CSS/capturas/docs): renderers Crystal/Functional + Pedals,
`tokens.css` ×2, manifiestos + `session-info-settings.ts` + i18n `showBrand`,
`.brand.test` ×4, `brand-band.layout.test.tsx`, `plan.md` + `roadmap.json`,
este handoff y este microplan.

## 4. Gates

- Focales P1/P2 verdes 2026-09-10 (log
  `frontend/design-evidence/isa1105/focal-p1p2-r2.log`, ignorado en git):
  `AppearanceSection.brand` 8/8 (Crystal/Efficiency, preferencias
  false/true, opt-in/out, pago→Free→pago, snapshot ausente),
  `InPlaceEditOverlay` 11/11 (denegación nativa traducida, borrador y
  revisión conservados, reintento explícito), `studio-profile-client` 14/14.
  Total 33/33, exit 0.
- `typecheck` (`tsc -b`): PASS, exit 0 (log `typecheck.log`, ignorado).
- Suite completa, build y lint se reservan al candidato conjunto #1098; no
  repetirlos en esta rama ni anunciar gates no corridos aquí.
- Digest: `python .github/scripts/roadmap_digest.py --repo . --ref origin/nightly`
  (desde gitroot; regenerado tras editar `plan.md`, hito
  `milestones:widget-access-branding` en tipo `feature`).

## 5. Capturas auténticas (descartadas las 4 primeras por fixture en quirks)

Directorio fuera del repo, sin versionar: `C:/tmp/vantare-isa1105-captures/`
(renderer productivo, tokens reales, Inter real, doctype CSS1Compat, asset
`vantare-mark.png` inlineado, datos sim golden — NO LMU real):
- `efficiency-signature-free-brand-hidden-header.png`
- `efficiency-broadcast-free-brand-hidden-header.png`
- `efficiency-signature-paid-no-brand.png`
- `crystal-pedals-free-brand.png` (chip discreto, canales libres)

## 6. Riesgos y límites

- Sin validación física LMU ni licencia real: el harness y los goldens no las
  sustituyen; la integración a Nightly y la comprobación conjunta las hará el
  padre con Isaac.
- Debajo de ~170px de alto los canales aceptados de Pedals (135px fijos) ya
  desbordan por sí solos; la prueba cubre 120×160 y 200×260.
- `nightly` avanzó con Redline ajeno (`a9b8dd36`, #1102): no rebasear aquí;
  el apilado lo resuelve el padre conservando Redline.
