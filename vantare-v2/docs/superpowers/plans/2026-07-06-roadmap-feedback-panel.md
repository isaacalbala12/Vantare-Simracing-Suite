# ROADMAP-FEEDBACK — Panel de feedback con enlaces externos

Fecha: 2026-07-06
Parte de: iteración Roadmap (D/E/F + porcentajes)
Depende de: ROADMAP-I18N
Modelo sugerido: Minimax M3
Reviewer: GLM

## Objetivo

Hoy la sección de feedback tiene botones muertos (`disabled`) y un mensaje a Discord.
Esta tarea reemplaza esa sección por un panel honesto que:

1. Permite elegir tipo de feedback: 🐞 Bug / 💡 Sugerencia / 💬 General.
2. Permite elegir destino: GitHub / Discord / Formulario externo.
3. Al enviar, ABRE un enlace externo prefirmado (no envía desde la app, para no
   introducir backend/proxy ni dependencias).
4. Respeta el gating `roadmap.feedback` (free ve locked state; paid/tester ve panel).

## Lee obligatoriamente

- `AGENTS.md`, `docs/current-plan.md`, `docs/roadmap-maintenance.md`
- `frontend/src/hub/roadmap/roadmap-data.ts` (post ROADMAP-I18N)
- `frontend/src/hub/pages/RoadmapPage.tsx`
- `frontend/src/lib/access-policy.ts` (`roadmap.feedback`: free=false,
  paid_overlays/paid_engineer=true)
- `frontend/src/lib/access.tsx` (`useAccess`, `canUseFeature`)
- `frontend/src/i18n/locales/{es,en,pt,it}.ts`
- `frontend/src/hub/pages/RoadmapPage.test.tsx`

## Alcance

### Datos (`roadmap-data.ts` o nuevo `roadmap-feedback.ts`)

- `ROADMAP_FEEDBACK_LINKS = { github: string; discord: string; form: string }` con
  constantes placeholder claramente marcadas `// TODO: reemplazar por URLs reales`.
  - `github`: base para issues new, p.ej.
    `"https://github.com/Vantare/overlays/issues/new"`.
  - `discord`: invite del servidor de soporte.
  - `form`: URL de formulario externo (Google Form / Formspree / la que indique el
    producto).
- Tipos: `RoadmapFeedbackType = "bug" | "suggestion" | "general"`.

### UI (`RoadmapPage.tsx`)

- Reemplazar la sección feedback muerta por un panel:
  - Si `!canGiveFeedback`: mantener el `locked state` actual (badge "Disponible para
    testers y planes de pago") — sin cambios de comportamiento para free.
  - Si `canGiveFeedback`:
    - Selector de tipo (radio o select) con labels i18n
      `roadmap.feedback.type.bug` / `.suggestion` / `.general`.
  - `github`: `"https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/new"`.
  - `discord`: `"https://discord.gg/wWjD7CPe74"`.
  - `form`: URL de formulario externo (placeholder `TODO` hasta decidir Google Form / Formspree).
      - GitHub: `${github}?title=${encodeURIComponent(`[${tipo}] ` + primeras50chars(mensaje))}&body=${encodeURIComponent(mensaje)}`
      - Discord / Form: abrir la URL base (el mensaje se pega manualmente en destino).
      - Apertura con `window.open(url, "_blank")` (o helper OpenURL de Wails si existe).
    - Mensaje honesto: el botón no "envía silenciosamente"; abre el cliente externo
      para que el usuario confirme. Mantener copy tipo "Se abrirá tu cliente externo".
- Añadir keys `roadmap.feedback.*` a los 4 diccionarios con paridad.
- Mantener `data-testid="roadmap-feedback-locked"` para el estado bloqueado (los tests
  existentes dependen de él).

## No tocar

- Backend Go, Supabase/Auth, runtime OBS, LayoutStudio, position/x/y/w/h, dependencias.
- El feature flag `roadmap.feedback` (solo se consume).
- Lógica de porcentajes / toggle (ROADMAP-DUAL) y changelog (ROADMAP-CHANGELOG).

## Requisitos

- TDD:
  - free user → sigue viendo `roadmap-feedback-locked`, sin panel.
  - paid/tester → ve panel; click en "Enviar a GitHub" llama `window.open` con URL que
    contiene el título y body codificados (mock `window.open`).
  - Tests de que el tipo/selección se refleja en la URL.
- Paridad de keys en los 4 diccionarios.
- Sin envío real desde la app (decisión de producto: evita backend/proxy en este corte).

## Checks esperados

- `pnpm --dir frontend test` → PASS
- `pnpm --dir frontend exec tsc --noEmit` → OK
- `pnpm --dir frontend lint` → 0 errores
- `pnpm --dir frontend build` → OK

## Reporte final en español

- archivos modificados/creados;
- checks ejecutados;
- checks no ejecutados y motivo;
- riesgos (URLs placeholder; el envío real queda para un corte posterior con backend);
- verificación manual (usuario free ve locked; paid ve panel y abre pestaña externa).
