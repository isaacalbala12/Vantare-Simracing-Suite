# I18N-01 — Base multiidioma para Widget Studio, onboarding y ajustes

Fecha: 2026-07-06
Estado: plan listo para ejecucion por worker
Skills esperadas: `vantare-core`, `planning-and-task-breakdown`, `test-driven-development`, `frontend-ui-engineering`, `code-review-and-quality`

## Objetivo

Crear una base i18n ligera para la app con soporte inicial para:

- Espanol (`es`)
- Ingles (`en`)
- Portugues (`pt`)
- Italiano (`it`)

El primer consumidor real sera Widget Studio. Ademas, debe existir un selector de idioma visible y funcional en:

- Onboarding (`frontend/src/hub/onboarding/OnboardingFlow.tsx`)
- Ajustes (`frontend/src/hub/pages/SettingsPage.tsx`)

La implementacion debe ser pequena, testeable y sin librerias nuevas.

## Contexto

El trabajo del dia esta dividido en segmentos. Este plan cubre solo `I18N-01`.

Widget Studio esta en pleno polish visual. Hay muchos cambios pendientes en el working tree de Widget Studio y widgets; no mezclar esta tarea con esos cambios salvo los archivos estrictamente necesarios para traducir copy visible.

Separacion obligatoria:

- `WidgetStudio` puede editar apariencia/datos del widget.
- `LayoutStudio` no debe tocarse.
- No tocar posicion, `x`, `y`, `w`, `h`, runtime OBS ni backend.

## Decisiones tecnicas

1. No usar dependencia externa de i18n en este corte.
2. Crear un modulo frontend puro de i18n.
3. Persistir idioma en frontend con `localStorage` usando una key estable, por ejemplo `vantare.locale`.
4. Idioma por defecto: `es`.
5. Fallback determinista: locale solicitado -> `es` -> key.
6. Los IDs tecnicos no se traducen: widget ids, metric ids, event ids, design ids, variant ids.
7. No traducir datos runtime de overlays. Textos como nombres de pilotos, marcas, `VANTARE`, `LE MANS ULTIMATE` o datos de telemetria se mantienen como datos.
8. Traducir solo copy de UI visible en este corte.
9. Onboarding y Ajustes usan la misma fuente de verdad. Cambiar idioma en un sitio debe reflejarse en el otro tras render.

## Scope incluido

### Nuevo modulo i18n

Archivos esperados:

- `frontend/src/i18n/i18n.ts`
- `frontend/src/i18n/i18n.test.ts`
- `frontend/src/i18n/I18nProvider.tsx`
- `frontend/src/i18n/I18nProvider.test.tsx`
- `frontend/src/i18n/locales/es.ts`
- `frontend/src/i18n/locales/en.ts`
- `frontend/src/i18n/locales/pt.ts`
- `frontend/src/i18n/locales/it.ts`

API esperada:

- `type Locale = "es" | "en" | "pt" | "it"`
- `SUPPORTED_LOCALES`
- `DEFAULT_LOCALE`
- `isLocale(value)`
- `normalizeLocale(value)`
- `translate(locale, key)`
- `I18nProvider`
- `useI18n()`

El hook debe devolver como minimo:

- `locale`
- `setLocale(locale)`
- `t(key)`
- lista de opciones de idioma para pintar selectores

### Selector de idioma

Crear un componente reutilizable si encaja:

- `frontend/src/i18n/LanguageSelector.tsx`
- `frontend/src/i18n/LanguageSelector.test.tsx`

Requisitos:

- `data-testid="language-selector"`
- Label accesible.
- Opciones: Espanol, English, Portugues, Italiano.
- Debe actualizar el contexto y persistir en localStorage.
- No debe depender de Wails, Supabase ni backend.

### Onboarding

Archivo:

- `frontend/src/hub/onboarding/OnboardingFlow.tsx`

Cambios esperados:

- Envolver el flujo con `I18nProvider` si no existe un provider global superior.
- Mostrar `LanguageSelector` en la pantalla inicial del onboarding.
- Traducir copy visible principal:
  - `Bienvenido a Vantare`
  - `Elige tu simulador principal para empezar`
  - `Elige tu perfil recomendado`
  - `Empezamos con un perfil base...`
  - `Empezar`
  - `Cargando licencia...`
- Mantener nombres de simuladores como datos.

Tests esperados:

- El selector aparece en onboarding.
- Cambiar a ingles modifica al menos un texto visible.
- El idioma se persiste.
- El flujo de pasos sigue funcionando.

