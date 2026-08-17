# Spec: Fase 2 ΓÇö Inspector flotante en el modo edici├│n in-place del overlay

**Fecha:** 2026-08-16
**Estado:** ACCEPTED - implementada en rama vantareapp/isa-402-fase2-inspector-flotante (cortes 1-6 completos, gates PASS, pendiente de revision de Isaac y promocion)
**Rama de documentaci├│n:** `vantareapp/overlay-inplace-edit-fase2-spec`
**Base documental:** `origin/nightly@3be8a307`
**Dependencias:** Fase 1 integrada en `nightly@77c2f648` mediante PR #267; ADR 0003; `StudioProvider`; `StudioProfileService.SaveInPlace`; preview imperativa de drag/resize.
**Ejecuci├│n:** seis cortes secuenciales en un ├║nico worktree. No se permite ejecutar agentes en paralelo sobre la misma rama o worktree.
**Linear:** sin issue por decisi├│n expresa del propietario el 2026-08-16.

## 1. Objetivo y alcance

### 1.1 Objetivo

Extender el modo edici├│n in-place del overlay desktop, activado con `Ctrl+Shift+E`, para que el usuario pueda editar el contenido, la apariencia y el comportamiento del widget seleccionado mediante un panel flotante sobre el juego.

La edici├│n debe:

- usar los datos reales de telemetr├¡a del overlay;
- reutilizar el store, comandos, permisos y secciones de Overlay Studio V3;
- conservar una ├║nica fuente de verdad documental;
- guardar sin recrear la ventana;
- mantener intacta la preview imperativa de drag/resize de la Fase 1;
- producir el mismo resultado que editar esas propiedades en el Hub.

Caso representativo:

1. El usuario abre su overlay sobre Le Mans Ultimate.
2. Pulsa `Ctrl+Shift+E`.
3. Selecciona Standings.
4. Desde el panel modifica columnas, apariencia y `updateHz`.
5. Los cambios aparecen en vivo y se guardan autom├íticamente.
6. Al abrir el mismo perfil en Overlay Studio, los cambios persisten.

### 1.2 Dentro de alcance

- Panel flotante en el modo edici├│n del overlay.
- Selecci├│n del widget ya proporcionada por la Fase 1.
- Secciones `content`, `appearance` y `behavior`.
- Una sesi├│n documental gestionada por `StudioProvider`.
- Undo/redo mediante botones visibles.
- Autosave para layout y propiedades.
- Debounce aproximado de 300 ms para comandos de propiedades.
- Guardado inmediato al finalizar drag/resize.
- Una sola petici├│n de guardado en vuelo y coalescing de cambios posteriores.
- Revisi├│n optimista mediante `expectedRevision`.
- Pausa visible ante conflicto o error.
- Retry expl├¡cito para errores sin conflicto.
- Recarga expl├¡cita de la versi├│n vigente ante conflicto.
- Pol├¡tica de acceso id├⌐ntica al Hub.
- Idioma seleccionado por el usuario.
- Chip que indique el layout realmente editado.
- Panel colapsable, no arrastrable.
- Telemetr├¡a del panel limitada aproximadamente a 5 Hz.
- Caracterizaci├│n expl├¡cita de `InPlaceWidgetEditFrame` como consumidor de `WidgetVisualHost`.

### 1.3 Fuera de alcance

- Sustituir Overlay Studio V3.
- Galer├¡a o selecci├│n de dise├▒os.
- Secci├│n `design`.
- Layout num├⌐rico.
- Delete, duplicate, center, reset o z-order.
- Secci├│n `actions`.
- Panel arrastrable.
- Atajos globales de undo/redo.
- `Ctrl+Y`.
- Cambios en OBS.
- Cambios en el schema V3.
- Cambios en telemetr├¡a, Shared Memory, SSE o proyecciones.
- Renderizadores nuevos o alternativos.
- DSL, scaffolder o compilador visual.
- Recuperaci├│n compartida entre ventanas.
- Rebase autom├ítico de dos documentos editados simult├íneamente.
- Dependencias nuevas.

## 2. Contexto t├⌐cnico

### 2.1 Fase 1 existente

