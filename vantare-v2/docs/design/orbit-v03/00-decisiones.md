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

## D-61 · El contrato manda en neumáticos; el reparto de vueltas y pilotos vive en la pantalla
**Decisión.** `strategy-contract-v1` y `strategy-editor.ts` modelan el **plan** (stints escritos a mano, neumáticos con compuesto, origen, estado, esquina bloqueada y condición con procedencia, entradas manuales), pero no el evento, ni el equipo, ni el ritmo o el consumo de cada piloto, ni la rotación. Estrategia Orbit reparte el trabajo: el inventario, la legalidad de una esquina (`assertPlannable`) y la condición de partida salen del dominio real; el `buildPlan` de `13.5` (vueltas totales, stints mínimos equilibrados, overrides y rotación) vive en `hub/strategy-orbit/strategy-orbit-model.ts` con los casos a–d en test. Los stints del plan son **derivados**, no los del documento del editor: su número depende del depósito y del ritmo, así que no se escriben en el documento.
**Consecuencia.** La condición mostrada es la real del neumático menos `12` puntos por uso (rango `−8`, suelo 40), no `100 − 12·usos` a secas: un juego que el dominio da como `80–90 %` no se presenta nunca como nuevo. El reparto de pilotos, los overrides y la asignación por esquina se guardan en `localStorage` (`vantare.v03orbit.strategy`) porque el `payload` del contrato se valida estrictamente y no admite campos ajenos; cuando el backend publique un plan con pilotos, esta capa se retira.

## D-62 · El evento activo llega por su propio canal, y sin él la pantalla lo dice
**Decisión.** El evento, los pilotos y las estrategias del evento se publican por `strategy:roster` (petición `strategy:roster:get`), igual que el calendario publica `calendar:loaded`. La pantalla no inventa un evento de muestra: sin puente muestra «Elige evento y pilotos» con los eventos seguidos reales del calendario. El runtime simulado de los harnesses siembra un evento de 4 h con tres pilotos por ese mismo canal.

## D-63 · `CornerSlot` monta con teclado cuando hay un juego elegido
**Decisión.** El `CornerSlot` del kit solo vaciaba la esquina con `Enter`/`Espacio`, así que la vía de teclado de `08 · a11y` no podía **montar** nada. Se añade `pickedId`: con un juego elegido, `Enter`/`Espacio` lo montan (y disparan el mismo pulso verde que el drop); sin él, la tecla sigue vaciando. Es aditivo y no cambia ninguna llamada existente.

## D-64 · «Exportar plan» exporta de verdad; el resto del menú ⚙ dice que aún no
**Decisión.** El menú de Ajustes del evento (briefing 07) tiene cuatro entradas y solo una tiene dominio detrás: `strategy-transfer.ts` ya sabe empaquetar un plan (`exportStrategyPackage`, que va por el servicio de aplicación y no persiste ni transmite nada). «Exportar plan» la llama con el `planId`/`variantId` del borrador abierto y el aviso dice el nombre del paquete y su tamaño real. Telemetría de la sesión, Modelo de combustible e Información del evento no tienen modelo todavía y lo dicen con esas palabras («aún no está conectado a datos reales»), en vez de fingir un panel.
**Consecuencia.** El paquete se devuelve en memoria: quien lo guarde en disco será el diálogo nativo cuando exista, no esta pantalla.

## D-65 · Sin disponibilidad declarada, todos disponibles
**Decisión.** El prototipo trae un fixture de ausencias por piloto. El puente `strategy:roster` no publica disponibilidad, así que la pantalla no la inventa: cada piloto entra con un único tramo `ok` de 13:00 a 18:30 y las ausencias aparecen solo cuando alguien las añade con el formulario. El recorte de solapes de `13.5` (`addAvailability`) parte el tramo anterior y conserva lo que queda fuera; el resultado se guarda junto a las estrategias en `vantare.v03orbit.strategy`, que pasa a tener la forma `{ variants, availability }` (la forma plana de la parte A se sigue leyendo).

