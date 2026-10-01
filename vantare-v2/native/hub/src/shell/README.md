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
- Topbar: ruta, acciones de sección, campana y versión pendiente en demo.
  El contador y el popover vienen de `Notifications`; el marco no crea avisos,
  comprueba versiones ni descarga actualizaciones. Guardar/cerrar viven en
  la paleta.
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

### Acciones de la sección en la barra superior

`Hub::topbar(window, section_actions, cx)` recibe `Option<gpui::AnyElement>`.
`orbit::topbar_with_actions` lo coloca entre la ruta y la campana/versión.
`None` conserva el marco común. No hay registro, estado duplicado ni comandos
del editor en la shell: la sección devuelve sus controles y conserva sus
listeners y persistencia. Sus acciones se colocan junto al título y los controles
comunes conservan el margen automático a la derecha. `orbit::topbar` sigue disponible para los consumidores
que solo necesitan ruta y una acción.

El worker de Studio conecta su método de presentación en `Hub::render`, por
ejemplo, una vez que exista `Studio::topbar_controls`:

```rust,ignore
let section_actions = (self.section == Section::Studio).then(|| {
    self.studio.update(cx, |studio, cx| studio.topbar_controls(cx).into_any_element())
});
let topbar = self.topbar(window, section_actions, cx);
```

Ese método aporta el selector «Clean Overlay», «Heredar de la aplicación»,
«NIVEL EFECTIVO: EQUILIBRADO» y el estado de autoguardado. Esta entrega añade
la ranura; no conecta ni implementa esos controles.

En demo la columna común usa `DemoData::overlay_profile()` para el nombre,
número de widgets y estado activo/recomendado; ▶ abre Studio mediante el gate común.
No arranca overlays ni simula que estén ejecutándose. La campana conserva el
historial y el popover de `Notifications`; su ancla se actualiza al moverla
(columna colapsada o cambio de tamaño).

`DemoData::apply_capture` adapta la fixture a la escena: solo `inicio-base`
contiene perfil en el marco; el banco no tiene historial local y el aviso de
versión aparece en `shell-*`, Ajustes (salvo la escena de preparación), Cuenta
y Licencias. La visibilidad de Testing en captura sigue
la escena Testing, sin conceder roles al producto real. Inicio debe consumir
el mismo accessor para distinguir ausencia de perfil de sus datos preparados.
La API actual de `home.rs` aún lee `profile` directamente; esa conexión queda
para su propietario (archivo fuera del alcance de este worker).
La lista Launcher común se omite en Ajustes, Cuenta, Licencias, Studio y
Workshop; Studio, Ajustes y Launcher aportan sus columnas propias.

El marco ya no añade la cabecera genérica «Hub nativo»: los títulos del contenido
pertenecen a cada sección. Home y Strategy ya la omitían; Ajustes conserva su
cabecera propia. Workshop, Studio, Launcher, Calendario, Engineer, Telemetría,
Notificaciones, Testing, Cuenta, Licencias y Roadmap recibían antes la genérica.
Calendario, Studio y Roadmap aún tienen márgenes negativos que restan esa
cabecera; el marco conserva 135 px de espacio de layout, sin título duplicado,
hasta que sus propietarios retiren esos márgenes. Testing, Cuenta y Licencias
necesitan cabeceras propias en sus renderizadores (fuera de estas rutas).

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
`cargo nextest run --workspace -j 2` y
`cargo test --workspace --test lifecycle -j 2`.
Tests puros: filtro, matriz, navegación bloqueada, cursor, orden y destinos;
assets embebidos y límites de ancho. La evidencia física y los logs quedan
exclusivamente en `C:/tmp/marco-2-evidence/`, con hashes y resultado de gates.
No equivalen a aceptación de paridad de contenido, licencia, LMU/OBS o DPI.

Encargo excepcional: Notion no disponible y trabajo GitHub autorizado por Isaac.
Seguimiento Notion pendiente; issue técnica #1430. Sin push, PR, promoción de
canal ni release. Solo merges locales solicitados.
El orquestador debe revisar el diff e integrar la continuidad en el handoff vivo.
