# Grabación LMU en el PC de juego — VANTA-33 / #1638

Decisión de Isaac, 16-oct-2026: **no abrir LMU en el servidor** por RAM.
El supervisor anterior, PID 16280, recibió STOP y terminó `cancelled`, verificado
en `C:/VantareServer/logs/1638-phase-b-20261015-204225/summary.json`.
La fase B pasa a captura en el PC de juego y análisis offline. No hay todavía
evidencia nueva de conducción, formación o cambio de sesión.

## Entrega inmediata: solo práctica en Imola

El orquestador concreta después que otro worker (DeepSeek) graba por SSH en
el PC de Isaac: **práctica de 6 h configuradas, unos 45 min grabados, con IA en
Imola**. No se grabarán clasificación ni carrera en esta entrega. Los archivos
llegarán a `C:/VantareServer/evidence/grabacion-lmu-imola/`; comprobar formato y
cierre completo antes de procesar. El arnés admite el `.lmu.gz` de este kit;
otro formato exige revisar su manifiesto y adaptar el lector, sin fingir buffers
o endpoints que no estén grabados. No se inicia un supervisor live nuevo.

Ejecutar el comando offline de abajo añadiendo `--recording-scope practice-only`.
Genera también `report.md`: 18 filas de recepción/proyección y una tabla de
calidades/alcance de los siete campos de Avisos. `summary.json` marca las
situaciones no cubiertas, incluso si algún valor numérico aparece positivo.
La configuración de 6 h y el plan de 45 min proceden del orquestador; duración,
sesión, pista y hechos efectivamente grabados se contrastarán con la captura.

Se podrán verificar las señales de práctica **realmente observadas** (vueltas,
entradas/salidas de boxes, consumo, parrilla, mandos, etc., según lo que contenga
el archivo). Recibir fotos en los 18 widgets no certifica todas sus opciones,
geometría de mapa, forecast, daños exactos ni situaciones que no ocurran.
**No cubre inicio/fin fiables de sesión, clasificación, carrera, formación,
salida ni agenda de próxima sesión.** Fin programado de práctica no es fin
real; parar una grabación parcial no termina una sesión de 6 h. La distancia
longitudinal en práctica tampoco valida distancia de formación/parrilla.

El fin de semana completo descrito en el README genérico del kit sigue siendo
la receta para cubrir esos pendientes en otra grabación; no se pide a Isaac
interrumpir la práctica ni añadir ahora clasificación/carrera. VANTA-33 sigue
En curso y la fase B completa continúa pendiente.

## Evidencia del kit y del arnés — 16-oct

Código release del kit `1cbb167b289dc3681013300aeef8af49a6086173`, ZIP
**507353 bytes**, SHA-256
`1ec0bc04011ab9c7d42be5c624795a95c8acfa59553805b051ce121feac2c7fa`.
Manifiesto interno con hashes de los siete archivos y commit; ocho entradas en
el ZIP, incluido el manifiesto. Extracción/hashes, PowerShell 5, BOM, rutas con
espacios/apóstrofo y guarda sin juego comprobados. El binario release importa
solo DLL de Windows; STOP drena y cierra, y cero SHM no acredita captura.

- Clippy workspace/all-targets `-D warnings`: **PASS**, log
  `C:/VantareServer/logs/1638-full-clippy-2.log`.
- Nextest runtime/domain/ipc con workspace: **644/644 PASS**, 5 skips,
  `1638-full-nextest.log`; incluye los cuatro tests de proceso Services.
- Perfil telemetría por cola: **32/32 PASS**, 1 skip opt-in, 663,271 s de tests,
  `1638-full-telemetria.log`. Gates en serie, MIN_GB=0, target propio.
- Arnés sobre fixture real existente: **18 widgets, 4 fotos, 7 campos de Avisos,
  0 rechazos**; archivo truncado falla. No es evidencia nueva de Imola.
  Regresión de alcance impide acreditar situaciones de carrera desde práctica.
- Compresión de muestra real de 47 coches: 120 cuerpos SHM, **38978400 → 202236
  bytes** mediante XOR/gzip. Solo cuerpos, sin metadatos/REST; no garantiza el
  tamaño de la grabación nueva. Evidencia `1638-compression-sample.json`.
- Fmt/diff y seis pruebas Python de catálogo, cancelación/guardas y alcance:
  PASS. UI completa y lifecycle no repetidos en este encargo acotado; ningún
  juego ni ventana/captura de Vantare. La grabación nueva sigue pendiente.

