# Paleta de comandos

La referencia es `native/hub/src/shell/chrome.rs:996` y `:1087`:
panel de 640 px con radio de 25 px, inicio al 14 % de la ventana, búsqueda de
75 px, iconos de fila de 36/14 px y pie de 44 px. La entrada usa 17 px,
como `native/hub/src/shell/input.rs:277`.

Las siete caras Inter estáticas se copian del mismo origen que registra GPUI;
los atajos conservan Space Mono. El rótulo de grupo de GPUI pide la cara
Inter W850, que no está registrada, con peso efectivo 400; no se sintetiza
un nuevo peso 850 en web.

`command-backdrop` se incorpora al JSON de tokens para las 18 combinaciones:
GPUI usa un velo oscuro en oscuro y el canvas de cada tema con alfa `9e` en
claro (`native/hub/src/orbit/theme.rs:269`). El test de paridad lee esos valores
del código congelado, sin que el bundle productivo lo importe. El radio procede
de `FEATURED_RADIUS`. Ningún otro componente cambia de color.

El renderer conserva libres los controles de ventana y el arrastre: el velo
empieza bajo la barra superior, conforme a #2148. Esta diferencia deliberada
con la captura GPUI se mantiene por seguridad de ventana.

## Comandos y escritura

Cada perfil usa el snapshot de `launcher.get` y su revisión exacta en
`launcher.launch`. Se vuelve a leer al abrir la paleta; no se usa la caché
indefinidamente ni se duplica la suscripción del editor de Launcher. Los
conflictos requieren intervención del usuario. Sin derechos, en pista,
durante otra petición o cadena activa y con aplicaciones sin configurar,
los comandos quedan inactivos con motivo visible.

El antiguo «Guardar perfil» global llama en GPUI a `Hub::save`
(`native/hub/src/shell.rs:104`), que guarda Strategy/Workshop. No es el guardado
del perfil de Launcher. Como esas dos vistas web no ofrecen esos borradores ni
hay un método global equivalente, se omiten «Guardar perfil» y «Guardar y
cerrar» hasta que existan esos borradores. Se conserva «Cerrar Hub», con sus
guardas, y el único comando del panel derecho se llama «Mostrar / ocultar
contexto». Es una diferencia deliberada aprobada por el orquestador.

Las filas bloqueadas siguen siendo seleccionables con flechas y anuncian el
motivo; Enter no las ejecuta. La búsqueda conserva también los metadatos
originales. Estrategia e Ingeniero permiten abrir su presentación, como GPUI;
el plan Founders recibido del anfitrión identifica el catálogo LaunchV1 y
muestra «Incluida en Pro». No se deducen derechos nuevos en el renderer.

Antes de enviar se comprueban otra vez revisión, identidad, disponibilidad,
derechos conectados, pista y petición activa. Un conflicto sustituye la caché
y pide volver a elegir. Un lanzamiento aceptado lleva al Launcher y el foco
vuelve al contenido. El anfitrión mantiene la autoridad final. La revalidación
de escaneo y pasos pendientes en el anfitrión se sigue en #2184.

Base UI 1.9 soporta `autoHighlight: "always"` en AriaCombobox y Root lo
transmite, aunque el tipo público de Root aún lo limita a boolean. La pequeña
adaptación queda localizada en este componente y protegida por pruebas de
Enter sin escribir y por Chromium real. No se importan módulos privados de
Base UI ni se añaden dependencias.

## QA

Escenas: `shell-paleta-abierta`, `shell-paleta-busqueda` (Studio) y
`shell-paleta-vacia`. Las capturas se hacen sin caret, igual que el HWND GPUI
sin foco. El estado vacío conserva el anuncio accesible de «Sin resultados»
sin añadir una fila visible que GPUI no pinta. Las referencias privadas
regeneradas conservan inventario del banco, recibo PNG y manifiesto.

`check-command-palette.ts` comprueba en Chromium real el resaltado inicial,
un lanzamiento por id/revisión de un perfil no favorito, petición única y
reapertura con la cadena activa. Forma parte de `web-a11y.ts` en CI.