### Ajustes

Archivo:

- `frontend/src/hub/pages/SettingsPage.tsx`

Cambios esperados:

- Mostrar selector de idioma en ajustes, preferiblemente en la pestaña `Cuenta` o en una tarjeta propia de preferencias generales.
- Traducir copy visible basico de la cabecera y tabs principales:
  - `Ajustes`
  - `Cuenta, actualizaciones, atajos y diagnosticos.`
  - `Cuenta`
  - `Actualizaciones`
  - `Hotkeys`
  - `Diagnostico`
  - `Avanzado`
- No traducir todo `SettingsPage` en este corte si dispara el scope. El selector y la estructura principal son obligatorios.

Tests esperados:

- El selector aparece en ajustes.
- Cambiar a portugues o italiano cambia al menos un texto visible de ajustes.
- El cambio se persiste y el valor seleccionado se refleja en el selector.
- No rompe los tests existentes de `settings:save`, actualizaciones y hotkeys.

### Widget Studio

Archivos candidatos:

- `frontend/src/hub/overlays/WidgetStudio.tsx`
- `frontend/src/hub/overlays/StudioWidgetList.tsx`
- `frontend/src/hub/overlays/WidgetSettingsPanel.tsx`
- `frontend/src/hub/overlays/WidgetConfigSections.tsx`
- `frontend/src/hub/widgets/WidgetDesignGallery.tsx`

Traducir copy visible del shell y paneles:

- `Widgets`
- `Edicion interna · sin posicion`
- `Cambios sin guardar`
- `Sin cambios`
- `Guardando...`
- `Guardado`
- `Error al guardar`
- `Guardar`
- `Overlays`
- `Todos`
- `Activos`
- `Buscar overlay...`
- `Mock`
- `Practica`
- `Qualy`
- `Carrera`
- `Diseno`
- `Sin disenos`
- `Personalizado`
- `Overlay Controls`
- `Type to filter settings...`
- `Overview`
- `Appearance`
- `Visibility`
- `Settings`
- `Variants`
- `Columns`
- `Column Groups`
- `Guardar en widget`
- `Descartar`
- `Workspace: Activo`
- `Vista Navegador`
- `Copiar URL`

No traducir:

- IDs de widgets.
- IDs de columnas/slots.
- Nombres de disenos oficiales si son parte del producto visual, salvo que ya exista label traducible separado.
- Datos mock de telemetria.

Tests esperados:

- Widget Studio renderiza labels en espanol por defecto.
- Cambiar locale a ingles/portugues/italiano cambia al menos tres labels visibles.
- Los tests de no tocar posicion/tamano siguen pasando.
- No se debilitan tests existentes.

## Fuera de scope

- No tocar backend Go.
- No tocar Supabase/Auth.
- No tocar `LayoutStudio`.
- No traducir calendario en este corte.
- No traducir roadmap en este corte.
- No traducir runtime OBS.
- No anadir dependencias.
- No commitear screenshots.
- No reestructurar la arquitectura de settings del backend.

## Microcortes

### MC-0 — Baseline y RED

1. Ejecutar:
   - `pnpm --dir frontend test -- OnboardingFlow SettingsPage WidgetStudio WidgetSettingsPanel WidgetConfigSections StudioWidgetList`
2. Crear tests RED para:
   - modulo i18n inexistente,
   - selector de idioma en onboarding,
   - selector de idioma en ajustes,
   - Widget Studio con traduccion basica.

No implementar UI hasta ver RED claro.

### MC-1 — Modulo i18n puro

Implementar `i18n.ts` y locales.

Criterios:

- Todas las locales tienen exactamente las mismas keys.
- `translate()` tiene fallback estable.
- `normalizeLocale()` rechaza valores invalidos.
- Sin React, Wails, Supabase ni side effects en `i18n.ts`.

Tests:

- keys iguales entre locales.
- fallback a `es`.
- locale invalido cae a `es`.

### MC-2 — Provider + persistencia local

Implementar `I18nProvider` y `useI18n`.

Criterios:

- Lee `localStorage["vantare.locale"]` al montar.
- Persiste al cambiar.
- No rompe SSR/test si `window` no existe.
- No usa Wails.

Tests:

- default `es`.
- carga locale guardado.
- persiste cambio.
- `t()` re-renderiza al cambiar locale.

### MC-3 — LanguageSelector

Implementar selector reutilizable.

Criterios:

