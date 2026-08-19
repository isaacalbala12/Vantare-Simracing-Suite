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

## D-92 · La resolución del icono real es un hook compartido, no una copia por pantalla
**Decisión.** El Launcher Orbit pintaba siempre monogramas de iniciales porque `toOrbitApp` descartaba `iconUrl` y `executablePath`, los dos campos que el Launcher clásico usa en `AppBadge` para pedir al backend el icono extraído del ejecutable (`launcher:app:icon`). En vez de duplicar esa lógica se extrae a `launcher/use-app-icon.ts`, con su caché de módulo compartida —el mismo icono se pinta en el catálogo, en cada paso de cada cadena y en el Launcher clásico, y extraerlo cuesta disco—, y `AppBadge` pasa a consumirla. El kit solo gana un `src` opcional en `Monogram`/`ChainStep`: la misma caja, el mismo radio, y las iniciales como respaldo cuando la imagen no carga. Ningún logotipo entra en el repositorio: el icono sale del ejecutable del usuario o no se pinta.

## D-93 · «Crear perfil» no puede esperar al backend, y «sin perfiles» no puede contradecir a la lista
**Decisión.** El botón buscaba el perfil recién creado en la instantánea del store, que solo lo trae cuando el backend confirma el guardado: hasta entonces el clic no abría nada. Ahora el borrador se guarda en local **antes** de despachar, así que el `ProfileEditor` —el editor real, sin duplicar— abre en el mismo clic. En la columna, `SideProfile` pintaba «Sin perfiles todavía» siempre que faltaba el perfil *activo*, aunque debajo hubiera un recomendado: la frase pasa a exigir que tampoco haya recomendado. Y el catálogo deja de mentir mientras espera: sin instantánea se pintan `SubtleStatus` «Detectando aplicaciones…» y filas de relleno, y solo con respuesta en la mano se dice que el catálogo está vacío.

## D-94 · Ningún control de Orbit se queda mudo: o hace lo que promete, o dice por qué no puede
**Decisión.** La auditoría de cableado (`evidence/porte/wiring-audit.md`, 142 controles) encontró cinco clases de deuda y las cierra con una sola regla: un control interactivo o ejecuta el flujo real que ya existe en el código, o queda deshabilitado con el motivo en su tooltip propio (`data-tip`, nunca `title`), o avisa con un toast que explica la causa. Ni un botón que no hace nada, ni un `onChange` que devuelve `undefined`, ni un toast que solo repite el nombre de lo que se ha pulsado.

Lo que cambia de comportamiento: (1) «Activar» del perfil recomendado en la columna **activa** el perfil (`hub:set-active`, el mismo evento que Inicio) en vez de limitarse a abrir el Studio; (2) el pill de actualización de la topbar lleva a Ajustes › Actualizaciones —donde viven el estado, el canal y el botón de instalar— en lugar de emitir `updater:install` a ciegas; (3) la columna en Studio › Mis perfiles deja de estar vacía y porta la lista de perfiles, con el activo marcado y el clic abriendo el editor de layout; (4) la marca del rail pierde su `title` nativo, el único que quedaba; (5) las filas de «Otros eventos» de Estrategia, que son botones y no tenían `onClick`, explican que el puente publica un solo evento activo; (6) «Editar piloto», «Atenuar el juego» y el eje «Tiempo» de Telemetría pasan de gesto falso a deshabilitado con motivo, porque el contrato que los sostendría todavía no existe.

Lo que **no** cambia: el diseño, los tokens y los datos. Esto es cableado y estados, y por eso todas las capturas de los harnesses siguen coincidiendo.

## D-95 · La marca es el icono de Inicio, y el avatar del rail es la cuenta
**Decisión.** Dos correcciones sobre el rail que comparten una idea: cada hueco pinta lo que dice ser.

(1) **Inicio lleva la marca de Vantare, no una casita.** El sprite gana `i-vantare`, el chevrón ‘A’ sin travesaño del logotipo trazado como contorno cerrado con las reglas del resto del sprite (`stroke="currentColor"`, trazo heredado 1.75, sin relleno, uniones redondas). Caja 24 —como `i-comando`— y no 18: con caja 18 el trazo relativo se come el hueco interior del chevrón y a 23 px la ‘A’ se cierra en un triángulo. `RAIL_ORDER` apunta Inicio a `i-vantare`; la losa de marca de la cabecera del rail sigue con el PNG a color, así que el rail no repite el mismo dibujo: arriba la marca llena en carmín, abajo el icono de línea que se ilumina con la barra de activo.

(2) **El avatar es la foto de la cuenta, nunca la inicial del plan.** El rail caía en `planLabel.charAt(0)` —de ahí la ‘F’ de Free— porque la shell le pasaba `avatarSrc={undefined}` y nadie leía la sesión. Se añade `orbit/use-account-identity.ts` como fuente única de `{ displayName, email, avatarUrl }`: lee la sesión real de Supabase (Google deja el nombre y la foto en `user_metadata` con dos nombres cada uno, `full_name`/`name` y `avatar_url`/`picture`; se aceptan los cuatro), se suscribe a los cambios de sesión y usa el correo de la licencia como respaldo. La consumen el rail y Ajustes › Cuenta, que antes inventaban su identidad por separado. Sin foto se pinta la inicial del **nombre**, y si no hay nombre la del correo; el plan ya no participa. Si la imagen no carga se vuelve a la inicial, y se recuerda *qué* url falló, no un booleano, para que un cambio de foto se reintente. `Rail` pierde la prop `planLabel`: quitarla es lo que garantiza que la regresión no puede volver. Los harnesses siembran una identidad de prueba con `seedAccountIdentity`, porque sin runtime ni Supabase configurado no hay sesión y la captura saldría con el avatar vacío.

## D-96 · El rail no repite la marca: fuera la losa, y la marca como icono se decide sobre capturas
**Decisión.** Dos cambios sobre el rail, uno cerrado y otro abierto.

(1) **Se elimina la losa cuadrada de marca de la cabecera del rail** (`.orbit-rail__brand` y su PNG de 26 px dentro de la caja de 49 px, la prop `labels.brand` del `Rail`, la clave `shell.rail.brand` de los cuatro idiomas y el `data-testid="orbit-rail-brand"`). Desde D-95 el botón de Inicio ya pinta la marca como icono de línea: la losa la decía dos veces, una en carmín lleno y otra a 23 px justo debajo. El rail arranca ahora directamente en Inicio, con `padding-top: 9px` — el botón mide 52 px y la topbar 70 px, así que `(70 − 52) / 2 = 9` deja el primer icono centrado en la banda de la cabecera y alineado con el título de la columna contextual. El PNG `assets/orbit/vantare-mark.png` se conserva en el repositorio (es la marca real extraída del prototipo), simplemente ya no lo consume nadie. `03-shell-y-layout.md` sigue describiendo la losa: el documento es de solo lectura en este porte y esta decisión es la que manda.

(2) **La marca como icono se rehace y queda en tres variantes hasta que se elija.** El `i-vantare` de D-95 era un contorno *cerrado* en caja 24: a 23 px se leía como un triángulo con un hueco pequeño y no casaba con el peso de sus vecinos, que son formas abiertas de línea en caja 18. Las tres variantes nuevas comparten el chevrón exterior `M3 15 9 3l6 12` en caja 18 —mismo alto visual (3→15) que `i-studio` y `i-launcher`, trazo heredado 1.75, `fill: none`, ápice y extremos redondos por herencia— y se diferencian solo en el gesto interior:

