# Testing Center — paridad de sección (#1430)

Worker Codex; revisión del diff completo por Claude Opus 5.5 pendiente.
Issue: https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1430.
Rama asignada: `vantareapp/isa-1430-w-sec-testing`.
Base recibida: `95c20ae2bb4efada1d2dfe0de1b160bb1b471c68`.
Se obtuvo `origin/nightly` (`f29b5fee04022756f9ae59f19bf153f91eebe4ed`) y se
leyeron sus instrucciones. Se conserva la base de integración asignada por
el orquestador; no se rebasa el trabajo de otros workers.

Notion no disponible: Isaac autorizó explícitamente trabajar solo con GitHub.
No se declara el seguimiento cerrado. El orquestador debe reconciliar Notion
y el handoff canónico. Este documento es una nota técnica del worker.

## Alcance

Solo `native/hub/src/testing/` y las dos conexiones mínimas de `shell.rs`:
mostrar el propietario de la sección y pasarle el servicio compartido y la
ventana. Sin cambios al kit Orbit, otros módulos, servicios, dependencias,
widgets ni núcleo. Sin push, PR, merge, release ni subagentes.

- Reportar / Validar / Mis reportes sobre `orbit::Choice` (pestañas).
- Formulario con selector real de los 15 módulos del contrato nativo,
  dos campos paralelos y otros dos a ancho completo; `orbit::Input::multiline`.
- Tarjeta de consentimiento y adjuntos con `orbit::Checkbox`. Diagnóstico,
  replay y logs deshabilitados y pendientes: el contrato nativo solo envía texto.
- Borrador, carga, descarte, preparación, reintento y envío usan los comandos
  del servicio integrado. No hay HTTP, cuenta, canal o recibos inventados.
  Errores de configuración/supervisor se muestran tal como los devuelve el
  servicio. Guardado explícito: guardar antes de previsualizar o cerrar.
  Guardar/Previsualizar van junto al selector para mantener las acciones visibles
  a 900 px; la tarjeta lateral conserva Enviar/Descartar.
- Previsualización exacta de `Preview.payload`, cuenta y canal del servicio.
  El checkbox autoriza solo esa vista. Cualquier edición revoca la autorización;
  mover cursor/selección no cuenta como edición. El click consume consentimiento.
  Reintentos requieren revisar de nuevo el payload original y dar consentimiento.
- Límites UTF-8 del formulario Wails: 3–2048 bytes en los tres obligatorios,
  contexto opcional hasta 4096 bytes, contando texto recortado en los extremos.
  La comprobación de UI no sustituye la validación del servicio.
- Validar explica que no hay contrato nativo de candidatos ni feedback; Actualizar
  queda deshabilitado. No se presenta una lista vacía como consulta exitosa.
- Mis reportes explica ausencia de historial y lista de recibos de sesión
  pendiente. El servicio conserva el último intento/recibo, consultable desde
  Reportar, pero su UI actual no entrega recibos tipados a la sección para una
  lista. No se extraen IDs desde mensajes libres.
- Diagnóstico y borrador privados previos se conservan bajo un desplegado local.
  Campos multilinea y selector Orbit también allí. Exportación sanitizada local
  separada del envío, con la misma privacidad, conflictos y persistencia anterior.

## Verificación y límites

Los tests nuevos cubren límites UTF-8, campos opcionales, preview ausente,
consentimiento ausente, edición, cambio de ID/digest/payload/cuenta/canal/retry
y reintento autorizado con contenido original. Los tests anteriores de
privacidad, archivos y diagnóstico se conservan.

Evidencia, logs y capturas exclusivamente en `C:/tmp/vw3-sec-testing-evidence/`.
La referencia es `wails-demo/testing-center-*.png`, copiada sin transformar.
`capture.ps1` espera el marcador de pantalla ocupada y toma
`Global\VantareParityCapture`, también para clicks y teclado. Por defecto 1440×900.

