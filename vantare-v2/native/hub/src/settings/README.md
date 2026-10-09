# Ajustes — feedback del 9 de octubre (#1496)

General guarda `general.json` con escritura atómica, límite de tamaño y detección
 de cambios externos. Densidad, inicio con Windows, arranque minimizado, avisos
 de actualización, avisos del Launcher y toasts son preferencias reales.
El valor Run `HKCU/Software/Microsoft/Windows/CurrentVersion/Run/VantareNative.Hub`
solo cambia tras activar o desactivar la opción desde el Hub normal. Una beta
instalada usa su `beta.ps1` estable, que selecciona la generación vigente; un
build de desarrollo usa su propio ejecutable. No se cambia el Run del Launcher.
Si falla el guardado se intenta restituir el estado anterior de inicio y se
muestra cualquier fallo. La prueba de registro utiliza una clave QA aislada.

El Hub mantiene español. Se ha retirado el selector de idioma incompleto: el
idioma de los widgets sigue siendo independiente y se guarda en el layout.
La localización completa del Hub y el nivel Automático quedan pendientes y no
se presentan como controles disponibles. Densidad Cómoda conserva la adaptación
por altura; Equilibrada y Compacta reducen espacio sin superar los límites de
ventanas pequeñas. Empezar minimizado afecta al siguiente arranque normal.

Las notificaciones de Windows usan el backend nativo de GPUI y una identidad
propia. Enviar prueba solicita un toast; No molestar o la configuración de
Windows pueden ocultarlo. El Hub no afirma que Windows lo haya mostrado.
Los avisos de actualización y final de lanzamiento respetan sus preferencias.

Atajos del Hub: Ctrl L busca un favorito; sin favorito abre Launcher. Ctrl K
abre búsqueda, Ctrl B cambia la barra izquierda y Ctrl Alt B la derecha.
Se distinguen los modificadores exactos y una tecla mantenida no repite toggles.
Deshacer/Rehacer de Studio también funciona cuando el foco está en la shell.
Studio admite Ctrl/Cmd Z, Ctrl/Cmd Shift Z y Ctrl/Cmd Y; con foco en el lienzo,
Ctrl/Cmd D duplica, Supr elimina y Ctrl/Cmd S confirma el documento. La paleta
y los campos conservan sus propios atajos. Las acciones de navegación del Hub
devuelven el foco a la shell antes de ocultar la sección o un panel.
Atajos globales: se reutiliza el registro `RegisterHotKey` del residente del
Launcher. Se editan en cada perfil y Ajustes muestra el registro real y sus
conflictos; una combinación guardada sin respuesta vigente no se llama activa.
No se ofrecen acciones globales de overlays ni botones del volante inexistentes.

Rendimiento guarda nivel y frecuencias dentro del único documento de layout
(`performance`, omitido cuando conserva los valores por defecto). El editor
comparte persistencia, conflictos y Deshacer/Rehacer con los demás cambios.
Máximo/Alto/Equilibrado/Ahorro/Mínimo limitan tablas a 30/20/15/10/5 Hz; los otros
widgets a cada foto/60/40/30/20 Hz. Son límites de proyección, no FPS medidos.
Banderas, cambio de estado de fuente y época nueva se aplican inmediatamente.
El inspector permite Usar nivel o 1/4/5/10/15/20/30/60 Hz por widget.
Personalizado abre Studio. Adquisición, IPC, derechos y renderers no cambian.
Una versión antigua que no admite `performance` puede rechazar un layout
modificado: conservar la copia `.bak` antes de volver a un binario anterior.

Apariencia conserva temas, esquema, contraste, cristal y fuentes. Se retiran
Reducir animaciones y las tarjetas sin funcionalidad de las otras subpáginas.
Actualizaciones mantiene metadatos, novedades y reinicio real de beta, ahora
accesible por teclado. Privacidad conserva los dos consentimientos y la política;
Diagnóstico prepara, filtra y copia el informe sanitizado existente. Los botones
de zoom, nivel, frecuencia y prueba tienen foco y activación por teclado.
En macOS no se muestran inicio con Windows, toasts ni registro global de perfiles.
Diagnóstico solo ofrece Todos/Error, que son los niveles observados actualmente;
retira las métricas de CPU/memoria y overlays sin fuente. La búsqueda solo ofrece
controles reales. El informe tiene scroll propio y Copiar expone su inactividad
hasta preparar contenido. Las tarjetas de canal son informativas, sin selector.

