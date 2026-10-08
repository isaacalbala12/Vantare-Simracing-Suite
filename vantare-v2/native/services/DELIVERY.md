# Entrega local para revisión de Opus — ISA-1430

2026-09-30. Rama `vantareapp/isa-1430-w-servicios`, worktree
`C:/tmp/vw3-servicios/vantare-v2`, raíz Git `C:/tmp/vw3-servicios`.
Base asignada `e8b0927a3e8f63b8e89d2043b18c57ac1753c0fd`.
Notion no disponible: excepción explícita de Isaac para trabajar solo con GitHub
#1430; no se declara su seguimiento completado ni se conoce su estado actualizado.
Se hizo únicamente el merge **local solicitado** de `vantareapp/isa-1427-fase2`,
tip `d2d9a3c4e4ac96dc60889457ba3463c65324a9cb`. Sin push, PR, merge remoto,
CI remoto, promoción, gasto ni release. Stash «WIP servicios previo a rediseño»
intacto, sin recuperar ni leer contenido. No se crearon subagentes.

## Hitos de integración

| Hito | SHA | Resultado |
|---|---|---|
| Merge fase 2 | `457b5916a139d6d461156ac2a9da0aed48070713` | Dos conflictos resueltos conservando diagnóstico local y editor/envío remoto del Testing Center. |
| Workspace | `f3f926227173662c3e321a47cc58cdc6d5fe2344` | Servicios miembro de native, lock/edición/lints compartidos; target y logs aislados trasladados fuera del repo. |
| Autoridad del núcleo | `1e0e4e50e5b43579bdee85c4c9915d621e8ae692` | Credencial firmada, control autenticado, binding/reloj DPAPI, revocación durable y política con hora exacta. |
| Supervisor, consumidores y paquete | `707027323613ec26990961c16b223a959bcff832` | Auxiliar real bajo demanda del Hub, handoff/cierre live, derechos en overlays/Engineer, once binarios. |
| Contrato de configuración y entrega | Commit que contiene este documento | Pregunta concreta de Clerk, evidencia actual y límites; SHA exacto en el reporte final. |

Historial anterior conservado: decisiones D1–D7/ADR `b566c6cdaaeb62ba09e640c9b9fd96c49dd7fa5d`;
host/DPAPI `a4c2533c4d49cf95cb5cf6bf0831e9ae6a213c6f`;
cuenta Clerk `b1be5b9b4f6bfb19f858d4d268371b9839de396a`;
licencias `f099dfaa03c56841acd629f344b63d5b9f85bbd9`;
roadmap `b0194143610dbb9d9480dab015c410e53a374ae4`;
informes manuales `ff57186198b31849bcb30c7ba4c7df4d03269b15`.
Las limitaciones antiguas de ownership/standalone se sustituyen por esta integración
autorizada; el runtime real de Clerk y backend continúa pendiente.

## Qué cubre

El Hub usa Orbit y el Input del Launcher `pub(crate)` sin duplicar módulos.
Solicita servicios por IPC al supervisor; no posee hijos ni credenciales.
El supervisor arranca el auxiliar solo al recibir una acción, exige transferencia
local confirmada antes de atenderla y cierra/recolecta el hijo al entrar en live,
EOF/cierre o shutdown. El hijo hereda el Job Object del supervisor.

El núcleo verifica los bytes firmados con la biblioteca común v1/JWS, mantiene
binding/reloj y tombstones protegidos, y publica política sin secretos/PII.
Pipes con ACL SID, rechazo remoto, primera instancia, pin de imagen/PID, nonce
privado, versiones/secuencias, marcos acotados y cancelación; no HTTP de los
consumidores. Verificación/disco fuera de adquisición. Básicos disponibles;
overlays avanzados y radio/voz de Engineer denegados ante política ausente,
incompatible, vieja o caducada. Engineer sigue checkpointando hechos auténticos.

Solo una licencia válida a la entrada live permite **caducidad + 3.600 segundos**.
No se reinicia el plazo al reconectar/transferir; tampoco se concede a derechos
emitidos después de entrar ni fuera de juego. Logout/reset espera revocación
durable del núcleo antes de limpiar el candidate; replay no reactiva la emisión.
Roadmap: última publicación válida. Informes: borrador DPAPI, preview y
consentimiento efímero, intento durable manual y recibo; sin autoenvío ni adjuntos.