No se afirma envío remoto, cuenta configurada, backend desplegado, CI,
aceptación de paridad completa, IME físico, DPI mixto ni runtime con juego.
Los datos de texto que se introduzcan en QA son entradas de prueba explícitas.
No se adjuntan capturas, logs ni diagnósticos a ningún servicio.

## Gates ejecutados (2026-09-30)

Sobre el código final, desde `native/`, conservando sccache y sin superar dos
jobs de compilación:

- `cargo fmt --check`: código 0 (`fmt-final.log`).
- `cargo clippy --workspace --all-targets -j 2 -- -D warnings`: código 0
  (`clippy-final.log`).
- `cargo test --workspace -j 2 --no-fail-fast -- --test-threads=1`:
  código 0; 740 aprobados, 0 fallidos,
  4 ignorados en 42 resultados de suites (`tests-final.log`). Los ignorados
  requieren LMU/ACC activos y no pertenecen a la lógica añadida.
- `cargo build -p vantare-hub -j 2`: código 0 (`build-final.log`).

Todos los logs viven en la carpeta de evidencia externa indicada arriba.
El primer gate de tests falló en dos casos de `engineer/tests/lifecycle.rs`:
`engineer_process_consumes_productive_facts_checkpoint_and_lap_radio_over_real_pipe`
y `real_pipe_process_applies_local_edits_and_invalid_json_keeps_last_valid`.
Una repetición paralela volvió a fallar en esos dos y en
`authentic_events_without_rights_keep_checkpoint_but_never_present_paid_radio`
(`tests-parallel-layout.log`). La ejecución aislada serial falló en el test de
edición por `ACK firmado durable: Kind(TimedOut)` (`engineer-lifecycle-serial.log`).
La ejecución completa final serial aprobó los cinco tests de procesos sin
modificar Engineer ni sus tests. La causa de esos fallos intermitentes no queda
demostrada; el resultado final no los convierte en un arreglo de Engineer.

La primera elección del botón primario reprodujo un panic real al abrir
Reportar. `hub-panic-backtrace.log` identifica `orbit.rs:502` desde
`Editor::consent_card`. El kit queda intacto; la sección compone el botón
estándar. No se ejecutaron checks frontend/Go porque esos archivos no cambian,
ni CI remota porque no se hizo push.

## QA visual final

Binario final, datos/layout/ajustes/launcher y pipe aislados en la carpeta de
evidencia. Se esperó el marcador de pantalla y se tomó el mutex global antes
de abrir la ventana y operar/capturar. No se iniciaron núcleo, juegos ni servicios.

- `native-reportar.png`, `native-validar.png`, `native-mis-reportes.png`:
  1440×900, inspeccionadas, junto a las cuatro referencias Wails originales.
- `native-modulos.png`: menú abierto; selección de Hub con ratón verificada.
- `native-focus.png`: enfocar texto mantiene el indicador Borrador local.
- `native-errores.png`: formulario vacío muestra los tres errores obligatorios.
- `native-texto.png`: entrada explícita de prueba con salto de línea, módulo Hub,
  indicador Cambios sin guardar y envío deshabilitado.
- `comparison.html` presenta los pares sin transformar imágenes;
  `hashes.json` identifica binario, referencias, capturas y logs.

Hub cerrado al acabar. Dos intentos adicionales perdieron el foco: el guard del
capturador detuvo la operación y cerró la instancia propia. Una tanda capturada
fuera de la sección esperada se conserva como `rejected-native-*.png`, excluida
de la comparación válida. El intento final de Guardar no se ejecutó por esa
pérdida de foco: no se afirma prueba física del error de servicio, guardado,
preview remoto, consentimiento con cuenta real ni envío. La autorización exacta
de preview se verifica con tests de lógica; no se inyectaron previews en la UI.

## Verificación manual

