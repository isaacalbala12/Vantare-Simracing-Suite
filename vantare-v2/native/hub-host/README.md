# Anfitrión del Hub web — ADR 0107 / VANTA-138

Proceso Rust sin GPUI que conserva la identidad `vantare-hub.exe` ante el núcleo.
Cargo produce `vantare-hub-host.exe` para evitar colisionar con el Hub congelado;
la preparación de QA lo copia como `bin/vantare-hub.exe`. Todavía no sustituye al
Hub distribuido. No cambia el núcleo, sus servicios ni sus derechos.

Electron se instala en `hub-ui/vantare-hub-ui.exe`, junto a `bin` dentro de la
generación. Fuera de una instalación se admite `VANTARE_HUB_UI` con una ruta
absoluta de QA; `dev` usa el Electron local de `hub-web`. El renderer no recibe
rutas, credenciales ni acceso directo al sistema de archivos.

## Puente y ciclo de vida

El experimento de stdio en Windows y la alternativa están conservados en
`D:/VantareServer/evidence/hub-web/stdio-probe`. Se usa el plan B: pipe privado,
nombre aleatorio, ACL del usuario actual, rechazo de clientes remotos, primer
servidor exclusivo y comprobación de PID e imagen del hijo. La autenticación
usa un valor aleatorio de un solo arranque que Electron elimina del entorno
antes de crear el renderer. No se registra el valor.

El formato es JSON precedido por longitud u32 little endian, máximo 1 MiB.
`protocol.rs` genera `hub-web/src/contract/generated/contract.ts` mediante
`ts-rs = 12.0.1`. El test de bindings compara el archivo completo y falla si
alguien cambia Rust sin regenerar TypeScript. Los dos extremos validan mensajes.
El núcleo simulado comparte el contrato y solo se activa explícitamente.

El anfitrión abre las fotos con demanda vacía, los derechos con `Feed` y los
servicios del supervisor con `Probe`. Con demanda vacía el pipe de fotos solo
entrega latidos: Live se lee de `Policy.live` en el Feed autenticado, calculado
por el núcleo con el predicado oficial de dominio. Una desconexión retira la conexión y los
derechos de la vista; no concede permisos por ausencia de datos. Las operaciones
no idempotentes no se reenvían automáticamente. `--control-stdin` conserva el
cierre por EOF. Electron confirma el cierre cuando terminan las solicitudes
pendientes; un error de guardado puede cancelar el cierre por ventana o Live. En EOF el
anfitrión aplica un límite de dos segundos para un renderer bloqueado. Una
entrada en Live cierra el Hub. `hub-ready` solo se publica tras mostrar la ventana.

## Comprobaciones locales

Desde `vantare-v2`, con target propio en D: y a través de la cola:

```powershell
$env:CARGO_TARGET_DIR = 'D:\VantareServer\targets\isa-1995-puente'
pwsh -NoProfile -File native/scripts/compilar.ps1 pwsh -NoProfile -File native/hub-host/check.ps1
```

Para regenerar tipos, sustituir el script final por `regenerate-and-check.ps1`.
Este actualiza los bindings y luego ejecuta las mismas comprobaciones.
`check.ps1` usa `qa-e2e` para la automatización local: activa CDP de Chromium
solo en loopback. **Ese feature no se habilita en distribución.** No abre el
inspector de Node ni cambia los fuses cerrados.

Desde `hub-web`, tras compilar y empaquetar la interfaz con
`VANTARE_HUB_QA_BUILD=1` (copia separada `release/package-qa`):

```powershell
node --experimental-strip-types scripts/smoke-host.ts
node --experimental-strip-types scripts/smoke-core.ts
```

El primer smoke crea una generación nueva bajo `D:/VantareServer/qa`, verifica
el arranque sin núcleo, aislamiento, señal de listo y cierre por EOF. El segundo
requiere `vantare` y `vantare-core` compilados con el feature existente `qa-e2e`;
crea su propia raíz bajo `qa/licencias-e2e`, una captura local y endpoints HTTP
loopback que responden sin cuentas. No usa servicios reales. Su overlay auxiliar
solo conserva abierto stdin; la admisión se comprueba contra supervisor y núcleo
reales. Los resultados y capturas se escriben en `evidence/hub-web/puente`.

Windows 10 22H2 sigue pendiente de una máquina o VM de Isaac: ejecutar ambos
smokes, comprobar el foco y cierre nativo, cambiar escala al 125/150 % y guardar
las capturas junto con versión de Windows, SHA y resultados. No afirmar soporte
probado en Windows 10 a partir de la ejecución del servidor.
