# Ajustes del Hub — ISA-1430

Referencia: `frontend/src/hub/settings-orbit/`, `internal/app/settings_service.go`
y fila Ajustes de `docs/analysis/2026-09-30-hub-paridad.md`.
Esta sección compone Orbit y las piezas de vista que el kit todavía no expone.

## Segunda pasada del banco visual

El panel reserva la altura de topbar, cabecera y pie y se actualiza al cambiar
el tamaño de ventana; el scroll de detalle no necesita modificar la shell.
Los selectores, paletas y controles pendientes se componen en esta vista con
la geometría Wails y permanecen sin acciones ni persistencia.
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
| Apariencia | Orbit oscuro fijo. | Siete paletas, sistema/claro/oscuro, contraste, opacidad, fuentes y reducir animaciones. |
| Rendimiento | Ninguna política nativa configurable. | Cinco niveles, Personalizado, Automático y cadencias por widget. Los FPS de referencia son descripciones Wails, no valores efectivos del núcleo. |
| Actualizaciones | Metadatos locales del candidato fase 7, lectura en segundo plano al abrir y al actualizar. Portable: manifiesto junto a `bin/`; instalado: generación activa y `state.json`. Build de desarrollo identificada. | Búsqueda remota, instalación, cambio de canal. Las notas son lectura informativa de manifiestos versionados. No se validan hashes aquí: esta vista no autoriza actualización/rollback. |
| Atajos | Las cuatro acciones reales del producto como referencia. | Sin registro global nativo: no combinaciones inventadas, editor o declaración de ausencia de conflictos. |
| Privacidad | Ningún envío desde esta sección. | Consentimiento, revocación, borrado remoto y cola Strategy. No se afirma que la cola esté vacía. |
| Diagnóstico | Observaciones reales del Testing Center, preparación local sanitizada, binarios/hashes, errores tipados, filtros/búsqueda y copia local del mismo informe. Trabajo de disco en segundo plano. | Estado de overlays, CPU/memoria, tamaño de datos, carpetas/registros y niveles Info/Aviso sin instrumentación. |

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