- `i-vantare-a` — chevrón + trazo corto interior paralelo al brazo izquierdo (`M9.1 9.3 6.3 14.9`): sugiere el peso del brazo izquierdo del logotipo sin cerrar la figura.
- `i-vantare-b` — doble chevrón anidado (`M6.5 15 9 10l2.5 5`): es literalmente el hueco en ‘V’ de la marca, con las dos ‘V’ paralelas (pendiente ±0.5 en ambas).
- `i-vantare-c` — chevrón + corte diagonal corto en la base interior (`M5.6 15 10.9 12.3`): la ‘A’ estilizada, el travesaño convertido en corte.

Las tres se quedan en el sprite hasta que Isaac decida; `i-vantare`, que es lo que consume `RAIL_ORDER`, copia hoy la variante **b** de forma provisional. La franja de comparación vive en `orbit-tokens-harness` (`data-testid="orbit-mark-variants"`, tres variantes contra tres vecinos del catálogo, en inactivo y activo, a 23 px y a 69 px) y `scripts/orbit-foundations-visual.mjs` la guarda como evidencia de la shell en `evidence/porte/01-shell/orbit-rail-mark-variants.png`. La rejilla de iconos de fundamentos sigue teniendo 15 símbolos: las variantes se pintan en su propio panel para no tocar ese contrato.

## D-97 · La marca como icono es la variante b (doble chevrón anidado)
**Decisión.** Isaac eligió la variante **b** de D-96 («claramente b»). `i-vantare` queda con `M3 15 9 3l6 12` + `M6.5 15 9 10l2.5 5` en caja 18; los símbolos `i-vantare-a` y `i-vantare-c` (y el alias `i-vantare-b`) se retiran del sprite y de `IconName`. El panel del harness de fundamentos pasa a ser de control (marca elegida contra tres vecinos, 4 filas) y la evidencia se guarda como `evidence/porte/01-shell/orbit-rail-mark.png`.
## D-W1-1 · El `Select` del kit deja de ser un `<select>` nativo: desplegable propio, misma API
**Decisión.** `ui/orbit/Select.tsx` envolvía un `<select>`, así que el trigger era del kit pero la lista desplegada la pintaba el sistema operativo: fondo claro, tipografía del SO y ninguna relación con los tokens. Se rehace como combobox propio: `button role="combobox"` con **el mismo aspecto de siempre** (clase `orbit-select`, altura `--orbit-control-h`, chevrón del `data:` URI, ancho opcional vía `--orbit-select-w`) y una lista `role="listbox"` portada a `body` con `position: fixed`, superficie `--orbit-surface-2`, `--orbit-shadow-menu`, filas de 38 px con hover, tick carmín en la opción activa, grupos opcionales y scroll interno a partir de 8 opciones. La posición se mide contra el viewport y la lista se voltea hacia arriba cuando abajo no cabe.

La API de props **no cambia** (`value` / `onChange` / `options` con `{value, label, disabled}`), y por eso los consumidores actuales —inspector del Studio (Sistema, Diseño, Frecuencia, Visible en boxes), Ingeniero, Ajustes, Estrategia, Testing Center, Telemetría y la topbar del Studio— siguen funcionando sin tocar una línea. `options` gana dos campos opcionales, `leading` (el punto de color del piloto de Estrategia) y `group`. Queda una vía `native` para el caso en que algún e2e necesite el control del sistema, pero nadie la usa hoy.

Teclado completo (↑↓ saltando deshabilitadas, Home, End, Enter, Esc, typeahead con ventana de 700 ms), cierre por clic fuera y por `Esc` con el foco devuelto al trigger, y `aria-activedescendant` sobre la opción activa. `measure()` depende del **alto** que necesita la lista, no de la identidad del array de opciones: los consumidores lo recrean en cada render y depender de él encadenaría reposicionamientos sin fin.

## D-W1-2 · La casilla también es del kit: `Check`, sin `input` nativo
**Decisión.** Los tres consentimientos del Testing Center eran `<input type="checkbox">` con `accent-color`, el último control del sistema que quedaba en la piel Orbit. Se añade `ui/orbit/Check.tsx`: `button role="checkbox"` con `aria-checked`, caja 18×18 y marca carmín, y la copia (título + ayuda) dentro del propio control, de modo que toda la fila es el objetivo de clic sin anidar interactivos. `orbit-testing.css` pierde sus reglas sobre `input` y pasa a usar `:disabled`.

## D-W1-3 · La columna del Studio es solo la lista de widgets
**Decisión.** «Próximas carreras» y «Launcher» seguían ocupando la columna en la vista Studio y le robaban altura a la lista de widgets, que es lo único que el briefing 04 pide ahí (el bloque «Perfil de overlay» ya estaba oculto). Se añade `"studio"` al `hiddenFor` de esos dos bloques en `OrbitShell`. Sin bloques persistentes, `ContextColumn` no pinta la caja `orbit-column__blocks` y el slot del Studio se queda con toda la altura: la lista ocupa el hueco con scroll interno y «Añadir widget» queda fijo abajo. El harness lo verifica con tres asertos nuevos (`columnBlocks === 0`, la lista ocupa más de la mitad del slot, el pie visible dentro del viewport).

## D-W1-4 · Nadie hereda scroll horizontal: `overflow-y: auto` obliga a declarar el eje X
**Decisión.** Las barras horizontales que salían bajo la lista de widgets y al pie de la ventana no venían de un hijo demasiado ancho sino de la especificación: cuando un eje deja de ser `visible`, el otro se computa como `auto`. `.orbit-column__context`, `.orbit-column__blocks` y `.orbit-studio-wlist__items` declaraban solo `overflow-y: auto`, así que cualquier nombre largo sacaba barra en X. Se les añade `overflow-x: hidden`.

La del pie de la ventana (visible también en Inicio) era `.orbit-workspace { overflow: auto }` recogiendo el halo decorativo de `.orbit-home__hero-side::before`, que sangra un 16 % fuera de su columna de 300 px. El espacio de trabajo pasa a `overflow-x: hidden` + `overflow-y: auto`: la rejilla ya cabe por diseño y lo que sí deba desplazarse en X lo declara su propio contenedor (`.orbit-tl`, `.orbit-studio-stage-wrap`).

Solo se veía en la build real porque `HubApp` añade la clase `hub` al `body`, que suelta el `overflow` de la página; los harnesses no la ponían. El nuevo `scripts/orbit-overflow-assert.mjs` reproduce esa clase y comprueba, en shell, Inicio y Studio, que `document.documentElement.scrollWidth <= innerWidth` y que ningún contenedor de la shell con `overflow-x` efectivo `auto`/`scroll` desborda, salvo la lista blanca de los que sí deben desplazarse.

## D-W1-5 · El perfil activo se refresca con `hub:profile-activated`, que es lo que emite el backend
**Decisión.** `use-overlay-state.ts` solo escuchaba `settings` para saber cuál es el perfil activo, pero `HubService.SetActiveProfile` **no** reemite `settings` tras `hub:set-active`: confirma con `hub:profile-activated`, que lleva `activeProfileId` (es exactamente lo que escucha `StudioRoute`). Por eso el toast decía «activado» y la columna, Inicio, Perfiles y la topbar del Studio seguían marcando el anterior hasta recargar. El hook se suscribe a ese evento, toma el id del payload y además vuelve a pedir `hub:list` y `settings:get`, porque una de las rutas del backend emite solo `{ok: true}`.
## D-W2-1 · La losa del icono solo cae a iniciales cuando han fallado *todos* los candidatos
**Decisión.** En la build real CrewChief salía con la losa vacía y otras aplicaciones con el icono pequeño y descentrado dentro de la losa de 39 px. Tres causas, tres correcciones en la misma cadena.