Servicios tiene el único lock del workspace principal, sin lock/target propio.
El workspace histórico `native/strategy/` de otro worker permanece intacto.
Se reutilizaron las versiones existentes de ureq/rustls, base64, sha2, getrandom,
zeroize, url y chrono; Ed25519 y sus transitivas se justifican en el hito workspace.
Los nuevos dev-dependencies de Engineer solo generan firmas y tiempos de fixtures;
no añaden versiones/paquetes. HTTP opcional; la unificación de features de Cargo
en tests conjuntos no acredita que el artefacto completo carezca de TLS.

## Gates y evidencia

Antes de cada commit se ejecutó el workspace completo en `native/`,
secuencialmente, máximo dos jobs y sin limpiar/copiar sccache ni cachés ajenas:

```powershell
cargo fmt --check
cargo clippy --workspace --all-targets -j 2 -- -D warnings
cargo test --workspace -j 2
```

| Evidencia externa | Resultado |
|---|---|
| `merge-*.log`, `merge-services-*.log` | Formato/Clippy/tests aprobados antes del merge; servicios aún aislados en ese momento. |
| `workspace-*.log` | Tres gates exit 0 tras unificar. |
| `rights-*.log` | Tres gates exit 0 para autoridad durable. |
| `integration-final-*.log` | Tres gates exit 0: 702 passed, 0 failed, 4 ignored. |
| `handoff-*.log` | Tres gates exit 0: 702 passed, 0 failed, 4 ignored; además 11 pruebas del harness de ciclo de vida, 0 failed. |
| `packaging-final-build.log` | Build Debug offline/locked del workspace, once bins, exit 0. |
| `packaging-final-test.log` | Exit 0, 105 comprobaciones PASS en Windows PowerShell 5.1. |
| `msix-test.log` | 12 PASS de parser/negativos; MSIX real SKIP. |

Histórico antes de integrar: último corte aislado de servicios, 22 unit + 1 proceso;
native, 622 passed/4 ignored; perfil aislado sin default-features, 8 passed.
Son resultados del diseño anterior, no la prueba del grafo integrado actual.

Todo bajo `C:/tmp/servicios-evidence/`, incluidos el target standalone histórico,
logs previos y directorios propios de fixtures de packaging trasladados después
de los tests. El paquete Debug se construye con `AllowDirty`: el manifiesto conserva
el SHA previo y `source_dirty=true`; los hashes identifican el payload verificado.
No es un release firmado ni evidencia de rendimiento de producción.

HTTP de pruebas solo loopback dentro del test, claves generadas, DPAPI de raíces
aleatorias y pipes/procesos locales. El test supervisor usa auxiliar **real** y
host del núcleo/biblioteca supervisor; no sustituye un juego físico. Engineer se
prueba con política firmada generada y sin política: checkpoint sí, radio protegida
no. Tests de tiempo inyectado cubren T+3599/T+3600, replay, binding/firma/reloj
inválidos, entrada/salida y transferencia tardía. El pipe generado de instancia
se comparte entre núcleo, overlays y Engineer.

Cuatro ignorados heredados requieren LMU/ACC físicos activos. Sin prueba
visual/interactiva GPUI, audio SAPI/WinMM real, aceptación de juego, login Clerk
ni Supabase remoto. Sin Go/frontend modificados; sus suites no aplican.
Incidencias encontradas se conservaron en evidencia: fixtures de Engineer
adaptadas a autoridad firmada y espera inicial acotada antes del cursor; packaging
lanzado desde PowerShell 7 falla al buscar `$PSHOME/powershell.exe`. La suite completa
se ejecutó con Windows PowerShell 5.1, sin ocultar esa ejecución fallida.

## Configuración y aceptación pendiente

El contrato y la pregunta de Isaac están en [INTEGRATION.md](INTEGRATION.md).
Variables públicas existentes exclusivamente `option_env!`:
`VANTARE_SUPABASE_URL`, `VANTARE_SUPABASE_ANON_KEY`,
`VANTARE_LICENSE_PUBLIC_KEYS`, `VANTARE_BUILD_CHANNEL`,
`VITE_CLERK_PUBLISHABLE_KEY`, `VANTARE_VERSION`.
Estos nombres no bastan: faltan issuer HTTPS Clerk, client ID OAuth público
PKCE/S256, redirect loopback registrado exacto (host/puerto/path), scopes/audience
y nombres públicos acordados del build, más URL/versión/owner del puente OAuth
a UUID/datos RLS. Publishable key no equivale a OAuth client ID. No se presume
despliegue de #909, #911/#1173 o #915/#1187; `native_oauth=None` y el hook de
puente siguen inactivos. Sin configuración: «servicio no configurado».
Nunca service_role, client secret ni firma privada del servidor en el desktop.

