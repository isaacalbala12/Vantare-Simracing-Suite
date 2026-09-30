# Ajustes del Hub — ISA-1430

Referencia: `frontend/src/hub/settings-orbit/`, `internal/app/settings_service.go`
y fila Ajustes de `docs/analysis/2026-09-30-hub-paridad.md`.
Esta sección compone exclusivamente el kit Orbit existente.

## Alcance y contratos

Columna contextual con búsqueda de títulos/controles, siete subpáginas y
enlaces a Cuenta/Licencias. La sección activa se conserva durante la sesión.
No concede roles ni crea Agenda Owner.

| Página | Conectado | Pendiente, deshabilitado |
| --- | --- | --- |
| Aplicación | Idioma/unidades de widgets → preferencias de Studio → layout compartido. Workshop observa Studio; overlays recarga el layout. Error de guardado visible y selector restituido al valor real. | Idioma del Hub, zoom, densidad, inicio/minimizado, preferencias de avisos y prueba de notificación. |
| Apariencia | Orbit oscuro fijo. | Siete paletas, sistema/claro/oscuro, contraste, opacidad, fuentes y reducir animaciones. |
| Rendimiento | Ninguna política nativa configurable. | Cinco niveles, Personalizado, Automático y cadencias por widget. Los FPS de referencia son descripciones Wails, no valores efectivos del núcleo. |
| Actualizaciones | Metadatos locales del candidato fase 7, lectura en segundo plano al abrir y al actualizar. Portable: manifiesto junto a `bin/`; instalado: generación activa y `state.json`. Build de desarrollo identificada. | Búsqueda remota, instalación, cambio de canal y notas de versión. No se validan hashes aquí: esta vista no autoriza actualización/rollback. |
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

El kit no tiene una muestra de paleta de dos colores ni keycaps; las paletas
se componen con tarjetas/filas existentes. La fidelidad de esas muestras queda
para revisión del orquestador, sin añadir estilos ni piezas al kit desde aquí.
El Input del kit no dibuja placeholder: el buscador lleva un rótulo visible.
`primary_button` registra dos estilos hover y GPUI aborta al renderizarlo;
Diagnóstico usa el botón secundario compartido. Reproducción y log conservados
en la evidencia externa; la corrección del kit queda fuera de este worker.
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

QA real: siete subpáginas a 1440×900; English/Imperial guardados y comprobados
tras reabrir el mismo layout. Un cambio externo de bytes bloquea el siguiente
guardado, conserva el archivo externo y restituye el selector. Diagnóstico
prepara hashes reales, muestra ese error observado, filtra/busca y confirma
la copia local. Cuenta/Licencias navegan a sus secciones. No se iniciaron
núcleo, juegos ni servicios. La vista del actualizador se comprobó como build
de desarrollo; instalaciones/candidatos se cubren con tests de metadatos,
sin afirmar QA de instalación o actualización de un paquete real.

Evidencia de esta entrega fuera del repo: `C:/tmp/vw3-sec-ajustes-evidence/`.
Notion no disponible; excepción explícita del encargo para trabajar con
GitHub #1430. Sin push, PR, merge ni promoción; revisión de Opus pendiente.