(1) **Faltaban candidatos.** `resolveIconCandidates` solo miraba el activo oficial y `iconUrl`, e ignoraba `iconOverridePath` —el icono que el usuario elige a mano— y `userExecutablePath` —la ruta que corrige una detección fallida, y de la que hay que extraer el icono cuando la ruta detectada no sirve—. La cadena queda ordenada de más a menos específica: `iconOverridePath` → activo oficial → `iconUrl` → icono extraído del ejecutable, sin duplicados y descartando cadenas vacías o remotas (`http(s)`, que el hub no descarga).

(2) **La escucha se rehacía con cada candidato.** El efecto que se suscribía a `launcher:app:icon:result` dependía de `src`, así que al fallar un candidato se desmontaba y volvía a montar: si el backend respondía en esa ventana, el resultado se perdía y la losa se quedaba vacía hasta un remontaje. La suscripción pasa a depender solo del `id`, y la petición de extracción vive en su propio efecto. Además, cuando el que falla es el icono ya extraído se le retira de la caché compartida **sin** avanzar el contador de fallos: al desaparecer de la lista, avanzarlo se saltaba un candidato válido.

(3) **La caja del icono era del 78 %.** Con `object-fit: contain` dentro de un 78 % un icono ancho se quedaba visiblemente pequeño, al revés que el `AppBadge` legado, que lo pinta a caja completa. `.orbit-monogram__img` pasa a ocupar la losa entera con su aire como padding. Y el degradado del monograma gana valor de reserva: una aplicación añadida a mano puede no traer `gradientFrom`/`gradientTo`, y sin reserva la losa quedaba transparente —exactamente la «losa vacía» que se veía—.

## D-W2-2 · La nota de estado neutral caduca con la primera detección
**Decisión.** «El catálogo procede del repositorio; ninguna aplicación se presenta como instalada hasta ejecutar la detección» explica por qué todo aparece como catálogo *antes* del primer escaneo. Después es falsa y ocupa el pie de la superficie. Se pinta solo mientras `discovery.lastScanAt` es nulo; en cuanto hay detección, la cabecera del catálogo cambia su meta por la fecha del escaneo y el número de detectadas. El meta va sin la palabra «Detección» porque la pill de la cabecera de la vista ya dice «Detección ejecutada …» y en 390 px de columna el rótulo largo se montaba sobre el título; el título de `Surface` gana además recorte con elipsis para que ningún meta pueda volver a solaparse.

## D-W2-3 · El editor de perfil es un cajón del kit, con la lógica intacta
**Decisión.** El editor de perfiles seguía siendo el diálogo legado en Tailwind suelto dentro de una pantalla Orbit. Se porta sin tocar una sola regla: el mismo borrador local, las mismas validaciones de `launcher-state` (`isProfileLaunchable`, `hasDuplicateSteps`, `isHotkeyAllowed`) y un único `onSave(draft)` hacia el mismo handler. Lo que cambia es el envoltorio: el kit gana `Drawer` —panel derecho de 480 px, cabecera con título y cerrar, cuerpo con scroll interno, pie de acciones ghost/primario, velo oscurecido, `Esc` y clic fuera, trampa de foco y devolución del foco al abridor, 280 ms de `translateX` (0 s con `prefers-reduced-motion`)— y `OrbitProfileEditor` monta dentro el mismo formulario con `Field`/`Input`/`Textarea`/`Select`/`Toggle`. El atajo global deja de escribirse a mano: se graba con el mismo `parseKeyEvent` que Ajustes y se enseña en un `KeycapRow` con keycaps físicos.

## D-W2-4 · La tarjeta «Crear perfil» es una invitación, no una tira
**Decisión.** Se redibuja según la referencia y el prototipo (`.launch-profile.add`): borde punteado de 1 px en `ink-3`, radio del kit, fondo transparente, monograma 46 punteado con `+`, título 15/650 y descripción 12,5 en `ink-2`, y altura mínima igual a la de una tarjeta de perfil plegada (20 + 46 + 20 = 86 px) para que no quede aplastada al final de la columna. El hover ilumina borde y `+` en carmín tenue, y el foco tiene anillo visible propio en lugar de compartir el estilo del `:hover`.

## D-W2-5 · Las iniciales de un perfil saltan los nexos
**Decisión.** La referencia rotula «Creador de Contenido» como **CC**; `profileInitials` daba CD porque tomaba las dos primeras palabras sin más. Los nexos (`de`, `del`, `la`, `y`, `of`, `the`…) dejan de contar, y si un nombre es solo nexos se vuelve al reparto anterior para no quedarse sin iniciales. En la columna de contexto la cadena pasa a encadenar nombres completos («LMU → OBS → Spotify»), como la referencia, en lugar de abreviaturas.
## D-W3-1 · En Carreras el único que desplaza es el cuerpo de la Surface
**Decisión.** El scroll de página que se veía en la build real no era el del documento —la shell es `100vh`— sino el del `.orbit-workspace`: la pantalla crecía por dentro. La raíz `.orbit-races` pasa a recortar (`overflow: hidden`) y cada vista deja de tener scroller propio: las cinco declaran `min-height: 100%` y desplazan en el cuerpo de la Surface, que ya es el scroller del kit. Esto no es solo higiene: una rejilla con altura definida no deja crecer sus pistas más allá del hueco libre, y por eso las celdas de Mes salían recortadas con el contenido amontonado. Todos los contenedores desplazables usan la barra fina del sistema de tokens (`--orbit-scroll-thumb` / `--orbit-scroll-track`, `scrollbar-width: thin`), incluido el eje del timeline. El harness comprueba ahora el desbordamiento del workspace y de la pantalla, no solo el del documento, y repite las cinco vistas también a 1920×900.

## D-W3-2 · Próximas agrupa por hora: la hora sube a la cabecera y la fila se queda con la carrera
**Decisión.** La lista repetía la hora en filas consecutivas y la carrera competía con ella por el peso visual. `groupByHour` parte las salidas en grupos por hora en punto; cada grupo abre con una cabecera pegajosa (`01:00 · en 10:06`, mono, coral en el primer grupo) y las filas quedan en 52 px con el nombre en 14/650, circuito · clase en 12 apagado y a la derecha la hora exacta, la meta `20 min · fijo` en mono y el `Chip` de licencia. La fila elegida se marca con una barra carmín a la izquierda —y solo la primera salida de la serie cuando no hay hora elegida, para que la barra no se repita.

## D-W3-3 · La celda de Semana enseña horas, no cadencia
**Decisión.** «cada 15 min · :00 +» era el mismo texto en las setenta celdas y no decía cuándo se corre. Ahora la celda pinta hasta cuatro horas concretas de ese día —desde ahora si el día es hoy, desde medianoche en el resto— y cuenta el resto en un «+n» que abre Día. Cada hora es un botón que selecciona serie **y** hora en el detalle; la cabecera del día es un botón que abre Día en esa fecha; el día en curso se sombrea y los ya cerrados se atenúan. La cabecera de días y la columna de series quedan fijas al desplazar. En Mes el número del día, «n series diarias» y los eventos son botones (día → Día en esa fecha, serie semanal → su detalle), con «+n» cuando hay más de dos eventos con nombre.