## D-66 · Las estrategias nuevas y las copias viven en local, con ids `local-n`
**Decisión.** `strategy:roster` publica las estrategias del evento; duplicar o crear una no puede escribir en ese canal, así que las variantes nuevas se quedan en el estado de la pantalla con ids `local-1`, `local-2`… y se persisten en la misma clave local. La siembra del puente ya no pisa lo que hay en memoria (`{ ...delPuente, ...actual }`), para que una copia no desaparezca cuando el evento se vuelve a publicar. La tarjeta «+ Nueva estrategia» avisa con un toast; el botón de la columna no, porque el cambio se ve en la propia lista.

## D-67 · El asa ⋮⋮ del stint es decorativa
**Decisión.** El prototipo dibuja un asa a la izquierda del `#n` de cada stint, pero el orden de pilotos se cambia con el `Select` de la tarjeta y con «Repartir pilotos», no arrastrando. El asa se porta como `aria-hidden`, sin `draggable` ni foco: prometer un arrastre que no existe sería peor que no dibujarla.

## D-68 · La voz y el volumen son locales porque el contrato del Ingeniero no los tiene
**Decisión.** `EngineerStatus` (`internal/engineer/service`) publica módulos (`enabled`, `spotterEnabled`, `subtitlesEnabled`), sensibilidad y salidas por categoría, y nada más: no hay voz, ni volumen, ni atenuación del juego. Ingeniero Orbit escribe en lo real por los mismos eventos que `EngineerPage` (`engineer:enabled|spotter|subtitles|sensitivity|output:set`) y, para la fila de Voz, usa el motor **del sistema** (`speechSynthesis`): el `Select` lista las voces instaladas de verdad y «Probar voz» habla con la voz y el volumen elegidos. Voz y volumen se guardan en `vantare.v03orbit.engineer.voice` y la superficie lo dice en su meta («ajuste local»).
**Consecuencia.** «Atenuar el juego al hablar» se porta como `Toggle` **deshabilitado** con el motivo escrito («Aún no está en el contrato del Ingeniero»), igual que «Estrategia en vivo · Próximamente»: prometer un ducking que nadie implementa sería peor que dibujarlo apagado. Cuando el servicio publique voz, volumen y atenuación, esta capa local se retira.

## D-69 · El estado de la cabecera es el del sim de la shell, sin inventar los Hz
**Decisión.** El briefing pide `SubtleStatus ok` «LMU · 15 Hz». `TelemetrySourceStatus` publica `kind`, `name`, `live`, `available` y `state`, pero **no** la frecuencia, y `EngineerStatus.connected` es otra verdad distinta. La cabecera lee el mismo `simStatus` que la shell calcula y pinta en el Pill LMU de la columna (`sim-status-context`, D-4x del Studio), con tres textos honestos: «LMU · en directo», «LMU · buscando sesión» y «LMU · sin fuente». Los Hz llegarán cuando la fuente los publique.

## D-70 · La radio no se exporta todavía, y lo dice
**Decisión.** El runtime de Telemetry Core no expone ninguna exportación del registro de radio (a diferencia de Estrategia, que sí tiene `strategy-transfer.ts`, D-64). El botón «Exportar» del pie del feed avisa con el motivo real («el runtime aún no expone una exportación de radio; llega con el registro de sesión») en vez de descargar un JSON inventado por la pantalla.

## D-71 · El feed es el scroller, y el harness siembra veinte mensajes
**Decisión.** `Surface fill` deja el scroll en el cuerpo; aquí el cuerpo se vuelve columna sin scroll y el `ol` del feed es el único scroller, para que el pie con la nota y «Exportar» quede fijo abajo como en la referencia (`.rf-foot`). El harness siembra **veinte** mensajes en vez de los ~12 del briefing: con doce el feed no llega a desbordar a 1080 y el criterio «el feed se desplaza dentro» no se podía comprobar. `visual:engineer-radio` no se toca: mide el widget de radio del overlay, no esta pantalla, y sigue verde.

