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