## D-W3-4 · El zoom del timeline es un factor sobre «24 h caben», no píxeles sueltos
**Decisión.** `HorizontalTimeline` gana zoom de forma retrocompatible: sin `pxPerHour` se dibuja exactamente como antes (Estrategia no se entera). Con él, el ancho del contenido lo manda el zoom, `ctrl+rueda` propone un nuevo valor manteniendo quieto el punto del cursor, `shift+rueda` y el arrastre desplazan el eje, y `onAxisWidth` devuelve el ancho útil para que la pantalla calcule sus límites. El eje **siempre** cubre 24 h; lo que cambia es cuántas se ven. El zoom se guarda como factor entre 1× —el mínimo, con el que las 24 h caben en el hueco— y 4×, así que persistirlo en local no depende del tamaño de la ventana; el `Seg` de 6 h / 12 h / 24 h es el zoom grueso (`fitZoom`) y «Ajustar» vuelve a él. Las etiquetas del eje se reparten cada hora, media hora o cuarto según los píxeles disponibles, y los bloques solo escriben su nombre si caben: el resto lo cuenta su tooltip propio (`data-tip`, nunca `title`).

## D-W3-5 · El detalle habla de una salida concreta
**Decisión.** Elegir una hora en Semana, Mes, Día, Timeline o en la lista de Próximas ya no selecciona solo la serie: el detalle cambia el rótulo a «Salida elegida» y cuenta atrás **esa** hora. Se añaden «Ver en Timeline» y «Ver en Día», que llevan la salida elegida a la vista correspondiente sin perder la selección.
## D-W4-1 · El evento de Estrategia es un registro local, no un dato que solo puede publicar el puente
**Decisión.** Hasta aquí la pantalla dependía de `strategy:roster`: sin ese evento no había nada que planificar y la vista se quedaba en «Elige evento y pilotos» con una lista de series que no abría nada. El feedback de Isaac —«debería poder elegir entre hacer yo mi estrategia o coger una de un evento»— no cabe en ese modelo, así que el evento deja de ser un dato externo. `strategy-orbit/strategy-events-store.ts` guarda una lista de eventos en `vantare.v03orbit.strategy.events`, cada uno con su circuito, su clase, su duración, su salida real (ISO), su depósito, su tiempo de parada, **sus** pilotos y **sus** estrategias.

El roster del puente no se pierde ni se privilegia: se importa como un evento más con `source: "roster"` e id estable (`roster:<nombre>`), de forma que recargar no lo duplica. La persistencia de la parte A (`vantare.v03orbit.strategy`, estrategias y disponibilidad sueltas) se migra encima de ese evento al importarlo —overrides, orden, neumáticos, estado y las estrategias `local-n` que el usuario hubiera creado—, así que nadie pierde el trabajo hecho. La disponibilidad también pasa a ser del evento: declarar que un piloto no puede a las 15:00 en Imola no dice nada de otra carrera.

## D-W4-2 · El estado inicial ofrece dos caminos, no una lista que no lleva a ninguna parte
**Decisión.** Sin evento seleccionado el panel pinta dos tarjetas `Featured` del kit, lado a lado: «Crear mi estrategia» abre el formulario del evento propio; «Desde un evento» despliega las series reales del calendario (`use-calendar-starts`), seguidas primero y luego el resto de próximas salidas, cada una con su hora, su duración y su clase, y el clic crea el evento con esos datos y el usuario como único piloto. Para que la segunda vía tenga datos que copiar, `RaceStart` gana dos campos que el calendario ya publicaba y se tiraban: `vehicleClass` y `durationMin`; una serie sin duración publicada cae a una hora en vez de a cero.

La columna contextual cambia en consecuencia: el bloque «Otros eventos» —que en D-94 solo podía explicar por qué no se abría— se sustituye por «Eventos», que lista **todos** los eventos con el activo marcado y cambia de evento al clic, con las estrategias del activo debajo y «+ Nuevo evento» de vuelta al selector. Sin evento activo el bloque de estrategias se oculta en vez de dejar un hueco con un título vacío.

## D-W4-3 · Los pilotos son del evento, así que se editan
**Decisión.** «Editar piloto» estaba deshabilitado (D-94) porque los ritmos los publicaba el hub y no había dónde escribirlos. Con el evento en local sí lo hay: el botón abre los seis campos del piloto —ritmo y consumo en seco, lluvia y eco— sobre el evento activo, y el plan se recalcula al escribir. El formulario del evento hace lo propio con el alta y la baja de pilotos, su nombre, sus iniciales y su color (de la paleta del kit, no un color libre). «Información del evento» del menú ⚙ deja de ser un toast que promete: abre ese mismo formulario en edición.

## D-W4-4 · Estrategia no depende del proveedor de licencia solo para rellenar un nombre
**Decisión.** El piloto por defecto de un evento nuevo entra como «Yo» (traducido) y el usuario lo renombra en el formulario. Leer el nombre real de la cuenta habría exigido `useAccountIdentity`, que a su vez exige `LicenseProvider`: una pantalla que solo planifica carreras no debería reventar fuera de ese árbol —y el harness visual la monta fuera—. El nombre lo pone quien lo sabe, en un campo que ya está a la vista.

## D-W4-5 · El reparto de neumáticos de partida se calcula, no se guarda dos veces
**Decisión.** El inventario real llega del editor de estrategia (`strategy-editor`) después de que el evento exista. En vez de un efecto que escribiera el reparto por defecto en cuanto llegara —una escritura de estado dentro de un efecto, con sus renders en cascada—, las estrategias sin reparto propio lo derivan al vuelo en el render y solo lo persisten cuando el usuario toca una esquina. El almacenamiento guarda decisiones del usuario, no valores que el código sabe recalcular.
## D-W5-1 · El Roadmap se rehace por elección: dos direcciones completas, ninguna en producción todavía
**Decisión.** Isaac dijo de la vista actual del Roadmap que «es una zona que no me gusta nada» y que haría un rework completo. Un rework a ciegas es caro de deshacer, así que este bloque entrega **dos direcciones enteras**, no bocetos: `hub/roadmap-orbit/directions/RoadmapDirectionA.tsx` («Trayecto») y `RoadmapDirectionB.tsx` («Tablero»). Son componentes reales, con el mismo dataset real que la vista actual —`docs/roadmap-source.json` por el cargador de `roadmap-orbit-model.ts`, más las cuentas de proyectos que ya resuelven el porcentaje de cada área— y con los mismos estados honestos de fuente (`loading` / `remote` / `fallback`).

Se eligen con `?roadmapDir=a|b`. `RoadmapOrbitPage` **solo lee** ese query una vez y, sin él, sigue pintando exactamente la vista de hoy: mientras Isaac no elija, producción no cambia. El resto del porte no se toca.

**A · Trayecto.** Una vía horizontal a lo ancho con una estación por fase (dial de progreso, nombre, etiqueta de fase, versión, color por estado) y los hitos como paradas sobre la vía. Debajo, tres columnas: «Ahora» (fase en curso, con su resumen, su barra y sus highlights), «Siguiente» (primera fase por planear) y «Áreas» (barras compactas con porcentaje y estado). La columna contextual lista Fases e Hitos, y pulsar cualquiera de las dos enfoca su estación en la vía.

**B · Tablero.** Rejilla de 12 con la fase en curso como `Featured` —dial de 120, resumen, highlights en dos columnas—, los hitos a la derecha como línea vertical, y las áreas debajo como tarjetas con barra, estado y próximo paso. El segmentado «Por fase / Por área» reordena el tablero (y ordena las áreas por avance); el canal viaja como `Pill`.