Para QA aislada, `VANTARE_NATIVE_DATA_ROOT` funciona también en macOS/Linux;
Privacidad usa `<raíz>/Vantare/native` en arranque normal. Una raíz relativa
falla sin recurrir a datos del usuario. La captura usa su `--data-dir` aislado.

Verificación manual: usar datos QA propios; cambiar General y reabrir. Con
una beta instalada autorizada, activar/desactivar inicio y consultar únicamente
el valor Run del Hub; comprobar minimización en el siguiente arranque. Activar
toasts y enviar prueba, después desactivarlos. Probar Ctrl L/K/B/Alt B y el
historial de Studio. Cambiar nivel y frecuencia, reabrir y deshacer/rehacer;
modificar externamente el layout debe bloquear la siguiente escritura. Preparar,
filtrar y copiar Diagnóstico; no reiniciar ni actualizar la instalación real en
QA. Los tests de registro trabajan solo sobre `VantareNativeTests/Settings-*`.

Continuación Mac: `/Users/isaacalbala/evidence/fb-ajustes/informe.md`,
`evidencia.md`, `checks.json`, logs y capturas PNG. Tarea
[VAN-781](https://app.notion.com/p/3f4e51695c6581118500d3b95b6fac6f),
proyecto Plataforma y roadmap; referencia técnica GitHub #1496. Base heredada
`e55a43b3`, sin push/PR/merge. `origin/nightly` no existe en el remoto consultado;
se conserva la base autorizada de esta continuación y no se recrea `plan.md`.

PASS macOS arm64: formato, build Hub `prueba` con la feature existente
`vantare-services/network`, Clippy de Hub/UI/Services `--all-targets --no-deps
-D warnings`, Ajustes 21, documento 8, resolutores de atajos 4, rendimiento 2,
diagnóstico/privacidad 19; biblioteca UI serial 181 (2 ignorados). Las suites
completas no pasan: Hub requiere binario storage y varios tests GPUI arrancan
fuera del hilo principal; demos asumen rutas Windows. El importador UI rechaza
un enlace y un test Services no admite su PNG. Clippy con dependencias falla en
`native/profiling.rs:230` heredado. Los archivos de esos fallos no cambian desde
la base; logs íntegros y límites en la evidencia. El Hub debug aborta en Orbit
por un hover duplicado heredado; QA visual usa `prueba` (perfil ya existente).

QA real GPUI mediante el contexto de captura de la shell, sin productor IPC,
sesión personal ni servicios de la instalación: nivel, frecuencia, densidad y
consentimiento persisten; Ctrl B/Alt B/K/L, duplicar/borrar/deshacer/rehacer,
Personalizado y preparación/copia/filtros de informe recorridos. No demuestra
licencia, telemetría de un juego ni rendimiento medido. Windows sigue pendiente:
Run del usuario, RegisterHotKey con juego/conflictos, toasts/No molestar, arranque
minimizado instalado, actualizador beta, identidad/icono y empaquetado NSIS.
Los apartados siguientes conservan antecedentes históricos.

# Ajustes del Hub — ISA-1470

## Rediseño beta (fase 2)

Siete pestañas en la topbar: General, Apariencia, Rendimiento en pista, Atajos,
Actualizaciones, Privacidad y Diagnóstico. Cada página usa el layout C con
scroll independiente en contenido y carril; Cuenta es un destino separado y
Licencias redirige a Cuenta. Usa las tarjetas neo y tokens de los cimientos.

Apariencia ofrece los cuatro temas productivos con miniaturas: Grafito carmín,
Harness, Noche Le Mans y Piedra cálida. Conserva guardado atómico,
conflictos, contraste, opacidad y fuentes. Privacidad mantiene ambos consentimientos
PostHog; diagnóstico conserva preparación, filtro y copia sanitizada;
Actualizaciones conserva metadatos, novedades y acciones de reinicio de beta.
Cuenta conserva inicio/cierre de sesión y restablecimiento del dispositivo.

#1515 añade una pregunta opcional de informes de fallos antes del acceso normal
del Hub, con botones Orbit «No, gracias» y «Aceptar» y enlace a la política.
Tab/Shift+Tab recorre los tres controles y Enter/Espacio los activa; el foco
inicial está en rechazar. Solo se abandona la pregunta tras guardar la decisión.
Sin decisión antigua registrada se vuelve a preguntar y se descartan pendientes
anteriores. Demo/capturas de otras pantallas conservan su flujo de QA.
La pregunta y Ajustes › Privacidad comparten el enlace confirmado por Isaac:
`https://vantare.app/privacidad`. El Hub aún no distingue idioma de interfaz;
el ajuste inglés de widgets no cambia esta URL. Ambos enlaces admiten clic,
Tab y Enter/Espacio.
Las licencias se presentan como Beta para testers, gratuita durante la beta;
Strategy y Engineer se anuncian Próximamente sin modificar permisos del núcleo.

Los controles sin implementación nativa siguen pendientes y no guardan datos.
CPU, memoria, dispositivos remotos y exportación/eliminación no se inventan.
Los atajos Ctrl L/K/B ya implementados se muestran junto a la referencia global.
El banco --capture --demo continúa aislado por parity-capture.

Verificación: recorrer las siete pestañas y Cuenta a 1440/1920/2560; seleccionar
los cuatro temas y reabrir; alternar consentimiento en un directorio QA; preparar
y copiar diagnóstico; revisar la instalación real en Actualizaciones. Las acciones
de cuenta requieren servicios y sesión reales. Evidencia fuera del repo en
C:/tmp/1470-ajustes-evidence. Las secciones siguientes son evidencia histórica
de ISA-1430 y no describen el layout actual.

# Antecedentes — ISA-1430

Referencia: `frontend/src/hub/settings-orbit/`, `internal/app/settings_service.go`
y fila Ajustes de `docs/analysis/2026-09-30-hub-paridad.md`.
Esta sección compone Orbit y las piezas de vista que el kit todavía no expone.

## Segunda pasada del banco visual

El panel reserva la altura de topbar, cabecera y pie y se actualiza al cambiar
el tamaño de ventana; el scroll de detalle no necesita modificar la shell.
Los controles conservan la geometría Wails. Apariencia está conectada a la
configuración local; los controles sin contrato de las otras páginas permanecen
sin acciones ni persistencia.
Novedades importa los mismos manifiestos versionados de `docs/releases` que
el producto Wails; esta lectura no concede autoridad para actualizar el producto.

En `--capture ... --demo`, Ajustes muestra los datos del harness de referencia
(versiones, rutas de QA y anillo de eventos); fuera del banco se conservan las
observaciones reales y los estados no disponibles. Cuenta/Licencias aplica el
mismo aislamiento en su vista con `parity-capture`, sin cambiar permisos,
credenciales ni comandos del servicio. Sus acciones demo son inertes.
Las horas del anillo y del último acceso pertenecen a las capturas congeladas,
no son observaciones de la sesión actual. Cuenta y Licencias conservan sus
permisos/destinos públicos: un observador del Hub presenta ambos dentro de
Ajustes/Cuenta. El modo de rasterizado gris se limita a la pintura de esta
cabecera y panel y restaura inmediatamente el modo anterior; las letras y
saltos se componen con GPUI. `Paragraph` conserva el interlineado CSS sin el
redondeo previo de `TextLayout`, usando la línea de base del helper compartido.
El renderer Win32 queda fuera de esta sección; las diferencias residuales de
cobertura/gamma se documentan para el orquestador, sin alterar imágenes de QA.
Las notas incluyen los 17 manifiestos de la base actual: una release nueva
requiere añadir su referencia en `releases.rs`. Evidencia en
`C:/tmp/ajustes-2-evidence/`, fuera del repositorio.

## Alcance y contratos

Columna contextual con búsqueda de títulos/controles, Cuenta y siete páginas
de ajustes. Las entradas públicas Cuenta/Licencias muestran la página Cuenta. La sección activa se conserva durante la sesión.
No concede roles ni crea Agenda Owner.

| Página | Conectado | Pendiente, deshabilitado |
| --- | --- | --- |
| Aplicación | Fuera del banco, idioma/unidades de widgets → preferencias de Studio → layout compartido. Workshop observa Studio; overlays recarga el layout. Error de guardado visible y selector restituido al valor real. | Idioma del Hub, zoom, densidad, inicio/minimizado, preferencias de avisos y prueba de notificación. |
| Apariencia | Siete paletas, sistema/claro/oscuro, contraste, opacidad y fuentes, con vista previa y guardado inmediato. | Reducir animaciones. |
| Rendimiento | Ninguna política nativa configurable. | Cinco niveles, Personalizado, Automático y cadencias por widget. Los FPS de referencia son descripciones Wails, no valores efectivos del núcleo. |
| Actualizaciones | Metadatos locales del candidato fase 7, lectura en segundo plano al abrir y al actualizar. Portable: manifiesto junto a `bin/`; instalado: generación activa y `state.json`. Build de desarrollo identificada. | Búsqueda remota, instalación, cambio de canal. Las notas son lectura informativa de manifiestos versionados. No se validan hashes aquí: esta vista no autoriza actualización/rollback. |
| Atajos | Las cuatro acciones reales del producto como referencia. | Sin registro global nativo: no combinaciones inventadas, editor o declaración de ausencia de conflictos. |
| Privacidad | Ningún envío desde esta sección. | Consentimiento, revocación, borrado remoto y cola Strategy. No se afirma que la cola esté vacía. |
| Diagnóstico | Observaciones reales del Testing Center, preparación local sanitizada, binarios/hashes, errores tipados, filtros/búsqueda y copia local del mismo informe. Trabajo de disco en segundo plano. | Estado de overlays, CPU/memoria, tamaño de datos, carpetas/registros y niveles Info/Aviso sin instrumentación. |

### Zoom del Hub — revisión #1470 (2026-10-07)

«Tamaño de la interfaz» (90/100/110/125 %, Ctrl +/−/0, persistencia y
aplicación inmediata) sigue pendiente. La revisión de `dd90b49c` activa la
condición de parada del brief: GPUI permite `set_rem_size`, pero los tamaños
del Hub están fijados mediante `px(...)` en 40 archivos; cambiar el rem no
escala sus textos, iconos, tarjetas ni espaciados explícitos.
`Window::set_scale_factor` solo existe con `test`/`test-support` y no es una
API de zoom productiva. No se habilita un control que prometa escala completa.

Alternativa con las API actuales: aprobar un lote acotado para convertir las
dimensiones de la interfaz del Hub a `rems` y usar `set_rem_size`, manteniendo
el canvas/renderer de widgets en píxeles. Requiere revisar también controles,
umbrales adaptables y coordenadas de interacción. No basta con cambiar los
tokens del tema. No se modifica GPUI ni el DPI global de Windows.

El diagnóstico reutiliza la lista blanca del Testing Center; no exporta rutas
privadas, pipe/SID, sesiones, pilotos ni telemetría cruda. La copia es local y
no envía datos. Un error no observado no demuestra funcionamiento correcto.

La lectura de fase 7 limita el tamaño de los JSON y valida esquema/producto,
canal cerrado, versión y forma de referencias; distingue estado inválido de
build de desarrollo. Es informativa y no sustituye `candidate.ps1 -Operation
Status`, que verifica los hashes y los archivos del candidato.

## Enlace mínimo y revisión

`shell.rs` declara este módulo, crea su estado y delega contenido, cabecera y
columna cuando Ajustes está activa. Las antiguas funciones de preferencias y
placeholder de Ajustes salen de `shell.rs`. No se modifica Orbit, ninguna otra
sección, núcleo, manifest de Cargo ni dependencias.

El kit no expone estas paletas, keycaps, selectores ni el tracking monoespaciado
con la geometría de Wails; se componen en la vista con elementos GPUI. El Input
conserva su entidad real y el placeholder se dibuja dentro del campo vacío.
La primera pasada reprodujo un aborto al usar `primary_button` por estilos
hover duplicados; esta vista usa su composición local para los primarios.
Las propuestas de kit y de migas del marco están en la evidencia externa.
No se afirma paridad funcional de servicios pendientes ni igualdad de píxeles.

## Verificación

Abrir el Hub con un directorio y layout de QA propios, navegar Ajustes y
recorrer las siete páginas. Buscar `idioma`, `opacidad`, `cadencia`, `nightly`,
`delta`, `consentimiento` y `cpu`; cada búsqueda conserva solo destinos reales.
Cambiar idioma/unidades de widgets, reabrir el mismo layout y comprobar la
persistencia. Cambiar externamente el documento antes de guardar debe mostrar
conflicto y restituir el selector. Los controles pendientes no guardan nada.
En Diagnóstico, Preparar, filtrar/buscar errores y Copiar informe; solo contiene
la lista blanca. En Actualizaciones de un build de desarrollo no aparecen
una release ni un canal activos inventados.

Tests propios: búsqueda y mapeo de preferencias, filtros de errores,
versiones/canales y lectura real de metadatos corruptos, demasiado grandes,
generación activa distinta, referencia anterior y portable. La persistencia/conflicto del
documento queda además cubierta por los tests productivos de `document.rs`.

QA anterior (primera pasada): siete subpáginas a 1440×900; English/Imperial guardados y comprobados
tras reabrir el mismo layout. Un cambio externo de bytes bloquea el siguiente
guardado, conserva el archivo externo y restituye el selector. Diagnóstico
prepara hashes reales, muestra ese error observado, filtra/busca y confirma
la copia local. En esa pasada Cuenta/Licencias navegaban a sus secciones independientes. No se iniciaron
núcleo, juegos ni servicios. La vista del actualizador se comprobó como build
de desarrollo; instalaciones/candidatos se cubren con tests de metadatos,
sin afirmar QA de instalación o actualización de un paquete real.

Evidencia de la primera pasada: `C:/tmp/vw3-sec-ajustes-evidence/`.
La segunda pasada conserva sus capturas, porcentajes y logs aparte; no
repite ni declara completado ese QA funcional anterior.
Notion no disponible; excepción explícita del encargo para trabajar con
GitHub #1430. En esta segunda pasada solo hay integración de bases y commits
locales autorizados. Sin push, PR, merge remoto ni promoción; revisión de Opus
pendiente. Los porcentajes finales y el estado real de los gates se entregan
en el informe externo, sin afirmar paridad total desde esta documentación.


## Temas conectados — worker Linux ISA-1430

`appearance.json` vive en el directorio de datos del Hub (`--data-dir`); utiliza
el guardado atómico y la detección de conflictos de `files.rs`. Un fallo de disco
se muestra en Ajustes y conserva el tema aplicado; los selectores vuelven al
valor guardado. El arranque valida JSON y tamaño (16 KiB), y acota porcentajes.
La selección inicial es **Vantare oscuro**, contraste 100 y cristal 80, para
conservar el Hub previo. `Sistema` guarda la preferencia y sigue los eventos de
apariencia de GPUI (incluida la ruta Windows existente).

El global GPUI `orbit::theme::Theme` contiene los colores resueltos. Los accesores
requieren `cx`; las antiguas constantes de color solo se compilan en tests como
contrato de paridad. Los literales históricos de secciones pasan por una tabla
semántica que mantiene sus valores exactos en Vantare oscuro. Inter delega en
el helper de pintura previo; Segoe/Arial usan el shaping de GPUI. Las fuentes
monoespaciadas se aplican únicamente al Hub.

Grises aplica los tokens del diseño del orquestador: éxito con ✓ y contorno,
aviso con ⚠ y borde discontinuo, peligro invertido con ✕ e información con ⓘ.
Las formas adicionales aparecen solo en Grises. Los chips de nivel añaden
estrellas y usan sus luminancias. Studio cambia su fondo sin modificar los
ViewModels ni el renderer de los 18 widgets; Vantare oscuro conserva el fondo
nativo anterior de superficies Orbit.

Tras futuros merges, ejecutar `native/hub/tools/temas-migrar.py --write`, producir
diagnósticos JSON con Cargo y usar `--repair-context <log>`; el script documenta
el ciclo. Revisar imports y callbacks: el `cx` de pintura lo proporciona GPUI y
no se captura una referencia de render. Ejecutar `--check` y `--self-test`.
El script no sustituye la revisión de colores semánticos, fonts o paridad.

El worker Linux guarda evidencia fuera del repo en `~/evidence/temas-conexion/`.
Quedan para el integrador: gates Windows, banco `-Todas` (≤0,05 pp por pantalla),
los 18 widgets, y capturas de Inicio/Apariencia en Vantare oscuro/claro, Grises
oscuro/claro y Océano. En esta sesión no hay DISPLAY ni WAYLAND_DISPLAY. Notion
está pendiente por la indisponibilidad explícita del encargo; no se ha simulado
su seguimiento ni realizado push, PR, merge o release.