**Límite de la hora:** el corte del worker margen descrito abajo añade plazos
absolutos e identidad a la persistencia del núcleo. La restauración con identidad
completa está probada localmente. Los adaptadores siguen sin publicar una marca
de inicio estable, por lo que Host aún deniega el margen frío en producción.
Recuperarlo en juego real necesita esa señal nativa, no una afirmación del Hub.

Corte 6, tras fijar la configuración pública con Isaac:

1. Registrar cliente Clerk/páginas alojadas/redirect; backend valida issuer,
   audience/scopes y `(iss,sub)` → UUID canónico; acordar puente a RPC actuales.
2. Build de prueba sin secretos en el repo/logs; arrancar `vantare -- --live`
   y Hub contra su mismo pipe. Comprobar login/reinicio/rotación/logout/reset
   con cuenta propia de prueba, transferencia ACK y cierre del auxiliar en juego.
3. Juego/overlays/Engineer reales con Hub cerrado: T+3599/T+3600, salida,
   desconexión y reinicio frío, tras resolver la marca estable del adaptador.
4. Roadmap válido/vacío/desconectado/schema incompatible. Informe de prueba
   solo tras consentimiento: respuesta perdida y reintento manual con mismo ID.
5. Medir CPU/RSS/latencia de cierre; completar MSIX firmado y CI solo cuando
   el orquestador los autorice. No gasto ni acción sobre usuarios ajenos.

JWS v2/enrollment es destino probado localmente, no endpoint/backend desplegado.
Sync de perfiles/layouts no se implementa; estimación del plan ~29 GiB/mes
para 1.000 usuarios/100 KiB/10 lecturas diarias, pendiente corpus/frecuencia/cuotas;
sin Realtime, sync continua ni gasto. Otros límites: un intento pendiente por
cuenta/contexto, campos de una línea y logout Clerk solo local. DPAPI/ACL no
protegen frente a admin/malware del mismo SID ni restauración integral antigua
del perfil. Overlays fijan el núcleo hermano del paquete; no se acredita una
combinación custom de ejecutables fuera de ese contrato.

## Ficheros del corte de integración

| Grupo | Rutas relativas a vantare-v2 |
|---|---|
| Workspace | `native/Cargo.toml`, `native/Cargo.lock`, `native/services/Cargo.toml`; borrados lock/.gitignore aislados de services. |
| Núcleo/launcher | `native/runtime/Cargo.toml`, `src/lib.rs`, `src/service.rs`, `src/bin/vantare-core.rs`, `src/bin/vantare/main.rs`, `src/rights/{mod,host,tests}.rs`, `src/services.rs`, `src/services/tests.rs` (todos dentro de runtime). |
| Control IPC | `native/ipc/src/lib.rs`, `native/ipc/src/control.rs`. |
| Servicios | `native/services/src/{app,process,protocol,lib,license_remote}.rs`, `src/bin/vantare-services.rs`, `src/license.rs`, `src/license/authority.rs`, `tests/process.rs`, `README.md`, `INTEGRATION.md`, `DELIVERY.md` (todos dentro de services). |
| Hub | `native/hub/src/shell.rs`, `src/services/{client,view}.rs`, `src/testing/{mod,editor}.rs`, `src/launcher/mod.rs` (todos dentro de hub). |
| Engineer | `native/engineer/Cargo.toml`, `src/main.rs`, `tests/lifecycle.rs`, `tests/rights/mod.rs` (todos dentro de engineer). |
| Host overlays | `native/ui/src/{app,lib,rights}.rs`, `native/ui/src/bin/vantare-overlays.rs`. |
| Paquete | `native/packaging/{README.md,candidate.ps1,tests.ps1}`; MSIX consume el inventario Cargo sin editar su script. |

El merge incorpora además los ficheros de fase 2; consultar su diff contra el
primer padre. En los hitos posteriores al merge no se editaron widgets, Go,
frontend, workflows, secretos ni cachés compartidas. ADR/plan aprobados y código de los cortes 1–5 anteriores
permanecen versionados. El SHA final del commit de este documento se entrega
en el chat; no se autoescribe una referencia circular.