| Pieza | Ruta | Responsabilidad |
|---|---|---|
| `handleToggleEditMode` | `cmd/vantare/main.go` | Alterna `ModeRacing` y `ModeEdit` |
| `StudioProfileService.SaveInPlace` | `internal/app/studio_profile_service.go` | Guarda sin recrear la ventana |
| `CompositeApp` | `frontend/src/overlay/CompositeApp.tsx` | Selecciona runtime o modo edici├│n |
| `InPlaceEditOverlay` | `frontend/src/overlay/edit/InPlaceEditOverlay.tsx` | Escena, selecci├│n, layout resuelto y guardado |
| `InPlaceWidgetEditFrame` | `frontend/src/overlay/edit/InPlaceWidgetEditFrame.tsx` | Frame, chrome, handles y `WidgetVisualHost` |
| `useInplaceInteraction` | `frontend/src/overlay/edit/use-inplace-interaction.ts` | Drag/resize, snap, gu├¡as y commit ├║nico |
| `inplace-frame-preview` | `frontend/src/overlay/edit/inplace-frame-preview.ts` | Cache y escritura DOM imperativa |

Actualmente `InPlaceEditOverlay` conserva `document` y `revision` en estado React local. Al terminar un gesto aplica un `widget/layout` mediante `applyStudioCommand` y emite directamente:

```text
overlay:edit-layout:save
  ΓåÆ StudioProfileService.SaveInPlace
  ΓåÆ studio:profile:saved | conflict | error
```

La Fase 2 elimina ese segundo store documental: el documento editable pasa a vivir exclusivamente en `StudioProvider`.

### 2.2 Capacidades reutilizadas de Studio V3

| Pieza | Ruta |
|---|---|
| Store y contexto | `frontend/src/hub/overlay-studio/state/studio-store.tsx` |
| Comandos puros | `frontend/src/hub/overlay-studio/state/studio-command.ts` |
| Historia | `frontend/src/hub/overlay-studio/state/studio-history.ts` |
| Cliente de perfil | `frontend/src/hub/overlay-studio/state/studio-profile-client.ts` |
| Permisos | `frontend/src/hub/overlay-studio/access/studio-access.ts` |
| Content | `frontend/src/hub/overlay-studio/inspector/ContentSection.tsx` |
| Appearance | `frontend/src/hub/overlay-studio/inspector/AppearanceSection.tsx` |
| Behavior | `frontend/src/hub/overlay-studio/inspector/BehaviorSection.tsx` |
| Inspector del Hub | `frontend/src/hub/overlay-studio/inspector/StudioInspector.tsx` |
| Telemetr├¡a del Studio | `frontend/src/hub/overlay-studio/canvas/StudioTelemetryProvider.tsx` |
| Host visual | `frontend/src/overlay/core/WidgetVisualHost.tsx` |

### 2.3 Hallazgos que condicionan el dise├▒o

1. `applyStudioCommand` materializa un layout de sesi├│n inexistente mediante `withSessionLayout`. Un comando enviado con `session: "race"` puede crear `layouts.race` copiando `general`.
2. `resolveRuntimeLayout` ya conoce si el layout mostrado es uno espec├¡fico o el fallback `general`. Todos los comandos in-place deben usar su `layout.type`, no la sesi├│n bruta de telemetr├¡a.
3. `StudioProvider` puede montarse fuera del Hub con un `StudioProfileClient`, `access` y `recoveryStorage`.
4. `client.save()` usa por defecto `studio:profile:save`, cuyo backend recrea la ventana. El overlay debe usar siempre `overlay:edit-layout:save`.
5. La carga del store puede normalizar configuraciones visuales y arrancar con `dirty=true`. Observar `dirty` como trigger de autosave guardar├¡a el perfil al abrirlo sin que el usuario hubiese ejecutado un comando.
6. El `save()` actual puede reemplazar `history.present` con la respuesta de una petici├│n antigua y perder una edici├│n posterior.
7. `StudioInspector` no es reutilizable directamente porque consume `useStudioDocument`, `useStudioTelemetrySnapshot` y `createWailsWidgetDesignClient`.
8. `ContentSection`, `AppearanceSection` y `BehaviorSection` s├¡ son reutilizables mediante props.
9. Sin `access` expl├¡cito, `StudioProvider` usa `DEFAULT_STUDIO_ACCESS`, equivalente a Free.
10. La rama del overlay no est├í bajo `LicenseProvider` ni bajo un `I18nProvider` real.
11. El recovery del Hub comparte origin con el overlay. La Fase 2 no debe crear borradores visibles desde la otra ventana.
12. `InPlaceEditOverlay` resuelve visibilidad a 15 Hz. El panel no necesita reconstruirse a esa frecuencia.
13. El guard positivo de `WidgetVisualHost` todav├¡a no incluye `InPlaceWidgetEditFrame`. En esta base, `OverlayParityHarness` tambi├⌐n consume el Host pero no figura en la matriz positiva; el corte de caracterizaci├│n debe alinear la lista con los consumidores reales.