## Kit autónomo

Fuentes: `native/scripts/lmu-recording-kit/`, binario runtime
`vantare-grabar-lmu-completo`, release Windows x64. No necesita Rust, Python,
Vantare instalado ni privilegios de administrador en el PC de Isaac.
El ZIP y su SHA-256 se dejan en `C:/VantareServer/share/kit-grabacion-lmu/`.
No contiene SDK, assets del juego, credenciales ni grabaciones personales.

Build del recorder en el servidor: por `native/scripts/compilar.ps1`,
`cargo rustc --release --locked --offline --manifest-path native/Cargo.toml
-p vantare-runtime --bin vantare-grabar-lmu-completo --target-dir
C:/VantareServer/targets/isa-1638 -j 2 -- -C target-feature=+crt-static`,
anteponiendo `VANTARE_CARGO_MIN_GB=0`. El PE resultante importa únicamente DLL
de Windows: no exige instalar MSVC ni enviar DLL de otro producto.

Con Tailscale conectado, desde PowerShell del PC de juego, usando el SSH
**ya existente** del servidor (sin crear shares ni abrir puertos):

```powershell
scp Administrator@100.79.77.56:C:/VantareServer/share/kit-grabacion-lmu/kit-grabacion-lmu.zip "$env:USERPROFILE\Downloads\kit-grabacion-lmu.zip"
```

Extraer todo, abrir LMU en menú y pulsar `Grabar-LMU.cmd`. La consola muestra
segundos, SHM, REST y MiB; `estado.json` se actualiza cada segundo. No abre
ventanas de Vantare ni inicia/controla el juego. Para cerrar, pulsar
`Detener-LMU.cmd`, esperar `FINALIZADO` y enviar `sesion.lmu.gz`, `estado.json`
y el log. Un cierre forzado o un disco lleno no acreditan captura completa.

Fin de semana offline/IA, Hypercar: práctica 5 min con boxes y dos vueltas;
qualy 5 min y dos vueltas cronometradas; carrera con formación/salida lanzada
y al menos tres vueltas, dejando finalizar las sesiones. Mantener la misma
grabación durante menús, transiciones y una bandera si ocurre. Duración habitual
20–40 min, tope de seguridad 4 h. En boxes solamente no se acredita formación,
salida, historia de consumo ni tiempos de vuelta.

## Qué conserva y límites

- Dos mappings del SDK de esta instalación: `LMU_Data` completo (generic,
  eventos, FFB, paths, scoring, stream y los 104 slots de telemetría) y
  `LMU_SharedMemoryLockData`. `MapViewOfFile(...,0)` + `VirtualQuery` conserva
  todas sus páginas, también padding y campos que el adapter aún no lee.
  Solo `OpenFileMapping(FILE_MAP_READ)`: no crea objetos ni toma/escribe el
  lock del juego. Los eventos de Win32 no son buffers de datos; su cola está
  dentro de generic. Una build con nuevos mappings exige revisar su SDK.
- Muestreo SHM con objetivo 60 Hz, dos copias hasta tres comparaciones.
  También conserva copias inestables con su marca; replay no las admite.
  Instantes monotónicos de inicio/fin, UTC de origen, gaps y errores. Los
  tiempos reales permiten detectar retrasos de lectura; 60 Hz no significa
  capturar cada actualización física ni una traza sin pérdidas del juego.
- `Discover-LmuRest.ps1` lee todos los JS del `Bin/UI.zip` local, resuelve
  prefijos constantes y recoge GET de `getJson`, `getText` y `$http.get`.
  Añade las rutas de inventario conocidas y los dos endpoints productivos.
  No evalúa JS ni redistribuye archivos propietarios. El catálogo y hash de
  UI quedan dentro de la grabación, con plantillas y exclusiones explícitas.
  Se consulta standings/sessionInfo con periodo mínimo 250 ms y el resto en
  rondas de al menos 2 s (la latencia de todas las respuestas alarga la ronda).
  `getIncidentsList` se consulta con intervalo 1; la plantilla de mapa de pista
  se resuelve si `GetLoadingScreen.trackInfo` entrega `id`/`trackId` válido.