## D-72 · Telemetría arranca vacía porque no hay fuente de sesiones expuesta al frontend
**Decisión.** Los ADR 0004 / 0005 sitúan las sesiones en la base DuckDB de `internal/telemetryanalysis`, pero ese paquete **no está cableado a la app**: no hay servicio Wails, ni binding generado, ni evento, ni store del hub que publique sesiones grabadas (`telemetry-transport` solo lleva el directo). Así que la vista Orbit no inventa una sesión: monta la **misma estructura** (cabecera, `Seg` de referencia, cuatro KPI, mapa, insights y trazas) con los cuerpos vacíos y el motivo escrito, «No hay sesiones disponibles · importa archivos locales de LMU cuando el flujo esté disponible», también en la nota del pie y en el hint de la columna. `telemetry-orbit-source.ts` deja la puerta abierta con `realTelemetrySessions()`, que hoy devuelve la lista vacía y mañana leerá el puente.
**Consecuencia.** `Telemetría` sigue marcada `soon` en el rail (el punto de «Próximamente» de `OrbitShell`): la vista es navegable y honesta, pero lo que enseña todavía no es telemetría tuya. El punto se retira cuando la fuente publique sesiones de verdad.

## D-73 · El generador sintético de `13.6` vive detrás de un flag y va etiquetado dos veces
**Decisión.** El prototipo genera ocho curvas, cuatro canales de 400 muestras, el trazado Catmull-Rom y los insights. Eso se porta entero a `telemetry-orbit-model.ts` (con tests de determinismo, reescalado por referencia y orden por pérdida), pero **no se enciende por defecto**: hace falta `?telemetryDemo=1` o `vantare.v03orbit.telemetryDemo` en local. Con el modo demo encendido, «Datos sintéticos» aparece en el `SubtleStatus` de la cabecera **y** como título de la `Note` del pie, que además explica que el circuito, los canales y los insights los fabrica la propia pantalla. En producción, sin el flag, no hay forma de ver un dato inventado.

## D-74 · El eje «Tiempo» de las trazas se porta deshabilitado
**Decisión.** El `Seg` de las trazas ofrece Distancia y Tiempo, pero el prototipo solo dibuja por distancia y el generador solo produce muestras equiespaciadas en vuelta. «Tiempo» se porta como opción **deshabilitada** del `Seg` del kit (con el motivo en su tooltip propio, nunca en un `title` nativo), igual que «Estrategia en vivo» del Ingeniero: prometer un eje que no existe sería peor que dibujarlo apagado.

## D-75 · Las etiquetas de curva de las trazas bajan una línea, no se mueve el rótulo del canal
**Decisión.** El rótulo del canal (`.orbit-trace__k`, «Velocidad km/h») vive arriba a la izquierda del SVG y la primera curva del circuito de demostración cae al 6 % de vuelta, justo debajo: se solapaban. En vez de desplazar el rótulo —que es el ancla de lectura de las cuatro trazas y debe quedar alineado— se bajan **todas** las etiquetas `Tn` una línea (`transform: translateY(13px)` en `orbit-telemetry.css`, acotado a `.orbit-tel__stack`). Se mueven todas y no solo la primera para que la fila de etiquetas quede a la misma altura en las cuatro trazas.

## D-76 · La cabecera dice de dónde salió la fuente, no siempre «disponible»
**Decisión.** `fetchRoadmapDataset` nunca lanza: cuando la red falla devuelve exactamente `ROADMAP_FALLBACK`, la copia empaquetada del JSON. Anunciar «Fuente disponible · vX» en ese caso sería mentir sobre la frescura de lo que se lee, así que `loadRoadmapSource` compara la identidad del objeto y la vista distingue tres estados: «Cargando la fuente…» (neutral), «Fuente disponible · vX» (ok) y «Fuente empaquetada · vX» (attn). La versión no sale de un campo del JSON sino del `target` de la fase en curso, que es el dato que la fuente sí declara.

## D-77 · El estado del hito se deriva del `type`, porque no hay otro dato
**Decisión.** La referencia pinta los hitos con puntos `done`/`active`/`planned`, pero `docs/roadmap-source.json` no declara estado de hito: declara `type` (`release`, `feature`, `fix`, `plan`) y una `label` traducida. Se deriva lo único derivable —una release publicada está hecha, un plan está por planear, lo demás está en curso— y la `label` del JSON se pinta tal cual bajo cada hito, sin reescribirla.

## D-78 · Las tarjetas de área enseñan el porcentaje real, no una descripción inventada
**Decisión.** Las siete tarjetas de la referencia llevan un subtítulo editorial («Studio V3 · catálogos · inspector») que no existe en la fuente. En vez de escribirlo en la pantalla, el subtítulo es el porcentaje del área, contado desde el snapshot de proyectos cuando el área está enlazada (`resolveAreaProgress`, igual que la página v5.2) y desde el número declarado cuando no lo está. El rótulo lateral («en curso», «planificada») sí viene del estado declarado.

