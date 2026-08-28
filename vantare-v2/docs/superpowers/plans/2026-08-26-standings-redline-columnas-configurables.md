# Plan de implementación: columnas configurables en Standings Redline

Estado: IMPLEMENT completado localmente tras PLAN/TASKS aprobado y enmendado
por review Fable con acuerdo de Isaac el 2026-08-27. Issue: ISA-849.

## Resultado buscado

`standings-redline` respetará visibilidad, orden, anchura y alineación de sus
nueve métricas flexibles. Posición y Piloto seguirán visibles como anclajes. El
diseño predeterminado, la altura de 30 px y el motor de movimiento conservarán
su comportamiento. Los demás renderizadores no cambiarán.

## Arquitectura mínima

- Los builders V1 y V2 añaden solo `configuredDriverName`, con el nombre
  formateado aunque Piloto estuviera desactivado en un documento antiguo.
  `columns` continúa siendo la única lista habilitada y ordenada; los demás
  renderizadores ignoran el campo aditivo.
- `StandingsRedlineTemplate.tsx` filtra y recorre esas columnas directamente.
  Un componente local pequeño resuelve las celdas especiales; no se crea una
  capa de adaptación ni una API reutilizable prematura.
- Cada fila define sus tracks con los píxeles canónicos de
  `resolveColumnWidthPixels`. CSS conserva color, tipografía, altura y motion.
- `deriveBattlePairs` no cambia. El hook solo habilita batalla/presión cuando
  Gap está visible; Intervalo no es una fuente equivalente y V2 no lo publica.
- `WidgetVisualViewport` recibe la selección visual y usa anchura base
  `layout.w` únicamente para Endurance Redline. Los otros renderers conservan
  la geometría actual de 520 px escalados.
- El inspector reconoce el ajuste efectivo de Redline mediante las utilidades
  visuales existentes, bloquea únicamente check/orden de los anclajes y calcula
  localmente la anchura recomendada. No modifica `layout.w`.

## Grafo de dependencias

```text
T1 contrato ViewModel ──> T2 fila Redline ──> T4 hook motion
           │                      │                   │
           └────────> T3 viewport fluido ────────────┤
                                                      v
                                                T5 inspector
                                                       │
                                                       v
                                             T6 evidencia visual
                                                       │
                                                       v
                                             T7 cierre documental
```

Cada tarea empieza con un test que falla por el comportamiento actual y termina
con un commit pequeño. No se avanza si su gate focal no pasa.

## T1 — Contrato aditivo para anclajes antiguos

Archivos (4):

- `frontend/src/overlay/widget-types/standings/standings-view-model.ts`
- `frontend/src/overlay/widget-types/standings/standings-view-model-v2.ts`
- `frontend/src/overlay/widget-types/standings/standings-view-model.test.ts`
- `frontend/src/overlay/widget-types/standings/standings-domain-free.test.ts`

Pasos:

1. Escribir regresiones V1 y V2 con Piloto desactivado.
2. Comprobar primero que falta el nombre estable.
3. Añadir solo `configuredDriverName` en estados ready y no disponibles, sin
   alterar `columns` ni los valores existentes.
4. Verificar que V2 sigue presentando solo datos autorizados por Go.

Aceptación: el campo aditivo sobrevive a perfiles antiguos; los assertions
previos del ViewModel y la paridad de valores mostrados siguen pasando.

Gate:

```powershell
pnpm --dir frontend test -- src/overlay/widget-types/standings/standings-view-model.test.ts src/overlay/widget-types/standings/standings-domain-free.test.ts
```

## T2 — Fila Redline configurable y fantasma único

Archivos (3):

- `frontend/src/overlay/design-systems/vantare-endurance/standings/StandingsRedlineTemplate.tsx`
- `frontend/src/overlay/design-systems/vantare-endurance/standings/StandingsRedlineTemplate.test.tsx` (nuevo)
- `frontend/src/overlay/design-systems/vantare-endurance/tokens.css`

Pasos:

1. Caracterizar el DOM Redline predeterminado antes de cambiarlo.
2. Añadir tests de visibilidad, orden, SM/MD/LG, alineación, valores ausentes y
   anclajes desactivados en documentos antiguos.
3. Sustituir las cinco celdas hardcodeadas por anclajes fijos, delta y map de
   métricas flexibles. Usar `minmax(preset, 1fr)` para Piloto. Conservar best
   lap, presión, PIT como estado permanente y goma.
4. Hacer que retiro llame a la misma función de fila con modo ghost; no mantener
   una segunda maqueta.
5. Definir tracks inline y dejar en CSS solo estilos semánticos y de motion.

Aceptación: cada métrica habilitada aparece una vez y en orden; cada desactivada
desaparece; el preset y la alineación son observables; el DOM base conserva
líder, jugador, clase, slots, keys y `data-standings-row`; ghost y fila viva
comparten columnas.

Gate:

