# Beta nativa — instalador y actualizaciones (#1454)

Paso 1c de #1840: el Hub escribe hub-ready antes de Register. Un fallo o lentitud
se guarda en registration-status.json, propiedad del Hub; Ajustes muestra el aviso
aparte. update-status.json pertenece solo al actualizador: Stage puede escribir
current/ready/error sin perder el aviso ni contaminar la notificación de actualización.
Confirm emite ACK antes de Sync-BetaRegistration; si ese mantenimiento falla, lo
registra como aviso en stdout y continúa. Register del Hub comunica su propio resultado.

Riesgo aceptado por decisión del orquestador en #1840: hub-ready significa solo
«ventana creada y proceso vivo». No certifica el mantenimiento posterior. Si el
proceso falla después de publicar readiness mientras Register sigue en curso,
ese fallo ya no provoca rollback de arranque. La disponibilidad tiene prioridad
sobre la actualización cosmética del registro. El bootstrap congelado de 0.0.975
conserva Sync-BetaRegistration sin try/catch; su fallo sigue siendo una limitación
preexistente de ese bootstrap, fuera de este paso.

`candidate.ps1` y `beta.ps1` exigen `-Root` incluso para Build. Cargarlos como
biblioteca requiere `. <script> -Library -Root <contexto explícito>`; no ejecuta
operaciones ni selecciona una instalación. La carga sin raíz falla antes de
inicializar tipos o escribir. Los parámetros internos tienen nombres propios
para conservar Root/Operation/Channel/Version/Archive del llamador.
El driver exige raíz en todas las operaciones que escriben; Probe conserva el
descubrimiento de la instalación para la UI. Las peticiones TEST aportan
identidad, carpetas y prefijo QA explícitos, sin constantes QA en producto.

Las pruebas históricas también exigen Root, RegistryRoot y ShellRoot explícitos;
rechazan contexto incompleto antes de escribir. Para ejecutar inventario de build
y el histórico, usar `matrix/run-historical-tests.ps1 -Root <QA nueva>` (más
`-LegacyPackage <ZIP975>` opcional). Este arnés copia scripts y fixtures a QA,
inyecta registro/shell y fija los entornos antes de crear el proceso. No invocar
directamente build-inventory-tests/historical-inventory-tests sin ese contexto.
El [incidente y la evidencia de 1b](matrix/evidence-1840-1b.md) describen el motivo.

Desde #1793, una generación anterior incompatible, ausente o corrupta no bloquea
la lectura de una activa válida ni su actualización. `Read-NativeState` conserva
el estado y los archivos en disco, registra `previous-corrupt` o
`previous-unreadable` en stderr y
devuelve esa referencia como no restaurable. Rollback exige una anterior íntegra;
la actualización conserva la activa validada como su nuevo destino de rollback.
La activa mantiene sus comprobaciones de referencia, manifiesto e inventario y,
salvo la sonda/reparación explícitas, de integridad de cada archivo.
El inventario instalado se toma de su propio `manifest.json`, ligado por SHA-256
desde `state.json`, dentro del universo cerrado de rutas conocidas del motor.
No hay lista congelada de 91 miembros ni intervalo de versiones para leerlo.
El universo conserva las rutas retiradas explícitamente en `NativeRetiredMembers`
(vacío hoy): al retirar o renombrar un archivo del paquete, su ruta conocida se
mantiene ahí para leer/restaurar generaciones anteriores y retirar sus binarios.
Una N de 109 archivos sigue siendo legible cuando N+1 añade un recurso; ZIP y
build entrantes siguen exigiendo todo el inventario actual. Rutas arbitrarias,
duplicados, archivos no enumerados, cambios de canal, hashes, sidecars y reparse
se siguen rechazando. Una anterior apartada de las referencias puede quedar huérfana:
sus archivos/datos se conservan deliberadamente; no hay limpieza automática.

Seguimiento #1695: el rollback intenta restaurar cada metadato aunque otro esté
bloqueado y registra los fallos en stderr, conservando el error original. Si no
se puede enumerar el estado anterior se aborta antes de activar; si no se puede
comprobar el estado actual o enumerar durante rollback, se conservan las
generaciones. Nunca se retira una generación aún referenciada por state.json.
Un bloqueo persistente puede impedir la restauración completa; el log lo indica.

