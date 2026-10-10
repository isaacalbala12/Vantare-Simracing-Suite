# #1565 · runners exclusivos y transición a Free privado

Preparado, **no instalado ni registrado**. Plan aprobado por el orquestador:
la instalación espera la señal explícita **PC listo** de Isaac.
No activar ningún runner mientras el repositorio siga público.

Propuesta actualizada: el PC **192.168.1.57 se reinstala con Windows** y será
el runner Windows principal; NO instalar CI en el PC de juego de Isaac.
GitHub Actions Runner **2.338.0** x64 en `C:/VantareCI/runner`, cuenta local
`vantare-ci` sin administrador. Runner Linux candidato dentro de WSL2 Ubuntu
24.04 en ese mismo PC, `/opt/vantare-runner`, cuenta Linux `vantare-ci` sin sudo.
El script Windows exige nombre de equipo esperado para evitar el PC de juego.
Descargar solo assets oficiales y comprobar sus SHA256 fijados.
El operador privilegiado prepara cuenta/directorio; el proceso de jobs no recibe
privilegios de instalación. Linux necesita WSL2/VM dedicada Ubuntu y las librerías
de quality.yml, Rust 1.95.0 del rust-toolchain, Nextest 0.9.146, Python, Deno, Git,
Node y PowerShell según los gates. Windows necesita Git Bash, Rust/Nextest,
Python, Deno y DuckDB según native/README.md. No instalar prerequisitos a escondidas.
Docker/Postgres y publicación con secretos permanecen en runners alojados;
su consumo reducido debe caber en la cuota Free con presupuesto de exceso cero.

Los workflows de calidad/gates eligen etiquetas propias **solo en privado**.
Mientras es público usan runners alojados; no se pone una máquina personal a
disposición de PR públicas. Las PR de forks se excluyen en jobs propios.
No se habilitan workflows inertes del Testing Center.

## Registro y servicio, después de PC listo

1. Aislar VM/red del runner de datos personales, USB de firma, credenciales SSH
   y producción. Cuenta exclusiva y firewall sin acceso a la LAN innecesario.
2. Crear carpeta/cuenta por el operador; instalar prerequisitos aprobados.
3. Linux: copiar estos scripts al directorio aprobado, ejecutar
   `bash register-linux.sh` **como vantare-ci**, con `gh` autenticado temporalmente
   por el operador; después cerrar sesión de `gh` y retirar sus credenciales.
   El operador instala servicio con `sudo ./svc.sh install vantare-ci`,
   `sudo ./svc.sh start`. No dar sudo permanente al usuario del runner.
4. Windows: en el PC 192.168.1.57, desde PowerShell administrador, ejecutar `register-windows.ps1`
   con `-ExpectedComputerName <nombre-del-PC-reinstalado>` y
   con `-ServiceCredential (Get-Credential '.\vantare-ci')`. La contraseña se
   introduce localmente, nunca por chat. El script usa variables de entorno
   transitorias para configuración, no imprime token ni salida de config.
   Comprobar identidad y permisos antes de configurar: config inicia el servicio.
5. Preparar hooks ANTES del primer servicio desde copia administrativa:
   cleanup.py, job-guard.py y wrappers job-start/job-end en `C:/VantareCI/hooks`
   o `/opt/vantare-hooks`, fuera de la aplicación runner y no editables por jobs.
   Configurar variables de SO ACTIONS_RUNNER_HOOK_JOB_STARTED/COMPLETED a esos
   wrappers. Windows: reiniciar antes de config, que inicia servicio automáticamente;
   el script verifica variables/archivos. Linux: Environment en drop-in systemd
   antes de svc.sh start. No leer ni escribir .env. Hook start rechaza público/forks
   y limpia _work/repo/repo; hook end limpia tras finalizar. No sustituye VM.
6. Verificar jobs con SHA conocido y comprobar que el usuario no puede leer
   secretos del host. Esta preparación no acredita aislamiento ni CI real.

Windows puede pausarse fácilmente: `control-windows.ps1 -Operation Pause`;
reanudar con `Resume` solo cuando no exista `C:/tmp/fase2/pantalla-ocupada`.
Parar servicio puede interrumpir un job: avisar antes; pausar al quedar idle
antes de reservar pantalla. El primer paso del job también espera al marcador,
pero no garantiza detener instantáneamente un job si aparece a mitad del build.
Linux: `sudo ./svc.sh stop/start`. Detener no elimina registro ni workspace.

Privado/sin forks y limpieza no equivalen a VM efímera: colaboradores y
dependencias pueden comprometer el runner. Firma/deploy/Discord con secretos
no se trasladan al runner de PR. Antes de cada uso privilegiado reconstruir
VM o usar entorno distinto; no montar socket Docker ni USB del host.

Fuentes: https://github.com/actions/runner/releases/tag/v2.338.0,
https://docs.github.com/en/actions/how-tos/manage-runners/self-hosted-runners/configure-the-application,
https://docs.github.com/en/actions/reference/security/secure-use.

## Viabilidad Linux en WSL2: pendiente de smoke real

WSL2 ejecuta kernel Linux real: candidato válido para Python/Deno y check/fmt/
Clippy/tests Rust de targets Linux, señales/Unix IPC y corpus. Usar ext4 de WSL,
no /mnt/c. No acredita gráficos/hardware de Linux físico ni paridad Wayland/GPU.
COM/.lnk, registro, instalador NSIS y lifecycle Windows requieren runner Windows
nativo. Un contenedor no elimina la necesidad de kernel Linux/VM ni el riesgo de host.

Systemd dentro de WSL no garantiza iniciar distro tras reboot Windows. Comprobar
arranque bajo cuenta Windows no admin, sin sesión interactiva, red tras reinicio
y supervivencia de la distro con supervisor administrativo antes de aceptación.
Hasta ese smoke no afirmar Linux CI real. Alternativa: VM Ubuntu dedicada.
Deshabilitar automount de discos Windows e interop en distro CI; no compartir
credenciales del host ni socket Docker. Limitar memoria/CPU y medir serial antes
de solapar dos builds pesados. No instalar Docker Desktop por defecto.
Fuentes: https://learn.microsoft.com/en-us/windows/wsl/wsl2-about y
https://learn.microsoft.com/en-us/windows/wsl/systemd.