## 3. Arquitectura propuesta

### 3.1 Decisi├│n principal

Se reutiliza `StudioProvider` en la ventana del overlay.

No se mantiene el `useState<ProfileDocumentV3>` documental de la Fase 1 y no se crea un segundo reducer. El store conserva documento presente, documento guardado, revisi├│n, dirty, permisos, undo/redo, selecci├│n y estado de guardado.

`InPlaceEditOverlay` conserva ├║nicamente responsabilidades visuales y de interacci├│n: resolver el layout runtime, dibujar la escena, congelar telemetr├¡a durante gestos, seleccionar widgets, iniciar drag/resize y mostrar el panel y estados visuales.

### 3.2 Montaje

```text
CompositeApp
ΓööΓöÇΓöÇ rama editMode
    ΓööΓöÇΓöÇ I18nProvider
        ΓööΓöÇΓöÇ LicenseProvider
            ΓööΓöÇΓöÇ InPlaceEditModeBranch
                ΓööΓöÇΓöÇ InPlaceEditOverlay
                    ΓööΓöÇΓöÇ StudioProvider
                        ΓööΓöÇΓöÇ InPlaceEditOverlayContent
                            Γö£ΓöÇΓöÇ escena l├│gica escalada
                            Γöé   ΓööΓöÇΓöÇ InPlaceWidgetEditFrame[]
                            Γöé       ΓööΓöÇΓöÇ WidgetVisualHost
                            Γö£ΓöÇΓöÇ gu├¡as de snap
                            Γö£ΓöÇΓöÇ chip EDIT MODE + layout activo
                            Γö£ΓöÇΓöÇ InPlaceInspectorPanel (fixed)
                            Γöé   ΓööΓöÇΓöÇ WidgetPropertyInspectorView
                            ΓööΓöÇΓöÇ useInplaceAutosave
```

`CompositeApp` nunca monta `StudioProvider` para el runtime normal. `LicenseProvider` e `I18nProvider` se incorporan a la rama de edici├│n mediante `frontend/src/overlay/edit/InPlaceEditModeBranch.tsx`.

### 3.3 Sesi├│n ├║nica con `InPlaceProfileClient`

Se crea `frontend/src/overlay/edit/inplace-profile-client.ts`.

```ts
export type InPlaceProfileClientInput = {
  document: ProfileDocumentV3;
  revision: string;
  transport: StudioEventTransport;
};

export function createInPlaceProfileClient(
  input: InPlaceProfileClientInput,
): StudioProfileClient;
```

Contrato:

- `load(file)` ignora el nombre l├│gico y devuelve una copia del documento y revisi├│n recibidos por `CompositeApp`.
- `save(input)` reutiliza la correlaci├│n y timeout de `StudioProfileClient`.
- Cada save genera un `requestId` distinto.
- Emite exclusivamente `overlay:edit-layout:save`.
- Escucha `studio:profile:saved`, `studio:profile:conflict` y `studio:profile:error`.
- Ignora respuestas con otro `requestId`.
- Libera listeners despu├⌐s de respuesta o timeout.
- Nunca emite `studio:profile:save`.

`createStudioProfileClient` admite:

```ts
export type StudioProfileClientOptions = {
  saveRequestEvent?: string;
};
```

Su valor por defecto contin├║a siendo `studio:profile:save`. El cliente in-place usa `overlay:edit-layout:save`, conservando sin cambios el comportamiento del Hub.

