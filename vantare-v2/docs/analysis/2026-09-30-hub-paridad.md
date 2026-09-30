# Hub Wails ↔ GPUI: referencias y matriz de paridad

Fecha: 30/09/2026. Issue técnica: [#1430](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1430).
Worker: Codex; revisión del diff y dirección visual: Claude Opus 5.5.
Proyecto: fase 5 del plan Rust nativo, ADR 0099. **Paridad no alcanzada.**

## Corte, autoridad y procedencia

- Rama asignada: `vantareapp/isa-1430-w-hub-referencias`.
- Código capturado: `6b831395cdb013e443e6396a79615bf2ae030482` en ambos productos.
- `origin/nightly` obtenido y leído: `f29b5fee04022756f9ae59f19bf153f91eebe4ed`.
  Ancestro común con la rama: `5838de5a4abee3e99d9d50aebd5dc20609c53611`.
  Se conserva la integración nativa asignada; no se rebasa ni cambia código
  de otros workers. No extrapolar las capturas a una integración posterior.
- Checkout limpio al empezar. Solo se editan este documento y
  `native/hub/reference/`. No se modifica producto, configuración, Cargo ni frontend.
- Notion no disponible: Isaac autorizó expresamente GitHub para este encargo.
  Se leyó #1430, abierta; no se verificó tarea/UUID/estado ni proyecto en Notion.
  No se declara su seguimiento completado. El orquestador recibe la continuidad
  en este documento porque el handoff vivo está fuera de las rutas asignadas.
- No hubo push, PR, merge, promoción, release, envío de informes, OAuth,
  restablecimiento de dispositivos ni lanzamiento de juegos/aplicaciones.

Evidencia privada **fuera del repo**:
`C:/tmp/isa-1430-hub-referencias-evidence/`. Galería: `gallery.html`.
Índice de PNG y SHA256: `images.json`. Reproducción:
[`native/hub/reference/README.md`](../../native/hub/reference/README.md).

## Qué se ha capturado

**76 PNG originales, todos 1440 × 900.** DPI Win32 96 (100 %), DPR WebView2 1.
Se compara el área cliente; se omite el marco de Windows. No se han escalado
los originales. Las miniaturas de revisión no sirven para medir píxeles.

| Carpeta | Cantidad | Qué demuestra |
| --- | ---: | --- |
| `wails-real/` | 4 | Producto compilado del SHA, backend Go, WebView2 real, `-live=false`, perfil de ejemplo aislado, sin sesión. Acceso inicial, login, alta y recuperación. No se enviaron formularios. |
| `wails-demo/` | 48 | Shell y páginas productivas servidas por los harnesses existentes en el mismo WebView2. Fixtures y overrides explícitos `VITE_RUNTIME_MOCK=mock`, `access=paid`, `updater=pending`, `telemetryDemo=1`. Apariencia Oscuro elegida mediante UI. No son datos reales de usuario ni runtime autenticado. |
| `native/` | 24 | Hub GPUI real, `--data-dir`, layout, ajustes Engineer y Launcher aislados; pipe privado sin productor. Workshop usa el fixture distribuido `lmu47`; Studio añade un Standings al layout aislado. |

Los resultados CDP están en los `manifest.json` externos: 48/48 demo y 3/3
estados de cuenta. La cuarta captura real es física, anterior al recorrido CDP.
Los scripts registran fallos sin sustituirlos por otra imagen.

Hash del ejecutable realmente capturado:

| Binario | SHA256 |
| --- | --- |
| Wails diagnóstico, compilado en la copia externa del SHA | `8455cbd28721a679b9489698cb166be693e3a3d4adc516e377e9df35d74d1c60` |
| Hub GPUI debug, conservado en `native/vantare-hub.exe` externo | `8e0e3a3eee1e2c2a26cb44f32c138dd86df3676dffee15d1bc9f0c8f5c727421` |

Wails sin sesión queda en el acceso inicial: **no se pudo recorrer el Hub
autenticado real**. Navegar el WebView2 al harness no convierte su mock en
backend Go. El texto, email, versión, actualizaciones y estado LMU mostrados
por los harnesses son demostración. En concreto, `v0.3.9`, `v0.3.10` y la
versión del aviso no certifican la versión de producto; `0.0.0` nativo viene
de `CARGO_PKG_VERSION`, tampoco es la versión comercial.

## Matriz: shell y páginas

P0 = necesario para aceptar paridad; P1 = completar comportamiento/contenido;
P2 = fidelidad visual. Son prioridades de revisión, no autorización para
desbloquear servicios ni ampliar los contratos de otros workers.

Nombres sin carpeta pertenecen a `wails-demo/`. La columna GPUI usa `native/`.
`.png` se omite únicamente para abreviar la tabla.

| Pantalla / estados Wails | GPUI observado | Diferencias de estructura, texto e interacción | Prioridad / kit |
| --- | --- | --- | --- |
| Shell: `shell-completa` | `inicio-base` | Wails tiene rail de 81 px + columna contextual de 296 px. GPUI solo columna fija de 296 px con todas las secciones. El contenido nativo gana 81 px y deja de tener la misma geometría. La columna Wails cambia con la página; GPUI conserva títulos y subtítulos genéricos. | P0: rail de iconos, grupos, tooltips, estados activo/bloqueado/próximamente, columna contextual. |
| Paleta: `shell-paleta-abierta`, `shell-paleta-busqueda`, `shell-paleta-vacia` | `inicio-sin-paleta` tras Ctrl+K | No aparece paleta nativa. Faltan overlay modal, desenfoque, campo de búsqueda, grupos, resultados y atajos de navegación/ejecución/cierre. No basta un botón que navegue. | P0: modal/paleta, input, filas con icono y navegación por teclado. |
| Columna: `shell-columna-colapsada` | `inicio-base` | Nativo no tiene colapso/expansión ni pie contextual. Wails separa contexto, próximas carreras, perfil de overlay y perfiles Launcher. | P0: toggle/colapso, slots de contexto y pie. |
| Topbar/avisos: `shell-completa`, `ajustes-actualizaciones` | `inicio-base` y todas las bases nativas | Wails: ruta/título, campana, pill de actualización. Versión en cabecera de **columna**, avatar en pie de **rail**, perfil activo en bloque contextual; no moverlos a topbar por suposición. GPUI: ruta genérica «Vantare», título y «Guardar y cerrar». Punto verde junto a `0.0.0` sin conexión comprobada. Faltan avisos/novedades y acciones por página. | P0: topbar compuesta, avatar, pill/chip de estado, popover de novedades. P2: versión sin indicador decorativo que parezca disponibilidad. |
| Inicio: `inicio-base` | `inicio-base` | Wails saluda, ofrece búsqueda/comando y acciones rápidas, perfil activo con mini preview y próximas carreras. GPUI presenta texto «Tu espacio de trabajo», tarjetas próximas carreras/núcleo y enlaces Studio/Workshop; no comando ni mini preview de perfil. Ambas capturas reconocen ausencia de próximas salidas vigentes. | P0 shell; P1 acción/comando, tarjeta de perfil y mini canvas. |
| Workshop: `workshop-base`, `workshop-detalle` | `workshop-base`, `workshop-detalle`, `workshop-catalogo` | Wails `/workshop` es ruta dev independiente, con selectores widget/sistema/idioma, controles de contenido, escenario y renderer productivo Eficiencia. GPUI lo integra como sección, muestra catálogo y comparación, controles que recorren opciones por click y archivo de escena. Catálogo nativo de 18 frente a 22 widgets del corte Wails; no misma escena/tabla ni tamaño de widget. Referencia congelada y fixture LMU no son una campaña de paridad completa. | P1: selector desplegable, controles de contenido, toolbar/transport y panel de escena. P2: catálogo y escenario con límites de captura explícitos. |
| Studio: `studio-base` | `studio-base`, `studio-widget-anadido`, `studio-seleccion` | Wails dispone de canvas central, lista contextual de widgets, herramientas y propiedades. GPUI antepone tarjetas documento/lista, canvas 1920×1080 y un inspector paralelo desplazable. Añadir/seleccionar Standings funciona; inspector ofrece visibilidad, opacidad por pasos, orden, cabecera/pie/marca y métricas. Expone opciones pendientes; faltan grupos/tabs completos de layout/contenido/comportamiento/apariencia y la misma disposición espacial. No se verificó drag/resize ni todos los ajustes. | P0 estructura del editor; P1 toolbar, tabs, controles numéricos y ajustes tipados; sin renderer nuevo. |
| Launcher: `launcher-base`, `launcher-nuevo-perfil` | `launcher-base`, `launcher-nuevo-perfil` | Wails organiza perfiles/favoritos en contexto, catálogo de apps y editor con pasos, nombre/descripción/notas y políticas. GPUI descubre apps locales y abre borrador de perfil con filas y controles. Faltan búsqueda/organización contextual equivalente, iconos y editor visual de pasos. Catálogos no iguales: demo Wails frente a escaneo nativo real; no se lanzaron apps ni cadenas. | P1: búsqueda, list rows, iconos, tabs, editor de pasos, input común. |
| Calendario: `calendario-base`, `calendario-dia`, `calendario-semana`, `calendario-mes`, `calendario-timeline` | `calendario-base` | Wails tiene filtro por categoría, seguidas, cinco vistas y zoom/control temporal. GPUI lista series con seguimiento y próximas salidas, agenda local caducada y botón de carga. No grids día/semana/mes, timeline, detalle horario ni filtrado equivalente. Las capturas no afirman una agenda vigente. | P1: segmented tabs, chips, filtros, grids/timeline y detalle; son vistas de dominio, no convertir `orbit.rs` en motor calendario. |
| Strategy: `strategy-base`, `strategy-lista`, `strategy-continuar`, `strategy-asistente-origen`, `strategy-asistente-equipo`, `strategy-asistente-inicio`, `strategy-nuevo-evento` | `strategy-base`, `strategy-detalle` | Wails muestra colección, continuación, asistente manual/automático, solo/equipo y formulario. GPUI dispone de documento V2/variantes y cálculo manual escalar, con campos en tarjetas y limitaciones explícitas. Faltan asistente/selección contextual, múltiple piloto, disponibilidad, inventario/forecast y workspace completo de stints. No se calculó un plan ni se aprobó solver desde screenshots. | P1: wizard/tabs, inputs tipados, chips, tablas y tarjetas; contrato funcional del worker Strategy. |
| Engineer: `engineer-base`, `engineer-historial` | `engineer-base`, `engineer-detalle` | Wails reúne estado, controles, salidas por familia, audio y tabla de historial/diagnóstico. GPUI ofrece configuración local de radio/voz/familias y estado «sin estado publicado». Selectores ES/EN/velocidad/familias usan botones. Faltan select real, sensibilidad/modos equivalentes, historial, previsualización de exportación y estado conectado verificable. | P1: selects, tabs/tabla de historial y status chips. Radio real/voz no probadas. |
| Telemetría: `telemetria-base`, `telemetria-demo`, `telemetria-trazas` | `telemetria-base` | Wails tiene lista de sesiones, deltas/sectores, mapa, insights y trazas; demo explícita para poblado. GPUI muestra directorio de grabaciones vacío, comparación A/B, trazas vacías y error explicado si no hay storage. Faltan workspace/readout/mapa/insights de la pantalla actual. No se aportó grabación real ni se compiló storage para esta captura. | P1: listas de sesión, tabs, tablas/readout; gráficas bajo módulo Analysis, no primitivas genéricas sin necesidad. |
| Testing Center: `testing-center-informe`, `testing-center-detalle`, `testing-center-validar`, `testing-center-mis-reportes` | `testing-center-base`, `testing-center-diagnostico`, `testing-center-diagnostico-preparado` | Wails tiene Reportar/Validar/Mis reportes, consentimiento, preview y envío por canal. GPUI ofrece borrador privado, diagnóstico sanitizado en memoria y exportación local; no envío/validación/lista de reportes. El diagnóstico marca binarios faltantes: solo se construyó Hub. No confundir ausencia de build con defecto del distribuidor. | P1: tabs, campo multilinea, checkbox, preview/tabla. Servicio de envío sigue bloqueado por el plan. |
| Roadmap: `roadmap-base` | `roadmap-base` | Wails capturado en «Cargando roadmap…». GPUI declara publicación Supabase pendiente. Timeline/tablero/distribución existen en fuente Wails, pero no se capturaron poblados sin publicación. No crear contenido local para cubrirlo. | P0 bloqueado por servicio para aceptación; P1 selector de vista/tarjetas solo con contrato y publicación autorizados. |
| Cuenta: demo `cuenta-base`; real `cuenta-anonimo`, `cuenta-login`, `cuenta-crear`, `cuenta-recuperar` | `cuenta-base` | Wails: acceso real sin sesión y, en fixture, perfil/avatar, plan, estado, canales y dispositivos. Nativo: «Sin sesión: integración de autenticación y almacén protegido pendiente». No formulario OAuth/email, ni sesión/dispositivos. No se concede autoridad a la identidad demo. | P0 bloqueado; P1 avatar, inputs, botones de proveedor y feedback. |
| Licencias: `licencias-modulos-dispositivos` (subpanel de Cuenta) | `licencias-base` | Wails coloca plan/módulos/dispositivo en Cuenta, no sección independiente equivalente a la nativa. GPUI indica validación firmada pendiente y no concede permisos. No se hizo comprobación/reset de acceso ni dispositivo. | P0 bloqueado; P1 chips/estado/matriz de módulos, contrato con núcleo. |
| Notificaciones: `shell-notificaciones-abiertas` | `notificaciones-base` | Wails es campana con popover/historial; nativo es página de bandeja local con leído/vaciar. Faltan campana/badge, popover, agrupación de fuentes/acciones y continuidad con topbar. Fixture vacía no prueba todos los tipos de aviso. | P1: icon button, badge, popover, list row/estado vacío. |

## Matriz: Ajustes y subpáginas

En Wails pertenecen a la misma shell con columna de secciones/buscador.
GPUI solo expone `ajustes-base`: formato de widgets Métrico/Imperial y ES/EN,
más textos pendientes para rendimiento, actualizaciones y atajos. No se
duplican sus PNG para simular subpáginas que no existen.

| Subpágina / evidencia Wails | Diferencia nativa | Prioridad / piezas |
| --- | --- | --- |
| Aplicación: `ajustes-aplicacion`, `ajustes-idioma-desplegado` | Falta zoom, idioma **del Hub**, densidad, inicio/minimizado/avisos/notificación de prueba. El ES/EN nativo solo formatea widgets. | P1: dropdown real, stepper, switch y feedback por capacidad del SO. |
| Apariencia: `ajustes-preparacion-oscuro`, `ajustes-apariencia`, `ajustes-apariencia-detalle` | Faltan siete paletas, sistema/claro/oscuro, contraste/opacidad y fuentes. GPUI está fijo en Orbit oscuro. | P1: swatches, tabs, slider y dropdown de fuentes. P2 fidelidad tokens/densidad. |
| Rendimiento: `ajustes-rendimiento`, `ajustes-rendimiento-detalle` | Falta nivel global/por perfil y ajustes de cadencia; el nativo declara que no tiene contrato de configuración. | P1 bloqueado por contrato: segmented select, rows y estados heredados. |
| Actualizaciones: `ajustes-actualizaciones` | Falta versión/canal/novedades/acción. Aviso fixture presente; ninguna descarga/instalación ejecutada. | P0 contrato actualizador; P1 pill, progress/estado y novedades. |
| Atajos: `ajustes-atajos` | Sin combinaciones globales ni editor/contexto de conflicto equivalente. | P1: campo de combinación de teclas y estado de validación. |
| Privacidad: `ajustes-privacidad` | Falta consentimiento y cola de Strategy en el Hub. No inferir paridad de privacidad por ausencia de controles. | P1: switch/checkbox/acciones de cola conforme al contrato. |
| Diagnóstico: `ajustes-diagnostico`, `ajustes-diagnostico-detalle` | No está en Ajustes nativo; una parte está en Testing Center, con contrato local diferente. Faltan fuentes/datos/registros, filtros y búsqueda equivalente. | P1: tabs/chips/búsqueda/tabla; distinguir diagnósticos de estado real. |
| Cuenta: `cuenta-base`, `licencias-modulos-dispositivos` | Cuenta/Licencias se separan como placeholders en GPUI; ver tabla anterior. | P0 bloqueado por autenticación/licencia. |
| Agenda Owner (`schedule`) | No capturada: la fixture paid no tiene rol Owner. La fuente Wails la filtra por `access.roles.includes("owner")`; no existe subpágina nativa. | P1 pendiente de sesión/fixture Owner existente autorizada; no fabricar roles. |

## Kit Orbit: qué existe y qué falta

En `native/hub/src/orbit.rs` existen texto/rótulo, columna, nav item, topbar,
page header, card/body, setting row, switch, botón secundario/principal,
select aparente y callout. La geometría de tarjeta/control comparte tokens,
pero eso no demuestra paridad de pantalla.

| Pieza | Brecha concreta y reutilización mínima |
| --- | --- |
| Rail/iconos/icon button/tooltip | Ausentes en el kit. Reutilizar iconografía aprobada; manejar activo, bloqueado, foco y avatar sin meter permisos en el renderer. |
| Columna contextual/colapso | `column` y `nav_item` existen. Faltan composición de bloques propios por página, colapso y slots de pie. |
| Paleta/modal/popover | No hay primitivas compartidas para capa, foco/cierre/selección. La paleta debe ejecutar intenciones de navegación/acción del propietario. |
| Dropdown | `orbit.rs:269` solo convierte `button` en select aparente. El click de varias páginas recorre valores; falta lista de opciones, opción activa, icono, teclado, cierre y posicionamiento. |
| Campo de texto | Falta en `orbit.rs`, **no en todo el producto**: Launcher ya tiene `launcher/input.rs` con IME/UTF-16/selección por teclado, y Testing/Strategy usan sus campos. Revisar/reutilizar esos controles; no escribir otro editor para cada página. La implementación Launcher declara límites de ratón/grafemas. |
| Chips/pills/badges/avatar | Faltan piezas comunes de plan, canal, fuente, actualización, contadores y perfil. Semántica y texto deben venir del ViewModel. |
| Segmented/tabs/checks | Faltan selección exclusiva, checkbox, pestañas y focus/ARIA comunes para vistas, filtros y consentimiento. |
| Slider/stepper/teclas | Los botones de pasos son funcionales parciales; falta interacción y feedback equivalentes de número, opacidad, contraste y atajo. |
| Filas/listas/tablas/estado vacío | Existen cards y setting rows. No sustituyen catálogo, resultados de paleta, historial y tabla: definir solo las piezas que una página necesita. |
| Tipografía/superficies | Revisar tamaños/pesos, rótulos espaciados, foco/hover, límites de scroll, textos de ayudas y overflow. `eyebrow` solo pone mayúsculas; selects y varios botones locales aún no usan el mismo componente. |

Anclas revisadas: `native/hub/src/shell.rs:171` (Ajustes), `:190` (columna fija),
`:263` (composición), `:303` (teclado de la shell); `native/hub/src/orbit.rs:60`
(columna/versión/punto), `:124` (topbar), `:269` (select).
`frontend/src/hub/components/orbit/OrbitShell.tsx:620` sitúa versión/columna y
`:640` compone campana/actualizaciones; `frontend/src/hub/orbit/views.ts:103`
enumera las nueve subpáginas. La evidencia funcional tiene el límite de las
acciones realmente ejecutadas, no de lo que estos nombres sugieren.

## Verificación y continuidad

- Build nativo `cargo build -p vantare-hub -j 2`: PASS, 4m45s en este entorno.
- Wails: `pnpm build` en copia externa (typecheck y assets): PASS;
  `go build -p 2 ... ./cmd/vantare`: PASS. Primer intento Go anterior a la
  llegada de `frontend/dist` falló por el embed; se conservó la causa y se
  construyó una vez disponibles los assets. No se cambió producto para compilar.
- `cargo fmt --check`: PASS. `cargo clippy --workspace --all-targets -j 2 -- -D warnings`: PASS.
- `cargo test --workspace -j 2`: PASS en reintento, código 0, 669 pruebas
  correctas y 4 omitidas; salida completa
  en `cargo-test-retry.log`. Primer intento 101 por el `.exe` abierto durante
  captura (Windows, error 5), conservado en `cargo-test-first-attempt.log`.
  Se cerró el Hub antes de repetir; no se modificaron tests ni producto.
- Captura CDP: 48/48 demo y 3/3 real; asserts 1440×900/DPR1. Captura Win32:
  asserts 1440×900/DPI96/PID/ruta/foco. Inspección de bases nativas y estados
  críticos; dimensiones de 76 PNG verificadas con Pillow ya instalado.
- Scripts: sintaxis Node/PowerShell PASS; rechazo de salida CDP dentro del
  repo comprobado (exit 1 esperado); `git diff --cached --check` PASS. Se
  renovaron solo shell completa (espera al aviso) y telemetría vacía con
  `telemetryDemo=0`: el store recuerda el modo demo entre visitas. Manifiesto
  final externo actualizado con los dos hashes nuevos, sin inventar sesiones.
- No se ejecutan suites Go/frontend, LMU, OBS, performance ni CI: no se cambia
  comportamiento de producto y esta entrega es referencia visual/documental.
  No se claiman gates omitidos, paridad funcional, ahorro de recursos ni fase 5 completa.

Wails y GPUI terminaron normalmente; Vite propio se detuvo por PID/ruta/puerto
verificados. No quedan sus hijos WebView2. El binario GPUI previo a los tests
se conservó en evidencia para asociar su hash a las capturas, aunque Cargo lo
reconstruya después. No se copiaron ni borraron cachés compartidas.

Siguiente paso del orquestador: revisar galerías/diff, ordenar P0 shell y P1
por contratos de cada worker y renovar referencias al integrar otro SHA.
Para aprobar paridad faltan Wails autenticado real, agenda Owner, publicación
Roadmap poblada, datos equivalentes por página, interacciones completas y
validación física requerida por el plan. Las capturas no levantan esos bloqueos.

Preguntas abiertas de revisión (no impiden esta entrega de evidencia): ¿se
conserva Workshop como herramienta dev separada o sección nativa de producto?
¿cuál es el contrato local de versión/actualizador/autenticación que alimentará
la shell? ¿qué sesión autorizada permite validar Owner/Roadmap sin fixture
inventada? Corresponden al orquestador/Isaac; no se implementaron decisiones aquí.
