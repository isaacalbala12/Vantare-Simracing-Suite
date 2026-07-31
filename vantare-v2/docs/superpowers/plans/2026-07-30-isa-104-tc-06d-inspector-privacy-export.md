# ISA-104 / TC-06D — Inspector, privacidad y exportación diagnóstica

Estado: listo para ejecución
Rama: `vantareapp/isa-104-tc-06d-inspector-privacidad-y-export-diagnostico`
Base exacta: `8b89c0adafed46a3c2c42cd52c858c8c185aa8bf` (ISA-103 / TC-06C)
Issue: ISA-104

## Objetivo

Entregar una superficie local y segura para:

1. inspeccionar las sesiones históricas creadas por Telemetry Core;
2. entender qué campos y calidad conserva cada sesión;
3. previsualizar y exportar un diagnóstico sanitizado;
4. disponer de una base limitada de captura raw para diagnósticos reproducibles;
5. hacerlo sin convertir la futura página de análisis de telemetría en una UI técnica.

El corte no implementa Telemetry Analysis, Strategy Planner ni Engineer. Tampoco
sube datos a red ni abre un segundo lector de Shared Memory.

## Decisiones cerradas

- El inspector vive en **Ajustes > Diagnóstico** y se implementa con componentes
  aislados. `TelemetryPage.tsx` no se modifica.
- El backend decide la raíz de sesiones. El frontend nunca envía rutas ni recibe
  `SessionRef.Root`, nombres de base de datos o identificadores internos.
- La UI opera con identificadores opacos y efímeros.
- La calidad mostrada es honesta con lo que persiste el esquema actual:
  presencia por campo y calidad agregada por vehículo. No se inventa calidad por
  señal.
- La exportación se construye desde cero mediante una lista permitida. No se
  copia el objeto de ajustes para intentar borrar datos después.
- La vista previa devuelve el texto JSON exacto e inmutable y su SHA-256. Copiar
  o descargar utiliza esos mismos bytes; no se regenera el paquete.
- La exportación no contiene nombres, IDs personales, hotkeys, argumentos,
  notas, rutas, tokens, voz, estrategias, archivos de telemetría, bases SQLite,
  WAL/SHM ni logs generales.
- La captura raw es una capacidad diagnóstica separada del histórico canónico.
  No cambia el manifest ni el schema histórico v1.
- La captura LMU reutiliza el único `LMU_Data` ya abierto por el driver mediante
  un tap opcional y no bloqueante. No existe un segundo reader.
- Sin dependencias nuevas. Standard library y herramientas ya presentes.

## Fuera de alcance

- Tabla avanzada de muestras/vueltas; pertenece a Telemetry Analysis.
- Compartir o subir diagnósticos.
- Exportar raw dentro del paquete sanitizado.
- Reproducir una captura raw desde la UI.
- Conectar productivamente la captura raw en la composición principal; esa
  activación corresponde a TC-07/TC-08 después de validar el tap.
- Rediseñar Ajustes o la navegación.
- Cambiar el formato histórico v1.

## Microcorte D1 — Contrato de privacidad y diagnóstico genérico

### RED

- Añadir tests adversariales con nombres, emails, Steam IDs, URLs con
  credenciales, tokens, rutas Windows/UNC/POSIX, argumentos, notas, hotkeys e IDs.
- Demostrar que el diagnóstico actual filtra esos valores.
- Fijar un contrato JSON versionado y UTC.

### GREEN

- Sustituir `SanitizedAppSettings` y DTOs derivados por un `DiagnosticsReport`
  construido mediante allowlist.
- Conservar únicamente:
  - versión de esquema;
  - fecha UTC;
  - versión de app;
  - OS, arquitectura, versión Go y CPU;
  - estado y nombre cerrado de la fuente de telemetría;
  - contadores, booleanos y enums cerrados de ajustes;
  - existencia, modo de salida, número de widgets y tipos de widget admitidos;
  - contadores agregados de Launcher por categoría/método permitido.
- Eliminar del contrato nombres, IDs, rutas, args, notas y hotkeys.
- Cambiar los tests antiguos que exigían conservar identidad insegura.
- Reemplazar fixtures con nombres reales por identidades sintéticas.

### REFACTOR

- Eliminar regex y sanitizadores que ya no tengan consumidor.
- Marcar `docs/local-security-privacy-audit.md` y
  `docs/tester-diagnostics-pack.md` como documentación histórica sustituida,
  conservando el contexto útil.

### Gate D1

