# 00 · Registro de decisiones (ADR-lite)

Formato: **Decisión** · Contexto · Alternativas descartadas · Consecuencias. Fecha 2026-08-16 salvo indicación.

## D-01 · Dirección visual: Command Orbit
**Decisión.** El hub adopta "Command Orbit": grafito profundo (`#08090b`), superficies translúcidas con blur, acento carmín→coral con glow calibrado, primario **blanco**, bordes degradados solo en superficies destacadas.
**Descartado.** v0.1 grafito fresado + cristal flotante; v0.2 (Sol); dirección "v5" actual del hub (uppercase + tracking amplio como firma).
**Consecuencias.** `docs/DESIGN.md` queda como sistema legado del hub; los eyebrows en mayúsculas se reservan para cabeceras de sección y tarjetas destacadas; los títulos de panel pasan a caja normal.

## D-02 · Escala tipográfica ×1.3 sobre base 12
**Decisión.** Base 16px (antes 12px). Todo el sistema de medidas se reescaló ×1.3 salvo hairlines (1px), breakpoints y `min-width` del body.
**Contexto.** A 1920×1080 el prototipo original era ilegible.
**Consecuencias.** Filas 49px, rail 81px, columna 296px, botones 39px, KPI 22px mono. Ver `02-tokens.md`.

## D-03 · Rail global + columna contextual (no duplicada)
**Decisión.** El rail (iconos) es la única navegación. La columna muestra **contenido de la sección** (widgets en Studio, filtros/seguidas en Carreras, perfiles en Launcher, estrategias en Estrategia, sesiones en Telemetría, fases en Roadmap, secciones en Ajustes) más bloques persistentes.
**Descartado.** Rail + columna con las mismas secciones (redundante); solo rail.
**Consecuencias.** La columna se pliega desde el rail o desde su cabecera; en Ajustes solo muestra sus secciones.

## D-04 · Bloques persistentes de la columna: variante B
**Decisión.** Próximas carreras · Perfil de overlay · Launcher (con ▶). Un bloque se oculta cuando la sección activa ya lo muestra.
**Descartado.** A (operativa: carreras + tarjeta overlay), C (mínima: solo contexto).

## D-05 · Estado de LMU en un único sitio
**Decisión.** El pill "LMU conectado" vive en el pie de la columna. En el hero es solo color (punto junto al saludo).
**Descartado.** Pill en topbar + dayline + signal strip (tres veces).

## D-06 · Inicio: hero en dos columnas con dial de cuenta atrás
**Decisión.** Izquierda: saludo, command surface, quick actions. Derecha: tarjeta "Próxima serie" con **dial** SVG cuyo arco/punto representan el tiempo hasta la salida (según cadencia real).
**Descartado.** Anillos orbitales decorativos; tarjeta rotada 1.4°; signal strip; suite-tiles; actividad vacía a todo el ancho.

## D-07 · Focal = perfil activo con widgets reales en miniatura
**Decisión.** La tarjeta destacada del Inicio se titula con el perfil ("Clean Overlay") y su mini-lienzo es un contenedor `container-type: inline-size` que reutiliza los widgets `.cw` reales (escalan en `cqw`).

## D-08 · Política "sin scroll de página"
**Decisión.** Cada vista está diseñada para caber a 1920×1080. Donde el contenido crece (listas, feeds, timelines) el scroll es **interno al panel**. Por debajo de ~940px de alto, Inicio se compacta; el resto de vistas puede desplazarse como respaldo.
**Consecuencias.** Vistas con `height:100%` + flex column; listas con `min-height:0; overflow:auto`.

## D-09 · Inspector del Studio: secciones apiladas y plegables
**Decisión.** Cabecera con identidad y acciones directas; Diseño / Comportamiento / Layout como `<details>` con resumen legible cerrado; Layout con X/Y/W/H.
**Descartado.** Pestañas; inspector flotante; barra de propiedades.

## D-10 · Calendario con horas calculadas desde la cadencia
**Decisión.** Las salidas se calculan en cliente desde `configs/calendar-lmu.json` (minuto ≡ offset mod intervalo; slots UTC para semanales) en la zona horaria del usuario. Cinco vistas: Próximas · Día · Semana · Mes · Timeline.

