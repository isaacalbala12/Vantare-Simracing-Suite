# Sonda de procesos de licencias (VANTA-126 / #1827)

`license-process-probe.py` ejecuta binarios Windows normales compilados desde
nightly, con una clave pública de fixture y **sin cuenta/backend configurados**.
No sustituye una prueba E2E de emisión, identidad, Feed ni renovación.

Solo acepta checkout, binarios y datos bajo
`D:/VantareServer/qa/licencias-e2e`. Crea una subcarpeta nueva por ejecución,
inyecta las raíces native/LocalAppData/AppData y los temporales, y usa pipes
únicos. No abre documentos de la instalación real. El nonce de IPC queda en
memoria; el resultado guarda solo campos permitidos y hashes de binarios.

Preparar el worktree desde la revisión de nightly que se quiera probar. Desde
`vantare-v2/`, en un proceso con los tres overrides QA y TEMP/TMP aislados:

```powershell
$env:CARGO_TARGET_DIR = 'D:/VantareServer/qa/licencias-e2e/target'
$env:CARGO_BUILD_JOBS = '2'
$env:VANTARE_BUILD_CHANNEL = 'nightly'
# Clave pública del vector de prueba RFC8032, sin clave privada.
$env:VANTARE_LICENSE_PUBLIC_KEYS = 'qa-rfc8032:11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo'
# No configurar VANTARE_CLERK_*, VANTARE_SUPABASE_* ni VANTARE_ACCOUNT_BRIDGE_URL para esta sonda.
pwsh -NoProfile -File native/scripts/compilar.ps1 cargo build --locked --manifest-path native/Cargo.toml -p vantare-runtime -p vantare-services --bin vantare --bin vantare-core --bin vantare-services -j 2
```

Desde la raíz Git:

```powershell
python tools/qa/license-process-probe.py --bin-dir D:/VantareServer/qa/licencias-e2e/target/debug --checkout D:/VantareServer/qa/licencias-e2e/checkout --qa-root D:/VantareServer/qa/licencias-e2e
```

La sonda comprueba versiones y hashes de los tres ejecutables, Status y
AccountPoll por IPC autenticado con `vantare-services`, y dos arranques del
núcleo real con un authority deliberadamente dañado. Exige cuarentena única,
guarda de recuperación, proceso disponible y cierre por EOF con código cero.
No descifra la autoridad; no concede acceso ni promete recuperación online.
El supervisor `vantare` solo se ejecuta con `--version`: no se prueba el Hub,
los overlays, una carrera Live ni el conjunto supervisado.

Status debe confirmar que la cuenta no está configurada antes de AccountPoll.
El núcleo usa replay local. La sonda conserva los fallos y datos de cada intento
para su inspección; no borra ni reutiliza un perfil anterior. Una espera acotada
observa la disponibilidad de pipe/archivos, sin cambiar el reloj del equipo.

El backend local completo requiere además identidad falsa, emisión firmada,
webhook simulado, Feed y control de reloj para los binarios normales. El opt-in
HTTP y los relojes actuales de `test-support` solo sirven para los harness de
biblioteca; activarlos no convierte esa evidencia en una ejecución E2E del
producto distribuido.
