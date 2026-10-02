# Servicios nativos — ISA-1430

`vantare-services` es miembro de `native/`: un workspace, `Cargo.lock`, edición
y lints compartidas. Proceso de usuario bajo demanda, sin GPUI/simuladores.
El supervisor `vantare` posee el auxiliar; el Hub solo manda comandos IPC.
El núcleo verifica y persiste la credencial y publica derechos a los consumidores.
Cuenta Clerk y datos Supabase tienen contratos distintos; el puente privado
permanece inactivo hasta acordar configuración/backend con Isaac.

```powershell
cd native
cargo fmt --check
cargo clippy --workspace --all-targets -j 2 -- -D warnings
cargo test --workspace -j 2
```

Máximo dos jobs, una compilación a la vez. Logs y target standalone histórico
están fuera del repo, en `C:/tmp/servicios-evidence/`; no recuperar el stash previo.
No hay dependencias async/DB/bus nuevas: se reutilizan transporte Win32/ACL,
ureq/TLS del lock, formatos/entropía mínimos y Ed25519/DPAPI de los cortes previos.
La biblioteca de verificación se consume con `default-features = false`; IPC es
común, HTTP/URL opcionales. Las pruebas de runtime habilitan network solo como
dev-dependency. Cargo unifica features en una compilación conjunta: ese grafo
no se presenta como prueba de ausencia de TLS en el artefacto completo.

IPC v3 distingue en `ReportReceipt` un borrador limpiado, otro posterior
conservado y una limpieza pendiente. Confirmar un reintento solo retira el
borrador con su misma idempotency key; un error de lectura conserva el archivo.
Hub, supervisor y auxiliar comparten el contrato y deben compilarse juntos.
`Account` comunica también el error y el estado real del intento: un callback
rechazado mantiene polling; caducidad/intercambio fallido lo termina. Reiniciar
explícitamente libera el listener anterior y estrena generación, state y PKCE.

Sin configuración se muestra «servicio no configurado», con funciones básicas
y borradores locales. La hora de excepción solo aplica a derechos válidos al
entrar a la sesión live; no hay otra gracia offline. Límite de restauración
tras reinicio frío e identidad de carrera, contrato exacto de Clerk pendiente,
variables del build, IPC, aceptación y riesgos: [INTEGRATION.md](INTEGRATION.md).
Commits/gates/evidencia y alcance real: [DELIVERY.md](DELIVERY.md).

Roadmap: última publicación válida; Testing Center: texto, borrador DPAPI,
preview/consentimiento efímero, intento durable manual y recibo. Sin autoenvío.
Tests: HTTP loopback, claves generadas, procesos/pipes y DPAPI de fixtures;
ningún secreto ni credencial real, `.env*` ni backend real. El corte 6 queda
pendiente de Isaac; sync de perfiles/layouts no se implementa aquí.

### Desarrollo Unix — #1437

El auxiliar y su cliente usan `vantare-ipc` también en Linux/macOS: socket Unix
local, mismo nonce, límites, PID e imagen del par. La sesión y demás datos del
`Store` se guardan bajo `$XDG_CONFIG_HOME/Vantare/native/services` (Linux,
`~/.config` si no está definido) o `~/Library/Application Support/Vantare/native/services`
(macOS). Cada namespace queda en un directorio `0700`; los JSON y el lock son
`0600`, y el reemplazo es atómico. A diferencia de DPAPI, Unix no cifra esos
JSON: los permisos protegen frente a otros usuarios, pero no frente a procesos
del mismo usuario, administrador/root, ni acceso al disco fuera del sistema.

El contrato v1 conserva el fingerprint heredado como SHA-256 de `HOME|GOOS`
(`linux`/`darwin`). La clave Ed25519 de instalación
conserva su ID RFC 7638 y prueba de enrollment; queda en el `Store` privado.
El backend v2 aún no está desplegado, por lo que la renovación v1 sigue usando
el fingerprint heredado también en Unix.