1. Desde `native/`, compilar Hub con `cargo build -p vantare-hub -j 2`.
2. Abrirlo con datos/layout aislados y acceder a Testing Center por la barra.
3. Cambiar pestañas con ratón/flechas; comprobar los pendientes honestos.
4. Elegir módulo y escribir texto con saltos de línea. Previsualizar vacío:
   errores en los obligatorios. Guardar mediante el servicio antes de revisar.
5. Con supervisor/servicio configurado autorizado, cargar borrador, preparar
   preview y revisar contenido/cuenta/canal. Sin consentimiento el envío queda
   deshabilitado. Editar texto/módulo revoca preview y consentimiento.
6. Consultar intento pendiente: su contenido original exige nuevo consentimiento.
   Enviar solo con el backend de prueba autorizado por Isaac.
7. Abrir el diagnóstico local, prepararlo y exportar a destino nuevo; comprobar
   que omite los textos privados y no altera el payload remoto.

## Pendientes para el orquestador

- Exponer recibos tipados de sesión desde la respuesta del servicio, sin parsing
  de texto ni duplicar el propietario. Añadir lista solo con ese contrato.
- La cabecera/columna contextual pertenecen al shell de otro worker: etiqueta
  `Hub nativo`, subtítulo y contexto común impiden afirmar paridad píxel a píxel.
- Orbit fija el dropdown a `FIELD_W`; se propone tamaño expandible para el
  selector de módulo, que en Wails ocupa todo el formulario. No se toca el kit.
- `orbit::primary_button` provoca `hover style already set` al componer dos
  `hover` en el mismo elemento. Se reprodujo al abrir Reportar; Enviar usa el
  botón estándar del kit hasta que su propietario corrija el primario. No se
  reproduce su estilo mediante código propio.
- Autosave, bloqueo de cierre y actividad visible del envío deben coordinarse
  con el propietario de servicios; se conserva el guardado explícito nativo.
- Cuenta/canal/configuración real y envío autorizado siguen sin prueba física.

## Segunda pasada estricta — 2026-10-01

Esta entrada sustituye los pendientes visuales de la primera pasada donde
corresponda; conserva su evidencia histórica. Issue GitHub #1430, rama
`vantareapp/isa-1430-w-testing-2`, base asignada
`0e26ac26c365138a1b67ae1f4ee63f1236000fc3`. Se consultó la issue abierta y
se obtuvo `origin/nightly` (`f29b5fee04022756f9ae59f19bf153f91eebe4ed`),
sin cambiar la base de integración recibida. Notion no está disponible y el
encargo autoriza GitHub como excepción; su reconciliación queda pendiente.

Propiedad de este hito: **solo `native/hub/src/testing/`**. Cambios en
`view.rs`, `editor.rs`, `model.rs`, `tests.rs` y esta nota. Sin cambios al
marco, Orbit, servicios, referencias Wails, fixtures, otras secciones ni
dependencias. Sin push, PR, merge, promoción, release ni subagentes.

### Estructura y presentación

Se leyeron las cuatro referencias, capturas iniciales propias y mapas con
`view_image`, antes de editar. El banco reproduce los porcentajes recibidos.
Las tarjetas y campos estaban unos 60 px por debajo de Wails porque el marco
pinta una cabecera genérica y Testing añade otra fila con el lead y estado.
La nota `C:/tmp/fase2/notas-testing-2.md` ordena que el worker del marco retire
esa cabecera y que Testing pinte la suya.

La sección aporta ahora cabecera completa: canal, título, descripción y estado
de borrador con borde y redondeado completo; después pestañas (16 px) y panel
(18 px). El título usa Inter W700, la cara embebida más próxima al peso Wails:
W690 no está registrada y provocaba una sustitución tipográfica visible.
Conserva los 36 px pedidos por el orquestador y el tracking Wails de -0.035em
(-1.26 px); el token CSS vigente mide 34 px. La diferencia con la referencia
congelada se debe revisar con el orquestador tras integrar el marco.
Reutiliza el texto modelado común de `vantare-ui`, como Inicio, para conservar
kerning y espaciado negativo sin sintetizar otra negrita sobre la cara estática.
El canal Nightly se limita a la escena de captura; en una build normal se usa
`VANTARE_BUILD_CHANNEL`, o se declara `CANAL NO DISPONIBLE`. Un test impide
atribuir Nightly a una build sin canal configurado.