**Lo que la fuente no declara, se deriva y se dice.** El JSON no relaciona hitos con fases ni declara un «próximo paso» por área. En vez de inventar ninguno de los dos:
- un hito se ancla a la primera fase cuyo estado visual coincide con el estado que ya se deriva de su `type` (`milestoneState`), y la etiqueta lo dice («ancla en Fase 2»);
- el «próximo paso» de un área es el primer highlight de una fase **no terminada** que mencione una palabra significativa del título del área, y la tarjeta lo marca como `derivado`. Si ningún highlight la menciona, el área dice que la fuente no declara ningún paso en lugar de rellenar el hueco;
- la vía no finge una escala temporal: reparte las fases en tramos iguales porque la fuente declara un orden, no fechas, y cada tramo se rellena con el progreso declarado en vez de un degradado decorativo.

**Recomendación de la porteadora: A.** B es la más vistosa y la que mejor se lee de un vistazo, pero repite la forma de Inicio (una focal grande con tarjetas debajo) y deja el orden de las fases fuera de la pantalla, en la columna. A es la única de las dos que responde a las tres preguntas de un roadmap —dónde estamos, qué viene, cómo va cada área— sin hacer scroll, y la única que hace del *orden* el elemento principal, que es justo lo que la vista actual no conseguía: hoy las cuatro fases son cuatro columnas sueltas y no se lee que sean un recorrido. La vía lo lee de izquierda a derecha en un segundo. Si se elige A, lo que conviene traer de B es la marca `derivado` y el «próximo paso» de las áreas.

## D-R3-A-1 · El marco de selección se ciñe a lo que el widget pinta, no a `layout.w × layout.h`
**Decisión.** El marco, los ocho tiradores y el ancla de la etiqueta dejan de colgar del `.osv3-widget-frame` (la caja del documento) y pasan a colgar de un envoltorio nuevo, `.osv3-widget-frame__selection`, que por defecto vale `inset: 0` —comportamiento histórico intacto— y que en la piel Orbit se ciñe a la caja **realmente pintada**.

**Causa raíz.** `WidgetVisualViewport` escala un plano de ancho base al ancho del widget y le da de alto `h / escala`, así que el viewport siempre mide lo que dice el documento; pero lo que el widget pinta dentro puede ser mucho menor —un standings de 380×540 con cinco filas pinta ~380×200— y `__visual` lo recorta con `overflow: hidden` sin que nadie mida nada. El marco heredaba la caja del documento y quedaba flotando alrededor de aire.

**Cómo se mide.** `computeContentBox` (puro, con test) toma el rectángulo de pantalla del marco, su tamaño sin escalar y los rectángulos de lo que pinta dentro, y devuelve la unión en coordenadas locales del marco. Se mide en `getBoundingClientRect` porque es lo único que ya lleva dentro todas las escalas en juego —la del `scene`, la del zoom y la del propio viewport— sin tener que reconstruirlas. La caja se recorta al marco (lo que sobresale ya no se ve) y, si no se puede medir con confianza, se cae a la caja del documento. `useSelectionFit` la reaplica con `ResizeObserver` sobre el marco y sobre lo que pinta, porque el contenido cambia con la telemetría y con el diseño aplicado, no solo con el layout.

**Por qué es opt-in.** `StudioWidgetFrame` lo comparten la piel Orbit y el lienzo V3 clásico. La prop `fitSelectionToContent` la enciende solo `StudioOrbitStage`: el V3 no cambia ni un píxel.

## D-R3-A-2 · La etiqueta de selección vive en el lienzo, no dentro de la escena escalada
**Decisión.** `.orbit-studio-scene__tag` desaparece y en su lugar hay `.orbit-studio-stage__tag`, hija del `stage` y posicionada en píxeles de pantalla.

**Causa raíz.** La etiqueta se pintaba dentro del `scene`, que va escalado, y se compensaba con `transform: translateY(-100%) scale(1/scale)` sobre `transform-origin: left bottom`. Ese `-100%` se resuelve contra la caja **sin escalar** del elemento, así que el desplazamiento vertical no acompañaba a la escala y la etiqueta se despegaba del widget. Además se anclaba a `layout.x/y` —la esquina del documento, no la del widget pintado—, no se recortaba contra los bordes del lienzo, y no seguía al widget al arrastrarlo: `resolveLayout` devuelve el layout comprometido y el arrastre mueve el marco por estilo en línea, sin repintar React.

**Cómo se coloca.** El ancla es el rectángulo del envoltorio de selección de D-R3-A-1 leído del DOM en coordenadas del `stage`; leerlo del DOM es lo único que sigue al widget durante un arrastre, y por eso se remide por frame mientras la interacción está viva. `placeSelectionTag` (puro, con test) centra la etiqueta sobre el borde superior del widget, la baja debajo si no cabe arriba, y la recorta contra los cuatro bordes del lienzo.

## D-R3-A-3 · «Sin diseño aplicado» era falso: un widget sin procedencia sí lleva diseño
**Decisión.** El `Select` «Diseño» resuelve su valor con `resolveEffectiveDesign(widget, catálogo)` en vez de con `isActiveDesign` a secas.

**Causa raíz.** `isActiveDesign` compara contra `visual.provenance.designId`, y esa procedencia **solo** se escribe al aplicar un diseño a mano: `createDefault` deja `baseSettings: {}` y ninguna procedencia. Un widget recién añadido se pinta con el diseño por defecto de su sistema visual —Original Base— pero el `Select`, al no encontrar procedencia, caía en la opción vacía y anunciaba «Sin diseño aplicado» sobre un widget que sí llevaba uno.

**Regla.** Gana siempre el diseño con procedencia. Solo cuando **no hay** procedencia se cae al diseño marcado `isDefault` del sistema del widget, y solo si el catálogo consultado es el de **su** sistema: si el usuario está hojeando otro sistema en el desplegable, ahí no hay nada aplicado y la opción vacía vuelve a ser la respuesta honesta.

## D-R3-A-4 · Un widget oculto se ve, se selecciona y se puede desocultar desde donde está
**Decisión.** El estado oculto deja de ser un callejón sin salida en las tres superficies donde aparece.

- **Lista.** La opacidad baja va en `.orbit-studio-witem__row`, no en su padre: así la fila se apaga y se tacha pero el ojo —que es hermano, no hijo— se queda a plena vista, y además se tiñe de carmín para que se lea como la acción que es. Sigue siendo pulsable, con `data-tip` «Mostrar», y la fila apagada se sigue seleccionando.
- **Cabecera del inspector.** Ya reflejaba el estado con `aria-pressed`; se mantiene y queda cubierta por test.
- **Lienzo.** Un widget oculto se pinta al 12 %, que no da asidero. Su etiqueta de selección añade «· oculto» y un botón **Mostrar** que despacha el mismo `widget/behavior` que el ojo. La etiqueta es el único elemento del lienzo que siempre está donde está el widget, así que es donde tiene sentido poner la salida.

## D-R3-A-5 · El contenido de standings se porta a Orbit dentro de «Comportamiento»
**Decisión.** `StandingsContentInspector` gana rama `orbit` con `useIsOrbitSkin()`: misma lógica, mismos handlers, mismo `parseStandingsContent`, solo otro JSX. Se queda en el acordeón **Comportamiento** —donde el mapeo de D-43 ya coloca la sección `content`— y no se abre un acordeón «Contenido» nuevo: la sección real sigue siendo la misma, y partirla habría creado un grupo Orbit sin sección propia detrás.

**Causa raíz.** La sección se pintaba con los controles legados dentro de la piel Orbit —`input[type=checkbox]` nativos, dos `<select>` por columna, botones `↑`/`↓` sin estilo— porque el inspector de contenido es propiedad del tipo de widget (`definition.inspector.CustomContentInspector`) y nunca se le había dado forma de elegir piel.

