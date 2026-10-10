# MSIX y firma gratuita en Microsoft Store — ISA-1432

Encargo acotado de [#1432](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1432),
ADR 0099, 2026-09-30. Worker Codex; revisión de todo el diff: Claude Opus 5.5.
Base asignada `e8b0927a3e8f63b8e89d2043b18c57ac1753c0fd`, rama
`vantareapp/isa-1432-w-msix`. No cambiar la base ni integrar los otros workers.
Notion no disponible, excepción explícita del encargo. No se declara seguimiento
Notion completado. Solo `native/packaging/msix/` y este documento; sin producto,
dependencias Cargo, push, PR, merge, cuentas nuevas ni envío a la Store.

## Microplan de este corte

1. Manifiesto Win32 full trust provisional, dos activaciones: Hub y supervisor
   existente. Todos los binarios Cargo juntos en `bin`, conservando la búsqueda
   de hijos y validación de imágenes. Sin launcher ni updater nuevos.
2. Generador PowerShell 5.1: Cargo locked/offline `-j 2`, herramientas del SDK,
   hash por fichero, hash MSIX, identidad parametrizable. Firma local opt-in,
   clave no exportable; salida ignorada bajo `native/target`.
3. Verificación con MSIX real: firma, instalación, activación AUMID, identidad
   del proceso y de los hijos, Hub/overlay con ventana, cursor Engineer por
   journal real; cierre, update de versión creciente y desinstalación.
4. Documentar exactamente las fronteras no probadas: juego live, OBS, equipo
   limpio, requisitos Store y paridad de servicios. Gates antes del commit:
   fmt, clippy y test workspace `-j 2`, parser/ejecución PowerShell y diff.

## Qué es gratis

Microsoft anunció el alta individual gratuita el 10-09-2025, sin tarjeta,
en casi 200 mercados. Isaac debe completar personalmente la comprobación de
identidad y elegir el tipo de cuenta que corresponda a su actividad.
[Anuncio oficial](https://blogs.windows.com/windowsdeveloper/2025/09/10/free-developer-registration-for-individual-developers-on-microsoft-store/).

La Store firma **MSIX/AppX** tras certificación; el paquete de envío puede estar
sin firma. No hace falta comprar certificado ni enviar PFX/CER. Los EXE/MSI
publicados en Store requieren firma Authenticode propia: esa ruta no resuelve
el problema económico.
[Requisitos de paquetes](https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msix/app-package-requirements).

## Herramientas y generación local

Windows x64, PowerShell 5.1, toolchain Rust fijado del repo y **Windows SDK
10.0.26100.0**. En el instalador del SDK seleccionar herramientas para apps
Windows Desktop: `makeappx.exe` y `signtool.exe` x64. Para el Windows App
Certification Kit (WACK), seleccionar también su componente. No instalar nada
automáticamente. SDK disponible en
[descargas oficiales](https://developer.microsoft.com/en-us/windows/downloads/windows-sdk/).
Si no están instaladas, el script falla con instrucción concreta. Se puede
indicar `-SdkDirectory` al directorio que contenga ambos exe; por defecto busca
la versión más alta en `C:/Program Files (x86)/Windows Kits/10/bin/<versión>/x64`.
`makepri` no se necesita para estos tres PNG de escala base y sin recursos
calificados; iconos finales/localizaciones exigirán comprobar PRI.
[Conversión manual oficial](https://learn.microsoft.com/en-us/windows/msix/desktop/desktop-to-uwp-manual-conversion).

Desde `vantare-v2`, en Windows PowerShell:

```powershell
powershell -NoProfile -File native/packaging/msix/build.ps1 `
  -OutputDirectory native/target/msix-v1 -BuildProfile Debug -TestSign
$first = Get-Content native/target/msix-v1/build-evidence.json -Raw | ConvertFrom-Json
powershell -NoProfile -File native/packaging/msix/build.ps1 `
  -OutputDirectory native/target/msix-v2 -BuildProfile Debug -Version 0.1.0.1 `
  -TestSign -TestCertificateThumbprint $first.test_certificate_thumbprint
```

El inventario de exe procede de `cargo metadata`, no de un glob de cachés.
`-BinaryDirectory` permite empaquetar binarios ya compilados, sin compilar;
se registra como entrada externa: el SHA fuente del checkout **no acredita**
su procedencia. Revisar hashes y build original antes de distribuirlos.
Sin esa opción, el generador compila su checkout. `source_dirty` evita presentar
una build previa al commit como build limpia. Debug prueba packaging, no
rendimiento ni certificación. El icono de prueba reutiliza `build/appicon.png`.
La licencia Inter se incluye; notices de TODAS las dependencias siguen pendientes.

`-TestSign` solo admite la identidad provisional. Genera RSA/SHA256, Code
Signing EKU, validez 30 días, clave **no exportable** en `CurrentUser/My`.
No crea PFX, contraseña, fichero de clave privada ni timestamp remoto. Solo
el CER público, manifiesto y evidencia se escriben bajo `native/target` ignorado.
No se importa confianza durante Build. La segunda build usa el mismo certificado
para permitir update. Retirar luego exactamente el certificado de prueba:

```powershell
Remove-Item -LiteralPath "Cert:/CurrentUser/My/$($first.test_certificate_thumbprint)" -DeleteKey
```

La firma local no es firma comercial, no arregla SmartScreen fuera de ese PC
y no se distribuye a usuarios. La Store gestiona su firma de producción.
[Guía oficial de firma](https://learn.microsoft.com/en-us/windows/msix/package/sign-msix-package-guide).

Comprobaciones del generador y del payload MSIX, sin permisos elevados:

```powershell
powershell -NoProfile -File native/packaging/msix/tests.ps1 `
  -ArtifactsDirectory native/target/msix-v1
```

Sin `ArtifactsDirectory` solo verifica parser y rechazos de entradas; informa
explícitamente SKIP del paquete. Con un paquete real, `makeappx unpack` comprueba
todos los hashes, inventario Cargo, identidad y capacidad mínima, sin instalarlo.

## Manifiesto y permisos mínimos

`packagedClassicApp`, `mediumIL`, Windows Desktop >= 10.0.19041, x64.
`runFullTrust` es la única capacidad restringida: necesaria para procesos
Win32 GPUI, Job Objects, ventanas transparentes/topmost/click-through, named
pipes locales y lectura de mappings del juego como usuario. No es elevación,
no da acceso a memoria privada del juego ni equivale a inyección. Es una
app empaquetada con identidad, **no AppContainer UWP**. El comportamiento
desktop conserva Win32; las ACL originales siguen siendo obligatorias.
[Modelo oficial](https://learn.microsoft.com/en-us/windows/msix/desktop/desktop-to-uwp-behind-the-scenes).

No se añaden `uiAccess`, `broadFileSystemAccess`, `internetClient`, capacidades
de red privada, elevación, servicios o autoarranque. Las capacidades de red
UWP no son necesarias para este proceso full trust. LMU REST local y mappings
LMU/ACC deben probarse con los juegos reales; declarar una capacidad no prueba
lectura ni resuelve una ACL, sesión o nivel de integridad incompatibles.
La autenticación por SID/PID/imagen de `ipc` sigue sin cambios.

Hub figura en Inicio; Runtime está oculto y se activa por AUMID con argumentos
explícitos. No añadir `--live` implícito, replay ficticio ni Engineer automático.
Hub debe conservar el flujo de producto aprobado para entrar a carrera.

## Verificación reproducible

En una consola Windows PowerShell **elevada**, para importar el CER únicamente
en `LocalMachine/TrustedPeople` (no Trusted Root). La app se activa como usuario
normal; el supervisor contiene a los hijos. El script retira la confianza que
ha añadido y desinstala solo su identidad al terminar, incluso si falla.
No reemplaza una instalación de prueba previa. Una consola sin permisos de
administrador no puede completar ese paso; conservar `verification.log`.
[Guía oficial de confianza local](https://learn.microsoft.com/en-us/windows/msix/msix-troubleshooting-guide):
App Installer consulta el almacén de máquina, no basta `CurrentUser/TrustedPeople`.

```powershell
powershell -NoProfile -File native/packaging/msix/verify.ps1 `
  -ArtifactsDirectory native/target/msix-v1 -UpdateDirectory native/target/msix-v2 `
  -TrustTestCertificate -Activate -Replay testdata/lmu-fixture.bin
```

La prueba usa una **captura real** del repo, no LMU live. Activación por
`IApplicationActivationManager`; `GetPackageFullName` comprueba identidad en
Hub, supervisor, núcleo, overlays y Engineer. El cursor real de Engineer
demuestra negociación/frame/ACK del journal desde el paquete; una ventana
abierta no demuestra fidelidad visual ni consumo del snapshot por overlays.
El estado `LocalState/msix-probe.txt` comprueba conservación al actualizar.
El script registra si queda el árbol de datos tras desinstalar. No borra
carpetas reales ni asegura limpieza de escrituras fuera del paquete.

El cursor se observa en su ruta física, incluida
`%LOCALAPPDATA%/Packages/<PFN>/LocalCache/Local/...` cuando se redirige.
Las esperas acotadas con sondeo son sincronización de procesos/ventanas de
Windows, no delays para hacer pasar tests de lógica. La prueba abre ventanas
Hub/overlay en el escritorio; ejecutarla fuera de una carrera.

Para validar live después, activar `Runtime` con argumentos del supervisor:
`--instancia <única> --engineer <cursor de prueba> -- --live --simulator lmu -- 4`,
y repetir con `acc`. Registrar GetPackageFullName, hashes, juego/build/SID,
procesos/mappings reales, revisiones crecientes y fuente Live en los consumidores.
LMU requiere también su REST local. Probar el juego al mismo nivel de integridad
que la app; no pedir elevación a la Store para sortear permisos.
Reiniciar núcleo y verificar reconexión; comprobar OBS/click-through/transparencia,
voz opt-in y cierre de Engineer, overlays y núcleo. **No crear mappings falsos
para sustituir la prueba live.** Repetir en Windows limpio/otra GPU.

## Cambios frente a instalador y portable actuales

El instalador Wails/NSIS vigente instala por usuario en
`%LOCALAPPDATA%/Programs/<producto>` o por máquina en `Program Files`, según
`WAILS_INSTALL_SCOPE`; crea accesos directos. El producto Go guarda configuración
instalada en `%APPDATA%/Vantare/configs` y sesiones/logs en
`%LOCALAPPDATA%/Vantare`. Su updater descarga releases GitHub y ejecuta
`vantare-installer.exe`. El launcher registra autoarranque por perfil en
`HKCU/Software/Microsoft/Windows/CurrentVersion/Run`, con `--launch=<perfil>`.
El MSIX nativo no incorpora esos componentes Go ni migra esas entradas/datos.
Un reemplazo completo debe retirar el autoarranque antiguo con consentimiento
y usar StartupTask para el nuevo; no dejar el updater NSIS apuntando a WindowsApps.
Evidencia del checkout: [NSIS](https://github.com/isaacalbala12/Vantare-Simracing-Suite/blob/5e1da3f68f9735d60057b61798d55849bbca0677/vantare-v2/build/windows/nsis/project.nsi),
[rutas de datos](https://github.com/isaacalbala12/Vantare-Simracing-Suite/blob/5e1da3f68f9735d60057b61798d55849bbca0677/vantare-v2/cmd/vantare/main.go),
[updater](https://github.com/isaacalbala12/Vantare-Simracing-Suite/blob/5e1da3f68f9735d60057b61798d55849bbca0677/vantare-v2/internal/updater/updater.go),
[autoarranque](https://github.com/isaacalbala12/Vantare-Simracing-Suite/blob/5e1da3f68f9735d60057b61798d55849bbca0677/vantare-v2/internal/app/launcher/autostart_windows.go).

La comparación del candidato **nativo** ya existente es:

| Tema | Candidato ZIP/instalador script | MSIX/Store |
| --- | --- | --- |
| Binarios | Carpeta elegida, generaciones y puntero `state.json` | WindowsApps administrado por Windows, árbol de paquete de solo lectura |
| Datos | `data` por generación; rollback del conjunto binarios/datos | Virtualización AppData/registro por identidad; update conserva estado, no guarda una generación de datos para rollback |
| Datos existentes | Importación explícita por copia | En Windows moderno, escrituras a ficheros existentes reales de AppData pueden permanecer fuera de virtualización; no asumir migración/aislamiento ni borrar Wails |
| Autoarranque | No instalado en este candidato | No declarado; futura integración usa StartupTask y decisión del usuario, nunca escribir Run/Startup como atajo |
| Update | `candidate.ps1 Update/Rollback` offline | Store despliega versiones crecientes y actualizaciones; no ejecutar updater propio contra WindowsApps |
| Downgrade | Selecciona generación anterior | No prometer rollback de datos/binarios; corrección Store con versión superior y contrato de compatibilidad de datos |
| Desinstalación | Generaciones conservadas explícitamente | Windows elimina payload y estado redirigido; escrituras externas/exportaciones pueden quedar y necesitan política propia |
| Canales/licencia | Canal explícito no autoriza acceso | Store no reemplaza entitlements del núcleo/Hub; usar audiencias/flight de prueba y conservar autoridad de promociones |

Son las reglas MSIX, no una migración de producto ejecutada en este cambio.
[Virtualización/actualización/desinstalación](https://learn.microsoft.com/en-us/windows/msix/desktop/desktop-to-uwp-behind-the-scenes).
El updater propio y rutas de persistencia necesitan aceptación de los propietarios
antes de un envío: no se modifica producto para resolverlos aquí.

## Guía de envío para Isaac (no ejecutada)

1. Abrir [Store Developer](https://storedeveloper.microsoft.com/), usar una
   cuenta Microsoft personal y elegir alta individual si corresponde.
   Completar datos reales y verificación de identidad en el portal; no entregar
   documentos personales/credenciales a un agente. Confirmar que muestra coste
   cero. Las reglas de tipo de cuenta y actividad deben revisarse al darse de alta.
2. Entrar en [Partner Center](https://partner.microsoft.com/dashboard), Apps
   and games → New product → **MSIX or PWA app**. Reservar el nombre libre.
   No elegir EXE/MSI. Product management → Product identity: copiar
   `Package/Identity/Name`, `Package/Identity/Publisher`, `PublisherDisplayName`
   y nombre reservado, respetando mayúsculas.
3. Compilar el SHA aceptado en Release. Generar una salida nueva con
   `build.ps1 -BuildProfile Release -Version 1.0.0.0 -IdentityName <valor>`
   `-Publisher <valor> -DisplayName <nombre> -PublisherDisplayName <valor>`
   **sin `-TestSign`**. Mantener último componente de versión en 0 para envío
   Store y aumentar versión en cada envío. No enviar identidad local, CER,
   clave privada, fixtures ni evidencias de desarrollo.
4. Probar esa distribución en Windows limpio: resolver dependencias MSVC/ICU
   según imports y licencias (framework VCLibs o redistribución app-local
   revisada). Este manifiesto no descarga ni declara runtimes sin verificarlos.
   Revisar notices GPUI y restantes dependencias; Inter sola no es suficiente.
   Ejecutar WACK instalado: `appcert.exe test -appxpackagepath <msix>`
   `-reportoutputpath <ruta.xml>`. Revisar resultado y repetir pruebas físicas.
5. Start submission: elegir disponibilidad/audiencia restringida para validar,
   subir MSIX en Packages, completar precio/mercados, propiedades, categorías,
   clasificación IARC, descripción, capturas de producto final, privacidad y
   soporte. No prometer paridad aún pendiente ni usar capturas de otro producto.
6. Explicar `runFullTrust` en Notes for certification: app desktop GPUI con
   supervisor y procesos separados, overlays fuera del juego, lectura de
   interfaces públicas de telemetría local sin inyección, ACL de usuario,
   Engineer opt-in. Proporcionar pasos y requisitos LMU/ACC y acceso de prueba
   si hay funciones protegidas. Declarar dependencias y limitaciones reales.
7. Revisar certificación, crash/hang, permisos mínimos, compatibilidad Windows,
   privacidad, derechos de assets y comportamiento del launcher de terceros.
   Enviar solo tras aceptación/autorización de Isaac; la Store decide aprobación
   de capacidades y firma. Revisar las políticas **vigentes al envío**: la página
   consultada ya anuncia 7.20 con entrada en vigor el 22-10-2026.
8. Tras aprobación, verificar instalación desde Store, firma Microsoft,
   versión/identidad final, update y desinstalación con datos de prueba. La
   aceptación de esta rama no autoriza publicar ni saltar nightly/testers/master.

[Flujo oficial Partner Center](https://learn.microsoft.com/en-us/windows/apps/publish/get-started),
[requisitos MSIX](https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msix/app-package-requirements),
[políticas Store](https://learn.microsoft.com/en-us/windows/apps/publish/store-policies).

## Firma de pago fuera de la Store

Azure **Artifact Signing**, antes Trusted Signing, anuncia Basic ~10 USD/mes;
consultar precio/impuestos/cuota en el portal antes de contratar. Es firma
administrada de MSIX/EXE fuera de Store, no una compra realizada aquí.
[Opciones oficiales de firma](https://learn.microsoft.com/en-us/windows/msix/package/signing-package-overview),
[tarifa Azure](https://azure.microsoft.com/en-us/pricing/details/artifact-signing/).

Límite relevante para Isaac: la validación Public Trust de **individuos** está
limitada a EE. UU./Canadá según el quickstart actual. Un individuo en España
no debe dar por hecho que puede contratarla. Organizaciones elegibles tienen
otros países/requisitos; no crear una entidad ni falsear ubicación para firmar.
[Elegibilidad oficial](https://learn.microsoft.com/en-us/azure/artifact-signing/quickstart).
Alternativa OV de CA suele costar 300–500 USD/año; verificar oferta, hardware
y elegibilidad. Ninguna firma fuera de Store garantiza reputación SmartScreen
instantánea. La alternativa sin coste aquí sigue siendo Store con MSIX.

## Handoff y evidencia local

Entorno observado: Windows 11 Pro x64, build 26200, PowerShell 5.1 para scripts,
SDK/WACK 10.0.26100 instalado. Sin privilegios de administrador en esta sesión.

- `cargo fmt --check`: PASS, exit 0.
- `cargo test --workspace -j 2`: PASS, exit 0. 620 tests estándar + 11 escenarios
  lifecycle, 0 fallos y 4 tests físicos ignorados (LMU REST, dos lecturas LMU
  shm y ACC live). Compilación inicial: 25 min 42 s; no es medición de producto.
- Primer Clippy: fallo de recursos al compilar `windows`,
  `memory allocation of 138412048 bytes failed` / `0xc0000409`.
  Isaac confirmó falta de memoria del sistema y ampliación de memoria virtual.
  No se tocó producto para sortearlo. Repetición
  `cargo clippy --workspace --all-targets -j 2 -- -D warnings`: PASS, exit 0,
  sin warnings; 17 min 36 s. Siempre un máximo de dos jobs por comando.
- `cargo build --workspace --bins --locked --offline -j 2`: PASS, exit 0.
  SDK validó el manifiesto y creó los dos MSIX; SignTool firmó ambos con el
  mismo certificado local. Perfil Debug, diez ejecutables nativos, 15 ficheros
  de payload; no certificación Release. `source_dirty=true`, SHA fuente de la
  base asignada: los scripts/docs aún no tenían commit durante esa build.
- PowerShell 5.1: 12 PASS de parser/negativos; **34 PASS por cada MSIX real**,
  exit 0, incluidos desempaquetado SDK, hashes e inventario de binarios.
- `verify.ps1 -TrustTestCertificate -Activate` con v1/v2 y captura real:
  exit 1, **BLOCKED** al importar `LocalMachine/TrustedPeople`,
  `E_ACCESSDENIED (0x80070005)`. Identidad real del paquete y CER: PASS antes
  de ese bloqueo. SignTool `/pa /v`: exit 1, únicamente cadena autofirmada
  no confiable; no se afirma verificación de firma confiable.
- **No ejecutados por el bloqueo:** instalación, activación Vantare empaquetado,
  Hub/overlays/núcleo/Engineer, named pipes bajo esa identidad, update y
  desinstalación. Memoria compartida LMU/ACC live tampoco probada: no había
  proceso de juego disponible en la sesión reanudada. WACK, Windows limpio,
  Release y certificación Store pendientes. Repetir el comando elevado de
  arriba; los MSIX y CER público conservados permiten repetir Verify sin clave.
- Limpieza de esta ejecución: eliminado el certificado exacto de
  `CurrentUser/My` **con su clave**; ninguna confianza añadida a máquina y
  ninguna identidad `Vantare.Native.LocalTest` instalada. Esto prueba limpieza
  de nuestros artefactos de firma, no desinstalación de una app instalada.
- Helper C# compila; GetPackageFullName identifica PowerShell Store y distingue
  Explorer sin identidad (15700). No equivale al arranque de Vantare MSIX.

Artefactos locales ignorados (no enviar a la Store):

| Paquete | Bytes | SHA256 |
| --- | ---: | --- |
| `native/target/msix-v1/vantare-native-0.1.0.0-x64.msix` | 49953757 | `c912e7c750888f92df8656cc13ccab58b643d8aa6cc5a1019850c8ccb0d62b87` |
| `native/target/msix-v2/vantare-native-0.1.0.1-x64.msix` | 49953759 | `0b374f3931f1946cf99799bc8f8a035c8aa4d450efad9a2070a333536fc403c8` |

Logs locales ignorados en `native/target/msix-gates/`: `fmt.log`, `clippy.log`,
`test.log`, `build-v1.log`, `build-v2.log`, `script-preflight.log`,
`script-package-v1.log`, `script-package-v2.log`, `verify.log`, `signature.log`,
`cleanup.log`. Cada salida conserva `build-evidence.json`; v1 conserva también
`verification.log`. Sin claves privadas en archivos ni Git. Tras retirar la
clave, una nueva build/update exige generar una nueva pareja de paquetes.
El orquestador incorpora resultados al único handoff del proyecto y reconcilia
Notion cuando vuelva a estar disponible. No se cierra la fase 7 completa.

Decisiones pendientes para el orquestador/Isaac, sin bloquear este tooling:

- Nombre/identidad Store y tipo de cuenta adecuado para la actividad real.
- Distribución MSVC/ICU y notices en un Windows limpio, antes de certificar.
- Contrato de actualización/migración de datos compatible con la Store;
  `candidate.ps1 Rollback` no se aplica al MSIX.
- Ventana de prueba física LMU/ACC/OBS y canal/audiencia autorizados para el envío.