Formulario y consentimiento conservan sus columnas y controles productivos,
validación, comandos y consentimiento. Las etiquetas llevan el tracking de
Wails y las superficies su composición RGBA. La nota de Mis reportes usa un
único `StyledText` para que el texto continúe tras Sin historial y las líneas
siguientes vuelvan al borde izquierdo. No se inventa un historial.
Los textareas incorporan el pequeño trazo visual inferior derecho. No habilita
resize: `orbit::Input` fija su altura; ampliar su API corresponde al kit,
fuera de las rutas de este worker. El editor e IME siguen siendo los existentes.

Informe y detalle **son la misma escena en las referencias congeladas**:
ambas tienen el mismo SHA-256, registrado fuera del repo en
`C:/tmp/testing-2-evidence/banco/content-metrics.json`.
El manifiesto solo hace scroll de `.orbit-workspace` para detalle; no abre
un reporte diferente. La cifra idéntica no es un fallo del selector de tabs.

### Banco y dependencia de integración

Toda la evidencia está en `C:/tmp/testing-2-evidence/`, fuera del repo:
`primera-*.png`, `banco/`, `despues/`, inspección visual, mapas, hashes,
logs y tabla. El banco es `native/hub/reference/compare.ps1`; umbral 8.
La métrica de contenido compara sin desplazamiento ni enmascarado los píxeles
con **x > 376, y > 70** (recorte 377,71–1440,900), en RGBA premultiplicado.

La base de este worktree aún pinta la cabecera genérica antes de Testing.
La nueva captura muestra las dos: no se oculta mediante márgenes negativos ni
se modifica una imagen para simular integración. **El gate visual ≤5 % está
pendiente de integrar el marco**, cuyo worker debe quitar esa cabecera para
Testing y conservar el padding de 32 px sin añadir otra separación.
También le corresponden las migas `CALIDAD / Testing Center` y el título /
versión demo `Testing Center / v0.3.10` de la columna contextual. Esta escena
usa los bloques comunes de carreras, perfil y Launcher, no otra columna propia.
El porcentaje tras integrar el marco requiere nueva medición y ajuste de
detalle si procede; no se anticipa su aceptación.

### Verificación de este hito

Gates locales del hito (todos con salida completa fuera del repo):
`cargo fmt --check`, `cargo clippy --workspace --all-targets -j 2 -- -D warnings`,
`cargo nextest run --workspace -j 2` y
`cargo test --workspace --test lifecycle -j 2`.
Nextest ejecuta 897 tests y omite 4 según la configuración del workspace;
el filtro de Hub ejecuta 173 tests. Se usa además
`cargo check --workspace --all-targets -j 2` durante la iteración.
El registro de resultados y códigos de salida es
`C:/tmp/testing-2-evidence/gates.json`.

La tabla antes/después está en `C:/tmp/testing-2-evidence/tabla.md` y
`tabla.csv`: ninguna de las cuatro pantallas cumple todavía el 5 % de
contenido. Mis reportes empeora en la comparación absoluta al coexistir
ambas cabeceras; no se declara el hito como paridad aceptada.

No se ejecutan Go/frontend (sin cambios), CI remoto, envío real de reportes,
runtime de juegos, OBS, DPI mixto ni validación de otra GPU. Para aceptar la
paridad, integrar primero el marco, repetir el banco de las cuatro pantallas
y mirar referencia, captura y mapa además del porcentaje. Para verificar el
flujo funcional, se conserva la lista manual de la primera pasada.
