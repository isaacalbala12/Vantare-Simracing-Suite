# Plan de implementación: columnas configurables en Standings Redline

Estado: PLAN/TASKS SDD pendiente de revisión de Isaac. Issue: ISA-849.

## Resultado buscado

`standings-redline` respetará visibilidad, orden, anchura y alineación de sus
nueve métricas flexibles. Posición y Piloto seguirán visibles como anclajes. El
diseño predeterminado, la altura de 30 px y el motor de movimiento conservarán
su comportamiento. Los demás renderizadores no cambiarán.

## Arquitectura mínima

- Los builders V1 y V2 añaden dos datos de presentación aditivos al ViewModel:
  `configuredColumns`, con la configuración completa, y
  `configuredDriverName`, con el nombre formateado aunque Piloto estuviera
  desactivado en un documento antiguo. `columns` y los campos actuales no
  cambian, por lo que los demás renderizadores continúan viendo el contrato
  vigente.
- `StandingsRedlineTemplate.tsx` filtra y recorre esas columnas directamente.
  Un componente local pequeño resuelve las celdas especiales; no se crea una
  capa de adaptación ni una API reutilizable prematura.
- Cada fila define sus tracks con los píxeles canónicos de
  `resolveColumnWidthPixels`. CSS conserva color, tipografía, altura y motion.
- `deriveBattlePairs` acepta explícitamente la fuente `gap` o `interval`; el
  hook elige una fuente solo cuando está visible y compuerta corona, PIT y
  neumático con la misma configuración.
- El inspector reconoce el ajuste efectivo de Redline mediante las utilidades
  visuales existentes, bloquea únicamente check/orden de los anclajes y calcula
  localmente la anchura recomendada. No modifica `layout.w`.

## Grafo de dependencias