## D-11 · Estrategia: panel único de evento, no wizard
**Decisión.** Entrada directa a la última estrategia del evento; columna izquierda como selector (estrategias + otros eventos + Nueva). Panel: cabecera del evento, pestañas Resumen · Estrategias · Disponibilidad, submenú ⚙. Resumen = KPIs + línea de carrera por piloto + distribución + stints con paradas + panel Pilotos/Neumáticos.
**Descartado.** Flujo de 4 pasos; portada con menú de secciones.
**Consecuencias.** Comparación de estrategias mide **vueltas completadas** (carrera a tiempo), no tiempo total.

## D-12 · Neumáticos individuales arrastrables
**Decisión.** Inventario de neumáticos individuales (id, compuesto, condición) asignables a FL/FR/RL/RR de cada stint por drag & drop, por tocar-y-tocar y por teclado. Editar stint despliega el editor bajo la tarjeta.

## D-13 · Telemetría MVP tipo "mapa → trazas → insights"
**Decisión.** Estructura del módulo: KPIs, mapa coloreado por tiempo ganado/perdido, trazas sincronizadas con scrubber, insights por curva explicables. Datos sintéticos etiquetados hasta conectar DuckDB (ADR 0005).

## D-14 · Ajustes con Atajos como sección propia
**Decisión.** Cuenta · Aplicación · Actualizaciones · Atajos · Diagnóstico. Atajos con keycaps físicos por grupo (Overlay, Launcher y carrera, Studio, Global). Densidad se configura en Ajustes › Aplicación (no en el topbar).

## D-15 · Iconografía por sprite y logos incrustados
**Decisión.** Un `<symbol>` por icono de navegación (`i-*`), stroke 1.75 en el rail. Marca Vantare y avatar como PNG data-URI (11 KB + 4 KB). En producción: assets locales, nunca CDN.

## D-16 · Micro-motion sobrio
**Decisión.** Entradas de 260–340 ms con `cubic-bezier(.2,.8,.2,1)`, cascadas de 30–40 ms, transiciones de posición 350 ms; todo bajo `prefers-reduced-motion`.

## D-17 · Porte 01-shell: la shell real es `V52Shell`, no `AppShell`
**Decisión.** El briefing 01 nombra `AppShell.tsx` como la shell a sustituir, pero en el código `AppShell.tsx` es solo el router de nivel superior (overlay · callback OAuth · hub · composite). La shell del hub es `hub/components/V52Shell.tsx`, montada por `HubShell` dentro de `HubApp`. El porte introduce `hub/components/orbit/OrbitShell.tsx` con la **misma firma de props** que `V52Shell` y `HubShell` elige entre las dos según el flag. `AppShell.tsx` no se toca.
**Consecuencias.** Cualquier briefing posterior que hable de "AppShell" debe leerse como `V52Shell`/`OrbitShell`.

## D-18 · Claves de persistencia: manda `vantare.v03orbit.*`
**Decisión.** El briefing 01 pide `vantare.orbit.{view,sidebar,rightDock,density}`; `13-modelo-y-algoritmos.md § 13.7` y el código ya existente (`lib/density.ts`, harness de fundamentos) usan `vantare.v03orbit.*`. Se conserva `vantare.v03orbit.*` para no romper la densidad ya persistida. El **flag** sí usa la clave que pidió el briefing: `vantare.orbit.enabled`.

## D-19 · El gating del rail sale del `access-policy` real, no de la matriz del prototipo
**Decisión.** `ACCESS`/`REQUIRED_PLAN` del prototipo describen un modelo de planes que el hub ya implementa en `lib/access-policy.ts` (con roles operativos, licencia bloqueada y estado sin configurar). El rail y la paleta consultan `canSeeSection`/`getFeatureGate`; de la matriz del prototipo solo se conserva el **plan requerido** que se muestra en el tooltip y en el motivo de la paleta.
**Consecuencia.** Un tester ve Estrategia desbloqueada aunque su plan sea Free: es el comportamiento actual del producto y prevalece sobre el prototipo.