### 3.4 Store y resultado de mutaciones

Para distinguir comandos aceptados de `dirty` producido durante la carga, el contexto del store devuelve si una operaci├│n cre├│ historia:

```ts
dispatch(command: StudioCommand): boolean;
undo(): boolean;
redo(): boolean;
```

Resultado:

- `true`: se produjo una nueva versi├│n de `history.present`;
- `false`: store no cargado, comando sin efecto, acceso denegado o historia no disponible.

Los consumidores actuales pueden ignorar el retorno sin cambiar su comportamiento.

### 3.5 Hardening de guardado

Cada llamada a `save()` captura el documento y revisi├│n actuales. Cuando llega una respuesta satisfactoria:

- `history.saved` se actualiza con `result.document`;
- `revision` pasa a `result.revision`;
- `history.present` se conserva tal como exista al resolver la petici├│n;
- si `present !== saved`, `dirty` permanece `true`;
- no se vac├¡an `past` ni `future`;
- una edici├│n B realizada mientras A estaba en vuelo no desaparece.

Invariante:

```text
guardar A
ΓåÆ editar B mientras A est├í en vuelo
ΓåÆ resolver A
= saved A + present B + dirty true + revision nueva
```

El siguiente guardado debe enviar B con la revisi├│n recibida al guardar A.

### 3.6 Autosave por comandos

Se crea `frontend/src/overlay/edit/use-inplace-autosave.ts`.

```ts
export type InPlaceAutosavePause = "error" | "conflict" | null;

export type InPlaceAutosaveController = {
  dispatch(command: StudioCommand): boolean;
  undo(): boolean;
  redo(): boolean;
  retry(): void;
  paused: InPlaceAutosavePause;
  pending: boolean;
};

export function useInplaceAutosave(input: {
  dispatch(command: StudioCommand): boolean;
  undo(): boolean;
  redo(): boolean;
  save(): Promise<StudioSaveResult>;
  interactionActive: boolean;
  debounceMs?: number;
}): InPlaceAutosaveController;
```

| Mutaci├│n aceptada | Espera |
|---|---:|
| `widget/layout` | inmediata |
| `widget/content` | 300 ms |
| `widget/visual` | 300 ms |
| `widget/behavior` | 300 ms |
| undo | inmediata |
| redo | inmediata |

Reglas:

1. No observa `dirty` para iniciar el primer guardado.
2. Solo un save puede estar en vuelo.
3. Cambios aceptados mientras hay un save se coalescen.
4. Al terminar el save en vuelo, si existen cambios pendientes se guarda el documento m├ís reciente con la nueva revisi├│n.
5. Un comando denegado o no-op no programa save.
6. Durante drag/resize el inspector, undo y redo est├ín deshabilitados.
7. Un error conserva `history.present`, pausa el autosave y muestra Retry.
8. Retry se permite para `status: "error"`.
9. Un conflicto conserva `history.present`, pausa el autosave y exige recarga expl├¡cita.
10. Nunca se reintenta autom├íticamente una revisi├│n conflictiva.

### 3.7 Conflicto y recarga

El cliente in-place carga inicialmente desde memoria y el payload de conflicto no contiene el documento o revisi├│n vigentes. Por tanto, no existe un retry seguro de conflicto dentro de esta fase.

Decisi├│n:

- `error`: bot├│n Retry.
- `conflict`: bot├│n "Recargar versi├│n actual".
- La recarga emite `overlay:profile-v3:get`.
- `CompositeApp` recibe un nuevo `overlay:profile-v3-loaded`.
- El nuevo documento/revisi├│n remonta la sesi├│n in-place.
- La UI debe explicar que la recarga reemplaza el borrador local.
- Nunca se repite `expectedRevision` despu├⌐s de un conflicto.

No se implementa rebase autom├ítico.

### 3.8 Inspector compartido

Se crea `frontend/src/hub/overlay-studio/inspector/WidgetPropertyInspectorView.tsx`.

Se elige una vista de una sola secci├│n, en vez de extraer el inspector completo, para evitar arrastrar al overlay las dependencias de design, layout y actions.