**Lo que cambia de forma.** FILAS pasa a `Seg`; cada columna es una fila con `Check` del kit para visible, dos botones de orden con las clases `orbit-icon-btn` del kit (el `IconButton` solo acepta nombres del sprite Orbit y ahí no hay flechas), un `Seg` SM/MD/LG para el ancho y otro IZQ./DER. para la alineación. Cero controles nativos, cero `title`.

**Lo que se pierde a propósito.** El ancho ofrecía cinco presets (`xs`…`auto`) y la alineación tres; en un dock de 395 px un `Seg` de cinco pasos es ilegible. La piel Orbit ofrece los tres pasos y las dos alineaciones que se usan, y respeta el valor guardado si viene de fuera de esa lista. La piel V3 conserva las cinco y las tres.

**Dónde vive la piel.** El contexto se mueve a `overlay/core/inspector-skin.tsx` y `hub/overlay-studio/inspector/inspector-skin.tsx` pasa a re-exportarlo. Los inspectores de contenido son de `overlay/`: hacerles importar del Hub habría invertido las capas. La superficie pública no cambia, así que ningún otro fichero del Studio se toca.
## D-R3-B-1 · La columna contextual pierde el pie: el estado del sim no se repite en todas las vistas
**Decisión.** Revierte lo que el briefing 01 fijó como «el pie es la única fuente textual del estado del sim». El pie («LMU conectado» + «Free») estaba abajo en las once vistas, decía lo mismo siempre y nadie lo miraba: Isaac lo considera innecesario y se elimina de `ContextColumn` (marca, props `simStatus` / `planLabel` / `onOpenAccount` y la regla `.orbit-column__foot`).

El estado del sim no se pierde, porque nunca vivió solo ahí: sigue siendo el punto de color del saludo de Inicio y el pill de **Ajustes › Diagnóstico**, que es donde se va a mirar cuando de verdad importa. El plan se abre desde la fila de cuenta del rail, que ya llevaba a Ajustes › Cuenta. El contrato del harness de la shell cambia en consecuencia: donde asertaba «el pie es visible» ahora aserta que **no hay pie** y que los bloques de la columna caben enteros a 900 px, que es lo que el pie servía para comprobar.

## D-R3-B-2 · Una sola política de scroll para toda la UI Orbit, en el kit
**Decisión.** Isaac no quiere ver la barra nativa del sistema en ninguna vista. Estaba asomando en la lista del `Select`, en paneles del inspector, en Roadmap y en varias listas, porque la barra fina se repetía a mano hoja por hoja (`orbit-races.css`, `.orbit-tl`) y solo cubría lo que alguien se acordó de cubrir. La política pasa a estar **una vez** en `orbit-kit.css`, sobre `.orbit-root` y sobre las capas que se portalizan fuera de él (lista del `Select`, `Menu`, `Drawer`, toasts): `scrollbar-width: thin`, `scrollbar-color` con tokens, `::-webkit-scrollbar` de 6 px, pista transparente y pulgar redondeado con `--orbit-scroll-thumb`.

En reposo el pulgar es transparente (`--orbit-scroll-thumb-idle`) y se revela al pasar el ratón por el contenedor o cuando algo dentro tiene el foco; las capas flotantes lo muestran ya visible porque se abren bajo el puntero. La rueda **nunca** depende de esto: se pinta la barra, no se desactiva el desplazamiento (ni `overflow: hidden` ni `::-webkit-scrollbar { display: none }`). Los bloques repetidos de Carreras y del timeline se borran para que la política sea de verdad única.

## D-R3-B-3 · El canal de actualizaciones se guarda de verdad, y lo que no se puede elegir dice por qué
**Decisión.** En la build real pulsar «Testers» o «Nightly» no hacía nada, y la causa eran tres cosas encadenadas: (1) con licencia Free esos canales se pintaban con `disabled`, y un botón desactivado no recibe clic ni foco, así que la tarjeta parecía rota y el candado no se podía ni leer; (2) `useUpdaterSettings` marcaba el canal en estado local y emitía `updater:settings:save`, pero el backend contesta un `updater:settings-saved` pelado y nadie volvía a leer los ajustes, de modo que un guardado fallido dejaba el radio mintiendo; (3) la elección no salía de la pantalla.

Ahora: un canal cerrado deja de estar `disabled` y pasa a `aria-disabled` —sigue sin cambiar nada, pero responde y explica el motivo bajo las tarjetas—; `useUpdaterSettings` recibe los canales permitidos y no emite el guardado de uno que no lo esté; `updater:settings-saved` dispara un `updater:settings:get`, así que lo que se ve es lo que quedó en disco; y `updater:error` devuelve el radio al último canal confirmado. El nombre y el payload de los eventos no cambian: son los que atiende `cmd/vantare/main.go` (`updater:settings:get` → `updater:settings`, `updater:settings:save` → `updater:settings-saved`).

## D-R3-B-4 · El canal elegido manda sobre el canal del binario para el Testing Center
**Decisión.** `HubApp` resolvía `testingCenterChannel` a partir de `buildChannel`, que llega en `app:version` y describe con qué rama se compiló el ejecutable: un dato que solo cambia reinstalando. Con eso, elegir «Nightly» en Ajustes no movía el rail ni el eyebrow del Testing Center, y la pantalla decía una cosa y la shell otra.

Ajustes emite ahora `hub:updater-channel` (evento de frontend, sin handler Go) al confirmar el canal y al releerlo del backend; `HubApp` lo escucha —y escucha también `updater:settings` directamente, porque Ajustes puede no haberse abierto nunca— y usa el canal preferido por delante de `buildChannel`. La licencia sigue decidiendo: `resolveTestingCenterChannel` es la misma función y las mismas capacidades, así que elegir un canal que no te corresponde no abre nada.
## D-R3-C-1 · Los iconos no venían pequeños del extractor: llegaban pequeños dentro de un lienzo grande
**Decisión.** El feedback («los logos no están a máxima resolución») no era el extractor pidiendo 32 px: `getIconHighRes` ya pedía `SHIL_JUMBO` y devolvía PNG de 256 px. Eran tres cosas encadenadas, y las tres estaban en el backend.

1. **El lienzo jumbo con el icono en la esquina.** Cuando el ejecutable no trae un icono de 256 px, la lista de imágenes del shell no lo amplía: coloca el de 32 px en la esquina superior izquierda de un lienzo de 256 y deja el resto transparente. El PNG «medía» 256, pasaba cualquier control de tamaño, y al pintarlo con `object-fit: contain` en una losa de 39 px el logotipo quedaba en unos 5 px. `trimIconCanvasPadding` recorta al contenido cuando está pegado al origen y ocupa menos de media caja; un icono de borde a borde —lo normal— se devuelve intacto.
2. **La caché de disco servía iconos borrosos para siempre.** Solo se invalidaba por mtime del ejecutable, así que las entradas escritas por versiones que sí caían en las rutas de 32 px (`SHGFI_LARGEICON`, `ExtractIconExW`) sobrevivían aunque el extractor ya supiera sacar 256. La caché pasa a `icons-cache-v2.json` y la v1 se borra en el primer arranque.
3. **La primera ruta que respondía ganaba, aunque trajera 32 px.** Las rutas de extracción están ordenadas por fidelidad, no por resolución. Ahora `iconPick` acepta en cuanto una llega a 64 px y, si ninguna llega, devuelve la mayor vista en vez de la primera.

En el front no había resolución que subir: se declara `image-rendering: auto` en la losa para que ningún valor heredado la convierta en un reescalado dentado, y el `<img>` pasa de `loading="lazy"` a `decoding="async"` porque la losa está siempre en pantalla y diferirla solo provocaba un parpadeo de iniciales.