```powershell
pnpm --dir frontend test -- src/overlay/design-systems/vantare-endurance/standings/StandingsRedlineTemplate.test.tsx src/overlay/design-systems/vantare-endurance/contract.test.tsx
```

## T3 — Anchura CSS real únicamente para Redline

### T3a — Contrato del viewport

Archivos (2):

- `frontend/src/overlay/core/WidgetVisualViewport.tsx`
- `frontend/src/overlay/core/WidgetVisualViewport.test.tsx` (nuevo)

Pasos:

1. Escribir un test que pruebe anchura base `layout.w` y escala 1 para
   `standings + vantare-endurance/standings-redline`.
2. Probar que Original, Crystal y otro template Endurance conservan 520 px y
   `scale(layout.w / 520)`.
3. Añadir una prop visual estrecha y resolver el template efectivo directamente
   en el viewport, sin registro, adaptador ni cambio de `resizeMode`.

Gate:

```powershell
pnpm --dir frontend test -- src/overlay/core/WidgetVisualViewport.test.tsx
```

### T3b — Paridad de superficies

Archivos (4):

- `frontend/src/hub/overlay-studio/canvas/StudioWidgetFrame.tsx`
- `frontend/src/overlay/runtime/RuntimeWidgetFrame.tsx`
- `frontend/src/overlay/edit/InPlaceWidgetEditFrame.tsx`
- `frontend/src/overlay/authoring/OverlayWorkshopDevRoute.tsx`

Pasos:

1. Pasar la misma selección visual al viewport en las cuatro superficies.
2. Añadir o actualizar los tests de superficie existentes solo donde una
   regresión no quede cubierta por el contrato T3a.

Aceptación: ensanchar concede espacio real a Redline en Studio, Desktop, OBS,
edición in-place y Workshop; ningún otro par visual cambia.

Gate:

```powershell
pnpm --dir frontend test -- src/overlay/core/WidgetVisualViewport.test.tsx src/overlay/core/WidgetVisualHost.v2.test.tsx src/hub/overlay-studio/canvas/widget-content-box.test.ts
```

## T4 — Compuertas semánticas en el hook existente

Archivos (2):

- `frontend/src/overlay/design-systems/vantare-endurance/standings/useStandingsMotion.ts`
- `frontend/src/overlay/design-systems/vantare-endurance/standings/useStandingsMotion.test.tsx`

Pasos:

1. Actualizar las factorías de test para declarar explícitamente sus columnas y
   añadir casos que oculten Gap, Mejor vuelta y Neumático.
2. Sin Gap, vaciar batalla y su estado de disolución; Intervalo no la sustituye.
3. No ejecutar vuelo/calentamiento de corona si Mejor vuelta está oculta, ni
   revelado de goma si Neumático está oculto. PIT conserva el estado de fila;
   solo su celda depende de visibilidad.
4. Mantener siempre FLIP, flash, delta, entrada y retiro, incluidos timers,
   cancelación y `prefers-reduced-motion` vigentes.

Aceptación: ocultar una métrica elimina solamente su señal visual; las
animaciones estructurales y sus duraciones no cambian.

Gate:

```powershell
pnpm --dir frontend test -- src/overlay/design-systems/vantare-endurance/standings/useStandingsMotion.test.tsx src/overlay/design-systems/vantare-endurance/standings/standings-motion.test.ts
```

## T5 — Inspector honesto, aviso de anchura e i18n atómicos

Archivos (7; excepción explícita porque separar locales deja claves ausentes u
huérfanas y rompe la auditoría i18n):

- `frontend/src/overlay/widget-types/standings/StandingsContentInspector.tsx`
- `frontend/src/hub/overlay-studio/orbit/StudioOrbitFeedback.test.tsx`
- `frontend/src/styles/orbit-studio.css`
- `frontend/src/i18n/locales/studio-orbit/es.ts`
- `frontend/src/i18n/locales/studio-orbit/en.ts`
- `frontend/src/i18n/locales/studio-orbit/pt.ts`
- `frontend/src/i18n/locales/studio-orbit/it.ts`

Pasos:

1. Añadir integración para Redline y controles equivalentes en Original.
2. Detectar el par visual directamente y sin importar el renderer Endurance.
3. En Redline, dejar activos ancho de ambos anclajes y alineación de Piloto;
   bloquear únicamente check y flechas, con explicación visible.
4. Sumar anclajes, delta, columnas flexibles, gaps y padding con
   `resolveColumnWidthPixels`; mostrar aviso si `layout.w` es inferior.
5. Verificar que el aviso desaparece al ensanchar y que nunca se emite un cambio
   de layout desde el inspector de contenido.
6. Añadir en el mismo corte las copias de anclaje y anchura recomendada en los
   cuatro catálogos; respetar los nombres Estrecha/Media/Ancha ya presentes en
   Nightly.

Aceptación: el usuario entiende qué está fijo y cuánto debe ensanchar; fuera de
Redline, checks, orden y ausencia del aviso conservan el comportamiento actual.