## Corte local del worker margen — ISA-1430

2026-09-30. `C:/tmp/vw3-margen/vantare-v2`, rama
`vantareapp/isa-1430-w-margen`, base asignada
`83225e516242533d65a2f1c3436ba306b9ccd517` (integración de servicios).
Se consultó GitHub #1430, abierta. Notion no disponible, excepción explícita
de Isaac: no hay actualización ni estado Notion verificados. Sin subagentes,
push, PR, merge, promoción, release ni CI remoto. El orquestador Opus revisa
el diff; no se declara terminada la integración live.

Se reutiliza el único almacén protegido y su reemplazo DPAPI durable. Game
guarda la identidad compuesta y deadlines absolutos por derecho junto al reloj
anti-retroceso. El binding firmado continúa verificándose al abrir. La primera
sesión live confirma solo una identidad completa coincidente y reutiliza los
deadlines originales, incluso con otro ID local o tras varios reinicios.
El formato anterior sin identidad/deadlines no restaura margen. Logout, replay
y salida live conservan la revocación de la excepción.

Ficheros de este corte: `runtime/src/rights/{mod,tests}.rs`,
`services/src/license/{authority,tests}.rs`, `services/{INTEGRATION,DELIVERY}.md`.
Sin dependencias nuevas ni unsafe. Solo la ruta interna del núcleo acepta la
marca; no se introduce autoridad de sesión por Hub/IPC.

**Bloqueo y siguiente paso para Opus:** `Session` solo publica identidad local,
tipo, circuito y relojes relativos. Los adaptadores LMU/ACC no publican una marca
nativa persistente. `advance_observed_session` recibe una marca explícita solo
en tests; Host continúa usando `advance_observed` sin marca. Por tanto este
corte prepara la restauración segura, pero **no conserva aún el margen tras
reiniciar el núcleo con un juego real**. Hace falta encargar al dueño de
adaptadores/domain una señal nativa con unicidad comprobada entre carreras del
mismo circuito/tipo y conectarla a Host, con conformidad física. No se permite
inventarla con pared menos elapsed, una época local ni un ID del Hub.

Pruebas: dos reinicios conservan el mismo deadline y deniegan exactamente en
caducidad + 3.600 s; cambios de marca/simulador/circuito/tipo, marca ausente o
circuito stale descartan la recuperación; replay no confirma; plazo vencido,
retroceso de reloj y estado ausente/corrupto/legacy deniegan. La regresión de
biblioteca detectó el uso indebido del ID reciclado antes del arreglo (1 fallo
esperado, `reproduction-before.log`). La prueba anterior de restauración se
actualizó para aportar identidad completa y comprobar un ID local distinto.
Las identidades y claves son fixtures generadas; no son evidencia física LMU/ACC.

Evidencia y logs largos fuera del repo, `C:/tmp/margen-evidence/`. Los tests de
derechos admiten `VANTARE_TEST_EVIDENCE_DIR` para situar sus blobs de fixture
en esa carpeta. Gates completos y SHA del commit local se entregan en el reporte
final; no hay SHA circular en este documento. No se ejecutan suites Go/frontend,
MSIX, Clerk/backend remoto ni QA físico porque no se modifican esos flujos y
la integración live sigue bloqueada por la identidad ausente.

Gates finales de este corte en `native/`, con máximo dos jobs, todos exit 0:

| Comando | Evidencia externa | Resultado |
|---|---|---|
| `cargo fmt --check` | `fmt-pass.log` | Aprobado. |
| `cargo clippy --workspace --all-targets -j 2 -- -D warnings` | `clippy-pass.log` | Aprobado, sin avisos. |
| `cargo test --workspace -j 2` | `test-workspace.log` | 726 passed, 0 failed, 4 ignored; además 11 escenarios del harness de ciclo de vida aprobados. |

Los cuatro ignorados heredados requieren LMU/ACC físicos. `clippy.log` y
`clippy-final.log` conservan los intentos previos fallidos por estilo en los
tests de este worker, corregidos sin supresiones. `gate-status.txt` y
`test-summary.json` conservan los resultados finales; `review.diff`, el diff
completo revisado. La pasada completa valida el workspace de esta base, pero
no convierte el contrato condicionado a identidad en aceptación live.