**De regalo, un fallo que mataba el escaneo en una instalación nueva.** Sin fichero de caché, `loadIconDiskCacheLocked` devolvía la estructura con los mapas a `nil` y el primer `saveIconToDisk` reventaba con «assignment to entry in nil map» dentro de la goroutine de extracción. Con caché ya escrita no se notaba; en un equipo limpio, sí.

## D-R3-C-2 · Discord no salía porque el ejecutable registrado no es Discord
**Decisión.** El catálogo detecta `…\Discord\Update.exe`, el arrancador de Squirrel, que no lleva icono propio: el shell devolvía el icono genérico de aplicación de Windows —una ventana gris— y en la losa parecía que Discord no salía. El logotipo real está al lado, en el `app.ico` del instalador o en el ejecutable de la versión instalada (`app-<versión>\Discord.exe`).

`resolveSquirrelIconSource` corrige **de dónde se lee la imagen**, no qué se lanza: `Update.exe` sigue siendo el ejecutable de arranque, que es el correcto. Se resuelve antes que ninguna otra ruta porque el stub sí devuelve un icono (el genérico) y ganaría por orden de llegada. Vale para cualquier aplicación empaquetada con Squirrel, no solo Discord.

## D-R3-C-3 · MoTeC es la única app con activo dibujado, y se dice que es una reconstrucción
**Decisión.** La app «MoTeC» del catálogo resuelve `…\MoTeC\app.exe`, que es el visor **i2**: su icono son los dos círculos cian y ámbar, así que la losa mostraba i2 donde ponía MoTeC. La instalación no trae el logotipo corporativo por ningún lado —`MoTeC.Extract.exe` lleva la marca del producto M1 y `MoTeC.Discovery.exe` un icono de 32 px—, así que no hay fichero local del que sacarlo.

`OFFICIAL_ICON_ASSETS` deja de estar vacío para esta única entrada: un SVG en `data:` URI (`brand-assets.ts`) con el wordmark en cursiva pesada sobre negro, que es como la marca se presenta. **Es una reconstrucción, no el fichero oficial**; si aparece el activo aprobado se sustituye la constante y no cambia nada más.

El resto del catálogo se queda a `undefined` a propósito. La regla es que el icono instalado gana: es el logotipo real de la aplicación, a máxima resolución y sin redibujar. Una entrada de la tabla solo se rellena cuando el icono instalado **no** identifica a la marca del catálogo y no hay ningún fichero local mejor, porque solo entonces la losa engaña. El orden de candidatos no cambia: la elección manual del usuario sigue mandando sobre el activo de marca.

## D-R3-C-4 · El contrato «sin ampliar» se comprueba en la captura, a DPR 2
**Decisión.** El harness visual gana un tercer viewport a `deviceScaleFactor: 2`, que es donde se nota el problema: las losas de 39 px y los pasos de 26 son 78 y 52 px físicos, así que un origen de 32 px se vería ampliado. Antes de capturar comprueba en la página que el ancho natural de cada `<img>` de losa cubra su caja física, y falla nombrando el icono culpable. Un SVG queda exento: no tiene resolución natural.
## D-R3-D-1 · El rótulo del bloque se recorta dentro del bloque, no por encima del vecino
**Decisión.** Isaac vio en el build que «el texto se queda por detrás y no por delante»: en el timeline de Carreras el rótulo de un bloque («LMP3 Fixed · 02:15») aparecía cortado por los bloques siguientes. La causa no era el `z-index` sino el desbordamiento: `.orbit-tl__block` centraba el texto con `white-space: nowrap` y sin `overflow`, así que el rótulo se salía de la caja del bloque y el bloque siguiente —absoluto, más adelante en el DOM y por tanto pintado después— lo tapaba a mitad de palabra.

El rótulo pasa a vivir en su propia caja (`.orbit-tl__block-label`) con `overflow: hidden` y `text-overflow: ellipsis`, y el bloque recorta. Lo que no cabe se corta con elipsis dentro de su propio color, nunca sobre el vecino, y el nombre completo sigue accesible en el `data-tip` del kit. Encima de eso sí hay orden de capas: el bloque bajo el cursor, con foco o seleccionado sube a `z-index: 3` dentro del carril, y la línea «ahora» sube a `4` para no perderse debajo. El bloque seleccionado rotula siempre —aunque su ancho quede por debajo del umbral de `BLOCK_LABEL_PX`—, porque es el único del que el usuario ya ha dicho que le importa.

## D-R3-D-2 · Los nombres de serie son tipografía de UI; el mono se queda en las horas
**Decisión.** El rótulo del bloque usaba `--orbit-font-mono` a 10.5/800: una serie no es un dato tabular y el mono condensado la hacía ilegible («no me gusta la fuente de letra»). Los nombres pasan a `--orbit-font-sans` 12/600 con `letter-spacing: normal`, la misma tipografía que el resto de la UI del kit. El mono se mantiene donde sí alinea columnas: los ticks del eje (`.orbit-tl__tick`) y las horas de las listas. Los rótulos de fila ya eran sans y no se tocan.

## D-R3-D-3 · Pulido del bloque: 24 de alto, radio del kit, 2 px de aire y estados con anillo
**Decisión.** El bloque baja de 32 a 24 de alto (centrado en la fila de 48), toma `--orbit-radius-chip` en vez del 7 suelto y separa 2 px de su vecino. La separación se pinta con `border-right: 2px solid transparent` y `background-clip: padding-box` en lugar de restar píxeles al ancho: el ancho del bloque sigue siendo el porcentaje exacto del `spanMin`, que es lo que hace que la posición en el eje sea verdad y lo que los tests del kit comprueban.

Los estados dejan de ser solo sombra: `hover`/`focus` añaden un anillo interior claro y el seleccionado un anillo carmín de 2 px, ambos como `box-shadow: inset` para no mover el bloque un píxel al entrar y salir. El contraste del rótulo lo declara el consumidor con `ink` (`dark` por defecto, `light` para fondos oscuros) en vez de que el kit adivine la luminancia de un color que le llega como variable CSS: los cuatro `TIER_COLOR` de Carreras son claros y van con tinta oscura, muy por encima del 4.5:1 de AA.
## D-R3-E-1 · El estado inicial de Estrategia recomienda eventos reales, no deja un hueco
**Decisión.** Bajo las dos tarjetas de «Empieza tu estrategia» quedaba media pantalla vacía. La llena una `Surface` «Eventos recomendados» alimentada por el calendario real, con dos niveles y ninguno inventado (`hub/strategy-orbit/strategy-recommended.ts`):

1. **Especiales** — `calendar.events`, las citas con fecha propia. Si hay alguna por delante, manda.
2. **Semanales** — si no hay ninguna especial, las series de tier `weekly` con su próxima salida, una fila por serie.

Cada fila lleva circuito, clase (o serie), duración y hora, y un botón «Planificar» que llama a `createEventFromSeries`, **la misma acción del camino «Desde un evento»**: no hay una segunda vía de creación con otras reglas. La fila entera también planifica; el botón repite la acción con nombre accesible explícito porque un `ListRow` es ya un `<button>` y anidar otro sería HTML inválido.

Sin especiales ni semanales la lista no se rellena con nada: una `Note` dice que el calendario no trae ninguna de las dos y remite a crear el evento propio. Para que la lista de series del camino «Desde un evento» no empuje la recomendación fuera de la pantalla, esa lista gana un tope de altura con scroll propio; la página sigue sin hacer el suyo.