## D-20 · "Próximas carreras" con motor real y dataset provisional
**Decisión.** `nextStarts`/`upcoming` se portan como dominio puro con pruebas (`hub/orbit/next-starts.ts`). El hub todavía no expone un fixture de series al frontend, así que la columna se alimenta de `hub/orbit/provisional-series.ts`, marcado explícitamente como provisional. Al llegar el fixture real se borra ese módulo; el motor no cambia.

## D-21 · Tooltip de rail con `data-tip`, nunca `title`
**Decisión.** El tooltip del rail se pinta con `::after` sobre `data-tip`, visible con hover **y** con `:focus-visible`. Los tests del rail comprueban que ningún botón lleva `title` nativo.

## D-22b · Marca real en la losa, avatar con inicial
**Decisión.** La losa del rail usa el PNG real de la marca Vantare, extraído del prototipo a `frontend/src/assets/orbit/vantare-mark.png` (26×26 dentro de la losa de 49 px). El avatar del rail sigue con la inicial de la cuenta: el prototipo embebe un avatar de prueba que no representa a ningún usuario, así que no se porta hasta que exista fuente real de imagen de cuenta.

## D-23 · Encender Orbit no cambia la preferencia de tema
**Decisión.** `applyOrbitThemeWhileMounted` aplica `vantare-orbit` al documento mientras la shell está montada y devuelve la restauración del tema guardado; **nunca** llama a `persistThemeId`. Un feature flag no puede dejar al usuario con un tema que no eligió cuando se apaga.
**Prueba.** `hub/orbit/orbit-theme.test.ts`.

## D-22 · El harness visual de la shell monta un workspace neutro
**Decisión.** `scripts/orbit-shell-visual.mjs` sirve `orbit-shell-harness.html`, que monta la `OrbitShell` real con un workspace vacío: las páginas de producto dependen del runtime de Wails y no arrancan en un navegador limpio. El harness verifica el contrato de la shell (rail 81 px, columna 296 px, topbar 70 px, sin scroll de página, pie visible, sin `title` en el rail) a 1920×1080 y 1920×900, e ignora los rechazos de `@wailsio/runtime`, que son ruido esperado fuera de la app de escritorio.

## D-24 · Medidas: manda `04-componentes.md` cuando choca con el prototipo
**Decisión.** El prototipo pinta `.pill` a 36 px y `.icon-btn` a 36×36; el catálogo (y `orbit.tokens.css`, con `--orbit-pill-h: 30px`) dicen 30 px y 28/39. El kit porta las medidas del catálogo y de los tokens.
**Consecuencia.** Las capturas del kit no son idénticas al HTML en esos dos controles; el resto sí.

## D-25 · El `title` de los contratos nunca es el atributo `title`
**Decisión.** `PillProps.title` y `SegProps.options[].title` existen en `12-contratos-componentes.md`, pero el kit los expone como `aria-label` (Pill) y como `data-tip` del tooltip propio (Seg). `SurfaceProps.title` es la cabecera y por eso hace `Omit<HTMLAttributes, "title">`. Ningún nodo del kit emite `title` nativo; el harness visual lo verifica contando `[title]` en la página.

## D-26 · El tooltip refleja su estado en el DOM (`data-tip-open`)
**Decisión.** El tooltip se sigue pintando con `::after` sobre `data-tip` (D-21), pero además marca `data-tip-open="true"` mientras hay hover o foco. Los pseudoelementos no existen en jsdom: sin ese atributo no había forma de probar "visible con hover y con foco" con Testing Library. El CSS también lo usa, así que el estado es uno solo.

## D-27 · Los toasts son del kit y la shell solo los consume
**Decisión.** `ToastProvider`/`useToast` viven en `ui/orbit/Toast.tsx` (contexto y constantes en `toast-context.ts`, por la regla de fast-refresh). `OrbitShell` envuelve su cuerpo con el proveedor y llama a `useToast`; su región propia y el bloque `.orbit-toasts` de `orbit-shell.css` desaparecen. Región abajo-centro, máximo 3, 2,6 s, como `04 · toast`.