```ts
export type WidgetPropertySectionId =
  | "appearance"
  | "content"
  | "behavior";

export type WidgetPropertyInspectorViewProps = {
  sectionId: WidgetPropertySectionId;
  widget: WidgetInstanceV3;
  session: SessionLayoutType;
  snapshot: TelemetrySnapshot;
  access: AccessContext;
  disabled?: boolean;
  dispatch(command: StudioCommand): void;
};
```

Responsabilidades:

- Seleccionar la secci├│n prop-driven.
- Aplicar `getStudioMutationGate` con `visual`, `content` o `behavior`.
- Deshabilitar controles si la licencia carga, el acceso lo deniega, hay un gesto activo o el autosave est├í pausado.
- Envolver controles con `fieldset disabled` y evitar dispatch program├ítico si est├í bloqueado.
- Reutilizar `ContentSection`, `AppearanceSection` y `BehaviorSection`.
- No consumir contexts del Studio, telemetr├¡a o Wails.

`StudioInspector.tsx` permanece como adaptador del Hub. Para appearance, content y behavior delega en `WidgetPropertyInspectorView`; design, layout y actions permanecen como est├ín.

### 3.9 Panel flotante

Se crea:

```text
frontend/src/overlay/edit/InPlaceInspectorPanel.tsx
frontend/src/overlay/edit/inplace-edit.css
```

Contrato visual:

```css
position: fixed;
top: 16px;
right: 16px;
z-index: 5100;
pointer-events: auto;
max-height: calc(100vh - 32px);
```

El panel:

- es hermano de la escena escalada;
- nunca est├í dentro del contenedor transformado con `scale`;
- detiene `pointerdown`, `click`, `dblclick` y `contextmenu`;
- no inicia selecci├│n, drag ni resize;
- es colapsable, no arrastrable;
- presenta estado de dirty/save/error/conflict;
- presenta botones Undo y Redo;
- no registra listeners globales de teclado;
- recibe un snapshot propio mediante `useRateLimitedTelemetry(telemetry, 5)`;
- est├í memoizado;
- muestra solo appearance, content y behavior;
- no presenta reset de secci├│n;
- presenta un estado vac├¡o si no hay widget seleccionado.

### 3.10 Permisos

La rama edit se monta bajo `LicenseProvider`. `InPlaceEditModeBranch` consume `useLicense` y `useAccess`.

`StudioProvider` recibe siempre acceso expl├¡cito y:

```tsx
recoveryStorage={null}
```

Mientras la licencia carga:

- drag/resize de layout puede seguir disponible;
- content, appearance, behavior, undo y redo permanecen deshabilitados;
- el panel muestra "Comprobando acceso".

### 3.11 Sesi├│n pineada

```ts
const resolvedLayout = resolveRuntimeLayout(document, runtimeSnapshot);
const editingSession = resolvedLayout.type;
```

`editingSession` es la ├║nica sesi├│n v├ílida para comandos in-place.

Reglas:

1. No usar `mapTelemetrySessionToLayoutType` como sesi├│n de escritura.
2. Si la telemetr├¡a indica race pero el perfil usa fallback general, se edita `general`.
3. Si existe un layout race y es el resuelto, se edita `race`.
4. El panel recibe `editingSession`.
5. Pointerdown copia `editingSession` en la sesi├│n del gesto.
6. La sesi├│n del gesto no cambia hasta pointerup/cancel.
7. El chip muestra `studio.v3.session.<editingSession>`.
8. Si cambia el layout resuelto fuera de un gesto, se limpia una selecci├│n que no exista en el nuevo layout.

### 3.12 i18n

La rama edit se monta bajo `I18nProvider`, que hereda `localStorage["vantare.locale"]`.

Se a├▒aden claves `overlay.editMode.panel.*` en los cuatro locales para t├¡tulo, estado vac├¡o, contraer/expandir, layout editado, undo/redo, licencia, retry, reload, error y conflict.

### 3.13 Recovery

La instancia del overlay usa `recoveryStorage={null}`. No escribe en localStorage ni sessionStorage. Los cambios pendientes permanecen en `history.present` mientras la ventana siga abierta.

### 3.14 Guard de `WidgetVisualHost`