## D-R3-E-2 · Testing Center no estrena columna contextual
**Decisión.** Las tres pestañas viven en la propia vista (`UnderlineTabs`), no en la columna. El briefing 12 no reserva hueco contextual para Testing Center y la shell no declara ningún `TESTING_CONTEXT_SLOT_ID`: abrirlo obligaría a tocar `OrbitShell.tsx`, que es archivo compartido con el resto de bloques en paralelo, para duplicar en la columna una navegación de tres elementos que ya se lee entera sobre el contenido. Cuando la vista crezca (filtros de candidatos, canales), la columna se planteará con su propio briefing.

## D-R3-E-3 · La pestaña Validar es un porte de piel, no una reimplementación
**Decisión.** `ValidateOrbitPanel` usa el mismo cliente (`candidate-feedback-client`, función `testing-center-feedback`), el mismo contrato de rechazo y la misma regla de validez —3–2048 bytes UTF-8 en los cuatro textos— que `CandidateFeedbackPanel` de la pantalla v5.2. Lo único que cambia es el kit: `Surface`, `Field`, `Select`, `Textarea`, `Check`, `Button` y `Note` en lugar de las utilidades de Tailwind. El cliente entra por prop (`feedbackClient`) para que los tests usen el servicio real con doble y no un atajo.

La vista previa del diagnóstico deja de ser un panel siempre desplegado y pasa a `Accordion` dentro de una `Surface` en la pestaña **Reportar**: los bytes exactos siguen a un clic de distancia, pero no empujan el formulario.

## D-R3-E-4 · «Mis reportes» dice que no hay historial en vez de fingirlo
**Decisión.** El servicio de Testing Center no publica ninguna operación de historial: `testing-center-client` solo abre, guarda y descarta **el borrador en curso**, y el envío devuelve un `SubmittedReport` suelto. La pestaña lo dice con esas palabras y lista lo enviado durante la sesión actual, que es lo único que la pantalla conoce de verdad. Cuando el backend publique un listado por tester, la pestaña lo consumirá sin cambiar de sitio.
## D-R3-F-1 · El Roadmap se rehace como «Qué viene»: una columna narrativa, sin porcentajes
**Decisión.** Ni la vista actual (StatRow + cuatro columnas de fases + rejilla de áreas + línea de hitos) ni las dos direcciones A/B de D-W5-1 convencieron. Isaac: «tira por la opción 1 y si no convence lo dejamos en Ajustes». La opción 1 es **«Qué viene»**: un changelog invertido en **una sola columna** de lectura, no un tablero. `RoadmapOrbitPage` pasa a pintar tres secciones separadas por rótulos grandes con línea —**AHORA**, **PRÓXIMO**, **HECHO**— y se retiran del repo las dos direcciones, su CSS, sus tests, el query `?roadmapDir` y sus capturas.

- **AHORA.** La fase en curso como `Featured` suave: etiqueta de fase, nombre a 22px, versión en `Kbd` mono, el `summary` que trae el JSON y su checklist de highlights en filas de 44px. Debajo, los hitos de la fase.
- **PRÓXIMO.** Las fases por planear y futuras como entradas de lista limpias: nombre 16/650, versión mono, `StateChip` pequeño y dos o tres highlights como bullets grises.
- **HECHO.** Un `Accordion` **plegado por defecto** con las fases completadas y los hitos ya publicados: lo publicado es contexto, no la lectura principal.

**Sin porcentajes ni barras de progreso, en ningún sitio.** La escala 0/10/25/50/75/100 de `roadmap-source.json` la escribe Isaac a mano; pintarla como barra la vendía como una medida. El único indicador de avance que queda es textual y honesto: «Fase 2 de 4», que sale del orden declarado. Con ello desaparece también la rejilla de áreas —era el único bloque cuyo contenido *era* un porcentaje— y con ella la lectura de `fetchRoadmapProjectsDataset`, que solo servía para resolver ese número.

**Lo que la fuente no declara, se deriva y se dice.** El JSON no relaciona hitos con fases ni distingue highlights hechos de pendientes. Por eso: el reparto de hitos en las tres secciones sale de `milestoneState` (de su `type`) y va marcado como `derivado`, con una nota que lo explica; y la checklist de AHORA lleva viñeta carmín en vez de una casilla marcada, porque una casilla marcada afirmaría un «hecho» que el JSON no dice en ninguna parte.

**Sin scroll de página.** La columna (880px centrada, el resto respira) se desplaza dentro de la `Surface` principal con barra fina. La columna contextual deja de listar fases y lista las tres secciones: pulsar una hace scroll suave hasta ella y la resalta con un lavado carmín de 1600 ms. El harness `visual:orbit-roadmap` captura 1920×1080, 1920×900 y una tercera con HECHO desplegado, y afirma en las tres que no hay `title` nativo, que no aparece ningún porcentaje en la columna y que la página no hace scroll.

## D-R4-1 - Las listas de Inicio se desplazan dentro de su panel, sin recortar filas
**Decision.** «Proximas carreras» y «Perfiles» cortaban la ultima fila por abajo cuando el contenido pasaba del alto del panel (Isaac lo vio con `Default Streaming` partido). El contenedor de scroll pasa a ser explicitamente el cuerpo de la `Surface` (`.orbit-surface__body`) de ambos paneles: `overflow-y: auto` con `min-height: 0` para que la rejilla pueda encogerlo, `overflow-x: hidden`, `overscroll-behavior: contain` y **hueco al pie** -`padding-bottom` de 14 px (12 en compacto) mas `scroll-padding-bottom`- para que la ultima fila quede entera al llegar al final del scroll, no pegada al borde. Las barras son las finas del kit, sin ocultarlas.

Sin degradado al pie: un velo permanente mentiria cuando la lista no desborda, y detectar «hay mas contenido» en CSS puro obligaria a un artefacto siempre visible. El harness `visual:orbit-home` lo afirma en 1080 y 900: por cada lista comprueba que el cuerpo desplaza de verdad (clonando filas de sonda cuando el calendario simulado no llega a desbordar, y retirandolas antes de capturar), que el `overflow-y` es de scroll, que el hueco al pie es de al menos 8 px y que **tras el scroll maximo la ultima fila no queda recortada por ningun borde**.

## D-R4-2 - El hero de Inicio pierde el dial: solo queda la tarjeta «Proxima serie»
**Decision.** El conjunto del dial -anillo, ticks, arco y punto girando alrededor de la tarjeta- no convencio a Isaac. Se retira entero y la columna derecha del hero (300 px) queda con **solo la tarjeta**: antetitulo con punto, nombre · circuito, «en mm:ss» en mono coral, «Cada N min · Tier» y el boton circular que abre la serie en Carreras. Misma superficie vino/carmin que tenia el interior del dial, radio del kit (`--orbit-radius-featured`), altura ajustada al contenido y sin trazos alrededor; tambien desaparece el halo radial que existia solo para envolver el aro. La tarjeta se centra verticalmente con el bloque saludo + superficie de comando, y en compacto (<=940 de alto) solo aprieta su interior en lugar de cambiar a un tamano discreto.

`CountdownDial` **se elimina del kit**: no lo consumia ninguna otra vista, y su unico otro consumidor era el banco de visualizacion del harness del kit, que pasa a mostrar la tarjeta nueva. En su lugar queda `NextRaceCard` (`ui/orbit/NextRaceCard.tsx`), que conserva el tick de 1 s de la cuenta atras y el reloj inyectable. Con el arco se va tambien el helper `dialFraction` de `viz-types`, que solo servia para calcular la fraccion del anillo; `formatCountdown` se queda porque lo usa la tarjeta. El contrato de `visual:orbit-home` cambia en consecuencia: ya no mide el diametro del dial (236/200), sino que exige **una** tarjeta «Proxima serie» y **cero** `.orbit-dial` en la vista.
