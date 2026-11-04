# Licencias E2E locales — VANTA-126 / #1916

Solo Windows, en un checkout propio bajo `D:/VantareServer/qa/licencias-e2e`.
No usa cuentas reales, servicios cloud ni la instalación real. La feature
`qa-e2e` está apagada por defecto. No distribuir estos ejecutables.

El script de build crea raíces propias e inyecta la configuración de fixture
sólo en el entorno del proceso hijo de `compilar.ps1`. No exportar claves en
la sesión de PowerShell:

```powershell
python tools/qa/build-license-e2e.py --checkout D:/VantareServer/qa/licencias-e2e/qa-e2e-checkout --target D:/VantareServer/qa/licencias-e2e/target-1916
```

La clave de firma de licencia QA es fija en el repo: el vector de prueba público RFC8032, no una clave efímera. La Edge local firma con ese
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
reutiliza `lmu-fixture.bin` para Live/Paused/Waiting. El Feed no tiene interruptor QA ni reloj de frescura artificial adicional.

`VANTARE_QA_ROOT` exige marcador `qa-e2e-owned`; las tres raíces inyectadas
deben ser sus subdirectorios. `VANTARE_QA_CLOCK` debe estar dentro de esa raíz.
Los endpoints `VANTARE_QA_LICENSE_URL`, `VANTARE_QA_IDP_URL` y
`VANTARE_QA_REDIRECT_URL` sólo admiten HTTP IPv4 loopback. Sin la feature no
existen esas lecturas ni el modo `--qa-e2e`/`--qa-e2e-probe`.

El reloj mantiene avance real y permite desplazamientos **independientes** de pared y monotónico;
no modifica el del equipo. La sustitución del documento es atómica y reintenta
únicamente la colisión de compartición de Windows/WSL, con límite de cinco
segundos. No reintenta ni oculta errores del Store de producto.

Se guardan Policy, resultados tipados, hashes de binding sintético y logs
sanitizados. El caso de red corta un listener TCP separado, comprueba desconexión
sin respuesta HTTP y conserva el binding y la gracia; los 503 de otros casos simulan backend
indisponible. Se registran PID y nombres de los tres procesos. No guardar stdout completo del conductor: AccountCopyLink lleva
estado OAuth transitorio. `qa-e2e-ready.json` contiene sólo una clave JWT efímera
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

Revisión de seguridad: el empaquetado limpia todas las variables VANTARE_ antes
cargar configuración explícita; analiza cada EXE, incluidos Setup/Uninstall y
MSIX, buscando feature, identificadores QA y clave pública de fixture (texto y
bytes). El gate prueba deliberadamente un entorno heredado contaminado.

El backend normaliza rutas con realpath antes de comprobar límites, arranca con
env limpio, restringe los nombres permitidos en Deno y protege /qa/* con token
aleatorio de cada ejecución. PostgreSQL y su clave efímera viven en volumen
ext4 de postgres con permisos 0700; no hay chmod 777.

El caso 7 acredita checkout sin concesión inmediata y llegada de Pro mediante
Feed fresco real. **No verifica la exclusividad de confirmación en la UI**:
se marca NO VERIFICABLE para esa afirmación. Se añaden tres negativos reales:
firma manipulada, credencial firmada para otro dispositivo y retroceso sólo de
pared. El caso 9 adelanta pared 72 h sin renovar, luego sólo el monotónico hasta
24 h. El caso 5 comprueba ausencia del binding al recibir éxito y restauración
tras matar el proceso, y observa B→Pro sin Founders.

El gate valida tres condiciones deterministas, sin buscar parejas de claves por
regex dentro de `.rdata`:

1. Cada clave del registro configurado tiene su SHA-256 en
   `native/packaging/production-license-keys.sha256`. Para un registro configurado,
   lista vacía, ausente o malformada es error. El smoke de CI sin registro no
   configura ninguna autoridad y no representa un RC de producto.
2. `vantare-core` y `vantare-services` deben contener literalmente el registro
   configurado completo. Son los dos EXE que lo embeben; el supervisor `vantare`
   no lo embebe. La comparación no necesita límites entre cadenas adyacentes.
3. Todos los EXE se revisan contra los marcadores QA y cada clave de
   `native/packaging/known-test-license-keys`, tanto base64url como bytes crudos,
   mediante búsqueda literal sin límites de palabra. Los nuevos fixtures fijos
   deben añadir su pública a esa lista versionada.

Antes del próximo RC, **Isaac debe añadir la(s) huella(s) de producción** a la
lista mediante review. Sigue vacía y deniega cualquier registro configurado.
El agente no consulta configuración real ni claves privadas. Para calcular la
huella de una clave pública configurada, Isaac prepara un fichero que contenga
sólo `kid:base64url` (o sólo base64url) y ejecuta desde la raíz del repo:

```powershell
Get-Content -LiteralPath 'C:/ruta/public-license-key.txt' -Raw | pwsh -NoProfile -File vantare-v2/native/packaging/license-key-fingerprint.ps1
```

La salida contiene únicamente SHA-256 en hexadecimal sobre los 32 bytes de la
clave pública, una huella por línea si el registro contiene varias parejas
separadas por comas. No lee variables de entorno, `.env` ni configuración de
build, no imprime clave/kid y no modifica la lista. Entrada inválida produce
salida estándar vacía y código distinto de cero.

La regresión local usa ficheros de bytes: registro aprobado presente/ausente,
clave fuera de lista, claves QA pegadas a texto, listas inválidas y `Status`
de serde. **El control de EXE limpio real queda en la CI de `distribution`**,
junto al EXE QA real, después de compilar los controles y el paquete normal.