El desinstalador mantiene beta-session.lock durante retirada de datos de
programa, registro, accesos y creación del marker. Su EXE se retira después de
salir mediante Cleanup, que toma el mismo lock hasta borrar EXE y marker.
La recuperación de un marker huérfano por Setup también se valida bajo ese lock.
Las suites de registro y shell se ejecutan en el check Windows bloqueante.
Auditoría de recursos de arranque, inventario explícito y regresión del Hub
Release aislado del checkout: [startup-resources.md](startup-resources.md) (#1694).

El orquestador publica la beta; estos scripts **no publican ni usan tokens**.
Windows x64, NTFS y PowerShell 5.1. Setup y Uninstall son binarios Rust/GPUI
del crate [installer](../installer/README.md), con ZIP, bootstrap y fuentes
embebidos. Reutilizan exclusivamente dependencias ya fijadas. No requieren
Rust ni NSIS en el equipo del usuario. El corte 0.0.976 de #1565 mantiene NSIS;
`-LegacyNsis` conserva también ese build como rollback explícito.
`-NsisCompiler <ruta>` solo se usa en esa ruta legacy.
El check Windows bloqueante ejecuta `publish-installer-tests.ps1`: selección
GPUI por defecto sin NSIS disponible, excepciones legacy, hash del Setup y
fallo de build sin fallback. Usa builds/firma simulados; no publica assets.
Instalador sin firma: SmartScreen puede pedir «Más información → Ejecutar de todas formas» (aceptado por Isaac).

## Instalar y desinstalar

Desde #1726, los accesos Inicio/Escritorio/Startup apuntan al supervisor GUI
`vantare.exe --beta -Root <raíz>` de la generación activa. Este crea el motor
PowerShell con `CREATE_NO_WINDOW`; no depende de una consola interactiva.
El registro del Hub renueva los destinos tras actualizar o restaurar una generación.
Los errores de arranque quedan en `<raíz>/logs/` (bootstrap, runtime y Hub).
Startup conserva `Vantare.lnk`, apunta al supervisor GUI y añade `--background`.
No abre indicador, no concede ASFW_ANY y respeta «Empezar minimizado».
Inicio/Escritorio son aperturas interactivas: muestran el Hub aunque ese ajuste
esté activo. No cambian nombres internos, rutas ni datos.
El marcador `# vantare-launch-capabilities: background-v1` en candidate.ps1 de
la generación permite usar el flag. Restore-NativeCandidate renueva explícitamente
el Startup existente para la generación restaurada y retira el flag si es antigua,
sin esperar a que se abra su Hub. Si el feed conserva candidate.ps1 raíz antiguo,
Register conserva el Startup anterior: ese supervisor GUI resuelve la generación
activa mediante beta.ps1 y sigue siendo compatible con rollback/desinstalación.
Setup renueva la raíz y habilita el flag. No se introduce otro host de arranque.

El indicador interactivo requiere este contrato exacto en la primera línea del
`beta.ps1` raíz (UTF-8, BOM opcional):
`# vantare-boot-capabilities: indicator-handshake-v1`.
El bootstrap lee solo el encabezado antes de crear la ventana; no interpreta
PowerShell. Sin ese marcador/versionado conocido, sale tras crear el motor PS,
como RC4, sin indicador residente que pueda bloquear Apply o rollback.
Setup renueva `beta.ps1`; el feed conserva la copia raíz antigua y por eso se
degrada sin indicador hasta reinstalar con Setup. No se cambia el guard de EXE.
Con el contrato v1, antes de Apply/rollback PS valida ventana/PID/imagen, envía
WM_APP+106 y espera su salida hasta 10 s. Apply aplaza si no sale. Solo rollback
puede esperar su cierre natural, mediante el mismo handle y hasta 47 s totales
(45 s del indicador más margen). Si tampoco sale, aborta sin cambiar generación
ni pendiente, sin terminar procesos a la fuerza. Un HWND ya destruido no impide
esperar la salida del proceso; el guard exclusivo se sigue obteniendo después. El arranque normal cierra por señal del primer frame del Hub, salida
del motor o plazo de 45 s. `--background` suprime el indicador y la activación.

`bootstrap-capability-tests.ps1 -GuiExecutable <vantare.exe construido>
-EvidenceDirectory <carpeta propia>` prueba los dos encabezados con el bootstrap
real en escritorios privados, sin SwitchDesktop: con marcador aparece el indicador,
señala/cierra y obtiene el guard; sin marcador no aparece y libera la imagen como
RC4. Lo ejecuta `runtime/tests/windows_startup.rs` junto al probe de timeout y guard.
La imagen construida lleva ICON1 de #1746. La campaña completa de actualizaciones
firmadas, incluidos los casos nuevos Apply/rollback con bootstrap vivo en
`beta-tests.ps1`, queda obligatoria para RC5 por decisión del orquestador.

Si se cierra el Hub mientras Register está pendiente, se oculta la ventana y el
proceso permanece vivo hasta el éxito y el acuse del supervisor (retirar
boot-pending.json), con plazo. hub-ready se publica una sola vez; un cierre con
código 0 y el PID correcto ya registrado es válido aunque gane el siguiente sondeo.
Código 0 sin hub-ready nunca confirma una instalación. Un quit forzado recoge
síncronamente el hijo Register antes de cancelar su tarea.

Las herramientas CLI de grabación/importación conservan su uso en terminal;
los procesos automáticos y las ventanas de producto usan subsistema Windows.

Doble clic en **VantareSetup.exe**. Instala sin administrador en
`%LOCALAPPDATA%/Programs/Vantare`, crea «Vantare Simracing Suite» y
«Desinstalar» en el menú Inicio y ofrece abrir el Hub al terminar.
En interactivo, Opciones propone escritorio ON y autostart OFF. `/S` no crea
accesos opcionales nuevos ni abre Vantare; respeta preferencias ya guardadas.
Solo se quitan accesos que pertenecen a esta raíz. «Aplicaciones instaladas» también
permite desinstalar. Se conserva la clave técnica `VantareNativeBeta`: cambiarla
rompería la sincronización de versión y rollback del bootstrap ya instalado.
Inicio, escritorio y Aplicaciones instaladas usan **Vantare Simracing Suite**.
Los accesos conservan el supervisor GUI como destino y usan explícitamente su
icono Win32 ID1. RC3/RC4 carecían de ese recurso; runtime/build.rs lo incrusta
solo en vantare.exe mediante el build-support compartido de Hub/UI. AppUserModelID
estable: `Vantare.SimracingSuite`. Si Windows bloquea la propiedad AUMID, se
registra un aviso y Register continúa con el nombre/icono guardados, retirando
el enlace antiguo; ese metadato no impide hub-ready ni provoca rollback. DisplayIcon apunta a Uninstall.exe propio,
o al Hub en instalaciones anteriores sin desinstalador GPUI. Setup y Hub
conservan sus títulos actuales.
Una instalación anterior conserva su `InstallLocation`, incluida la carpeta
`Vantare Native Beta`; moverla obligaría a migrar datos y referencias sin aportar
valor al usuario. Setup también adopta datos de esa ruta tras desinstalar.

La actualización desde el Hub antiguo funciona sin reemplazar su bootstrap:
el Hub nuevo ejecuta `Register` del `candidate.ps1` de su generación verificada
antes de publicar `hub-ready`. Esa operación cambia DisplayName, mantiene la
misma clave y raíz, crea los dos accesos nuevos y retira solo accesos antiguos
que apuntan a esa instalación. Puede repetirse sin duplicados. Un fallo impide
confirmar el arranque y deja actuar al rollback existente. El tag técnico,
asset, canal y firma del feed siguen iguales para clientes anteriores.

Inicio y Aplicaciones instaladas usan `Uninstall.exe` propio cuando existe el
marker validado `installer-ui.json`; se conserva `uninstall-vantare.ps1`, copia durable
del script del paquete: llama a la desinstalación beta instalada, conserva los
datos y retira accesos, registro y bootstrap. Así también puede desinstalarse
una beta renombrada solo por feed, cuyo Uninstall.exe antiguo desconoce la nueva
carpeta. La copia permanece disponible si se interrumpe la desinstalación.
Uninstall.exe propio también retira los accesos nuevos y antiguos propios; la migración
ya retiró los antiguos propios y preservó cualquier acceso ajeno.
Wails usa otra carpeta y sus propios accesos.
No se leen ni importan datos Wails durante la instalación.

La desinstalación exige cerrar todos los procesos de esta instalación, retira
los binarios y conserva `generations/<id>/data/`. No borra perfiles ni cuenta.
Ejecutar Setup encima actualiza a una versión más reciente o reinstala los
binarios de la misma versión, conservando perfiles, layout y cuenta. Usa la
misma activación por generaciones que el Hub: exige cerrar Vantare y restaura
la versión anterior si el Hub nuevo no confirma su ventana. Una versión inferior
se rechaza con un aviso; no baja de versión en silencio. Inicio y el registro
de desinstalación se actualizan, también si hay rollback.
Si se vuelve a ejecutar Setup antes de comprobar el arranque de una actualización
o reparación, devuelve código 4 y pide abrir y cerrar Vantare primero. No cambia
la generación ni el marcador pendiente: el arranque conserva su rollback.
Los códigos 2 (sesión/binarios abiertos), 3 (versión anterior) y 4 provienen de
errores tipados, sin depender del texto mostrado.

#1690: Desktop/Startup apagados no crean carpetas ni accesos. Register consulta
el escritorio para migrar un acceso propio existente, incluso sin preferencias
heredadas de NSIS; desinstalar consulta ambos destinos para retirar residuos. Si se activan,
se usa la ruta configurada por Windows y se crea la carpeta si falta; una
carpeta inaccesible o un acceso ajeno se conserva y produce un aviso sin
abortar la instalación. Al apagar una opción antes activa, Setup retira
solo su acceso anterior; desinstalar retira solo los accesos activados propios.
La finalización del registro permanece bajo el bloqueo de sesión de Setup.
Si falla tras activar/copiar, se restauran los valores y tipos del registro,
los bytes de accesos/bootstrap/metadatos y la generación anterior; se retira
solo la generación nueva, conservando los datos originales. La restauración
es para excepciones del proceso, no una garantía nueva ante corte de energía
o permisos que impidan también restaurar. `installer-registration-tests.ps1`
usa carpetas ausentes, PE inertes y errores reales de archivos compartidos;
incluye el driver completo sin abrir la aplicación ni una UI de instalador.

Después de desinstalar, Setup adopta automáticamente los datos de la generación
activa conservada en `retained-data.json`. Desinstaladores antiguos sin esa
referencia permiten recuperar una copia única (o copias idénticas); si quedan
copias distintas, se rechaza sin elegir datos arbitrariamente.

QA aislada: `build-installer.ps1 -TestInstaller` (alias `/DTEST_INSTALLER`)
y ejecutar `VantareSetup.exe /S "/D=C:\tmp\ola2\1591-qa\installed"`.
Esta build exige ruta explícita y usa registro `VantareNativeBetaQA1492` y
accesos «Vantare QA1492», separados de la instalación de Isaac.
Solo este instalador escribe `registration-identity.txt` en la raíz y lo retira
al desinstalar; el bootstrap lee esa identidad validada para sincronizar el
registro tras confirmar o restaurar. Sin ese archivo usa `VantareNativeBeta`.
No distribuir esta build. `installer-tests.ps1` conserva el ensayo de marca
beta antigua; `-FirstBrand Current` compara NSIS actual con el propio sin
inventar una marca anterior. `installer-qa.ps1` añade propio A→B, locks,
repair, rollback headless, índices de todos los data, feed TEST y reinstalación.
`beta-tests.ps1` requiere verificador y semilla de TEST
para probar el feed firmado, nunca la clave privada productiva.

`/S` y la UI comparten el motor y los códigos 0/1/2/3/4; cancelar antes de la
transacción devuelve 5. La UI muestra extracción con bytes reales y etapas del
motor, sin progreso ficticio. Repair solo está disponible con el mismo Setup;
Actualizar exige uno posterior. No existe opción de borrar datos: se muestra
`Tus datos se conservan en <raíz>/generations/<id>/data`.

El acceso de Inicio abre un host PowerShell de 64 bits oculto. El legacy NSIS usa
[Sysnative](https://learn.microsoft.com/en-us/windows/win32/winprog64/file-system-redirector)
para evitar la redirección WOW64; el acceso guardado apunta a System32 para Explorer x64.
Setup propio es x64 y utiliza System32 directamente. La build QA no abre el Hub
en el SID de origen del builder: su instancia/pipe `native-beta` se comparte.
Arranque live, Inicio/autostart y DPI físicos requieren otra cuenta/VM. Un
snapshot/captura no acredita ese arranque ni Windows limpio.
El host abre el supervisor nativo `vantare` (instancia `native-beta`, núcleo live
y overlays) y el Hub conectado a él. Mantiene
un lock de sesión único, comprueba actualizaciones al abrir y cada 6 horas
mientras el Hub está abierto, y termina después del Hub. No hay tarea programada
ni updater residente durante la carrera. Al cerrar el Hub fuera de Live se
solicita el cierre protegido del supervisor beta; al entrar en Live se mantiene
el supervisor con overlays y la actualización espera a que terminen. Abrir un exe directamente es una ruta
diagnóstica; para recibir actualizaciones utiliza el acceso instalado.

## Actualización automática

El feed anónimo consulta las 100 Releases más recientes de
`isaacalbala12/Vantare-Downloads` (repo publico creado en #1565; sin releases nuevas todavia), selecciona la mayor versión numérica
`native-beta-vMAJOR.MINOR.PATCH` con asset `vantare-native-beta.json`
(incluidas prereleases, excluidos drafts). El repositorio debe ser público.
El destino nuevo está creado sin releases; no hay descarga firmada nueva acreditada.
La disponibilidad de una release se comprobará tras publicación autorizada; no certifica una
release beta publicada. Rate limit, falta de red o manifiesto ausente se muestran
en Ajustes; no bloquean el uso de la versión instalada.

Contrato cerrado del manifiesto:

```json
{
  "schema": 1,
  "product": "vantare-native",
  "channel": "beta",
  "version": "0.1.1",
  "url": "https://github.com/isaacalbala12/Vantare-Downloads/releases/download/native-beta-v0.1.1/vantare-native-amd64-package.zip",
  "sha256": "<64 hex minúsculas>",
  "notes": "Cambios de la beta"
}
```

El nombre del asset, tag, URL, canal, esquema, versión y SHA se verifican.
El ZIP pasa además el inventario y hashes del candidato. Solo entonces queda
en `staging/` y el Hub muestra **«Actualización lista, se aplicará al reiniciar»**
y **«Reiniciar ahora»**. El botón utiliza el cierre protegido del Hub; no
interrumpe un proceso de carrera. Al cerrar se aplica `Update` de `candidate.ps1`,
que exige todos los escritores detenidos y copia datos a una generación nueva.
Si algún proceso sigue usando los binarios, queda pendiente para otro arranque.

El Hub confirma la creación de su ventana mediante `hub-ready`. Un marcador
durable `boot-pending.json` sobrevive a interrupciones del supervisor. Si el Hub
nuevo termina o no confirma en 45 s, se restaura la generación anterior con
`Rollback`; en timeout se cierra únicamente el Hub nuevo que creó el supervisor.
La confirmación prueba apertura, no login remoto, juego ni sesión prolongada.
Las generaciones se conservan; no hay purga automática ni migración de esquema.
El bootstrap schema 1 queda fijo durante Update; el registro visible se
sincroniza mediante el script verificado que ya viaja en cada generación.
Los demás cambios de bootstrap requieren reinstalación/revisión. SHA-256 prueba integridad sobre GitHub HTTPS;
el manifiesto del feed exige firma Ed25519; no se ofrece Authenticode.

Los datos beta viven en la generación (`data/`); el Hub y sus hijos heredan
`VANTARE_NATIVE_DATA_ROOT`. Layout, ajustes, servicios y derechos no se escriben
en la ubicación Wails. Ajustes → Actualizaciones y los diagnósticos muestran
versión de producto embebida; cada exe admite `--version` y muestra el canal.
PostHog (cola, privacidad e identificador anónimo) y `freshness.log` usan
`data/Vantare/native/`; los borradores protegidos se guardan bajo
`data/Vantare/native/services/<namespace>/` por el auxiliar del supervisor.
Todos permanecen en la misma generación aislada. El Testing Center usa la
membership RPC `testers` para una build `beta`, sin cambiar el esquema remoto.
Su contexto visible añade el identificador anónimo y el canal de distribución;
la preview y el reintento conservan el mismo payload. El límite de contexto de
4096 bytes incluye estos metadatos: si se supera, el borrador se conserva y el
envío se rechaza, sin recortar el texto.

## Preparar publicación (sin publicar)

Desde `vantare-v2`, en el SHA integrado y limpio:

```powershell
powershell -NoProfile -File native/packaging/publish-beta.ps1 `
  -Version 0.1.0 -OutputDirectory C:/tmp/isa-1432-beta-build `
  -SigningKeyFile <ruta-privada-elegida-por-Isaac> `
  -ConfigFile C:/tmp/beta/build-config/beta-dev-clerk.env `
  -Notes 'Notas revisadas por el orquestador'
```

Compila Release offline/locked con `-j 2`, verifica inventario Cargo y genera
paquete, portable, `VantareSetup.exe`, sidecars y `vantare-native-beta.json`.
Fija `VANTARE_VERSION` y `VANTARE_BUILD_CHANNEL=beta` para todos los binarios,
restaurando el entorno al terminar. No compila Wails ni altera sus workflows.
Imprime un comando `gh release create --prerelease`; **no lo ejecuta**.
El orquestador revisa y publica el tag y los assets exactos. No usar `latest/download`
porque la beta es prerelease. `-BuildProfile Debug -AllowDirty` sirve para QA local;
no equivale a una candidata Release del SHA integrado.

### Variables públicas finales de build

`-ConfigFile` carga líneas literales `NOMBRE=valor` (comillas opcionales), sin
expansión de PowerShell ni impresión de valores. Rechaza nombres desconocidos,
duplicados, valores vacíos y claves privilegiadas; restaura el entorno al acabar.
La configuración queda fuera del repositorio y del paquete. Lista cerrada:

| Variable | Uso |
| --- | --- |
| `VANTARE_SUPABASE_URL` | Origen HTTPS del proyecto Supabase. |
| `VANTARE_SUPABASE_ANON_KEY` | Clave pública anon/publishable; nunca service role. |
| `VANTARE_LICENSE_PUBLIC_KEYS` | Claves públicas de verificación de licencia y sus kid. |
| `VANTARE_CLERK_ISSUER` | Issuer OAuth Clerk. |
| `VANTARE_CLERK_CLIENT_ID` | Client ID público nativo. |
| `VANTARE_CLERK_REDIRECT` | Callback loopback registrado. |
| `VANTARE_CLERK_ACCOUNT_PORTAL_URL` | Origen HTTPS del Account Portal; obligatorio para alta/reset con dominio propio. Desarrollo conserva su derivación si falta. |
| `VANTARE_ACCOUNT_BRIDGE_URL` | Endpoint exacto `native-account-authorize`. |
| `VANTARE_POSTHOG_KEY` | Clave pública PostHog UE; ausencia desactiva diagnóstico. |
| `VANTARE_ADMIN_URL` | Endpoint owner, solo para la compilación separada de admin. |

`VANTARE_VERSION` y `VANTARE_BUILD_CHANNEL` los fija el builder desde `-Version`
y el canal `beta`; no se aceptan en el fichero. `ipc::product` es la
fuente de identidad que usan binarios, PostHog y Testing Center. Las claves
privadas de licencia y los secretos Clerk/Supabase viven solo en servidor.

Para la instancia productiva, seguir el [runbook de Clerk](../../docs/billing/clerk-production-runbook.md).

La miniapp `vantare-admin` se excluye de la compilación pública y del inventario
del paquete; `beta.ps1` solo arranca supervisor y Hub. Se compila aparte según
[`admin/README.md`](../admin/README.md), nunca se añade al instalador público.

## Prueba local

Construye dos salidas con versiones 0.1.0 y 0.1.1 mediante el script anterior.
Luego, desde `vantare-v2`:

```powershell
powershell -NoProfile -File native/packaging/beta-tests.ps1 `
  -Version010Directory C:/tmp/isa-1454-evidence/build-0.1.0 `
  -Version011Directory C:/tmp/isa-1454-evidence/build-0.1.1 `
  -EvidenceDirectory C:/tmp/isa-1454-evidence/roundtrip `
  -TestVerifier <exe-aislado-con-clave-publica-de-TEST> `
  -SigningKeyFile <semilla-de-TEST>
```

Prueba comparación de versiones, contrato inválido, SHA erróneo, staging,
Update real con conservación de datos, versiones de los once exe, fallo de
arranque real y rollback reversible, y desinstalación preservando datos.
Verifica también el bootstrap instalado y el hash en un proceso PowerShell 5.1
sin `Get-FileHash`/autoload: el SHA se calcula en streaming mediante .NET.
El harness heredado se ejecuta con `tests.ps1 -Channel beta -ArtifactsDirectory <salida> -EvidenceDirectory C:/tmp/isa-1454-evidence/phase7`, incluyendo corrupción e interrupción real en tres fronteras.
El manifiesto local usa URI `file:` únicamente con `-LocalManifest`; el feed
productivo rechaza esa URL. Para abrir una instalación local y comprobar el
aviso/botón con la misma cadena automática:

```powershell
powershell -NoProfile -File native/packaging/beta.ps1 -Operation Run `
  -Root C:/tmp/isa-1454-evidence/installed `
  -LocalManifest C:/tmp/isa-1454-evidence/roundtrip/local-manifest.json
```

Evidencia fuera del repo. QA final debe repetirse sobre la integración B1–B4,
Release, Windows limpio y otra GPU. MSVC/ICU siguen siendo límites de la fase 7:
que el paquete cargue en este PC no certifica redistribución ni equipo limpio.

---

# Candidato offline — fase 7 (ISA-1432)

#1692: el builder de distribución compila con CRT estático y target explícito
`x86_64-pc-windows-msvc`, igual que Setup/Uninstall. Se limita a esa invocación:
no cambia el toolchain ni la configuración Cargo del desarrollo y restaura los
flags previos incluso si Cargo falla. Los EXE salen de `<target>/x86_64-pc-windows-msvc/<perfil>`.
DuckDB sigue siendo bundled (sin DUCKDB_LIB_DIR), y `cc` recibe crt-static para
usar /MT en su C++. Antes de ejecutar --version o copiar cada EXE, dumpbin
/DEPENDENTS revisa imports normales y diferidos: VC Runtime, MSVC C++ y UCRT
dinámicos se rechazan. El inspector usa los Build Tools MSVC ya requeridos;
no requiere Python ni incorpora un redistribuible. La UCRT dinámica es parte
de Windows 10/11, pero esta guarda exige que el CRT del paquete sea estático.
`build-crt-tests.ps1` prueba PE /MT, /MD, delay imports, fallos del inspector y
restauración de flags en el builder. Las DLL del sistema y Windows limpio se
verifican por separado: pasar el gate CRT no acredita GPU, Hub ni servicios remotos.

Windows x64, PowerShell 5.1/.NET y volumen local con reemplazo atómico (NTFS).
No requiere Python, NSIS, crates nuevas ni permisos de administrador.
**Candidato técnico sin firma; Wails sigue siendo el producto distribuido.**

Desde la raíz `vantare-v2`, con checkout limpio y dependencias Cargo cacheadas:

```powershell
& native/packaging/candidate.ps1 -Operation Build -Root D:/VantareServer/qa/build-context -Version 0.0.0-local `
  -Channel nightly -BuildProfile Debug -OutputDirectory C:/tmp/isa-1454-evidence/phase7-build
```

Compila todos los binarios del workspace (once en esta base), offline/locked con `-j 2`.
`Release` es el perfil por defecto; `Debug` verifica packaging sin representar
rendimiento de producto. Beta empaqueta diez: excluye `vantare-workshop.exe` y su
sidecar, pero sigue compilándolo para desarrollo y capturas de paridad en el repo.
Los demás canales conservan Workshop. El inventario se verifica según el canal
guardado en el manifiesto/estado, también al actualizar, importar o consultar Status.

Las herramientas privadas `vantare-grabar-lmu-completo` y `vantare-verificar-lmu`
se validan en el inventario de compilación, pero no se distribuyen en ningún
canal; no amplían los diez EXE beta. Regresión mediante
`matrix/run-historical-tests.ps1 -Root <QA nueva>`. Para un llamador que ya
inyecta el entorno y crea la clave única de pruebas:

```powershell
& native/packaging/build-inventory-tests.ps1 -Root $qaRoot `
  -RegistryRoot $qaRegistryRoot -ShellRoot $qaShellRoot
```

RegistryRoot tiene forma `HKEY_CURRENT_USER\Software\VantareInstallerMatrix\<uuid>`.
TEMP/TMP/LOCALAPPDATA deben estar en QA antes de crear el proceso. Sin los tres
parámetros de contexto falla sin escribir; el arnés anterior los gestiona todos.
Para probar antes del commit, `-AllowDirty` registra `source_dirty=true`.
El SHA de Git y los hashes de todos los archivos identifican lo construido;
los binarios embeben `VANTARE_VERSION` y `VANTARE_BUILD_CHANNEL`, que el builder fija y restaura. Todos responden a `--version`.

La salida conserva `payload`, `portable-tree`, el paquete, portable e instalador
script con sus SHA-256. El manifiesto enumera exactamente los exe del canal y sus sidecars SHA-256, el
script, README, licencia Inter y catálogo Cargo con versiones/licencias/source.
Este catálogo **no es un SBOM ni una auditoría de distribución**. No publica
releases ni ejecuta los workflows Wails.

Instalación por usuario en una carpeta vacía elegida expresamente (puede ser
una carpeta de prueba; no escribe registro, servicios, asociaciones o AppData):

```powershell
$package = 'C:/tmp/isa-1454-evidence/phase7-build/vantare-native-amd64-package.zip'
$sha = (Get-FileHash -LiteralPath $package -Algorithm SHA256).Hash.ToLowerInvariant()
& native/packaging/candidate.ps1 -Operation Install -Root C:/tmp/isa-1454-evidence/phase7-install `
  -Archive $package -ExpectedSha256 $sha -Channel nightly
& C:/tmp/isa-1454-evidence/phase7-install/candidate.ps1 -Operation Status -Root C:/tmp/isa-1454-evidence/phase7-install
```

El instalador es `vantare-native-installer.ps1` con operación Install y los
mismos argumentos. Para instalar de verdad por usuario se puede elegir
`$env:LOCALAPPDATA/Programs/Vantare Native Candidate`; los tests no usan esa ruta.
Portable: verificar su sidecar y extraer el ZIP a una carpeta nueva; contiene
el mismo árbol listo, con `candidate.ps1`, `state.json` y generaciones.

El SHA externo debe venir de una fuente confiable. Calcularlo del propio ZIP,
como en el ejemplo local, prueba integridad de prueba, **no autenticidad remota**.
El script no descarga ni concede acceso a canales. `master` equivale a Stable
de Wails; canal explícito no equivale a licencia. No usar este candidato para
distribución comercial ni reemplazar assets Wails.

Arranque explícito (replay real, no fuente sintética por defecto):

```powershell
& C:/tmp/isa-1454-evidence/phase7-install/candidate.ps1 -Operation Start -Root C:/tmp/isa-1454-evidence/phase7-install `
  -ApplicationArgs @('--', '--replay', (Resolve-Path testdata/lmu-fixture.bin).Path, '--build', '1.3.0.0', '--', '4')
```

Start conserva el lock solo hasta crear el proceso launcher en consola oculta
y devuelve su PID. PowerShell termina; el launcher nativo es el propietario de
sus hijos. Cierre normal de overlays / `vantare --parar` usan el ciclo de vida
existente. Si existe `data/layout.json` en la generación activa y no se proporciona un
grupo explícito de argumentos de overlays, Start pasa su ruta mediante
`--layout`. Un grupo explícito (p. ej. `4`) mantiene la selección indicada.

Actualización y rollback, con todos los procesos de esta instalación cerrados:

```powershell
& C:/tmp/isa-1454-evidence/phase7-install/candidate.ps1 -Operation Update -Root C:/tmp/isa-1454-evidence/phase7-install `
  -Archive 'C:/ruta/local/vantare-native-amd64-package.zip' -ExpectedSha256 '<64 hex minúsculas confiables>'
& C:/tmp/isa-1454-evidence/phase7-install/candidate.ps1 -Operation Rollback -Root C:/tmp/isa-1454-evidence/phase7-install
```

Update exige el mismo canal/esquema y un paquete íntegro. Copia datos a una
generación nueva, verifica que el origen no cambió y solo entonces reemplaza
`state.json` atómicamente. No sobrescribe exe en uso. Un lock excluye las
operaciones y el arranque; handles exclusivos de los exe rechazan procesos
abiertos directamente durante actualización/rollback. No se mata la app.
Rollback selecciona a la vez binarios y datos anteriores. Las escrituras hechas
en la generación nueva permanecen allí; **no se mezclan en la anterior**.
Otro Rollback permite volver a la generación retirada. No borra ninguna.

Interrupción antes del reemplazo: sigue activa la anterior. Después: la nueva
está completa y tiene anterior para rollback. Las pruebas matan procesos reales
en tres fronteras mediante eventos, sin sleeps. Esto cubre interrupción de
proceso, **no** corte eléctrico, fallo físico de disco o DB con propietario
externo. Copiar archivos requiere todos sus escritores detenidos; fases 4/5
deben adoptar el contrato antes de usarlo con sus almacenes.
El bootstrap `candidate.ps1` instalado no se reemplaza en Update (schema=1).
Una evolución del instalador requiere reinstalación aislada/revisión explícita;
no ejecutar un script nuevo automáticamente desde un ZIP.

Importación explícita de Studio V4 (un solo perfil y monitor elegido):

```powershell
& C:/tmp/isa-1454-evidence/phase7-install/candidate.ps1 -Operation ImportLayout -Root C:/tmp/isa-1454-evidence/phase7-install `
  -ProfileFiles @((Resolve-Path native/packaging/fixtures/studio-v4.json).Path) `
  -MonitorBounds @(-2560, 100, 2560, 1440)
& C:/tmp/isa-1454-evidence/phase7-install/candidate.ps1 -Operation Rollback -Root C:/tmp/isa-1454-evidence/phase7-install
```

Bounds son x/y globales y ancho/alto del monitor en las coordenadas usadas por
GPUI. Se eligen explícitamente; no se deduce el monitor actual a partir del
índice antiguo. Véase IMPORTACION-V4.md del repositorio para conversión,
Settings y límites. El informe queda en
`data/legacy-profiles/<generación>/native/report.json`, el origen copiado con
SHA en el mismo archivo y el layout activo en `data/layout.json`. La generación
anterior conserva exactamente el layout previo; Rollback revierte binarios y
datos juntos, sin borrar el original ni la generación importada.

`ImportProfiles` conserva su comportamiento anterior: archivo opaco explícito,
sin conversión ni activación. Para V2/V3 usar primero la migración del producto
Wails a V4; el CLI nativo rechaza versiones anteriores.

La [matriz de servicios](PARIDAD-SERVICIOS.md) identifica qué existe en esta
base y qué falta, incluido Testing Center. La fase completa no está aceptada.

No se aceptan ZIP parciales, hashes erróneos, otro esquema, paths arbitrarios,
enlaces ni árboles con `.env*`. Las preparaciones incompletas se conservan para
inspección y nunca se activan. No hay borrado automático de datos/generaciones.

Antes de cada commit, desde `native/`:

```powershell
$env:CARGO_NET_OFFLINE = 'true'
$env:CARGO_BUILD_JOBS = '2'
cargo fmt --check
cargo clippy --workspace --all-targets -j 2 -- -D warnings
cargo nextest run --workspace -j 2
cargo test --workspace --test lifecycle -j 2
```

Faltan firma/SmartScreen, notices completos de terceros, redistribuible MSVC
si fuera necesario, equipo Windows limpio/otra GPU, sesión prolongada LMU+OBS,
paridad completa de servicios y contratos de persistencia de fases 3/4/5.
Ver el microplan: la fase 7 completa sigue abierta aunque el mecanismo local pase.

Prueba local del mecanismo (con binarios reales de la salida indicada):

```powershell
powershell -NoProfile -File native/packaging/tests.ps1 `
  -ArtifactsDirectory C:/tmp/isa-1454-evidence/phase7-build
```

Las pruebas conservan sus carpetas fuera del repo (por defecto `%TEMP%/vantare-native-packaging-evidence/`; `-EvidenceDirectory` permite elegir otra ruta) y no
necesitan Pester. El smoke solo verifica carga del exe y rechazo de argumentos,
sin abrir juego, ventana GPUI ni red. La inspección PE local de Core/Overlays
detecta `VCRUNTIME140.dll`; Overlays también importa `icuuc.dll`, DX11 y
`d3dcompiler_47.dll`. Que carguen en este PC no prueba Windows 10 limpio.

## Firma del manifiesto (#1472)

La clave PÚBLICA Ed25519 está en `PUBLIC_KEY_BASE64`
(`native/services/src/update_manifest.rs`). La semilla privada (32 bytes
binarios) se generó el 2026-10-07 y la custodia Isaac en un USB, carpeta
`vantare-claves\actualizador-ed25519.seed` (letra de unidad variable).
Para firmar: conectar el USB y pasar
`-SigningKeyFile <USB>\vantare-claves\actualizador-ed25519.seed`.
**No copiar la semilla al disco, logs ni repo.** Retirar el USB al terminar;
Isaac conserva una copia de seguridad offline bajo su custodia. Si se pierde, ninguna
instalación podrá recibir actualizaciones firmadas y habrá que reinstalar con
una clave nueva. No hay clave de test, clave obtenida del feed ni parámetro
para reemplazar la clave del verificador. Instalaciones con el bootstrap
antiguo sin firma necesitan reinstalación.

El JSON anterior es el contenido firmado, no el asset publicado. El asset
`vantare-native-beta.json` tiene exactamente `payload` (bytes UTF-8 del JSON
en base64) y `signature` (firma Ed25519 de esos bytes en base64). Reescribir el
JSON dentro del payload invalida la firma. El verificador es `vantare-services`
de la generación instalada, verificada por los hashes del inventario.
Se comprueba la firma antes del staging y otra vez al aplicar; pending.json
conserva el sobre firmado. `-LocalManifest` también exige firma.

Isaac custodia su semilla privada de 32 bytes binarios fuera del repo. Esta
implementación no genera ninguna clave privada real ni la imprime. Pasar
`-SigningKeyFile <USB>\vantare-claves\actualizador-ed25519.seed` a `publish-beta.ps1`; el archivo se lee
solo en el proceso firmador, con buffers zeroize. No ponerlo en logs ni Git.
Para firmar por separado un JSON revisado:

```powershell
pwsh -File native/packaging/sign-beta-manifest.ps1 -Manifest <json-revisado> -Output <asset-firmado> -ServicesExecutable <vantare-services.exe> -SigningKeyFile <USB>\vantare-claves\actualizador-ed25519.seed
```

El script también acepta la ruta desde `VANTARE_UPDATE_SIGNING_KEY_FILE`.
No es una variable con el valor secreto. Solo escribe el sobre firmado y lo
verifica con la clave pública embebida antes de guardarlo. Firma de manifiesto
y SHA-256 autenticado del ZIP no sustituyen Authenticode/SmartScreen.
Las pruebas Rust generan sus claves de test en memoria y comprueban ausencia
de firma, cambio de contenido, clave ajena y campos desconocidos.
El smoke beta genera paquetes aislados con un verificador de TEST y sobres
firmados con su semilla de TEST. No sustituye la comprobación remota con los
binarios y la clave pública productivos ni requiere el USB de Isaac.

### Prueba del feed remoto firmado (#1472 R2)

Regresión local (sin red): `remote-feed-tests.ps1 -TestVerifier <exe aislado con
clave pública de TEST> -SigningKeyFile <semilla de TEST>`. El feed simulado
incluye versiones inválidas `99999.0.0` y `65535.0.0`, un asset ajeno y una
versión menor firmada. Comprueba selección descendente y contenido string,
UTF-8 bytes y UTF-16 con BOM; no modifica la clave productiva.

Prueba real pendiente, **solo cuando Isaac autorice una prerelease**: construir
instalador inicial y actualización con la clave pública productiva fijada;
Isaac firma fuera del repo. Publicar la prerelease autorizada y su manifiesto,
instalar la anterior en una cuenta de prueba, ejecutar Check sin LocalManifest,
verificar versión/notas, reiniciar y confirmar Apply/arranque y datos conservados.
Guardar tags, hashes, log y capturas; desinstalar esa instalación de prueba.
No publicar una versión inválida para simular el ataque en el feed real.

## #1565 · feed en `Vantare-Downloads` (cambio en seco)

Decisión 2026-10-13: el feed y las descargas viven solo en el repo público
`isaacalbala12/Vantare-Downloads` (sin código; solo README). Cada release
`native-beta-vX.Y.Z` lleva `VantareSetup.exe`, `vantare-native-amd64-package.zip`,
sus `.sha256` y `vantare-native-beta.json` con sobre Ed25519. Firma, clave
pública y verificador no cambian. No hay feed doble ni renovación automática
del bootstrap: con ~3 instalaciones no compensa ese código.

El repo del feed vive en el `beta.ps1` raíz, que solo renueva Setup; el ZIP no
lo copia y su inventario estricto impide añadirlo. Por eso **la 0.0.976 se
publica solo en Downloads y cada instalación pasa a ella reinstalando con su
Setup** (Vantare cerrado). El repo antiguo conserva la 0.0.975 hasta el cambio
a privado; las instalaciones que no reinstalen se quedarán sin feed después.

QA aislada (2026-10-13, identidad `TEST_INSTALLER`, raíz `C:/tmp/1565-qa/root`):
Setup TEST 0.0.975 con bootstrap y ZIP reales de la release (bootstrap idéntico
al tag `native-beta-v0.0.975`) → datos sembrados → Check consulta
`Vantare-Simracing-Suite` → Setup TEST 0.0.976 con el bootstrap de esta rama →
4/4 archivos de datos con hash idéntico, generación anterior como `previous`,
`beta.ps1`/`candidate.ps1` raíz iguales a la rama → Check consulta solo
`Vantare-Downloads` (0 releases: «Estás al día», sin error). Instalación real
intacta y QA desinstalada. Límite: el paquete 0.0.976 de la QA reutiliza los
binarios 0.0.975 con `manifest.version` 0.0.976; el build real lo hace Isaac.
Reinstalar dos veces sin abrir Vantare devuelve el código 4 (arranque
pendiente): abrir y cerrar Vantare y repetir.

Runbook de firma, publicación y reinstalación:
[repo-privado-1565.md](../../docs/repo-privado-1565.md#runbook-de-isaac-00976-en-vantare-downloads).


#1746: `shortcut-branding-tests.ps1` (incluido en registration-tests) comprueba
nombre, destino GUI, IconLocation, AppUserModelID, registro, repetición sin
duplicados, restauración transaccional y limpieza antigua/nueva para las formas
de enlaces de NSIS 0.0.975, RC3 y RC4, con COM real y carpetas aisladas.

Revisión #1752: el harness `tests.ps1` exige RT_GROUP_ICON ID1 en el supervisor
extraído e instalado del paquete (LoadLibraryEx como datos, sin ejecutar código).
La regresión de branding simula fallo de IPropertyStore en Register del Hub y
en la transacción de Setup: aviso, un solo enlace y generación conservada.
Rollback manual de Inicio/Escritorio hacia generaciones anteriores: seguimiento
#1753. La compatibilidad de Startup/`--background` sí se restaura en #1758,
antes de abrir el Hub de la generación anterior.