`frontend/src/overlay/core/overlay-workshop-characterization.test.ts` debe incluir expl├¡citamente `overlay/edit/InPlaceWidgetEditFrame.tsx` y caracterizar `overlay-harness/OverlayParityHarness.tsx` si contin├║a siendo consumidor directo.

## 4. Contrato normativo de preview imperativa bajo el store

Este contrato es P1 bloqueante.

### Invariante 1 ΓÇö Dos planos de estado

```text
Persistente:
StudioProvider.history.present ΓåÆ widget.layout

Transitorio:
interactionRef + preview cache + DOM imperativo
```

### Invariante 2 ΓÇö `resolveLayout`

`resolveLayout(widget)` devuelve siempre `widget.layout`. Nunca devuelve preview, cache o geometr├¡a almacenada en React state.

### Invariante 3 ΓÇö Sesi├│n de gesto congelada

En pointerdown se copian `widgetId`, `layout.type`, `widget.layout`, snapshot actual, viewport, escala, rect de escena, origen del puntero y handle de resize. Estos valores no cambian por un render del provider.

### Invariante 4 ΓÇö Pointermove sin store

Pointermove solo puede modificar `interactionRef.preview`, cache, estilos DOM y gu├¡as. Est├í prohibido hacer dispatch, modificar historia, marcar dirty o iniciar autosave.

### Invariante 5 ΓÇö Reaplicaci├│n tras render

Mientras `previewActive`, move conserva el rect inicial y aplica translate imperativo; resize usa la preview almacenada; `InPlaceWidgetEditFrame` reaplica la cache en `useLayoutEffect`.

### Invariante 6 ΓÇö Snapshot congelado

Se usa un `snapshotDuringInteractionRef` que se actualiza solo mientras la interacci├│n est├í idle. No se congela como efecto colateral de seleccionar un widget.

### Invariante 7 ΓÇö Cierre transaccional

- Pointerup produce exactamente un `widget/layout`.
- El comando usa el `layout.type` congelado.
- Autosave ocurre despu├⌐s del comando.
- Escape y `lostpointercapture` producen cero comandos.
- Undo, redo e inspector est├ín deshabilitados durante el gesto.
- Una respuesta de autosave puede renderizar, pero nunca reemplazar `history.present`.

### Gate P1

Test obligatorio:

```text
keeps imperative preview and frozen telemetry across StudioProvider rerenders during drag
```

Secuencia:

1. Montar `StudioProvider` real con cliente controlado.
2. Publicar snapshot A.
3. Partir de widget `x=100`.
4. Comenzar drag y mover preview a `x=144`.
5. Durante el gesto publicar snapshot B y ejecutar un comando no geom├⌐trico.
6. Verificar DOM visual en 144, `resolveLayout` en 100, documento en 100, visual usando A y cero comandos de layout.
7. Pointerup.
8. Verificar un ├║nico `widget/layout`, documento en 144, comando no geom├⌐trico conservado, save serializado y snapshot B visible.

## 5. Boundaries

### Always

- Verificar ra├¡z, rama, HEAD, base y worktree limpio.
- Ejecutar los seis cortes en orden.
- Usar TDD.
- Mantener un solo documento editable.
- Usar `layout.type` resuelto para cada comando.
- Usar `overlay:edit-layout:save`.
- Correlacionar eventos por requestId.
- Preservar `history.present` ante respuestas tard├¡as.
- Conservar preview imperativa y snapshot congelado.
- Aplicar acceso real antes de habilitar propiedades.
- Mantener `recoveryStorage={null}`.
- Ejecutar checks focales y completos.
- Actualizar spec, handoff y `current-plan`.

### Ask first

- Cambiar el canal Go de `SaveInPlace`.
- Cambiar schema o contratos de perfil.
- A├▒adir dependencias.
- Mover directorios completos del Studio.
- Cambiar la pol├¡tica comercial.
- A├▒adir recuperaci├│n entre ventanas.
- Incorporar atajos globales.
- Ampliar el panel con design, layout o actions.
- Tocar CI, releases o canales de promoci├│n.

### Never