## D-28 · `state="saved"` deshabilita el botón
**Decisión.** `04 · btn-save` describe `saved` como "check verde, deshabilitado": el kit lo aplica en el propio componente en vez de dejarlo al llamante, para que no haya un "Guardado" clicable en ninguna pantalla.

## D-29 · El harness del kit captura por grupos
**Decisión.** `scripts/orbit-kit-visual.mjs` (`visual:orbit-kit`) sirve `ui-orbit-harness.html` a 1920×1080 y hace una captura por grupo del briefing (`primitivos`, `estado`, `contenedores`), desplazando la sección a la vista: el kit completo no cabe en 1080 px. Antes de la captura del grupo 3 dispara los tres toasts y abre el menú, que son estados exigidos por el criterio y solo existen tras interactuar. El script falla si hay errores o avisos de consola o si aparece cualquier `title` nativo. El grupo 4 (visualización) se parte en dos capturas (`data-shot="visualizacion-a"`/`-b`), porque tampoco cabe entero.

## D-30 · Los tipos de dato de visualización que `13` no escribe se fijan en el kit
**Decisión.** `12-contratos-componentes.md` nombra `WidgetDoc`, `TyreView`, `DriverView` y `AvailRange` y remite a `13-modelo-y-algoritmos.md`, donde solo está escrito `WidgetDoc`. Los otros tres se declaran en `ui/orbit/viz-types.ts` con la forma mínima que el CSS del prototipo necesita para pintar: `TyreView { id, compound, label?, condition }`, `DriverView { id, name, color }` y `AvailRange { from, to, state }` con horas decimales (13.5 = 13:30).
**Consecuencia.** Cuando el dominio publique los suyos, el kit importa y borra estos; la forma es deliberadamente pobre para que la migración sea trivial.

## D-31 · `MiniStage` no conoce el registro de widgets: recibe `renderWidget`
**Decisión.** El contrato dice "host V3 en modo preview", pero el kit no puede depender de `overlay/core/widget-registry` sin arrastrar todo el sistema de overlays a cada página que importe un botón. `MiniStage` pinta el lienzo (`aspect-ratio 16/9`, `container-type: inline-size`, rejilla `6.25cqw`, widgets sin interacción) y delega el contenido en `renderWidget(doc)`; sin ese render dibuja un marco rotulado. El harness sí lo inyecta con `WidgetVisualHost` real.
**Nota.** `WidgetVisualHost` no tiene modo `"preview"`: sus modos son `studio | desktop | obs | harness`. Se usa `"harness"`, que es el que ya emplea `ProfilePreview` para exactamente lo mismo.

## D-32 · El escalado del mini-lienzo se mide, la rejilla es container-query
**Decisión.** La rejilla de `6.25cqw` y la relación 16/9 salen de `container-type: inline-size`, como pide `04`. El plano de widgets (1920×1080 lógicos) se escala con un `ResizeObserver`, igual que `ProfilePreview`: CSS no puede derivar un factor de `scale()` sin unidad a partir del ancho del contenedor.

## D-33 · La traza llama `reference` a la serie de referencia
**Decisión.** `TraceProps` del contrato la llama `ref`. `ref` es un nombre reservado de React y `react-hooks/refs` bloquea leerla en render, así que el kit la expone como `reference`. Es el único nombre de prop que cambia respecto a `12`.

## D-34 · El dial acepta un reloj inyectado
**Decisión.** `CountdownDialProps` se amplía con `now?: Date`. Sin él el dial refresca solo cada segundo (`13`); con él el harness y los tests fijan la fracción y las capturas dejan de cambiar entre ejecuciones.

## D-35 · `over` y `pulse` de las esquinas se capturan con eventos reales
**Decisión.** Son estados internos de arrastre, no props: ensuciarlos con una prop de demostración habría contaminado el contrato. `scripts/orbit-kit-visual.mjs` dispara `dragover` sobre `RL` y `drop` sobre `RR` justo antes de la captura del grupo 4b, y espera a `data-pulse="true"` (el halo dura 500 ms).