## D-79 · El eyebrow de fase no repite el estado cuando el objetivo es el mismo texto
**Decisión.** El briefing pide «Estado · versión · %». La fuente escribe el objetivo a mano y en las fases sin versión repite el propio estado («Por planear», «Futuro»), así que el eyebrow salía como «Por planear · Por planear · 25 %». Cuando objetivo y estado coinciden se dice una sola vez (`roadmap.phases.eyebrowShort`); con una versión de verdad se mantienen los tres campos.

## D-80 · El canal lo pone la shell, que es la única que lo sabe
**Decisión.** El `StatRow` pide «Canal actual» y el frontend no tiene un servicio de canal de actualización expuesto a la vista: lo más cercano es el canal de Testing Center que `OrbitShell` ya resuelve (build + capacidades de la licencia). La pantalla recibe ese canal como prop y cae en `stable` cuando no hay ninguno, en vez de inventar un selector o leer un ajuste que no existe.

## D-81 · Los atajos se portan agrupados, pero solo los que la app registra
**Decisión.** El prototipo dibuja cuatro grupos y trece combinaciones (Overlay 4 · Launcher y carrera 3 · Studio 4 · Global 2). El contrato real (`settings-contract.ts · HOTKEY_KEYS`) declara **cuatro**, y las cuatro son del overlay. Se porta el grupo «Overlay» con sus cuatro filas reales y una `Note` que dice exactamente qué falta y por qué; los otros nueve atajos no se pintan ni siquiera en gris, porque una fila con keycaps es una promesa de que pulsar esa combinación hace algo. `HOTKEY_GROUPS` está escrito para que añadir un grupo sea añadir una entrada el día que el backend registre más.

## D-82 · «Instalar automáticamente al salir», «Cerrar a la bandeja» y «Unidades» no se pintan
**Decisión.** Los tres controles existen en la referencia y ninguno tiene nada detrás: el actualizador no guarda una preferencia de instalación automática (la instalación siempre la lanza el usuario), y la configuración de la app no tiene ni cierre a bandeja ni sistema de unidades. Un toggle que no escribe en ningún sitio es peor que su ausencia, así que las secciones lo declaran en una `Note` en vez de dibujar un control decorativo. Se mantienen los que sí existen: inicio con Windows, empezar minimizado y los tres avisos.

## D-83 · Dispositivos enseña uno, el verificado, porque el servicio no publica la lista
**Decisión.** La referencia lista «este dispositivo» más otros con botón «Cerrar». `docs/license-service-contract.md` solo expone `deviceOK` para el equipo actual y un `license:reset-device` con límite de 1 cada 24 h; no hay endpoint que enumere dispositivos ni que cierre uno remoto. La tarjeta muestra el equipo actual con su estado real y ofrece «Restablecer dispositivo», que es la acción que de verdad existe, con una `Note` explicando por qué no hay más filas.

## D-84 · El tema se guarda aunque Orbit imponga el suyo
**Decisión.** `applyOrbitThemeWhileMounted` fuerza el tema Orbit mientras la shell está montada y restaura el del usuario al desmontarla (D-06). Las tres muestras de Interfaz siguen siendo reales: escriben la preferencia con `persistThemeId`, que es la que vuelve al apagar el flag. La fila lo dice en su subtítulo y en una `Note`, en vez de fingir un cambio inmediato que la shell revertiría en el mismo frame.

## D-85 · «Reducir animaciones» es una preferencia local declarada como tal
**Decisión.** No hay contrato en Go para el movimiento reducido. En vez de omitir la fila o inventar un ajuste del backend, se implementa igual que la densidad: `data-reduce-motion` en el `body`, persistido en `localStorage`, y CSS que apaga las mismas duraciones que ya apaga `prefers-reduced-motion` en los tokens. El subtítulo dice que es local y que la preferencia del sistema se respeta siempre.

## D-86 · Un payload de ajustes sin `hotkeys` ya no borra las cuatro combinaciones
**Decisión.** `useAppSettings` sustituía el objeto entero al recibir el evento `settings`, así que un backend que marshala el mapa nil como `null` —o cualquier payload antiguo sin el campo— dejaba las cuatro filas en «sin asignar» sobre atajos que el backend seguía registrando. Ahora las claves ausentes se rellenan con `DEFAULT_APP_SETTINGS.hotkeys` y las presentes mandan. Es un arreglo del hook real, no de la pantalla: la página v5.2 tenía el mismo agujero.

