# Inicio Rune · VANTA-141, pieza 8

Solo para el PC de juego. No ejecutar en servidor, ni con opciones de captura,
árbol o versión. El servidor solo compila/verifica archivos y empaqueta.

Pantalla local 1440×900, Vantare oscuro, barra lateral contraída y sin animación
de entrada. Usa `hub-web/design/tokens.json`, los mismos nueve archivos de
fuentes estáticas del Hub (ver `scripts/fonts.ts` y `design/fonts.css`), SVG
originales de widgets/iconos y el circuito lemans_h de su catálogo. Todos los
recursos van incrustados; hashes y procedencia en assets/procedencia-assets.json.
No hay red, cuentas, datos reales ni procesos de simulación o aplicaciones.

Conserva la estructura de la referencia inicio-base-collapsed: búsqueda,
saludo y perfil, overlay en pista, actividad, estado y plantillas. Los perfiles
se leen del mismo fixture inicio-base.json. Inicio y otra sección sencilla
permiten medir el cambio de pestaña; los demás botones no lanzan aplicaciones.
No pretende reproducir páginas completas fuera de Inicio. El aspecto se
comprobará en el PC; estos tests no demuestran paridad visual al píxel.

Argumentos: `--medicion-inicio --control-stdin`. El cierre de stdin pide salir.
Se usa el scroll real de Rune y la ventana se puede redimensionar hasta
1280×720. A 1440×900 todo Inicio cabe: registrar si una fase de rueda no mueve
contenido; no presentar ausencia de desplazamiento como fluidez medida.

Tests puros: árbol con perfiles canónicos y secciones principales; pulsación
real de Roadmap y vuelta a Inicio. 2/2 PASS; imágenes decodificadas en CPU
por ImageCache y Runtime::frame, sin crear ventana ni dispositivo gráfico.
Fmt y Clippy all-targets -D warnings PASS, solo Release, Rust 1.99.1.

Fuente Windows compilada 69d2a5cc78aadc06b5dda900afc269f313b8c487;
opt-level=3, lto=false, codegen-units=16, debug=0 también en dependencias.
Cruce Windows cargo-xwin, 11,16 s incremental; 27.247.616 bytes, SHA256
3723297ccfea1b13d02d2df650be086044eb2d61e6a721ddf067a8f10dead0a2.
Procedencia incrustada comprobada leyendo el PE; dumpbin en evidencia externa.
El primer cruce fue 37,14 s con dependencias calientes: NO compilación limpia.

Target Mac único ~/target-isa-2213-rune, una compilación a la vez; mínimo
absoluto autorizado 10 GiB, guardián 10,25 GiB. Mínimo de este build 11,75 GiB.
No se modifica native/rust-toolchain.toml. Workspace aparte y cuatro parches
Rune fijados a d5338988a7c1b3377adb60853815b6d0843dae7c.

Pendiente: ejecución física, paridad visual, primera ventana/estado interactivo
medidos por la campaña común, comparación A-Electron/A-GPUI fast y kit final.
No hay veredicto de adopción, integración ni release.

## Marca de interactividad para la campaña A

VANTARE_MEASUREMENT_READY_FILE absoluto se publica una sola vez después de
un frame completo con todas las imágenes locales decodificadas. El controlador
observa su JSON con QPC igual en los tres motores; no se presume equivalencia
entre otro reloj y QPC. No equivale a una medida de pantalla: PresentMon
aporta la primera imagen mostrada. La marca nunca sobrescribe archivos.
El nuevo gate de imágenes y el callback se comprobarán en Mac y el PC.