## D-36 · Las salidas del backend mandan; el motor `13.3` solo cubre huecos
**Decisión.** `calendar:loaded` ya trae `seriesPreviews[].nextStarts` calculadas por el backend sobre `configs/calendar-lmu.json`. Cuando esa lista tiene salidas futuras se usa tal cual —es la autoridad— y `buildRaceStarts` solo recurre al motor local `nextStarts` (`13.3`) para las series cuyo preview llega vacío o no llega: arranque en frío del backend, o previews caducadas. Así el hero, el dial y la columna no recalculan lo que el backend ya sabe ni se quedan en blanco mientras lo calcula.
**Consecuencia.** `hub/orbit/provisional-series.ts` se borra. Sin calendario o sin series, la lista queda vacía con su texto de estado: no hay fixture de respaldo en ningún entorno.

## D-37 · Una salida por serie en las listas de Inicio y de la columna
**Decisión.** `13.3` define `upcoming` tomando dos salidas por serie antes de ordenar. Con las diez series reales, todas a cadencia de 15–30 min, la segunda salida de una serie siempre cae después de la primera de otra: lo único que produce es la misma serie repetida en filas contiguas, que no es lo que muestra `evidence/inicio.png`. `useCalendarStarts` pide una salida por serie. El motor conserva el parámetro (`perSeries`) y su comportamiento de `13.3` intacto.

## D-38 · El comando real de perfiles es `hub:list`, no `hub:profiles:get`
**Decisión.** El briefing 01 escribió `hub:profiles:get` en `use-overlay-state`. Ese evento no lo atiende nadie: el backend (`internal/app/hub_service.go`) y todo el frontend real (`ActiveOverlayCard`, `StudioRoute`, `ProfilesPage`) usan `hub:list`. Manda el código: sin este cambio la columna y la focal de Inicio nunca recibían perfiles.

## D-39 · Inicio lo monta la propia shell, no `HubApp`
**Decisión.** `OrbitShell` renderiza `HomeOrbitPage` en su workspace cuando la vista activa es `inicio`, en lugar de los `children` que le pasa el hub. Con el flag apagado la shell no se monta y `DashboardPage` sigue intacta, que es el contrato del flag; y el harness visual obtiene la pantalla real sin duplicar el cableado de datos que ya vive en la shell (`use-overlay-state`, `use-calendar-starts`, `navigate`, `toggleOverlay`, paleta).

## D-40 · La actividad reciente no se renderiza mientras no exista feed
**Decisión.** `06 · Inicio` la oculta si está vacía y el hub no expone hoy ningún feed de actividad local. En vez de renderizar un panel siempre oculto, Inicio no lo monta. Cuando exista la fuente se añade el panel con su condición de vacío.

## D-41 · El mock de Wails adjunta `previewDocument` a `hub:list`
**Decisión.** El backend real ya incluye `previewDocument` en cada entrada de `hub:list` (`hub_service.go`), que es lo que permite pintar widgets reales en las miniaturas. El mock de harness no lo hacía, así que el mini-lienzo de Inicio no tendría con qué pintar. Se alinea el mock con el contrato real en vez de inventarle una ruta de carga aparte al harness.

## D-42 · El Studio se porta con portales a huecos que reserva la shell
**Decisión.** La lista de widgets y los controles de la topbar necesitan el store del Studio (`useStudioDocument`), que vive por debajo de la shell en el árbol. En vez de subir ese estado a `OrbitShell`, la shell reserva dos huecos vacíos cuando la vista es `studio` (`#orbit-studio-context-slot` en la columna, `#orbit-studio-topbar-slot` en el slot `children` de `Topbar`) y `StudioOrbitLayout` los rellena con `createPortal`. Los hijos del portal siguen dentro del árbol React del Studio: conservan store, proveedor de confirmación y telemetría, y se pintan donde manda `06`.
**Consecuencia.** `columnAvailable` de la shell pasa a ser verdadero en Studio por el propio hueco, sin que la shell sepa nada del Studio.