## D-87 · Testing Center porta el formulario y el consentimiento, no las pestañas ni el panel de validación
**Decisión.** La pantalla v5.2 lleva dos pestañas («Reportar» y «Validar», esta última con `CandidateFeedbackPanel`) que el briefing 12 no menciona: la referencia dibuja una sola cosa, el formulario con su tarjeta de consentimiento. La vista Orbit porta exactamente eso y el panel de candidatos se queda donde está, con la shell v5.2, hasta que un briefing lo pida. El flujo portado es el real: mismo `testing-center-client` para abrir, guardar y borrar el borrador, misma `validateReportFields` y mismo RPC `submitTestingCenterReport`.

## D-88 · «Logs de producto» se pinta deshabilitado siempre, y por eso no se pide el búfer
**Decisión.** El briefing marca replay y logs como deshabilitados. En la v5.2 la casilla de logs sí se activa cuando el diagnóstico declara `availableLogCount > 0`. Aquí se respeta el briefing —la fila es informativa y `includeLogs` va siempre en `false` al RPC—, lo que además evita prometer un búfer que en la práctica no existe. El diagnóstico preparado sí es real: al marcarlo se pide `prepareDiagnostic`, se comprueba que el canal coincide y se enseña el tamaño y el digest de la vista previa antes de enviar, que es lo que sostiene la frase «nada se adjunta sin selección explícita y vista previa».

## D-89 · La redirección sin canal la hace la shell, con toast, además del corte que ya hacía el hub
**Decisión.** `HubApp` ya devolvía a Inicio la sección `testing-center` sin canal, pero en silencio. El botón del rail tampoco existe sin canal, así que llegar a la vista es cosa de una URL o de un estado viejo. `OrbitShell` añade el aviso que faltaba: si la vista activa es `testing` y no hay canal, muestra el toast «Testing Center no está disponible en Stable» y navega a Inicio; `navigate("testing")` sin canal hace lo mismo en vez de cambiar de vista. Es la shell quien lo hace porque es la única que conoce el canal y el toast.

## D-90 · La bienvenida y el aviso de carrera son capas de la app, no contenido de una pantalla
**Decisión.** `BetaWelcome` y `CalendarReminderBanner` viajaban dentro de `children` de la shell. La shell Orbit pinta `children` solo en su rama de respaldo —hoy únicamente Overlays Studio, porque el resto de vistas tienen página Orbit propia—, así que el onboarding del primer arranque aparecía en Studio en lugar de encima de Inicio. Ambos son capas `fixed` sobre toda la app, así que pasan a ser hermanos de la shell en `HubApp` y funcionan igual con el flag ON y OFF. Además la vista inicial con Orbit se resuelve en `orbit/initial-view.ts`: Inicio salvo preferencia guardada válida en `vantare.v03orbit.view`, y si el onboarding está pendiente se fuerza Inicio y se reescribe la preferencia, para que una sesión de pruebas que dejó `studio` guardado no secuestre el primer arranque de un usuario nuevo.

## D-91 · «Mis perfiles» es una capa de presentación sobre la ruta del Studio, no una pantalla nueva
**Decisión.** La pantalla que Isaac vio con la piel v5.2 es `OwnProfilesView`, que `StudioRoute` monta cuando su modo interno es `ownProfiles`. Portarla como pantalla independiente habría duplicado el store de perfiles, la activación y el editor de layout. En su lugar `profiles-orbit/ProfilesOrbitPage` recibe **exactamente las mismas props** que la vista legada y `StudioRoute` elige una u otra según el flag: con Orbit apagado no cambia absolutamente nada. La tarjeta usa el `MiniStage` real del perfil (el mismo `HomeMiniStage` de la focal de Inicio), no una miniatura aparte, y la rejilla es la que hace scroll, no la página. Además se abre la puerta de entrada que faltaba: `navigate("studio", "profiles")` desde «Gestionar» de Inicio llega hasta `StudioRoute` a través de `HubApp`, que ya recibía el destino de la shell y lo tiraba.
