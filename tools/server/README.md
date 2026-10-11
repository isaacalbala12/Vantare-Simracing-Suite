# Servidor Vantare · 192.168.1.57 «SapphireOS»

Runbook del PC dedicado: runners propios (#1565), Plane CE (#1571) y publicador
del roadmap (#1535, script en `tools/server/roadmap/`). Windows 11 Pro 22631
SapphireOS (build recortada), Ryzen 5 1500X, 16 GB. Acceso: `ssh Administrator@192.168.1.57`,
solo con clave y solo desde 192.168.1.0/24. Sin secretos en este directorio.

## Piezas

| Pieza | Dónde | Arranque sin sesión |
|---|---|---|
| Runner Windows | servicio `actions.runner.*` como `vantare-ci`, `C:\VantareCI\runner` | servicio automático |
| Runner Linux | distro WSL `vantare-ci` (6 GB, 4 CPU, 4 GB swap; sin automount ni interop), `/opt/vantare-runner` | tarea `\Vantare\WSL-vantare-ci` + systemd |
| Plane CE v1.4.2 | distro WSL `vantare-svc` (3 GB, 2 CPU, 3 GB swap, red mirrored), `/opt/plane`, `http://192.168.1.57:8088` | tarea `\Vantare\WSL-vantare-svc` + `vantare-plane.service` |
| Roadmap | `vantare-svc`, usuario `roadmap`, `vantare-roadmap.timer` (cada 6 h, min 17) | systemd |
| Copias | `vantare-plane-backup.timer` 03:30 → `/var/backups/plane` y `C:\VantareServer\backups\plane` (14 días) | systemd |
| Copia externa | PC principal: tarea `Vantare-PullServerBackups` 04:00 → `%USERPROFILE%\Backups\VantareServer\plane` (30 días) | al iniciar sesión si se perdió |
| Supervisión Plane | `vantare-plane-health.timer` (5 min): 3 fallos → reinicia la stack; latido `C:\VantareServer\heartbeat\plane.txt` | systemd |
| Supervisión | tarea `\Vantare\Health` (SYSTEM, cada 5 min): distros, latido, runner (prioridad BelowNormal), disco → `C:\VantareServer\logs\health-AAAA-MM.log` | al arrancar |
| Pantalla | SapphireOS abre sesión de Administrator al arrancar (svchost, no Winlogon); `\Vantare\LockAtLogon` la bloquea al instante | al iniciar sesión |

WSL mirrored no expone Plane al resto de usuarios de Windows (ni 127.0.0.1 ni la IP LAN
desde el propio host); por eso la comprobación de Plane vive dentro de su distro.

Cada cuenta Windows (`vantare-ci`, `vantare-svc`, sin administrador) tiene su propia
VM WSL y su `.wslconfig`: un job de CI no ve la BD de Plane ni los secretos del roadmap.

## Orden de montaje (ya aplicado el 2026-10-11)

1. BIOS: SVM Enabled; recomendado «Restore after AC Power Loss = Power On» y ErP Disabled.
2. `windows/setup-base.ps1`: red Privada, cortafuegos solo LAN (22 y 8088), sshd solo clave,
   autologon off, Windows Update domingo 05:00 (la política solo admite horas enteras), pagefile 8 GB.
3. Crear `vantare-ci` y `vantare-svc` (Usuarios estándar). `windows/setup-virtualization.ps1`:
   SapphireOS deja deshabilitados vdrvroot, Vid, hvservice, HvHost, NdisVirtualBus, W32Time y
   VaultSvc, y no da «iniciar sesión como proceso por lotes»; reinicia. Valores previos en
   `C:\VantareServer\logs\services-reenabled.txt`.
4. WSL 3.0.1 (MSI oficial) e imagen Ubuntu 24.04 de Canonical, ambas con SHA256 fijado.
5. `windows/Invoke-AsUser.ps1` ejecuta como la cuenta de servicio `linux/setup-ci.sh` y
   `linux/setup-svc.sh` + `setup-svc-2.sh`; `windows/install-ci-prereqs.ps1` instala
   PowerShell 7, Git, gh, Python, VS Build Tools C++ y rustup (SHA256/firma).
6. `windows/setup-layout.ps1`: ACL, plantilla de secretos, Hyper-V firewall 8088 LAN,
   `C:\VantareCI`, variables ACTIONS_RUNNER_HOOK_*, tarea Health. Copia los hooks de `tools/ci-runners`.
7. `windows/register-keepalive.ps1` por cuenta.

## Credenciales

Hasta que Isaac fije las suyas, las contraseñas de las cuentas de servicio son aleatorias,
solo en memoria y en el almacén de Windows de cada tarea. Isaac, en PowerShell **administrador
local**: `& C:\VantareServer\ops\Set-VantareCredential.ps1 -User vantare-ci` (y `vantare-svc`);
actualiza tareas y servicio. Después `Invoke-AsUser.ps1` se niega a rotar esa cuenta.
Secretos de Plane: `/opt/plane/plane.env` (600, generado en el servidor). Roadmap:
`C:\VantareServer\secrets\roadmap.env` (ACL Administradores + vantare-svc).

## Operación

- Plane: `wsl -d vantare-svc -u root -- systemctl status vantare-plane` (como vantare-svc).
- Actualizar Plane: copia manual (`systemctl start vantare-plane-backup`), cambiar
  `APP_RELEASE` y los ficheros oficiales de la nueva release con su SHA256, `systemctl restart vantare-plane`.
  Rollback: versión anterior + `pg_restore` de la copia si hubo migración. Nunca borrar volúmenes.
- Restaurar: `tar --zstd -xf plane-*.tar.zst` → `plane.dump` (`pg_restore -c`), `uploads.tar`
  (volumen `vantare-plane_uploads`), `plane.env`.
- Pausar runner Windows: `C:\VantareCI\ops\control-windows.ps1 -Operation Pause`.
- IP por DHCP sin reserva: si cambia, actualizar `APP_DOMAIN`/`WEB_URL`/`CORS_ALLOWED_ORIGINS`
  de `plane.env` y el host de la tarea del PC principal.

## Medidas (2026-10-11, nightly ee372540, ambos smokes a la vez, en frío)

- Linux (WSL `vantare-ci`): quality tests, fmt, check 1386 s, clippy 58 s, nextest 534 s,
  telemetría 1125 s, lifecycle 10 s — **todo PASS**. `target` 8,6 GB + `~/.cargo` 1,3 GB.
- Windows (`vantare-ci`): fetch, DuckDB, fmt, gates check 332 s, clippy 83 s, lifecycle 15 s,
  telemetría 1290 s, retirement — PASS; **gate test: 1 fallo** (ver abajo).
- RAM libre del host durante ambos: mínimo 1,27 GB, media 4,9 GB; CPU al 100 % en compilación.
  Plane en reposo ≈ 1 GB dentro de su VM de 3 GB.

### Fallo de producto detectado en el runner Windows

`vantare-hub analysis::tests::recorded_database_smoke_reads_real_storage_pages_without_changing_original`
falla aquí y pasa en `windows-latest` (mismo SHA). En este equipo DuckDB informa del bloqueo
con el mensaje genérico de Windows («The process cannot access the file because it is being
used by another process») y `storage/src/inspection.rs::open_error` solo reconoce
«could not set lock», «conflicting lock» y «File is already open in». El Hub mostraría
«ilegible» en lugar de «bloqueada» en equipos así. Arreglo propuesto (issue aparte): tratar
también ERROR_SHARING_VIOLATION / ese texto como `locked`.