## D-43 · Tres acordeones sobre las seis secciones reales del inspector
**Decisión.** Se cumple el mapeo que pide el briefing: **Diseño** = `design` + `appearance`, **Comportamiento** = `behavior` + `content`, **Layout** = `layout` + `actions`. `resolveInspectorSections` sigue siendo la autoridad: un grupo solo se pinta si el widget tiene alguna de sus secciones, y el caso "sistema visual no compatible" mantiene su aviso en vez de abrir acordeones vacíos. El a11y no se resiente porque `Accordion` es `<details>/<summary>` nativo.
**Consecuencia.** `StudioInspector` (rail de seis iconos) sigue intacto para el Studio con el flag apagado; la capa Orbit no lo modifica.

## D-44 · El ojo de la lista va al lado del `ListRow`, no dentro
**Decisión.** `ListRow` del kit renderiza un `<button>`. Meter el ojo en su `trailing` habría anidado un botón dentro de otro, que no es navegable con teclado ni válido en HTML. La fila se envuelve en un contenedor con el `ListRow` como control de selección y el ojo como hermano posicionado sobre su borde derecho, con `aria-pressed` y `data-tip` propios.

## D-45 · El modo estrés es siembra del harness, no una función del Studio
**Decisión.** `?stress=1` reescribe el documento del perfil simulado con veinte widgets de nombre largo desde `orbit-studio-harness.tsx`. Es un dato de prueba, no una capacidad del producto: no entra en el código de producción. `delta` aparece una sola vez porque el documento V3 solo admite uno por layout.

## D-46 · El fondo por defecto sigue siendo el degradado del código
**Decisión.** El prototipo abre con la rejilla seleccionada; `DEFAULT_PREVIEW_STATE` del Studio abre con el degradado, con una razón escrita en el código (se parece más a lo que hay detrás de un overlay en carrera). Manda el código: la toolbar Orbit refleja el estado real del store en vez de forzar la rejilla al montar.

## D-47 · Los iconos que el sprite Orbit no tiene se dibujan en la vista
**Decisión.** Área segura, zoom −/+, ojo, duplicar y eliminar no existen en `ui/orbit/Icon`. En vez de ampliar el sprite con glifos de una sola pantalla, la vista pinta el trazo del prototipo dentro de un botón con las clases del kit (`orbit-icon-btn`) y su mismo contrato de tooltip (`data-tip`/`aria-label`, nunca `title`). El resto —fondo, fuente, plegar inspector, guardar, overlay, selector de perfil— sí sale del kit tal cual.

## D-48 · Los controles del inspector eligen componente por una «piel», no por CSS
**Decisión.** Los acordeones Orbit envolvían las secciones reales del Studio (`DesignSection`, `BehaviorSection`, `LayoutSection`, `ActionsSection`, `InspectorControlField`), que seguían pintando `checkbox` y `select` nativos con la clave cruda del control por rótulo. La vía elegida es un contexto de piel: `inspector/inspector-skin.tsx` expone `InspectorSkinProvider` con `"v3" | "orbit"`, `StudioOrbitInspector` monta el árbol con `skin="orbit"` y cada sección consulta `useIsOrbitSkin()` para elegir el JSX. Los handlers, el gate de plan (`getStudioMutationGate`), el store y los comandos son exactamente los mismos objetos en ambas pieles: lo único que cambia es con qué se pintan. Se descartó re-estilar por CSS los controles legados (un `checkbox` con aspecto de toggle no es un toggle) y duplicar las secciones en `orbit/` (dos copias de la misma lógica divergen).
**Consecuencia.** El valor por defecto del contexto es `"v3"`, así que el inspector con el flag apagado —y el panel flotante del overlay, que comparte `WidgetPropertyInspectorView`— no cambia ni una etiqueta. La escritura de `visibleWhen.inPit`, `visibleWhen.sessionTypes`, `layout.aspectLocked` y `restore-defaults` se extrajo a un único punto por sección para que las dos pieles no puedan divergir en el comportamiento.