Gate:

```powershell
pnpm --dir frontend test -- src/hub/overlay-studio/orbit/StudioOrbitFeedback.test.tsx src/i18n/i18n-audit.test.ts
```

## T6 — Evidencia visual y de movimiento

Archivos previstos; se dividen en microcortes si hacen falta más de 5:

- `frontend/src/overlay/authoring/fixtures/authoring-fixtures.ts`
- `frontend/src/overlay/authoring/fixtures/animation-scenes.ts`
- `frontend/src/overlay/authoring/fixtures/animation-scenes.test.ts`
- `frontend/src/overlay/authoring/OverlayWorkshopDevRoute.test.tsx`
- `frontend/src/overlay/authoring/overlay-workshop-query.ts` y su test si se
  añaden variantes
- evidencia temporal en `frontend/.tmp/overlay-workshop-visual/`

Pasos:

1. Reutilizar primero las escenas Redline existentes.
2. Añadir únicamente los estados mínima y todas-las-métricas si no pueden
   expresarse mediante los parámetros actuales de Workshop.
3. Capturar reposo predeterminado, mínimo y ancho; reproducir adelantamiento,
   batalla, best lap, pit-out y retiro.
4. Ejecutar el protocolo estático con argumentos explícitos de Standings
   Endurance Redline; las secuencias se reproducen manualmente en `/workshop`.
5. Inspeccionar que no hay recorte, solape, saltos horizontales ni reinicio de
   animaciones al disolver batallas.

Aceptación: Workshop prueba paridad visual usando `WidgetVisualHost`; la entrega
separa esta evidencia de una prueba Wails/WebView2 real.

Gate:

```powershell
pnpm --dir frontend visual:overlay-workshop -- --widget=standings --system=vantare-endurance --design=standings-endurance-redline
```

Checkpoint humano: Isaac revisa las capturas y secuencias antes del cierre.

## T7 — Gates, roadmap y expediente vivo

Archivos (3):

- `docs/roadmap/plan.md`
- `docs/changelog/fragments/ISA-849.json` (nuevo)
- `docs/vantare-program/handoffs/overlays-launcher-hub.md`

Pasos:

1. Actualizar el hito público de Overlay Studio a lo que hace hoy, sin anunciar
   una promoción no ocurrida; regenerar el digest, nunca editar JSON a mano.
2. Registrar checks, evidencia, riesgos, commit, push, PR, CI y promoción reales
   en handoff e issue.
3. Revisar el diff completo contra la base exacta.

Gates finales:

```powershell
pnpm --dir frontend test -- src/overlay/widget-types/standings/standings-view-model.test.ts src/overlay/widget-types/standings/standings-domain-free.test.ts src/overlay/design-systems/vantare-endurance/standings/StandingsRedlineTemplate.test.tsx src/overlay/design-systems/vantare-endurance/standings/standings-motion.test.ts src/overlay/design-systems/vantare-endurance/standings/useStandingsMotion.test.tsx src/overlay/design-systems/vantare-endurance/contract.test.tsx src/hub/overlay-studio/orbit/StudioOrbitFeedback.test.tsx
pnpm --dir frontend test
pnpm --dir frontend typecheck
pnpm --dir frontend lint
pnpm --dir frontend build
pnpm --dir frontend visual:overlay-workshop
python ..\.github\scripts\roadmap_digest.py --repo .. --ref origin/nightly
git diff --check origin/nightly...HEAD
```

Prueba manual: seleccionar Endurance Redline en Studio; alternar, ordenar,
dimensionar y alinear las nueve métricas; ensanchar hasta retirar el aviso;
comparar con Original; reproducir todas las escenas en Workshop. Ejecutar Wails
real si existe sesión autorizada y registrar el bloqueo exacto si no.

## Stop conditions

Parar antes de ampliar si aparece cualquiera de estos casos:

- hace falta tocar otro template o renderer;
- el ViewModel aditivo altera el DOM de Original, Crystal u otro Endurance;
- se necesita cambiar altura/stride o transportar una señal nueva desde Go;
- el inspector exige redimensionar automáticamente;
- hacen falta más de cinco archivos en una tarea, una dependencia o una
  abstracción nueva;
- fallan pruebas por una causa no entendida o la evidencia visual no es
  verificable.

## Estado Git al completar IMPLEMENT

- Rama: `vantareapp/isa-849-standings-redline-columnas`
- Base actual tras rebase: `origin/nightly@c1d4dfa4bcd233df3ea4e15aaa5cc23aeef31e9b`
- Spec y plan aprobados; commits documentales reescritos por el rebase.
- Implementación: T1–T6 completadas y commiteadas; T7 documentado en la rama.
- Push, PR, CI, merge, promoción y release: no realizados.
- Dependencia de integración: PR draft #795/ISA-799 toca la habilitación motion
  de `StandingsRedlineTemplate.tsx`; no se incorpora ni se duplica en ISA-849.