- Accesible.
- Reutilizable en onboarding y ajustes.
- Usa opciones centralizadas.
- `data-testid="language-selector"`.

Tests:

- muestra 4 idiomas.
- cambiar opcion llama a `setLocale`.
- refleja valor actual.

### MC-4 — Onboarding

Integrar selector y traducciones basicas.

Criterios:

- Selector visible en la primera pantalla.
- Cambiar idioma actualiza textos sin reiniciar el flujo.
- Nombres de simuladores se mantienen.

Tests:

- selector visible.
- ingles cambia `Bienvenido a Vantare` a su traduccion.
- el flujo simulator -> auth/recommended sigue funcionando.

### MC-5 — Ajustes

Integrar selector en `SettingsPage`.

Criterios:

- Selector visible en ajustes.
- Preferentemente dentro del tab `Cuenta` en una tarjeta de preferencias.
- Cambiar idioma no emite `settings:save` salvo que se decida explicitamente persistir tambien en AppSettings. En este corte la persistencia local es suficiente.

Tests:

- selector visible.
- cambiar a italiano o portugues cambia labels de cabecera/tabs.
- no rompe tests de update channel/hotkeys.

### MC-6 — Widget Studio copy visible

Aplicar `useI18n()` en los componentes de Widget Studio.

Criterios:

- Traducir shell, tabs, botones y panel settings.
- No traducir datos tecnicos.
- No tocar posicion/tamano.
- No tocar runtime widgets salvo labels de editor.

Tests:

- WidgetStudio muestra espanol por defecto.
- Con provider en ingles muestra labels traducidos.
- Con provider en portugues/italiano cambia labels principales.
- Tests existentes de edicion siguen pasando.

### MC-7 — Documentacion y checks

Actualizar:

- `docs/current-plan.md`

Opcional si el cambio queda suficientemente estable:

- `docs/widget-architecture.md` con una seccion breve: "I18N en Widget Studio".

Checks obligatorios:

- `pnpm --dir frontend test -- i18n OnboardingFlow SettingsPage WidgetStudio WidgetSettingsPanel WidgetConfigSections StudioWidgetList`
- `pnpm --dir frontend test`
- `pnpm --dir frontend exec tsc -b`
- `pnpm --dir frontend lint`
- `pnpm --dir frontend build`
- `git diff --check -- <archivos tocados>`

## Criterios de aceptacion

- Existe selector de idioma en onboarding.
- Existe selector de idioma en ajustes.
- Idiomas soportados: `es`, `en`, `pt`, `it`.
- El idioma persiste entre pantallas usando una unica fuente frontend.
- Espanol es default.
- Las locales tienen cobertura de keys identica.
- Widget Studio traduce su UI visible principal.
- No hay librerias nuevas.
- No hay cambios en backend, Supabase, LayoutStudio, calendario o runtime OBS.
- No se toca posicion/tamano de widgets.
- Tests y build pasan.

## Prompt de ejecucion para worker

Usa las skills `vantare-core`, `planning-and-task-breakdown`, `test-driven-development`, `frontend-ui-engineering` y `code-review-and-quality`.

Implementa el plan `docs/superpowers/plans/2026-07-06-i18n-widget-studio.md` de principio a fin. Este plan es para un modelo pequeno: no improvises arquitectura ni amplíes scope.

Contexto obligatorio:

- Repo: Vantare v2.
- Objetivo: base i18n ligera para `es/en/pt/it`.
- Debe haber selector de idioma en onboarding y ajustes.
- Widget Studio es el primer consumidor real.
- No tocar backend Go, Supabase/Auth, LayoutStudio, calendario, runtime OBS ni dependencias.
- No traducir IDs tecnicos ni datos runtime.
- Espanol es idioma default.
- Persistencia frontend local con `localStorage`.
- El cambio debe ser TDD: crea tests RED antes de implementar cada microcorte.

Ejecuta los microcortes MC-0 a MC-7 y reporta al final:

1. Archivos tocados exactos.
2. Tests RED vistos.
3. Confirmacion de selector en onboarding.
4. Confirmacion de selector en ajustes.
5. Confirmacion de que las 4 locales tienen las mismas keys.
6. Confirmacion de que no tocaste backend/Supabase/LayoutStudio/calendario/runtime OBS.
7. Checks ejecutados y resultados.
8. Archivos seguros para commit.
9. Archivos que NO deben incluirse.
10. Sin commit, sin tag, sin release, sin Discord.
