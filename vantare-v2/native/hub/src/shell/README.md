# Shell Command Orbit nativa — ISA-1430

Alcance: rail, columna contextual, topbar y paleta. Las entidades de sección,
sus ficheros y servicios no cambian. Referencias: `OrbitShell.tsx`, `Rail.tsx`,
`ContextColumn.tsx`, `Topbar.tsx`, `CommandPalette.tsx`, `palette-filter.ts`,
`views.ts` y `orbit-shell.css`/`orbit.tokens.css` del frontend productivo.

## Composición y teclado

- Rail de 81 px: Inicio (marca Vantare), Studio, Launcher, Calendario,
  Strategy, Engineer, Telemetría, Roadmap y Testing. Abajo: contexto,
  comandos, Ajustes y cuenta. Workshop se abre desde contexto/paleta/Inicio.
- Columna de 296 px; 216 px a partir de 1152 px de ancho lógico. Se puede
  ocultar sin perder la sección. El rail desplaza su lista verticalmente si
  falta altura y conserva los controles inferiores.
- Cabecera, versión, estado de fuente ya observado y búsqueda de enlaces
  locales. Ajustes ofrece Cuenta, Aplicación (preferencias existentes) y
  Licencias; Studio enlaza su editor y Workshop. No se crean pestañas sin API
  de sección. Los bloques persistentes son enlaces: no inventan carreras,
  perfiles activos, cadenas ni estado de overlays.
- Topbar: ruta, notificaciones locales y guardar/cerrar. El espacio del
  actualizador no muestra un pill mientras no exista estado local. No hay
  red, comprobación ni descarga de versiones, ni contador de notificaciones
  porque la entidad existente aún no expone ese dato a la shell.
- Ctrl+K abre/cierra la paleta. Filtro substring sobre etiqueta, meta y bloqueo,
  sin distinción de mayúsculas, con trim del query como Wails. ↑/↓ recorren
  resultados con wrap y scroll; Enter ejecuta; Escape/clic exterior cierran.
  Tab/Shift+Tab alternan búsqueda y cierre dentro del diálogo. Escape restaura
  el foco previo. Fuera de la paleta Tab recorre los controles; en el rail ↑/↓
  cambian el foco con wrap y desplazan el icono a la zona visible. GPUI activa
  botones con Enter/Espacio.
- Navegar limpia la búsqueda contextual conservando su entidad/foco; ejecutar
  un comando vuelve a la shell, incluso si oculta el control previamente enfocado.
  Regresión comprobada en runtime: buscar contexto, navegar con la paleta y
  volver a abrir Ctrl+K; ocultar contexto y volver a abrir Ctrl+K. No se habilita
  `test-support` de GPUI para automatizar foco/ventana en este cambio.
- Campo de búsqueda GPUI/IME de una línea, ancho flexible y placeholder. El
  editor de Launcher es privado y reutilizarlo por `#[path]` falla el gate
  `duplicate_mod`; esta pieza permanece en las rutas asignadas y no cambia
  Launcher. Límite: 16 KiB, cursor por caracteres, sin posicionamiento por clic
  ni segmentación de grafemas. Unificar el editor cuando se autorice su API
  compartida corresponde al orquestador.

## Acceso e integración pendiente

`run(options)` usa `Access::default()` (plan **sin verificar**). No se supone
Free/Suite ni se lee una licencia de un archivo o variable de entorno. La
integración de cuenta puede llamar `run_with_access(options, access)` con
derechos ya resueltos por su contrato. Esto es un gate de navegación de UI;
no autentica credenciales ni concede derechos al núcleo.

La matriz reproduce `access-policy.ts`: Studio básico permite Free/Overlays/
Suite; Strategy y Telemetría permiten Overlays/Engineer/Suite; Engineer permite
Engineer/Suite. Una licencia bloqueada impide esas cuatro vistas. El estado
sin verificar las bloquea hasta integrar cuenta. Workshop permanece como
herramienta local de autoría, sin activar overlays. Testing es el diagnóstico
local existente; su filtrado por canal productivo necesita el contrato de canal.

Todos los enlaces (rail, contexto, paleta, Inicio y destino de notificaciones)
pasan por el mismo gate. Un destino inicial monetizado muestra el motivo de
bloqueo en vez de montar su contenido. No se cambia la matriz del núcleo.
Faltan roles/capabilities y actualización en vivo de derechos: integrar con
el worker de cuenta, sin añadir autoridad de licencias a la shell.

## Kit y assets

Solo se añaden tokens/piezas en `orbit.rs`: rail, SVG, tooltip y ancho contextual.
Las piezas anteriores de las secciones se conservan. Los SVG son los símbolos
de `frontend/src/assets/orbit-icons.svg`, con la misma geometría/viewBox y las
propiedades heredadas de `Icon.tsx` hechas explícitas. GPUI aplica el color del
token como máscara. `AssetSource` los embebe: no requieren manifiesto nuevo,
dependencias, rutas absolutas ni cwd concreto.

## Verificación

En `native/`: `cargo fmt --check`,
`cargo clippy --workspace --all-targets -j 2 -- -D warnings`,
`cargo test --workspace -j 2`.
Tests puros: filtro, matriz, navegación bloqueada, cursor, orden y destinos;
assets embebidos y límites de ancho. La evidencia física y los logs quedan
exclusivamente en `C:/tmp/hub-shell-evidence/`, con hashes y resultado de gates.
No equivalen a aceptación de paridad de contenido, licencia, LMU/OBS o DPI.

Encargo excepcional: Notion no disponible y trabajo GitHub autorizado por Isaac.
Seguimiento Notion pendiente; issue técnica #1430. Sin push, PR, merge ni release.
El orquestador debe revisar el diff e integrar la continuidad en el handoff vivo.