- Emitir `studio:profile:save` desde el overlay.
- Montar `StudioInspector` directamente.
- Montar `StudioTelemetryProvider` en el overlay.
- Usar telemetr├¡a mock.
- Duplicar `applyStudioCommand` o las secciones.
- A├▒adir un renderer.
- Acceder a `Renderer` fuera de `WidgetVisualHost`.
- Pasar geometr├¡a transitoria por React state.
- Autosave basado solo en `dirty`.
- Reintentar autom├íticamente una revisi├│n conflictiva.
- Escribir recovery compartido.
- Interceptar hotkeys globales de historia.
- Tocar OBS, telemetr├¡a, schema o renderers.
- Ejecutar dos agentes sobre el mismo worktree.

## 6. Success criteria

1. `Ctrl+Shift+E` abre el modo edici├│n con idioma y acceso reales.
2. El panel aparece fuera de la escena escalada y solo ofrece content, appearance y behavior.
3. Standings permite modificar columnas, apariencia y `updateHz` con telemetr├¡a live.
4. Todos los comandos usan el `layout.type` resuelto; un fallback general no crea `layouts.race`.
5. Layout y propiedades utilizan el mismo documento de `StudioProvider`.
6. No existe estado documental local ni Emit manual en `InPlaceEditOverlay`.
7. El cliente in-place nunca emite `studio:profile:save`.
8. Autosave no se inicia por dirty de migraci├│n al montar.
9. Solo existe un save en vuelo y las ediciones posteriores no se pierden.
10. Error conserva el borrador y ofrece Retry; conflicto exige recarga.
11. Undo/redo est├ín disponibles por botones y autosalvan.
12. No se registran hotkeys globales.
13. El panel queda deshabilitado mientras la licencia carga.
14. El acceso coincide con el Hub.
15. Recovery del overlay no escribe en storage.
16. El panel usa snapshot live a aproximadamente 5 Hz.
17. Drag/resize conserva preview imperativa bajo renders del provider.
18. El gate P1 completo pasa.
19. La vista headless se monta sin providers del Studio ni Wails.
20. El guard est├ítico proh├¡be los imports definidos.
21. `StudioInspector` conserva sus expectativas funcionales.
22. `InPlaceWidgetEditFrame` queda en la matriz positiva del Host.
23. Los cambios persisten y aparecen en el Hub.
24. Frontend completo, build, lint focal, Go completo y diff-check pasan.
25. Smoke real con LMU, 1080p, 4K, 32:9 y segundo monitor completado.

## 7. Riesgos y mitigaciones

| Origen | Riesgo | Mitigaci├│n |
|---|---|---|
| Fable | Telemetr├¡a mock en el overlay | Vista prop-driven y snapshot real por props |
| Fable | Access impl├¡cito degrada Pro a Free | `LicenseProvider`, `useAccess` y bloqueo durante carga |
| Fable | Dirty de carga dispara save | Autosave exclusivamente tras mutaci├│n aceptada |
| Opus | Sesi├│n de telemetr├¡a materializa race | Escribir en `resolveRuntimeLayout(...).type` |
| Opus | Consumidores del Host no caracterizados | Ampliar `hostConsumers` |
| Opus | Idioma fallback | Montar `I18nProvider` |
| SOL | Respuesta tard├¡a reemplaza una edici├│n | Actualizar solo saved/revision |
| SOL | Autosaves solapados reutilizan revisi├│n | Una petici├│n en vuelo y coalescing |
| SOL | Retry repite revisi├│n conflictiva | Pausa y recarga expl├¡cita |
| Revisi├│n independiente | Cliente normal recrea ventana | Evento configurable y `SaveInPlace` |
| Revisi├│n independiente | Dos documentos editables | `StudioProvider` como ├║nica autoridad |
| Revisi├│n independiente | Recovery compartido | `recoveryStorage={null}` |

## 8. Decisiones que resuelven contradicciones

1. Recovery con namespace se sustituye por `recoveryStorage={null}`.
2. Retry solo aplica a errores; un conflicto exige recarga.
3. Los tests de Fase 1 no se debilitan; solo se puede adaptar montaje as├¡ncrono y a├▒adir casos.
4. La matriz del Host debe representar los consumidores reales.
5. Se extrae una vista peque├▒a de propiedades, no el inspector completo.

## 9. Open questions

Ninguna.
