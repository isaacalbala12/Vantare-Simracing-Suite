# Corte 1 · Hub Rune · VANTA-143 / #2256

**Pendiente de aceptación.** Isaac aprobó el funcionamiento manual y rechazó
el aspecto inicial. El PR prioritario [#2297](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/2297)
corrige el marco e Inicio; la nueva aprobación visual sigue pendiente.

| Requisito ADR 0108 §4 | Resultado verificado | Pendiente para aceptar |
| --- | --- | --- |
| Windows 10 22H2 y 11, 100/125/150 % | Build/Clippy y 59 tests Windows CI PASS en e553d9fb; 66 capturas Mac en las tres escalas | Ventana real en ambos Windows; windows-latest y capturas Mac no certifican esos sistemas |
| Teclado español, acentos y AltGr en campos | Catálogo Unicode y escritura/pegado Unicode en la búsqueda CPU PASS | Entrada física/IME/AltGr en la búsqueda real |
| Todo por teclado y controles con nombre | **PASS manual de Isaac en Mac:** Tab, Enter, Espacio, tema, Inicio/Roadmap y X; «súper bien». Tests de foco, activación y nombres PASS | Lector de pantalla real; el PASS manual corresponde a 5e1c7024 |
| Aspecto fiel aprobado por Isaac | **FALLO visual inicial de Isaac.** Nuevas comparativas completas y arreglos en #2297 | Revisión y aprobación visual de Isaac; las capturas no convierten el resultado en PASS |
| Media hora sin cierres ni bloqueos | Tests de protocolo, cancelación y cierre PASS | Sesión continua real de 30 minutos; no se sustituye por tiempo virtual |

## Evidencia de la corrección visual

Código capturado en revisión 2: `e6fcb3271e8b9190d05df0f4079aba4f1154be30`.
El ajuste de Clippy 4186911d no cambia la presentación.
Captura anterior: `f980b5355ed82ec17a620cf7b13eeeda30cb0e5b`.
Antes y referencia Electron QA: `5e1c70241ccf57378041dc2dcceabacff2bc9447`.
Registro anterior extraído del repositorio a `D:/VantareServer/evidence/hub-rune/review-2297-r2/previous-repo-evidence/validation.json`. Las imágenes y registros pertenecen al servidor, no a Git.

66 celdas por cliente: marco expandido/contraído, Roadmap publicado/vacío/error
e Inicio en seis estados, en claro/oscuro y a 100/125/150 %. Viewport lógico
1440×900; PNG físicos 1440×900, 1800×1125 y 2160×1350. 198 PNG originales y
132 comparativas antes/después. Sin estirar una referencia 100 % para fabricar otra escala.

Informe completo: `D:/VantareServer/evidence/hub-rune/corte1/index.html`.
Originales y manifiestos: `before/`, `after/`, `electron/`; comparativas:
`comparisons-before/` y `comparisons-after/`. Electron va a la izquierda y Rune
a la derecha. Los seis ejemplos antes versionados se conservan en
`D:/VantareServer/evidence/hub-rune/review-2297-r2/previous-repo-evidence/`.

Revisión 2 de #2297: saludo y fecha desde Electron, búsqueda y Ctrl K / Ctrl L,
widgets en píldoras, VER TODO y badges Launcher, Editar overlay blanco / Detener,
avatar y Studio al final del raíl y badges de estado con color. La fecha de la
referencia congelada de Electron es **30/09**. Nuevas 66 capturas offscreen
y 66 comparativas completas en
`D:/VantareServer/evidence/hub-rune/review-2297-r2/index.html`.
Manifiestos en `rune/manifest.json`, parejas en `comparisons/comparisons.json`
y validación de todos los hashes/dimensiones en `validation.json`.
La referencia Electron conserva sus 66 PNG originales y su SHA anterior: no
se recaptura ni se ejecuta Electron en esta revisión. Aprobación de Isaac pendiente.

## Ejecución y límites

Rune usa `--snap` offscreen con 181 frames virtuales y un solo PNG final.
Electron usa un entry QA accessory, ventana oculta, sin foco ni show/activación;
se verificaron visible=false, focused=false y focusable=false en las 66 celdas.
Ningún proceso QA fue la aplicación en primer plano. No se usó System Events ni
permiso de Automatización. La referencia es el renderer Electron QA real en Mac
con viewport/DPR CDP, complementario al banco HWND Windows; no es una prueba de
ventana Windows. El antiguo guion que abría ventanas se retiró de esta tanda.

El servidor solo compiló y ejecutó tests CPU, por la cola, un slot y -j2 con
targets D:. Ninguna ejecución de la aplicación ni opción gráfica de Rune en Windows.
Rune d5338988, Rust 1.99.1, --locked, 463 paquetes permisivos, sin MPL/ogg-audio.
Mac e6fcb3271: build y 52 tests PASS; 29 avisos existentes del host sin uso
en esa plataforma. Clippy Windows 4186911d PASS en cola, -j2. TypeScript y Biome
PASS. CI web e553d9fb PASS. Prueba web local: un archivo/3 tests PASS, otros tres
workers no arrancaron a tiempo; registro conservado, no se considera gate PASS.
La CI web sí pasó typecheck, lint, tests, build y pruebas de navegador.
CI Rune e553d9fb PASS: Clippy, 59 tests y enlace del ejecutable Windows sin
ejecutarlo. CI web, calidad y gates PASS en el mismo SHA. El último cambio
documental conserva ese código; HEAD/checks definitivos se consultan en el PR.

La X observada por Isaac cierra la ventana; no certifica por sí sola la duración
del proceso. El cliente conserva WindowClose → CloseRequested → CloseAnswer,
plazo de 10 s, fallo de envío y recuperación de rechazos tipados. Reapertura/foco
tras un rechazo y smoke del anfitrión real Windows siguen pendientes; detalles
de E/S cancelable y cierre en [README](README.md).

## Limpieza del Mac

En la revisión anterior: target propio de 3,16 GiB y 93 perfiles QA retirados.
En esta revisión: retirado exclusivamente `~/target-isa-2256-hub-rune`
(1,93 GiB lógicos), 15,53 → 17,27 GiB libres. Cero procesos
propios de captura pendientes. Se conservó el binario debug y su hash en
`~/orq/isa2256-review-r2-binary-e6fcb3271/`; no se ejecuta automáticamente.
Hash SHA-256: `8ebe61421d39010d294b617cd3a9a9a9ce4c768e68b792c60109e20c47b78d14`.
No se tocaron targets de Isaac ni de otros workers. Sin cuentas ni datos reales,
cambios de hub-host/overlays/instalador/distribución, merges, promociones o releases.


## Revisión del hero y buscador · 14-nov

Código de lanzamiento e3749fa6 aceptado por Isaac; aspecto pendiente de igualar.
Se corrigen el fondo degradado, Studio secundario con borde, retirada del botón
inferior de Plantillas y búsqueda/selector de 168×38 con flecha. Las seis capturas
preliminares 043b24d20 de `D:/VantareServer/evidence/hub-rune/review-2297-r3/`
aún muestran el hero oscuro: son diagnóstico, no evidencia final del arreglo.
La preparación determinista de imágenes de las escenas de captura se verifica
en un test CPU del primer frame. Falta repetir los seis PNG tras ese cambio.
El Mac no responde por SSH al retomar el 14-nov; no se afirma fidelidad aprobada
ni se atribuyen los 61 tests Windows / 54 Mac de 043b24d20 al último head.