- `go test ./internal/app -run Diagnostics -count=20`
- búsqueda negativa de todos los secretos/PII de los fixtures en el JSON final;
- `go test ./internal/app -count=1`.

## Microcorte D2 — Catálogo e inspector histórico seguro

### RED

- Sesión válida actual.
- Sesión futura: solo metadata compatible, sin abrir la base.
- Sesión corrupta o incompleta.
- Raíz vacía.
- Cancelación durante el resumen.
- Prueba de que ningún DTO expone rutas, archivos SQLite o IDs internos.

### GREEN

- Añadir un catálogo neutral y acotado sobre la raíz fija de recording.
- Enumerar únicamente directorios de sesión con manifests válidos.
- Orden determinista por fecha descendente y límite explícito.
- Traducir cada sesión a un handle opaco de proceso.
- Exponer resumen:
  - estado y versión del manifest;
  - simulador, inicio/fin y estado de cierre;
  - número de chunks/hechos/vueltas/vehículos cuando exista;
  - campos presentes;
  - calidad agregada disponible;
  - compatibilidad actual/futura/corrupta;
  - motivos sanitizados de indisponibilidad.
- Una sesión futura nunca abre la base ni intenta migrarla.
- El escaneo de páginas es cancelable y acotado.

### REFACTOR

- Mantener SQLite dentro de `internal/telemetry/recording/sqlite`.
- No filtrar tipos concretos de base de datos hacia `internal/app` o frontend.
- Añadir reglas arquitectónicas solo si protegen una frontera real nueva.

### Gate D2

- tests focales del catálogo/inspector `-count=20`;
- `go test ./internal/telemetry/recording/... -count=1`;
- `go test ./internal/telemetry/... -count=1`.

## Microcorte D3 — Preview y exportación exacta

### RED

- Mismo payload visto, copiado y descargado.
- SHA-256 corresponde exactamente a los bytes entregados.
- Orden JSON determinista.
- Límites de tamaño y error seguro.
- Dos peticiones concurrentes no se correlacionan incorrectamente.

### GREEN

- Añadir un servicio de preparación que devuelve:
  - `schemaVersion`;
  - `generatedAtUtc`;
  - `payload` JSON completo;
  - `sha256`;
  - `byteSize`.
- El frontend copia y descarga ese `payload` exacto mediante Clipboard/Blob.
- Sustituir el evento global inmediato por una petición correlacionada con
  `requestId`, respuesta y timeout.
- No escribir archivos en backend ni realizar requests de red.

### Gate D3

- tests backend de determinismo/allowlist/concurrencia;
- tests frontend de correlación, preview, copy y download;
- comprobar que no existe `fetch`, HTTP, SSE ni upload en la feature.

## Microcorte D4 — UI aislada en Ajustes

### RED

- Carga, vacío, error, sesión futura, sesión corrupta y cancelación.
- Selección de sesión por handle.
- Preview visible antes de copiar/descargar.
- Confirmación explícita de que el paquete no incluye telemetría ni identidad.
- Textos en inglés, español, italiano y portugués.

### GREEN

- Crear componentes bajo `frontend/src/hub/settings/diagnostics/`.
- Mantener `SettingsPage` como montaje y navegación, sin lógica de negocio.
- Vistas:
  - resumen de conexión;
  - sesiones locales;
  - resumen de manifest/campos/calidad;
  - paquete sanitizado con contenido exacto, hash y tamaño.
- No añadir tabla avanzada de vueltas/muestras.
- Estados accesibles, teclado y responsive del shell existente.
- Añadir un harness Playwright local que no dependa de LMU.

### Gate D4

- tests Vitest focales;
- `pnpm --dir frontend test`;
- `pnpm --dir frontend build`;
- `pnpm --dir frontend lint` o deuda global separada con lint focal limpio;
- Playwright en wide/medium/compact con cero error de consola.

## Microcorte D5 — Captura raw limitada y separada

### RED

- Desactivada por defecto.
- Solo una captura activa.
- Cancelación y cierre idempotentes.
- Límites por duración y bytes.
- No se reanuda tras reinicio.
- Limpieza de capturas temporales de más de siete días.
- Permisos privados del directorio/archivo cuando el SO lo permite.
- Un consumidor lento no bloquea al productor.

### GREEN

- Crear una capacidad diagnóstica interna separada del histórico canónico.
- Límites:
  - duración por defecto: 60 s;
  - duración máxima: 120 s;
  - tamaño por defecto: 64 MiB;
  - tamaño máximo: 128 MiB;
  - muestreo máximo por defecto: 5 Hz;
  - retención temporal: 7 días.