- **No es posible prometer todos los endpoints ocultos del servidor** a partir
  de los clientes. Se conserva todo cuerpo de las rutas descubiertas, incluso
  404/500, transporte fallido y errores. No se prueban POST/PUT/DELETE ni GET
  que activan acciones (join/play/reset/campeonato), ni credenciales/perfil/chat.
  No se recogen tickets de autenticación. Un endpoint no descubierto no se
  presenta como capturado; el catálogo es evidencia revisable de la cobertura.
- HTTP solo a `127.0.0.1:6397`, sin proxy ni redirects, deadline 750 ms,
  cuerpo máximo 16 MiB. Truncamiento queda explícito y nunca alimenta replay.
  Dos workers REST, cola acotada con contrapresión; cierre STOP/Ctrl+C drena
  las respuestas. Los instantes de solicitud, final HTTP y disponibilidad en
  la grabación se guardan por separado, preservando el orden de reproducción.
- `vantare.lmu-full.v1`: registros con JSON y cuerpo binario, gzip continuo,
  XOR reversible contra el cuerpo anterior de cada fuente. No deja terabytes
  de SHM crudo ni miles de archivos temporales; RAM independiente de duración.
  Hash SHA-256 por cuerpo, footer obligatorio y CRC gzip verificados offline.
  No se garantiza tamaño final sin una sesión real; la consola lo mide.
- **Datos crudos privados**, sin anonimizar: nombres de parrilla IA/online,
  paths del usuario en SHM y configuración del coche/juego. La fidelidad de
  los bytes y las relaciones de identidad se conservan para investigar; no
  subir públicamente ni convertir la captura en fixture versionada sin sanear.

## Arnés offline y significado del informe

```powershell
$env:VANTARE_CARGO_MIN_GB='0'
pwsh -NoProfile -File native/scripts/compilar.ps1 python -I native/scripts/verify-lmu-widget-coverage.py --target-dir C:\VantareServer\targets\isa-1638 --recording C:\VantareServer\evidence\grabacion-lmu-imola\sesion.lmu.gz --recording-scope practice-only --output-dir C:\VantareServer\logs\1638-imola-repeticion-nueva
```

Usar siempre una carpeta de salida nueva y esperar a que termine cualquier
verificación anterior. El comando va por la cola y no vuelve a compilar.
[Alcance real de Imola y revisión por widget](imola-practica-2026-10-16.md):
77 min 18 s de práctica recibidos, Alpine #35 fuera del garaje pero parado,
IA móvil; no cubre clasificación, carrera, formación ni salida.

Requiere `release/vantare-verificar-lmu.exe` y
el test UI `offline_coverage::recorded_dtos_reach_all_widgets` precompilado
en `debug/deps/` del target propio (el arnés verifica el filtro exacto). No compila ni abre
LMU, HTTP, mappings o ventanas durante la verificación.

Primero verifica archivo íntegro y luego reproduce en streaming por el mismo
`Replay → Translator → Core → DTO v11 estricto` del producto. Los dos REST
productivos entran individualmente por las mismas funciones de caché que en
vivo: fallos dejan envejecer datos, no reemplazan valores por cero. TTLs y
reloj de fuente usan los tiempos grabados, sin esperar tiempo real. El padding
SHM se conserva en el archivo; solo el layout de build admitida llega al parser.
Los demás REST permanecen disponibles como evidencia cruda para ampliar luego
el adapter, **no se afirma que ya alimenten señales productivas**.

DTOs fluyen por un pipe anónimo, sin escribir snapshots personales a disco,
hacia `Widget::ingest` de las 18 entradas del registro. `widgets.json` cuenta
fotos, cambios solicitados por ingest, señales demandadas y calidades por campo/sesión.
Además separa estados de fuente, velocidad/inputs/vueltas fiables del jugador
y rivales con velocidad fiable >0,1 m/s. Stale y Estimated no acreditan movimiento.
`telemetry.json` incluye inventario REST, rechazos, sesiones y las siete
calidades de Avisos (inicio, fin, fin previsto, fase, metros, próximo tipo/hora).
`verification.log` y `summary.json` recogen el resultado de ambos procesos.
No hay éxito con cero fotos ni con menos de 18 widgets. `evaluated_pending_coverage_review`
significa recorrido comprobado, **no** 18 widgets completos ni fase B aprobada.
Imola se procesó completa: 287.495 fotos por widget y cero rechazos, pero
99,9833 % Stale y jugador parado. Calma/seco explícitos sí se añadieron con
evidencia positiva. Siguen pendientes conducción y transiciones; la rama del
widget #1653/#1660 no se modifica.
