# Revisión de Ajustes · #1612 / VANTA-9

Decisión vigente de Isaac (14/10/2026): **perfil y foto guardados solo en el PC;
sync apagada y pendiente**. `PILOT_SYNC_ENABLED = false` en Services corta la
preparación OAuth y la red de todos los comandos de perfil. RED→GREEN adicional
de cargar/guardar/PilotSync/reabrir sin conexiones, con/sin identidad restaurada,
en `C:/tmp/1612-local-sync-off`. La evidencia remota descrita abajo corresponde
a preparación inerte; no acredita una sync activa ni modifica esa decisión.

Base `0807fbd0`, diseño de Opus `3aaa3961` integrado como `48b4f812`.
La revisión cubre las ocho páginas del código vigente, sus stores, callbacks,
errores y búsqueda. El QA usa rutas de `C:/tmp`; no se modifica la instalación
ni los datos de Isaac. Los resultados exactos de gates/capturas y SHA de entrega
se registran en la issue y en `C:/tmp/1612-evidence`.

| Página | Contrato verificado y prueba | Límite del QA |
| --- | --- | --- |
| Cuenta / piloto | Nombre, descripción, país, simuladores, favoritos y foto; documento protegido, namespaces por cuenta/issuer, CAS, reabrir, fallo remoto y campos futuros. Selección y recorte fuera del hilo UI; foto sola activa Guardar y Descartar restaura la anterior. El logout invalida la proyección y los trabajos de foto anteriores. | Backend preparado. Sin cuentas reales ni escritura Supabase. |
| General | `general::Store`: guardado atómico, conflictos y reapertura; densidad con límites por viewport. Idioma/unidades y ocultar fuera de pista usan el documento de Studio. Inicio/minimizado/avisos/toasts conservan preferencias reales y errores visibles. | No se cambia el Run instalado ni se envían notificaciones del usuario. |
| Apariencia | `appearance::Store`: paleta, esquema, contraste, cristal, fuentes, zoom y reducción de animaciones en sus documentos; conflictos conservan datos externos y restituyen controles. Previsualización durante arrastre y aplicación al soltar. | Las capturas prueban el renderer de esta build, no el DPI de otro PC. |
| Rendimiento | Nivel y cadencias persisten en el documento único del layout; historial de Studio y configuración por widget. Los rótulos describen límites de proyección, sin presentarlos como FPS medidos. | Sin medición de CPU/GPU ni sesión física de LMU/ACC. |
| Atajos | Acciones reales de Hub y Studio, modificadores exactos y no repetición. Registro global del Launcher por perfil; actividad y conflictos derivados de su respuesta vigente. | Pruebas del registro en claves/identidades QA; sin cambiar perfiles del usuario. |
| Actualizaciones | Lectura acotada y tipada de manifiestos locales, canales/versiones cerrados, portable/instalado/desarrollo y errores. Novedades informativas y reinicio de beta. | No hay búsqueda remota, instalación, promoción ni reinicio de la beta real. |
| Privacidad | Consentimientos independientes, migración, revocación y conflicto de archivo. F01: `--data-dir` usa su propia privacidad y cola, sin cargar ni descartar la instalada. Política accesible por teclado. | No se envían informes ni se borran colas reales. |
| Diagnóstico | Preparación, filtrado/búsqueda y copia del mismo informe sanitizado. Solo observaciones reales y lista blanca; no incorpora nombre, foto, país ni el documento de perfil. | No se simulan métricas de recursos o estado de overlays. |

## Hallazgos arreglados

- F01, P1: la privacidad de una instancia con `--data-dir` resolvía la cola
  instalada. Sonda del resolver RED/GREEN recuperada y regresión en Hub.
- F02, P2: cambiar/quitar solo foto no activaba Guardar. Regresión del estado
  de edición RED, seguimiento de foto guardada/actual y descarte; el banco de
  captura comprueba además estos métodos en un Window real.
- F03, P1: una respuesta PilotLoad tardía tras Logout podía repoblar datos
  privados. RED con el Remote real y canales locales; respuesta descartada
  cuando hay salida pendiente. Los resultados de selección/recorte comprueban
  también la generación antes de aplicar una imagen.
- F04, P2: Storage responde 400/409 al intentar subir una foto ya existente.
  RED HTTP de fixture, reconocimiento de códigos tipados y lectura/verificación
  SHA antes de aceptar el duplicado. No se activa upsert ni se ignoran otros
  errores. Contrato contrastado con la documentación oficial de
  [Storage](https://supabase.com/docs/guides/storage/uploads/standard-uploads).
- F05, P2: una PNG válida de 256×256 con mucho detalle superaba los 24 KiB
  al convertir a JPEG de calidad fija. RED con píxeles deterministas; el encoder
  reduce calidad dentro de un conjunto acotado y conserva dimensiones y límite.
- F06, P2: si el canal IPC rechazaba el comando no había respuesta para liberar
  el editor de «Guardando». RED con el Remote y canal real desconectado; el fallo
  emite el estado contextual, conserva el borrador y permite reintentar.
- El recorte del servicio recuperado usaba el cuadrado centrado en lugar de
  las coordenadas originales que emite el diseño. Imagen rectangular RED y
  GREEN con el contrato único; formato, dimensiones, bytes y coordenadas
  inválidas se rechazan antes de persistir.

## Preparación y validación pendiente

`vantare_ui::pilot_flag` es el painter compartido diseñado por Opus, con fallback
ISO para países que no representan sus franjas. No hay colocación por widget
aprobada; no se inventa una nueva composición. No se infiere el país del idioma
ni de otros participantes.

Los 19 checks SQL recuperados corresponden al PostgreSQL desechable de la
sesión anterior; no acreditan aplicación ni API real de Supabase. El runbook
es [pilot-profile-backend.md](pilot-profile-backend.md). La activación necesita
OK de Isaac, revisión del esquema/policies existentes y prueba con dos cuentas
QA. No se han creado cuentas, comprado, hecho merge ni publicado release.

## Resultado de la entrega aislada

Check y Clippy del workspace con `-D warnings` PASS; Nextest 1668/1668,
7 skips existentes; lifecycle 18/18 PASS. Telemetría 25/25 PASS (replay ACC 918 s). SHA final y CI remota se contrastan
con la issue antes de aceptar. Formato, presupuestos de Hub y huellas de retiro
se conservan sin ampliar límites ni baselines. Los dos primeros fallos de
presupuesto y la corrección de imports del carril quedan en logs de evidencia.

Diez capturas GPUI 1440×900 de datos ficticios: las ocho páginas más foto y
recorte. Archivo índice `C:/tmp/1612-evidence/captures.md`, hashes en
`captures.json`. Se revisaron visualmente las diez; el banco del perfil ejercita
cambiar solo foto, activar Guardar y Descartar en un Window real. No acredita
sesión física de juego, backend productivo, Run instalado, toasts o actualización
real. El build `parity-capture` conserva un warning heredado de `cx` sin uso en
Análisis, presente en `0807fbd0`; Clippy de producto pasa y Análisis no se edita.