## D-49 · Los rótulos ya venían en el descriptor: el inspector legado no los usaba
**Decisión.** `InspectorControl` declara `labelKey` desde siempre (`overlay.inspector.delta.showHeader`, …), pero `inspector-control-field.tsx` pintaba `control.id` (`show-header`) y las opciones de los `select` pintaban la clave de la opción. La piel Orbit traduce `labelKey`; las claves `overlay.inspector.*` de los tres sistemas visuales, que no estaban en ningún catálogo, se añaden a `locales/studio-orbit/*` en los cuatro idiomas. Si una clave siguiera sin traducción se humaniza el id (`show-header` → `Show header`) en vez de enseñar la clave.

## D-50 · Las cinco sesiones reales, no las tres del prototipo
**Decisión.** `evidence/studio.png` muestra tres botones (Carrera / Práctica / Clasificación); el documento V3 admite cinco tipos (`practice`, `qualifying`, `race`, `warmup`, `endurance`). El `Seg` multi-selección lista los cinco reales con nombre humano y se reparte en dos filas dentro del dock: recortar la lista a la del prototipo dejaría dos filtros sin interfaz.
**Consecuencia.** El kit gana `SegMulti`, la variante multi-selección del `Seg` (mismo marcado y mismas clases, `aria-pressed` por botón). Y `.orbit-field--row` recupera su `flex-direction: row`: heredaba la columna de `.orbit-field` y apilaba el par etiqueta–control, que es el defecto que se ve en el `Toggle` de «Bloquear proporción».

## D-51 · No hay «perfil predeterminado» en el contrato: manda el favorito
**Decisión.** `06 § Launcher` y `evidence/launcher.png` rotulan la tarjeta destacada como «Perfil predeterminado · favorito» y el stat de Perfiles cuenta «1 predeterminado · 1 favorito». `LaunchProfile` no tiene campo de predeterminado: solo `isFavorite`. Manda el código: la tarjeta se rotula «Perfil destacado · favorito», el stat cuenta favoritos y el orden pone el favorito primero. El atajo global del stat sale del `hotkey` real de ese perfil destacado, y sin `hotkey` el stat muestra «—» con «sin atajo asignado» en vez de inventar Ctrl Alt L.

## D-52 · El estado por paso sale de `activeChains`, no del `chain-store`
**Decisión.** El estado pending/launching/ready/failed de cada `chain-step` se lee de `LauncherSnapshot.activeChains`, que ya viaja en la misma instantánea que el catálogo y los perfiles. Se descartó `useChainState` del `chain-store` porque exige `ChainRunnerProvider` por encima, que la shell Orbit no monta y que obligaría a acoplar la shell a un proveedor del Launcher para pintar tres puntos de color. `done` del contrato se normaliza a `ready`, que es el vocabulario del briefing.
**Consecuencia.** El punto y la etiqueta del paso comparten color (ámbar abriendo, verde listo, rojo fallo) y la etiqueta sustituye a la espera solo cuando el paso ya no está pendiente: en reposo la cadena sigue mostrando «sin espera» y «+2 s», como la referencia.

## D-53 · Editar y crear perfil reutilizan el diálogo legado del Launcher V3
**Decisión.** El lápiz y la tarjeta punteada abren `launcher/ProfileEditor`, el panel deslizante del Launcher clásico, sin re-estilarlo ni duplicarlo en Orbit. Crear despacha el mismo `launcher:profile:save` con un perfil en blanco que `ProfilesPanel` y abre el editor sobre él. Portar ese editor a Orbit es un briefing propio, no parte del 05: hacerlo aquí habría duplicado la validación de pasos, hotkeys y políticas.

## D-54 · `ChainStep` entra en el kit; el hueco de la shell deja de ser del Studio
**Decisión.** El paso de cadena (`.chain-step`) no existía en `ui/orbit`: se añade como `ChainStep` + `Chain` con su CSS en `orbit-kit.css`, porque es un componente del catálogo (`04 · perfil de lanzamiento`) y no layout de una pantalla. En paralelo, `useOrbitSlot` y las reglas `.orbit-column__slot` / `.orbit-topbar__slot` se mueven de `overlay-studio/orbit` y `orbit-studio.css` a `hub/orbit/use-orbit-slot.ts` y `orbit-shell.css`: los huecos los pinta la shell, y ahora los usan dos pantallas. `studio-orbit-slots.ts` reexporta el hook para no tocar el Studio.