- Estados terminales explícitos: completed, canceled, size-limit, time-limit,
  error.
- Escritura atómica de metadata y frames; captura incompleta reconocible.
- Directorio derivado de configuración, nunca elegido por frontend.
- La captura queda excluida del exportador sanitizado.

### Gate D5

- tests de límites, cancelación, concurrencia, crash parcial y limpieza `-count=50`;
- race test focal;
- comprobación de permisos en Windows y fallback documentado en otros SO.

## Microcorte D6 — Sanitizador LMU y tap no bloqueante

### RED

- Buffer de entrada no se modifica.
- Buffer de salida no conserva bytes desconocidos.
- Texto libre se sustituye por aliases sintéticos.
- IDs se remapean de forma estable dentro de una captura.
- Build/fingerprint desconocido rechaza captura.
- Tap saturado descarta frames y contabiliza drops, sin ralentizar `Run`.
- Cancelar el driver cierra el tap sin fuga.
- Prueba estructural: existe una sola apertura de `LMU_Data`.

### GREEN

- El sanitizador de producto reconstruye un buffer conocido desde cero; no
  reutiliza el fixture test-only actual.
- Solo copia offsets conocidos y necesarios para replay diagnóstico.
- El driver admite un tap opcional privado llamado después de `readStable` y
  antes del parse.
- El envío al tap es no bloqueante y copiado; el buffer reutilizado del driver
  nunca se comparte.
- Sin tap configurado, el hot path permanece equivalente.
- El tap no se conecta todavía en la composición de producción.

### Gate D6

- tests unitarios y de integración del driver `-count=100`;
- fuzz del sanitizador con corpus fijo y tiempo acotado;
- benchmark comparativo con tap ausente/presente/saturado;
- `go test -race` focal;
- búsqueda estructural de apertura única de Shared Memory.

## Microcorte D7 — Integración, evidencia y cierre

- Actualizar:
  - `docs/current-plan.md`;
  - `docs/vantare-program/handoffs/telemetry-core.md`;
  - `docs/telemetry-core/README.md`;
  - documento de evidencia ISA-104;
  - ledger de orquestación.
- Registrar decisiones, límites, campos omitidos y activación pendiente.
- Ejecutar:
  - `gofmt` sobre Go modificado;
  - `git diff --check`;
  - `go test ./internal/telemetry/... -count=1`;
  - `go test ./internal/app/... -count=1`;
  - `go test -p 1 ./... -count=1`;
  - `go vet` focal;
  - suite frontend;
  - build frontend;
  - build Wails;
  - Playwright del inspector;
  - escaneo de secretos/PII sobre diff y artefactos.
- Review independiente de código, privacidad y arquitectura.
- Corregir P0/P1/P2 y P3 razonables antes de entregar.
- Commit, push y PR draft apilado sobre ISA-103.
- Sin merge ni promoción de rama.

## Archivos previstos

La implementación puede ajustar nombres, pero debe permanecer dentro de estas
fronteras:

- `internal/app/diagnostics_*`
- `internal/telemetry/diagnostics/**`
- `internal/telemetry/recording/**`
- `internal/telemetry/drivers/lmu/**`
- `frontend/src/hub/settings/diagnostics/**`
- montaje mínimo en `frontend/src/hub/pages/SettingsPage.tsx`
- eventos/bridge mínimos de diagnóstico
- locales i18n
- tests y harnesses focales
- documentación indicada en D7

Si se necesita tocar composición productiva de recording, Telemetry Analysis,
Strategy, Engineer, Overlay Studio o añadir una dependencia, el corte se
considera desviado y debe detenerse.

## Criterios de aceptación finales

- [ ] Ningún dato personal o secreto de los fixtures adversariales aparece en el
      paquete.
- [ ] El usuario ve exactamente los bytes que copiará o descargará.
- [ ] No existe subida a red.
- [ ] Ninguna ruta o tipo SQLite cruza el contrato de frontend.
- [ ] El inspector no afirma calidad por señal que el histórico no persiste.
- [ ] Sesiones futuras/corruptas no rompen la UI ni se abren como actuales.
- [ ] La captura raw está desactivada por defecto, limitada y separada.
- [ ] LMU mantiene una sola apertura de Shared Memory.
- [ ] Un tap lento no bloquea la telemetría live.
- [ ] `TelemetryPage.tsx` no cambia.
- [ ] No hay dependencias nuevas.
- [ ] Todos los gates aplicables pasan o quedan documentados con causa heredada.
- [ ] Handoff, plan y evidencia permiten continuar en otro chat sin historial.