```text
T1 contrato ViewModel ──> T2 fila Redline ──> T3 motor puro ──> T4 hook motion
                                  │                                  │
                                  └──────────────> T5 inspector <────┘
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

1. Escribir regresiones V1 y V2 con Posición/Piloto desactivados.
2. Comprobar primero que faltan configuración completa y nombre estable.
3. Añadir `configuredColumns` y `configuredDriverName` en estados ready y no
   disponibles, sin alterar `columns` ni los valores existentes.
4. Verificar que V2 sigue presentando solo datos autorizados por Go.

Aceptación: los campos aditivos sobreviven a perfiles antiguos; los assertions
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
   métricas flexibles. Conservar tratamientos de best lap, presión, PIT y goma.
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

## T3 — Fuente de batalla Gap o Intervalo

Archivos (2):

- `frontend/src/overlay/design-systems/vantare-endurance/standings/standings-motion.ts`
- `frontend/src/overlay/design-systems/vantare-endurance/standings/standings-motion.test.ts`

Pasos:

1. Añadir tests para batalla con Gap y con Intervalo directo.
2. Mantener las pruebas de carrera, boxes, proximidad al jugador, desempate
   estable y máximo de una pareja.
3. Añadir un parámetro estrecho de fuente a `deriveBattlePairs`; con Intervalo
   se lee el intervalo publicado de la fila perseguidora y no se reconstruye
   aritmética de dominio.

Aceptación: ambas fuentes producen el mismo contrato `BattlePair`; no hay
batalla con señal ausente, fuera de carrera o en boxes.

Gate:

```powershell
pnpm --dir frontend test -- src/overlay/design-systems/vantare-endurance/standings/standings-motion.test.ts
```

## T4 — Compuertas semánticas en el hook existente

Archivos (2):

- `frontend/src/overlay/design-systems/vantare-endurance/standings/useStandingsMotion.ts`
- `frontend/src/overlay/design-systems/vantare-endurance/standings/useStandingsMotion.test.tsx`

Pasos:

1. Añadir tests que oculten de forma independiente Gap/Intervalo, Mejor vuelta,
   PIT y Neumático.
2. Elegir Gap, o Intervalo si Gap no está visible; sin ambas, vaciar batalla y
   su estado de disolución.
3. No ejecutar vuelo/calentamiento de corona si Mejor vuelta está oculta, ni
   revelado de goma si Neumático está oculto. PIT solo altera la celda si su
   métrica está visible.
4. Mantener siempre FLIP, flash, delta, entrada y retiro, incluidos timers,
   cancelación y `prefers-reduced-motion` vigentes.

Aceptación: ocultar una métrica elimina solamente su señal visual; las
animaciones estructurales y sus duraciones no cambian.

Gate:

```powershell
pnpm --dir frontend test -- src/overlay/design-systems/vantare-endurance/standings/useStandingsMotion.test.tsx src/overlay/design-systems/vantare-endurance/standings/standings-motion.test.ts
```

## T5 — Inspector honesto y aviso de anchura

Archivos (4):

- `frontend/src/overlay/widget-types/standings/StandingsContentInspector.tsx`
- `frontend/src/hub/overlay-studio/orbit/StudioOrbitFeedback.test.tsx`
- `frontend/src/styles/orbit-studio.css`
- `frontend/src/overlay/core/widget-visual-settings.ts` (solo consumo; modificar
  únicamente si una prueba demuestra que falta una lectura pública segura)

Pasos:

1. Añadir integración para Redline y controles equivalentes en Original.
2. Resolver los settings efectivos con la utilidad existente y detectar solo
   `vantare-endurance/standings-redline`.
3. En Redline, dejar activos ancho de ambos anclajes y alineación de Piloto;
   bloquear únicamente check y flechas, con explicación visible.
4. Sumar anclajes, delta, columnas flexibles, gaps y padding con
   `resolveColumnWidthPixels`; mostrar aviso si `layout.w` es inferior.
5. Verificar que el aviso desaparece al ensanchar y que nunca se emite un cambio
   de layout desde el inspector de contenido.

Aceptación: el usuario entiende qué está fijo y cuánto debe ensanchar; fuera de
Redline, checks, orden y ausencia del aviso conservan el comportamiento actual.

Gate:

```powershell
pnpm --dir frontend test -- src/hub/overlay-studio/orbit/StudioOrbitFeedback.test.tsx
```

## T5b — Copia traducida del inspector

Archivos (4):

- `frontend/src/i18n/locales/studio-orbit/es.ts`
- `frontend/src/i18n/locales/studio-orbit/en.ts`
- `frontend/src/i18n/locales/studio-orbit/pt.ts`
- `frontend/src/i18n/locales/studio-orbit/it.ts`

Pasos:

1. Añadir las mismas claves para anclaje fijo y anchura recomendada.
2. Ejecutar el test de paridad de catálogos i18n que descubra el repo.

Aceptación: ninguna copia productiva queda hardcodeada y los cuatro catálogos
mantienen las mismas claves.

Gate:

```powershell
pnpm --dir frontend test -- src/i18n
```

## T6 — Evidencia visual y de movimiento

Archivos previstos, máximo 5 y solo si el harness necesita escenarios nuevos:

- `frontend/src/overlay/authoring/fixtures/authoring-fixtures.ts`
- `frontend/src/overlay/authoring/fixtures/animation-scenes.ts`
- `frontend/src/overlay/authoring/fixtures/animation-scenes.test.ts`
- `frontend/src/overlay/authoring/OverlayWorkshopDevRoute.test.tsx`
- evidencia bajo la ruta canónica ya usada por Workshop

Pasos:

1. Reutilizar primero las escenas Redline existentes.
2. Añadir únicamente los estados mínima y todas-las-métricas si no pueden
   expresarse mediante los parámetros actuales de Workshop.
3. Capturar reposo predeterminado, mínimo y ancho; reproducir adelantamiento,
   batalla, best lap, pit-out y retiro.
4. Inspeccionar que no hay recorte, solape, saltos horizontales ni reinicio de
   animaciones al disolver batallas.

Aceptación: Workshop prueba paridad visual usando `WidgetVisualHost`; la entrega
separa esta evidencia de una prueba Wails/WebView2 real.

Gate:

```powershell
pnpm --dir frontend visual:overlay-workshop
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
python .github/scripts/roadmap_digest.py --repo . --ref origin/nightly
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

## Estado Git al redactar

- Rama: `vantareapp/isa-849-standings-redline-columnas`
- Base: `origin/nightly@8a90c3a7837166ffec6943c839f7cb31cbf11b31`
- Spec aprobada: `55b732a146856d31bbec496c3f4614ef144c7e77`
- Implementación: no iniciada.
- Push, PR, CI, merge, promoción y release: no realizados.