## D-55 · Las iniciales del monograma de perfil son las del código, no las del prototipo
**Decisión.** El prototipo dibuja «CC» para «Creador de Contenido»; el algoritmo real del bloque persistente Launcher (`SideLauncher`) toma la inicial de las dos primeras palabras y da «CD». Manda el código: `profileInitials` se extrae al modelo del Launcher Orbit y `SideLauncher` pasa a importarlo, de modo que la columna y la pantalla no puedan divergir. Elegir a mano las iniciales «bonitas» de dos perfiles del prototipo no se generaliza a los perfiles que cree el usuario.

## D-56 · Carreras se monta sobre el calendario real, no sobre las 10 series del prototipo
**Decisión.** `06 § Carreras` y el prototipo describen 10 series (3 Bronce · 3 Plata · 3 Oro · 1 Semanal) con `SERIES` en línea. El fixture real (`configs/calendar-lmu.json`, espejado en `calendar-visual-mock-data`) publica 11 con cadencia calculable: nueve por intervalo y dos semanales, y una de ellas (`series-special-imola`) llega con `tier: "special"`, que `toEngineSeries` normaliza a `weekly`. Manda el código: el contador del filtro dice «Semanal 2» y no se inventa una categoría «Especial» que el motor no sabe planificar. Las series cuya recurrencia no describe ninguna cadencia se descartan enteras: sin cadencia no hay salidas que pintar en ninguna de las cinco vistas.
**Consecuencia.** `races-orbit-model.ts` traduce `Calendar` → `RaceSeriesEntry[]` una sola vez y las cinco vistas y el detalle leen de ahí; el filtro de categoría recorta esa lista antes de calcular cada rejilla, así que afecta a las cinco a la vez sin ninguna rama propia por vista.

## D-57 · El destino de la navegación lo guarda la shell
**Decisión.** `navigate("carreras", seriesId)` sale de la shell (dial de Inicio, bloque persistente «Próximas carreras», paleta) y viaja hacia arriba por `onNavigate`, que no vuelve: `OrbitShellProps` solo recibe `activeSection`. En vez de ampliar el contrato de la shell hacia el host, la propia shell recuerda el último `target` que despachó y se lo pasa a la pantalla destino. Carreras lo consume como preselección: mientras el usuario no elija otra serie, el detalle abre la que traía la navegación.
**Consecuencia.** El patrón queda disponible para el resto de pantallas portadas sin tocar `AppShell` ni la navegación legada, y la preselección no sobrevive a un clic del usuario (`picked` gana siempre), que es lo que espera quien llega desde el dial y luego navega el calendario.

## D-58 · El detalle pide sus cuatro salidas al motor, no a `upcoming`
**Decisión.** `upcoming` de `13.3` toma **dos** salidas por serie antes de ordenar, así que reutilizarlo para las cuatro horas del detalle daba solo dos teclas. El detalle llama a `nextStarts(serie, ahora, 4)` directamente; `upcoming` se queda para las listas multi-serie (Próximas y la lista de seguidas de la columna), que es para lo que está definido.

## D-59 · El scroll horizontal del timeline ya lo pone el kit
**Decisión.** El prototipo scrollea en `.timeline`, el contenedor de la pantalla. En el kit Orbit el scroller es el propio `HorizontalTimeline` (`.orbit-tl { overflow-x: auto }`) con su `minWidth`, así que `orbit-races.css` no vuelve a declararlo: duplicarlo dejaba dos cajas de scroll anidadas y la de fuera nunca desbordaba. El harness comprueba el desbordamiento sobre `[data-testid="orbit-timeline"]`, que es el elemento que de verdad scrollea.

## D-60 · Las filas de Semana y Mes existen para la semántica, no para el layout
**Decisión.** Las rejillas de Semana (`200px + 7`) y Mes (7×6) son una sola rejilla CSS, pero `role="grid"` exige `role="row"` intermedios (`08 · a11y`). Las filas se envuelven con `display: contents`: la semántica queda completa y el layout lo sigue poniendo la rejilla padre, sin `subgrid` (que no cubre todos los motores del rango soportado) ni celdas descolocadas.
