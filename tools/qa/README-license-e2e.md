# Licencias E2E locales — VANTA-126 / #1916

Solo Windows, en un checkout propio bajo `D:/VantareServer/qa/licencias-e2e`.
No usa cuentas reales, servicios cloud ni la instalación real. La feature
`qa-e2e` está apagada por defecto. No distribuir estos ejecutables.

Antes de ejecutar, compilar por `native/scripts/compilar.ps1` con target propio
y `-j 2`, desde `vantare-v2/`, manteniendo native/LocalAppData/AppData y TEMP/TMP
bajo QA. Variables **públicas de fixture** de esa compilación:

```powershell
$env:VANTARE_BUILD_CHANNEL='nightly'
$env:VANTARE_BILLING_ENVIRONMENT='sandbox'
$env:VANTARE_LICENSE_PUBLIC_KEYS='qa-rfc8032:11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo'
pwsh -NoProfile -File native/scripts/compilar.ps1 cargo build --locked --offline --manifest-path native/Cargo.toml -p vantare-runtime -p vantare-services --features vantare-runtime/qa-e2e --bin vantare --bin vantare-core --bin vantare-services --target-dir D:/VantareServer/qa/licencias-e2e/target-1916 -j 2
```

La clave es el vector de prueba público RFC8032. La Edge local firma con ese
vector; el núcleo conserva su verificador Ed25519 y binding de dispositivo
reales. No importar claves de producción ni modificar el trust store.

Prerrequisitos locales del runner: WSL `vantare-inferencia`, PostgreSQL 16 con
pgTAP en `/usr/lib/postgresql/16/bin`, usuario `postgres`, soporte ext4 loop;
Deno 2.7.13 en `qa/tools/deno-2.7.13/deno`. El script descarga PostgREST 16.1
con el hash fijado por la CI existente y prepara dependencias Deno. El runtime
Deno recibe permiso de red sólo para `127.0.0.1`.

```powershell
python tools/qa/license-e2e.py --checkout D:/VantareServer/qa/licencias-e2e/qa-e2e-checkout --bins D:/VantareServer/qa/licencias-e2e/target-1916/debug
```

Cada ejecución crea `e2e-1916-<uuid>` con casos nuevos, sin reutilizar datos
de usuario. Levanta PostgreSQL/PostgREST mediante el harness comercial real,
las Edge y el IdP falso en Deno loopback. El IdP valida PKCE. El conductor usa
copiar enlace y el callback reales sin abrir el navegador del servidor.
El supervisor ejecutable posee el Job, el núcleo ejecutable y el helper
ejecutable. Se consumen el Host/Renewal y el Feed reales; el adaptador QA
reutiliza `lmu-fixture.bin` para Live/Paused/Waiting.

`VANTARE_QA_ROOT` exige marcador `qa-e2e-owned`; las tres raíces inyectadas
deben ser sus subdirectorios. `VANTARE_QA_CLOCK` debe estar dentro de esa raíz.
Los endpoints `VANTARE_QA_LICENSE_URL`, `VANTARE_QA_IDP_URL` y
`VANTARE_QA_REDIRECT_URL` sólo admiten HTTP IPv4 loopback. Sin la feature no
existen esas lecturas ni el modo `--qa-e2e`/`--qa-e2e-probe`.

El reloj mantiene avance real más desplazamientos QA de pared/monotónico;
no modifica el del equipo. La sustitución del documento es atómica y reintenta
únicamente la colisión de compartición de Windows/WSL, con límite de cinco
segundos. No reintenta ni oculta errores del Store de producto.

Se guardan Policy, resultados tipados, hashes de binding sintético y logs
sanitizados. El caso de red corta un listener TCP separado, comprueba desconexión
sin respuesta HTTP y conserva el binding y la gracia; los 503 de otros casos simulan backend
indisponible. Se registran PID y nombres de los tres procesos. No guardar stdout completo del conductor: AccountCopyLink lleva
estado OAuth transitorio. `qa-e2e-ready.json` contiene sólo una clave efímera
de la base local y no es evidencia para adjuntar. Las cuentas y concesiones
son fixtures; el webhook firmado se procesa mediante los handlers y SQL reales.
El checkout devuelve una URL sintética válida, que nunca se abre ni contacta
con Polar. No se ejecuta el renderer del Hub ni un simulador físico.

El resultado está en `results.json` e `INFORME.md` de la ejecución; un fallo
de caso, cierre o metadatos de la carpeta real da salida distinta de cero.
Las esperas son barreras acotadas de proceso/IPC, no esperas de 24 horas.
Los fallos de producto se reproducen y reportan aparte, sin arreglarlos aquí.

Distribución: desde `vantare-v2/`, por la cola:

```powershell
pwsh -NoProfile -File native/scripts/compilar.ps1 pwsh -NoProfile -File native/gates.ps1 -Gate distribution -TargetDirectory D:/VantareServer/qa/licencias-e2e/target-1916
```

Ese gate construye los tres controles negativos QA **optimizados**, exige que
el escáner los rechace y compila/empaqueta después el inventario release real
sin QA. El constructor rechaza features QA resueltas y examina los bytes de
cada EXE antes de copiarlo al payload. La CI invoca el mismo gate.
