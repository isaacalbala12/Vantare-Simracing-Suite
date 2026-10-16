## #1636 · VANTA-72 · Segunda sincronización nightly (16/10/2026)

Entrada limpia `7d873cdcf`; merge `3159e214` de `nightly@e8aa2077c` en la rama
`vantareapp/isa-1636-correos` / PR #1657, autorizado por el orquestador.
Solo conflicto de handoff: ambos bloques íntegros. Oferta inicial y programa por
informes apagado de #1673, avisos #1649, cola por comprometido #1674 y filtro
CI/telemetría #1676 preservados. Sin cambios adicionales de producto ni SQL/Rust.

Repetición completa del alcance: Mac **815 SQL** en 28 suites, **367 Edge** y
**E2E1** verdes con PostgreSQL real y RPC psql/OAuth/Brevo/Polar dobles. Incluye
launch_offer_sql y report_enrollment_policy nuevos. Docker bajo lock/trap y
contenedor retirado. Contratos CI marketing, scope nativo/telemetría y canales,
YAML/shell y quality/**456** huellas PASS. Nuevos contratos/migraciones/cola y
clasificador idénticos byte a byte a nightly; workflow combina ambos conjuntos.

Windows servidor, worktree aislado ya existente y target propio, comandos
seriales vía compilar.ps1 actualizado, MIN_GB=0 solo proceso: **fmt/check/Clippy
-D warnings PASS, Nextest admin/services 224 PASS y 2 ignorados existentes**.
Jobs2/tests1. Guard PS real PASS. Lifecycle/telemetría omitidos: no cambia código
runtime/domain/ipc/testdata; solo scripts/docs nativos llegan desde nightly.
No se cambian variables de máquina, checkout principal ni datos ajenos.

Evidencia `~/evidence/1636-nightly2/` y
`C:/VantareServer/evidence/1636-nightly2/`. SHA final/bare, base verificada y FIN
se registran al cierre. El orquestador publica y fusiona; worker solo push bare.
CI remoto tras publicación pendiente. Sin promoción a nightly, activación,
despliegue, SaaS real ni gasto; pendientes de activación anteriores conservados.

## #1636 · VANTA-72 · Sincronización con nightly (16/10/2026)

PR #1657 / rama `vantareapp/isa-1636-correos`, entrada `2de604cc2`. Merge
`8c6362f0` incorpora `nightly@9e48eb86f` autorizado por el orquestador; segundo
merge `d75fd2e3` incorpora avance `ceb999f5` de avisos/handoff durante los gates.
No se promociona la rama ni se publica en GitHub desde el worker.

25 conflictos resueltos conservando nightly actual en Founders/disputas/informes,
refunds, ledger y miniapp de creadores/personas; se reenganchan solo cambios de
Correos sobre esa base (delta comparado con miniapp `0ac70754`). Los seis archivos
críticos polar/webhook/creator-code/payment-sync/fixtures/people se conservan
idénticos a nightly. Handoff conserva ambas entregas. CI mantiene scope/cache y
gates de nightly junto al job SQL/E2E de Correos; el guard PS respeta scope nativo.

Fix `950aac58`: guard PowerShell reconoce también billing-report-promotion,
como candidato inerte (sin habilitarlo); ejecución Windows detectó el fallo y
regresión Deno fue roja/verde. Guard PS real Windows ya PASS tras corregirlo.

Checks combinados: Mac SQL **756/756** (26 suites admin/marketing/Founders/
renovaciones/informes) y E2E **1/1**, Edge **363/363**, CI marketing **2/2**,
clasificador nativo **11/11**, YAML/shell, fmt Deno y quality/**456** huellas PASS.
Docker bajo lock con contenedor limpio; PostgreSQL real, OAuth/Brevo/Polar dobles.
E2E usa adaptador RPC psql, no transporte PostgREST ni proyecto remoto.
Windows admin/services: **fmt, check, Clippy -D warnings PASS; Nextest 224 PASS,
2 ignorados existentes**, comandos seriales por compilar.ps1, jobs2 y tests1,
VANTARE_CARGO_MIN_GB=0 en proceso según encargo; sin cambiar variables de máquina.
Todo `native/` idéntico al snapshot de validación `8c6362f0` tras el segundo merge.
No se modifican runtime/domain/ipc/testdata frente a nightly: lifecycle/telemetría
no se repiten en este encargo de resolución; CI de producto sigue con sus gates.

Evidencia Mac `~/evidence/1636-nightly/`; Rust/guard Windows en
`C:/VantareServer/evidence/1636-nightly/`. Checkout de gates aislado
`C:/VantareServer/wt/isa-1636-sync`, target propio, sin tocar el checkout principal
ni su untracked ajeno. No se compila Rust en Mac en esta ronda por instrucción
expresa. Sin cambio visual adicional ni nueva QA física de UI.

Entrega local para publicación/revisión de CI por el orquestador. Push solo al
bare del Mac, SHA/FIN en `~/orq/1636.buzon.md`. Sin merge a nightly ni release,
despliegue, servicios reales o gasto. Se conservan pendientes de activación
#1637/web, QA visual/Windows, secretos/flags/tick y alarmas documentados en MAIL.md.

## #1636 · VANTA-72 · R3 menores de seguridad (15/10/2026)

PR #1657, rama `vantareapp/isa-1636-correos`, entrada limpia `3fcb0420a`, aprobada
por seguridad R2 y subida por el orquestador. Mismo Mac `~/wt-1636`, sin
subagentes ni SaaS real. Orquestador mantiene Plane/GitHub; worker solo bare.

- M1, `072462f6`: HMAC mediante subtle.verify antes de ambos presupuestos.
  601 firmas inválidas no gastan SQL ni impiden una baja válida (regresión roja/verde).
- M3, `d006335c`: recibo público idéntico para espera, ausencia o cuenta vinculada;
  mismo 200/cuerpo/cabeceras. No afirma borrar cuentas. Owner mantiene diagnóstico.
- M4, `e3671427`: DELETE espera lease previo +10 s, cubriendo PUT tardío. Test de
  plazo exacto rojo/verde; la migración de retención conserva ese margen.
- M2, `8f473514`: máximo ocho intentos o 24 h por trabajo; estado failed retira
  correo, deja recibo/huella privada y bloquea nuevas altas hasta ACK manual.
  Owner ve aviso y hasta 20 recibos sin dirección, motivo/intentos/HTTP. Expiración
  antes de flags/clave Brevo, en cada claim y lectura Owner. Runbook manual MAIL.md;
  requiere tick periódico independiente y alarma de fallos/scheduler antes de activar.
  No se pierde la obligación: failed no acredita borrado del proveedor.
- M5: SQL/E2E separado de policy/product en job alojado ubuntu-latest, con
  preflight Docker visible y pull explícito de imagen fijada. Público automático;
  privado requiere variable MARKETING_POSTGRES_CI=true tras autorización del
  presupuesto alojado. No se modifica configuración. Runbook #1565 excluye Docker
  del runner privado Linux; inspección read-only confirma runs públicos hosted.
  Prueba roja/verde y tres escenarios: Docker ausente, daemon denegado, disponible.

Evidencia `~/evidence/1636-r3/`: SQL **199/199** + E2E **1/1** (PostgreSQL real,
RPC mediante adaptador psql, OAuth/Brevo dobles), Edge/contratos **97/97** sin red,
Nextest admin **29/29**, Clippy all-targets -D warnings, fmt, build normal PASS.
CI contrato **2/2** con tres escenarios de capacidad; YAML/shell nuevos parseados.
Quality y **456** huellas PASS. Primer Clippy R3 rechazó dos lints, corregidos sin
suprimirlos. Diff completo revisado; sin dependencias ni manifiestos/locks nuevos.
La escena mail-cleanup abre ventana nativa; `Vantare1636R3QA.app` queda en evidencia.
Preflight de captura macOS sigue false: sin PNG ni QA visual/Windows. Target propio
se elimina al cierre. Lifecycle/telemetría omitidos: no cambia runtime/domain/ipc/testdata.

Antes de activar siguen pendientes CI remoto y QA visual/Windows, conexión UI
#1637/web, configuración de proveedor/secretos/flags/scheduler/alertas. M6/M7 del
informe siguen observaciones de escala/retención de hashes, fuera de estos cinco
arreglos. No se despliega ni activa, sin merge/promoción/release/gasto. SHA final,
commits/push bare y FIN en `~/orq/1636.buzon.md`; informe completo en evidencia.

## #1636 · VANTA-72 · R2 para revisión (15/10/2026)

PR #1657, rama `vantareapp/isa-1636-correos`, entrada `b0f799827`. Mismo worktree
Mac `~/wt-1636`; sin subagentes, credenciales ni push GitHub. El orquestador
mantiene Plane/issue/PR y sube del bare. Buzón `~/orq/1636.buzon.md`.

**P2-1, 5f9e3806:** #1622 encola DELETE Brevo de direcciones actuales/anteriores
antes de borrarlas localmente. Worker `mail-cleanup`, backoff 5 s–1 h, leases,
fencing y ACK 204/404 idempotente. Al confirmar retira también la PII temporal de
la cola y conserva resultado/intentos/fecha sin correo en auditoría. Sync anterior
vence antes de DELETE; un alta nueva espera al borrado pendiente. Worker inerte,
flag/secreto/scheduler no configurados. Owner puede drenar y ver lo pendiente.

**P2-2, b3fbe59c:** borrar espera sin cuenta desde gestión (correo exacto y
confirmación), RPC solo servidor o enlace firmado; misma cola Brevo. No permite
borrar una cuenta por esa vía. GET muestra confirmación, POST de formulario actúa,
POST RFC8058 de un clic conserva baja sin segunda pantalla.

**P2-3, 4a8527ba:** `native-mail-consent`, OAuth + correo primario verificado en
Clerk, UUID derivado en servidor, una decisión de novedades/ofertas y evidencia
fija. Get/set, bloqueo/tombstone y límite persistente por cuenta. #1637 no está en
esta base: servidor listo y enganche exacto documentado en
`supabase/functions/native-admin/CONSENT.md`, también llamada backend del repo web
tras su verificación de dirección. UI #1637/Ajustes y frontend web siguen en sus
ramas; no se afirma haberlos conectado aquí. E2E local prueba el servidor con SQL
real, no solo un mock de consentimiento.

**P3:** CHECK de locale y escape/fallback de lang; cursor UUID sin dirección.
La selección usa proyecciones pendientes por entorno, no límite de keyset: recoge
cambios detrás del cursor, durante HTTP y cambios/expiración de grupos. ACK viejo
no limpia datos nuevos. Reserva reevalúa como máximo 20 pendientes; el barrido
identificador de cambios de sync sigue comparando la proyección efectiva de la
cohorte. Rate de baja persistente global 600/min y token válido 20/min, hash con
retención acotada, 429/Retry-After. PS guard reconoce rutas/candidatos ya conocidos
por TS; wrapper permite desplegar cuatro rutas nuevas solo por nombre explícito,
sin cambiar el conjunto comercial por defecto. CI añade Deno offline, SQL y E2E
con Docker bajo lock, y ejecuta guard PS en Windows. Gates nativos --workspace
ya incluyen admin; CI remoto pendiente de que el orquestador suba esta ronda.

Evidencia `~/evidence/1636-r2/`: SQL **181/181**, E2E **1/1** con PostgreSQL real y
OAuth/Brevo dobles, Edge/contratos **95/95** sin permiso runtime de red; Clippy admin
`-D warnings`, Nextest **28/28**, build normal, fmt, quality/456 huellas PASS.
YAML y shell de los steps nuevos parseados. Seis escenas nativas demo abren;
`Vantare1636R2QA.app` privado debug conservado. **Capturas y revisión visual siguen
bloqueadas** por permiso macOS para SSH (preflight false comprobado en esta ronda).
No se afirma interacción física ni Windows/DPI. PowerShell solo se prueba por
contrato aquí; ejecución en el nuevo step Windows CI. Lifecycle/telemetría omitidos:
no cambia runtime/domain/ipc/testdata. Target aislado retirado al cerrar.

Contrato/configuración vigente consolidado en `supabase/functions/native-admin/MAIL.md`.
Antes de activar: review del orquestador, CI y QA visual/Windows, enganchar #1637/web,
configurar Brevo/DNS/listas/bajas/secreto y scheduler de limpieza, probar sandbox
con autorización y validar modelo/coste de Anthropic. El worker no configura nada
real ni envía correos. Sin merge, promoción, despliegue, release, anuncios o gasto.
Push únicamente al bare local del Mac; SHA final y verificación en el buzón.

## #1636 · VANTA-72 · Correos de gestión (15/10/2026, candidato local)

Worker Codex T3 por SSH en Mac, sin subagentes ni servicios reales. Rama
`vantareapp/isa-1636-correos`, base miniapp `0ac70754`, no nightly. Estado Plane
informado por el encargo: «En curso»; el worker no consulta ni modifica trackers.
Hitos locales: backend `8e3f4f30`; código integrado en esta rama `3ffc14f7`.
El orquestador revisa y mantiene Plane/GitHub. Buzón `~/orq/1636.buzon.md`.

Backend: ledger privado con consentimiento único, siete grupos desde derechos
comerciales efectivos/roles/creadores/espera, cuatro idiomas, aprobación de revisión
por Owner, cuota global de 300 reservas por ventana de 24 h y tandas manuales de
hasta tres. No reintenta respuestas inciertas. Bajas firmadas GET/POST globales y
webhook Brevo autenticado; se vuelven a comprobar permisos antes del HTTP.
Cambio de correo suprime el anterior; tombstone elimina direcciones actuales y
anteriores y sus entregas, conservando cuota anónima. IA solo devuelve borradores
(`claude-opus-5-5`, high), sin guardar/aprobar/enviar. Flags apagados por omisión.
El cliente conserva límite de 8 KiB para otras acciones y permite 128 KiB en mail,
sin duplicar el stream. Contrato/guía de Isaac en
`supabase/functions/native-admin/MAIL.md`.

UI GPUI: sección Correos, campañas, tres plantillas, editor ES/EN/IT/PT-BR con
vista previa segura, grupos y recuentos, confirmaciones, historial y estado. No
permite enviar cambios sin guardar; bloquea edición durante confirmación/petición.
Limpia borradores al perder autorización. No se cambia Hub ni runtime nativo.

Checks Mac: SQL Docker aislado **120/120** (42 correos + 57 admin + 21 borrado);
Edge/Deno **76/76**, sin permiso de red, con dobles Brevo/Anthropic; Clippy admin
`-D warnings` y Nextest **27/27**; fmt, build normal, quality y 456 huellas de
retirada PASS. Cuatro escenas demo abren ventana nativa de 1280 puntos de ancho.
Evidencia: `~/evidence/1636/`; app QA debug local en `Vantare1636QA.app`.

**Pendiente de QA visual:** las capturas físicas están bloqueadas por permiso de
macOS para SSH (`CGPreflightScreenCaptureAccess=false`; screencapture no pudo leer
la ventana). El intento de exportar el fotograma con test-support de GPUI exigía
cambiar Cargo.lock y se descartó por «sin dependencias nuevas»; no queda cambio de
features, lock ni captura en el producto. No se acredita revisión visual,
interacción física ni Windows/DPI. Escenas `mail-editor`, `mail-confirm`,
`mail-history` preparadas para capturar desde sesión Mac autorizada.

Antes de producción: conectar colectores verificados de consentimiento en
registro/cuenta/espera (no existe permiso histórico que importar), configurar
Brevo/dominio/listas/webhook/secretos y Anthropic con autorización de gasto,
validar modelo, entrega y bajas, y completar procedimiento de borrado externo en
Brevo. Las campañas viven en Vantare: envío individual SMTP API para reservar y
revalidar cada destinatario, listas Brevo como espejo; no se crean campañas
paralelas en su panel. El contador local no conoce correos enviados por otros
sistemas: usar cuenta Brevo dedicada. Historial «aceptado» no significa entregado.

Sin ejecución de lifecycle/telemetría: solo se toca la miniapp aislada y Edge/SQL,
no runtime/domain/ipc/testdata. Gates Windows y CI remotos no ejecutados. El bare
`~/vantare.git` recibe la rama por encargo; no es un canal de producto. Sin GitHub,
merge, promoción, despliegue, release, anuncios ni gasto. Revisión y capturas por
el orquestador antes de dar por cerrada la entrega.
## #1593 / VANTA-39 · decisión de Isaac P3-E y revisión P3-F/G/H · 16/10/2026

PR draft [#1673](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1673),
rama vantareapp/isa-1593-endurecer desde nightly 9e48eb86f; esta ronda continúa
bc631a839. Review de esa base APTO; cambios nuevos pendientes de CI del nuevo SHA.
SHA final y estado de CI se verifican en issue/evidencia/buzón al publicar.

- Isaac NO abre el programa por informes con el lanzamiento: queda apagado por
  defecto, sin fechas de inscripción y pendiente de un anuncio posterior.
  Sustituye la propuesta P3-E anterior, que ya no está pendiente de confirmar.
- SQL incorpora enrollment_enabled=false y fechas NULL en la política privada
  existente, solo para operador. Una ventana propia finita y ordenada es
  obligatoria antes de habilitar nuevas inscripciones. El flag Edge también
  arranca apagado si está ausente o false; encenderlo solo no inscribe.
- La observación solo usa esa política para nuevas inscripciones, sin derivar
  fechas del JSON de lanzamiento. El helper histórico de checkout conserva
  su ventana de #1661, sin cambios en precio/cupón inicial ni en su consumo.
  Se conservan hechos contables y observación de derechos ya concedidos.
- P3-F: generador imprime SELECT del registro tras commit; checklist exige
  comparar las claves activas, IDs, ventana y versión antes de desplegar Edge.
  P3-G: comentario histórico identifica la RPC retirada y su migración de baja.
  P3-H: begin/commit explícitos en la migración del registro; también en la nueva.
- Rojo inicial: suscripción de lanzamiento se inscribía sin configurar programa.
  Verde:24 comprobaciones nuevas de política y fechas futuras ficticias,
  además de183 informes,29 checkout,88 convivencia,89 creador y Founders43+36.
  Ambos órdenes de migración pasan; tests antiguos habilitan explícitamente
  su ventana ficticia. No se atribuyen esas fechas a un anuncio real.
- SQL completo81 suites,54PASS/27FAIL heredadas frente al PR anterior80/53/27;
  1885→1909 aserciones aprobadas, sin regresiones. Mutaciones de flag SQL y
  acoplamiento con lanzamiento detectadas. Edge711PASS/0FAIL/2ignored,
  frente a710/0/2. Fmt/lint, superficie, quality/retirada y diff-check PASS.
- SQL y Edge en Mac; Docker desechable sin red/puertos, actor sin superusuario,
  lock/trap liberado. Sin Rust tocado: fmt/clippy/nextest/lifecycle/telemetría
  nativos omitidos. Sin servicios reales, productos/cupones, deploy, merge,
  release o anuncio comercial. Activación futura requiere a Isaac.

Evidencia de esta ronda: ~/evidence/1673-programa-apagado y copia servidor.
Evidencia completa anterior: ~/evidence/1593-endurecer (no ~/evidence/*1673*),
incluida copia en C:/VantareServer/evidence/1593-endurecer. Próximo paso:
publicar el nuevo SHA en #1673, comprobar CI y entregar Por revisar al orquestador.

## #1593 / VANTA-39 · endurecimiento P3-D/P3-E · 16/10/2026

#1659 ya integrado por el orquestador en nightly9e48eb86f. Seguimiento aislado
vantareapp/isa-1593-endurecer, base exacta9e48eb86f; [PR draft #1673](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1673)
hacia nightly. Código30389aec; SHA final en issue/evidencia/buzón. Publicado
al bare Mac y a GitHub desde servidor; CI automático en curso al cerrar.
Plane Por revisar tras verificación final; integración reservada al orquestador.

- P3-D: retira report_promotion_checkout y fallback Edge. billing_launch_checkout
  valida SQL entorno/clave/producto/cupón/ventana/reloj finito contra registro
  privado exclusivo del operador. No reserva/consume ante oferta no registrada.
  Reserva/CAS/consumo por cuenta y B03 preservados en único core privado sin
  permisos API; owners explícitos, search_path vacío y RLS.
- Proyección SQL offline del único JSON #1661 y loadPolarProductMap.
  Registro inicialmente vacío: aplicar SQL revisado ANTES del checkout
  actualizado. Repetición conserva auditoría; deriva aborta/rollback, sin rotación
  silenciosa. Verificación remota de importe/duración once/ámbito por operador,
  no certificada por este generador. No activa ni consulta Polar.
- P3-E: inscripción de Pro/Plus mensual durante26oct→26nov19Madrid,
  apertura inclusiva/cierre exclusivo; 45 días individuales (1080h).
  Decisión operativa del orquestador PENDIENTE de confirmación de Isaac.
  Contrato/regla lo dicen expresamente; premio sigue desde segundo mes.
- SQL RED inicial0/3 confirma los fallos previos. Verde29 nuevas +183 informes
  +88 convivencia +89 creador en ambos órdenes; suites Founders43+36 verdes.
  Catálogo80/53PASS/27FAIL frente al baseline exacto79/52/27,
  1850→1885 checks y ninguna regresión. Fallas heredadas idénticas.
  Generación SQL real aplicada/repetida y deriva revertida en BD desechable.
- Edge710PASS/0FAIL/2ignored frente a nightly707/0/2.
  Tres mutantes detectados: cupón, intento y B03; los dos últimos eliminan
  ambos guards redundantes para comprobar la ausencia completa del control.
  La primera prueba P3-E chocó con cupo1/día: separadas cuentas sin debilitarlo.
  Rust/clippy/nextest/lifecycle/telemetría omitidos: ningún archivo nativo tocado.
- Mac Docker sin red/puertos, actor NOSUPERUSER BYPASSRLS y lock/trap liberado.
  Fmt/lint producción, superficie deploy, quality/retirada456huellas y diff-check PASS.
  Evidencia ~/evidence/1593-endurecer y C:/VantareServer/evidence/1593-endurecer.
  PR#1673 abierto draft y enlazado al hilo, CI en curso; estado final en issue.
  Sin merge, deploy,
  productos/cupones reales, pagos/refunds, release ni promoción desde este worker.
  Multi-cuenta aceptado y saldo ganado caduca6meses: sin cambios.

## #1593 / VANTA-39 · R7 terminada al bare, pendiente publicación · 16/10/2026

PR #1659, proyecto Vantare/area:licencias; misma rama. Base R7 b5378d166.
Merge autorizado8392038d desde nightly1f07e8e28 y ff079767 desde
nightly460c39e45 (#1661/#1672). Cierre posterior solo documentación y tooling;
SHA final en issue/evidencia/buzón. Sin promoción de esta rama hacia nightly.

- Conserva checkout/guards de #1661, compra Founders y renovación/retirada
  de creador, incluida cancelación definitiva por subscription.updated.
  Webhooks conservan ledger e incidencias de informes y pagos Owner.
- Un JSON canónico de #1661, sin copia parcial. Ventana única26oct→26nov19
  Madrid; primer periodo once por cuenta, recuperable tras TTL, consume desde
  SQL incluso sin flag de informes. Mensual/anual comparten el derecho,
  sin consumirlo por una compra vitalicia histórica. Reserva/CAS, identidad,
  huella de oferta/creador y claim/atribución transaccionales conservados.
- Mayor ahorro con selector original único; informes desde mes2. Conserva
  seis cobros totales, caducidad6meses, spam, traslados y barrera de borrados.
  Revocación PATCH→ACK: recibo durable, solo token propio/vivo, conflicto
  blando auditado y lease liberado; no completar creador ni falsa incidencia.
  Retirada de creador incluye remanentes verificados; preserva informes/manual.
  Refund inicial sigue perdiendo el premio y autoriza solo limpieza.
- SQL177+88+89+43+36 PASS en ambos órdenes sobre migraciones reales.
  Catálogo completo79/52PASS/27FAIL heredadas frente a nightly77/50/27:
  1585→1850 aserciones PASS,265 nuevas, cero regresiones y mismas fallas.
  #1672 no cambia ni un fichero SQL: baseline1f07 se conserva con prueba Git.
- Edge707PASS/0FAIL/2ignored frente a nightly460662/0/2. Conservadas593
  declaraciones literales de tests de nightly y sus casos dinámicos. La
  copia vieja superpuesta fue sustituida por archivo del árbol Git unido,
  que exige el ancestro460. Sin suites sustituidas por un fixture parcial.
- Diez controles SQL y siete Edge detectados: fecha, revocación/ACK y remanentes,
  comparación, locks/lease, total de meses, recuperación, borrados; guards,
  hooks/retirada/cancelación definitiva, once/fingerprint y configJWT.
  Primeras pruebas rojas de ventana y carrera ACK conservadas. Dos mutantes
  Edge iniciales solo rompían el tipado: corregidos para probar conducta.
- Windows serial MIN_GB0 por compilar.ps1:fmt/check/Clippy PASS, Nextestci
  1826PASS/14skips (telemetría incluida), lifecycle18PASS.24 entradas
  nativas Mac/Windows idénticas normalizandoLF; #1672 no toca Rust.
  Targets propios se limpian por Cargo al cerrar. Fmt/lint Edge, superficie,
  quality, retirada y diff-check PASS. Docker aislado sin red/puertos,
  SQL NOSUPERUSER BYPASSRLS, lock/trap liberado tras cada gate.
- Remanentes20%1..10 son requisito ANTES de activar convivencia. Runbook y
  fragmento ISA-1593 actualizados. Multi-cuenta aceptado; progreso en Hub
  sigue propuesta, Owner conserva bloque. Sin nuevos productos ni cupones,
  servicios reales, deploy, scheduler, pagos/refunds o release.

Estado al cierre:Plane Por revisar tras verificar entrega; publicación GitHub,
CI y re-review R7 por orquestador. PR remoto aún b5378d166, CI SUCCESS solo de
esa base; no acredita R7. Evidencia ~/evidence/1593-r7/RESULTADOS.md y copia
C:/VantareServer/evidence/1593-r7. FIN en ~/orq/1593.buzon.md al completar
seguimiento. Pendientes sandbox autorizado/QA visual y activación de catálogo.
Polar real:seis fijos Pro200c/Plus300c repeating1/3/6, creador #1661 y remanentes
mensuales20%1..10 validados; oferta inicial once solo del catálogo de #1661.
Isaac autoriza/crea; este worker no ha consultado ni escrito Polar real.

## #1593 / VANTA-39 · R7 incorpora retirada definitiva #1672 · 16/10/2026

Nightly460c39e45 añadido por encargo explícito del orquestador. Conserva la
retirada de creador por subscription.updated canceled definitivo, sin confundir
cancelación al fin pagado ni paused. Hooks originales y pruebas de #1672 unidos
con el ledger de informes. Edge707PASS/0FAIL/2ignored; baseline460 intacto
662PASS/0FAIL/2ignored. Mantiene todos los tests de ambas ramas, incluidos
creador-only/retirada. Cuatro conflictos de tests/handoff resueltos con la versión
más estricta y los casos de informes añadidos, no con stubs permisivos de Launch.
No hay cambios SQL ni Rust entre1f07e8e28 y460c39e45: baseline SQL y entradas
de los gates nativos conservan sus hashes. Rust sigue validándose serialmente
sobre fuentes nativas idénticas. Pendientes controles finales/evidencia/cierre.

## VANTA-83 / #1661 · seguimiento O1/O3 (16-oct-2026)

- #1666 integrado por el orquestador en nightly 1f07e8e28. Seguimiento aislado
  vantareapp/isa-1661-disputas desde esa base; no promoción de este seguimiento.
- O1: las disputas se reciben mediante revocación de suscripción o refund
  preventivo. Polar no enumera dispute.*; no añadir un evento inventado.
  Se acepta también status=canceled con cancel_at_period_end=false en updated;
  cancelación diferida no inicia retirada. Mismo lease/GET/PATCH/ACK durable,
  cupón persistido y fallo Owner. Contrato documenta ausencia de señal al abrir.
- O3 confirmado: refund confirmado de cualquier factura de esa suscripción,
  parcial incluido, retira permanentemente el 20 %. Sin afectar otras suscripciones.
- O2 sigue en sandbox: PATCH sobre suscripción ya revocada y payload/entrega reales.
  Fuentes oficiales y lista exacta de eventos en creator-renewals-1661.md.
- Rojo→verde: updated terminal omitía retirada. 484 Edge y 142 pgTAP PASS;
  quality/retirement PASS (456 huellas), Deno fmt PASS. Siete fixtures heredadas
  fallaban también en la base: actualizadas para llamadas sin operación creador
  y compras Launch históricas, conservando las comprobaciones comerciales.
  Logs Mac ~/orq/disputas-1661-evidence; copia servidor al cerrar.
- No cambia Rust/schema/dependencias: no repetir gates Rust/lifecycle/telemetría.
  PR nuevo y CI se anotan en issue/entrega; Plane Por revisar al cierre.
  Sin llamadas a Polar real, despliegues, dinero ni capturas (#1655).

## #1593 / VANTA-39 · ronda 7 en validación · 16/10/2026

Merge autorizado EN la rama de PR #1659 desde nightly1f07e8e28 (#1661/#1666).
Conserva guards de checkout, Founders, atribución y renovación/retirada de creador,
con los efectos Owner y ledger de informes. Catálogo JSON completo de #1661;
primer periodo once durante26-oct→26-nov19Madrid, derecho único por cuenta
independiente del flag de informes. RPC/consumo para mensual y anual, reserva,
recuperación/CAS y huella de creador conservadas. Premio mensual desde mes2.
Revocación entre PATCH/ACK: recibo confirmado durable con conflicto blando
fenced; retirada sigue pendiente, sin falsa incidencia ni completar creador.
Retirada incluye remanentes privados verificados y preserva cupones de informes;
revocar creador no congela el premio independiente. Remanentes1..10 obligatorios
antes de activar. SQL/Edge de ambas ramas en árbol unido real, sin overlay viejo.
Edge702PASS/0FAIL/2ignored; dirigidoSQL176+84+89+43+36PASS en primera pasada.
Catálogo completo, controles y gates Rust Windows pendientes en este checkpoint.
Nightlybaseline real: SQL50PASS/27FAIL; Edge651PASS/7FAIL/2ignored (dobles
antiguos de refunds, reproducidos sin cambios). Falta cerrar comparación final.
Plane En curso, proyecto Vantare/area:licencias; rama
vantareapp/isa-1593-descuento-informes, base ronda b5378d166. Sin push aGitHub,
deploy, Polar real, cupones/productos creados ni promoción de canal.
Evidencia y plan ~/evidence/1593-r7. Cierre posterior actualizará SHA/checks/FIN.

## #1593 / VANTA-39 · ronda 6, convivencia con #1661 · 16/10/2026

Entrega para revisión de PR [#1659](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1659),
proyecto Vantare / area:licencias. Misma rama, base de ronda c99b306fd;
nightly ya integrado eb553c7fe. Código85614da0 y cierre documental posterior;
SHA final verificado en issue, evidencia y buzón. Contrato y código de #1661
leídos en271e20053. No se fusiona Founders ni se promociona un canal.

- Creador20 % desde primera renovación; informes desde segundo mes. Se retira
  la selección antigua de dos meses. Porcentaje/plazo en el catálogo común de
  #1661; su comparación en céntimos es única y empate favorece informes.
  Registra el perdedor para Owner.
- La campaña tiene un solo escritor externo. El webhook de creador guarda
  atribución/primer pago y delega sin rearmar una candidatura antigua. El
  worker calcula el saldo real y usa la selección, lease y ACK de #1661.
  Fuera de esta campaña, creador mantiene su flujo normal.
- Conserva saldo3/6 total, caducidad6meses, spam/refund y B03. Al volver al
  creador usa un cupón validado para el plazo restante, nunca once meses
  nuevos. El primer ciclo rebajado fija su reloj; una factura anterior
  reconciliada solo lo puede acortar. Sin remanente, incidencia Owner durable.
- Premio sigue cambios observados de plan/segunda alta, con auditoría.
  Limpieza conserva/restaura el creador de la anterior; canceled/paused no
  recibe PATCH. Refund solo autoriza retirada, nunca otro beneficio.
  Publisher/selector comparten B03, sin invertir el lock de checkout;
  regresión real de pg_locks y control que detecta la inversión.
- SQL169 de informes +70 de convivencia +58 originales de #1661 PASS.
  Catálogo aislado76suites/50PASS/26FAIL heredadas, frente a nightly74/48/26:
  1415→1589 aserciones, cero regresiones. Conjunto79/52/27 frente al
  #1661 intacto77/50/27:1551→1790, cero regresiones. La suite anual roja
  adicional ya falla en271e20053. Instalación en ambos órdenes PASS.
- Edge684PASS/0FAIL/2ignored. Conjunto675/5/2 frente al #1661 intacto645/5/2:
  mismos cinco tests comerciales de refund con dobles RPC antiguos.
  Precio de producto y periodos de factura sobreviven juntos a minimización,
  sin PII. Ocho controles SQL RED; regresiones rojas contra c99 confirmadas.
- Gates Mac con lock/trap liberado; SQL NOSUPERUSER BYPASSRLS, Docker sin red
  ni puertos. Fmt/lint, superficie, quality/retirada y diff-check PASS.
  Rust/clippy/nextest/lifecycle/telemetría omitidos: no hay código Rust tocado
  ni target creado; checkout Windows de integración sin cambios propios.

Integración prevista en runbook: combinar checkout once/atribución y catálogo
de #1661 con hooks/ledger de #1593. Conservar helper con managed_report_ids,
proyección de cuatro campos de línea y verify_jwt=false. El fixture Git no
acredita merge Git ni checkout final combinado. Si #1661 llega después, ejecutar
el instalador idempotente y exigir true. El cron de informes lleva también al
creador de estas cuentas; su flag detiene nuevas asociaciones de ambos, nunca
el ledger ni el calendario de cupones ya aplicados. No activar aún.

Polar pendiente de Isaac: seis cupones fijos Pro200c/Plus300c repeating1/3/6;
creador según #1661 (20 %, mensual11/anual12, solo API), sin ampliar históricos.
Para reanudación: remanentes mensuales20 % de1..10meses, validados con producto
y cupón original; pueden compartir ID si coinciden porcentaje/ámbito.
Nada creado en Polar, productos nuevos, servicios reales, deploy o release.

Evidencia ~/evidence/1593-r6/RESULTADOS.md, resumen.json y comparaciones completas;
copia servidor C:/VantareServer/evidence/1593-r6. FIN en ~/orq/1593.buzon.md.
Plane Por revisar al cerrar. Orquestador publica SHA y pide CI/re-review;
después integración final de checkout, sandbox/QA autorizado. CI SUCCESS
observado solo acredita c99b306fd. Sin promoción hacia nightly/testers/master.

## #1593 / VANTA-39 · merge de nightly entregado al bare · 16/10/2026

Encargo explícito del orquestador: merge de origin/nightly eb553c7fe sobre
53b1fdf29, misma rama de PR #1659. Nightly importado al bare mediante bundle
desde origin del servidor (el Mac no tiene credenciales GitHub).
Nueve conflictos resueltos: webhooks conservan sincronización de pagos/refunds
Owner y ledger de informes; dobles admiten solo las RPC esperadas de ambos.
La miniapp nueva se conserva y su ficha Persona muestra el progreso/incidencia
de informes. DTO combina promoción con plan/pagos/accesos/bloqueo de #1639;
fixture aprobado conservado, con ejemplo falso de Ana añadido. Históricos
de ambos handoffs preservados. Cola/optimización Rust y retirada CI Linux
exactamente de nightly, sin activar servicios ni cambiar reglas comerciales.
Edge combinado679PASS/0FAIL/2ignored. SQL75suites/49PASS/26FAIL: las74 suites
de nightly idénticas,169 comprobaciones de promoción (incluye contrato combinado
de detalle Owner) y0regresiones. Prueba nueva de una factura actualizando a la
vez promoción y pagos. Gates Mac fmt/lint/superficies/quality/retirada PASS.
Rust Windows PASS: fmt/check/Clippy, perfilci1818/1818 (14 skips de perfil),
incluida telemetría real congelada, y lifecycle18/18. Secuenciales por la cola
nueva con MIN_GB=0/jobs2.20 entradas nativas idénticas Mac/Windows al normalizar
LF. Targets propios se limpian con Cargo al cerrar.
Dos commits: merge2dd6761d (padres53b1fdf29+eb553c7fe) y cierre con formato,
prueba de coproyección y evidencia. SHA final/pushbare en issue y buzón.
Plane Por revisar al cerrar, PR1659 todavía en53b1fdf29 hasta publicación por
el orquestador; CI del nuevo SHA pendiente. No se promocionó hacia nightly,
testers o master; sin deploy, release, productos ni servicios reales.
Evidencia ~/evidence/1593-merge y C:/VantareServer/evidence/1593-merge.

## #1593 / VANTA-39 · ronda 5 entregada al bare · 16/10/2026

PR #1659, rama vantareapp/isa-1593-descuento-informes; base de ronda
011ca3cbe (R4 APTO), base de rama 3f82af867. Commits por punto:
c1402432 (P3-23 plazo real retry_at), b0974da6 (P3-24 desajuste dueño/producto
visible al Owner), 15bcd59f (P3-25 historia durable por elemento no-orden) y
6cc7e663 (P3-22 mensajes locales en app, conserva UUID y no muestra prosa remota).
Regresiones RED→GREEN de los cuatro puntos. SQL167/167, Edge648PASS/0FAIL y
dos ignores históricos. Dos controles SQL nuevos fallan al quitar las incidencias.
Catálogo contra base 3f82af867: 59→60 suites,33→34PASS,26rojas idénticas,
1266→1433 aserciones,0regresiones. Runner NOSUPERUSER BYPASSRLS, Docker/Edge
en Mac con lock/trap, sin servicios reales.

Nightly remoto ahora eb553c7fe, con miniapp #1639 y tooling. Comparación nueva
desde snapshot exacto: SQL74suites/48PASS/26FAIL; las59 comunes son idénticas a
esta rama (15 nuevas de miniapp no están en la base aislada). Edge643PASS/0FAIL/
2ignored. PR remoto sigue011ca3cbe y GitHub marca CONFLICTING; requiere
integración del conjunto y CI del SHA final por el orquestador, no se acredita
un candidato integrado con ese nightly.

Rust Windows: fmt/check/Clippy y Nextest servicios188PASS/2skips, incluidos
procesos reales con fixtures. Workspace completo: fmt/check/Clippy PASS,
Nextest1786/1786 (14 skips del perfil existente) y lifecycle18/18 PASS.
Ejecución secuencial por compilar.ps1,MIN_GB=0,jobs2 y targets propios que se
eliminan al cerrar. Sin cambios en runtime/domain/IPC/testdata; telemetría
no repetida. SHA final/pushbare y limpieza verificados en buzón e issue.
Plane pasa a Por revisar al cerrar desde servidor. Evidencia Mac
~/evidence/1593-r5 y servidor C:/VantareServer/evidence/1593-r5.
Campaña inerte; sin Polar/Clerk reales, productos, deploy, merge ni release.

## #1593 / VANTA-39 · Ronda 4 entregada al bare · 15/10/2026

Base de ronda d90b8ec04 ya publicada en PR draft #1659 por el orquestador.
Misma rama vantareapp/isa-1593-descuento-informes, Mac ~/wt-1593, nightly
3f82af867 verificada sin cambios. SHA final y siete commits en el buzón
~/orq/1593.buzon.md; pendiente publicar el SHA nuevo en GitHub.

- P2-8: cinco aceptados dan **seis cobros en total**, contando los ya consumidos
  con el tramo de tres. reward_granted_at conserva la primera concesión;
  reward_expires_at sigue el plazo del tramo nuevo. Regresión con cobro entre
  tramos, cinco restantes y corte tras seis totales.
- P2-9: creación creating/uncertain sin ID se libera a los30min, conservando
  el derecho por cuenta y admitiendo un intento nuevo/Plus. Marca durable de
  recuperación visible al Owner aunque aún no exista promoción/suscripción;
  el pago la resuelve y consume el derecho. IDs remotos conocidos mantienen
  GET y prueba terminal/CAS. Pro→Plus con Pro abierto espera con409 y mensaje
  claro, sin enlace de plan equivocado ni segundo checkout. Una creación remota
  sin respuesta puede dejar un checkout huérfano sin enlace entregado; esta
  recuperación es la decisión del orquestador R4, no atomicidad entre proveedores.
- P3-18: captura por elemento, continúa toda la página, intenta registrar el
  hueco y devuelve código saneado. Si falla conserva cursor para reintentar la
  página; los éxitos previos deduplican. Handler corta su bucle de páginas
  después de esa página y marca el fallo; no pierde facturas silenciosamente.
- P3-19: p_attempt obligatorio en SQL y helper; no existe concesión sin reserva.
- P3-20: resultado contable inseguro registra hueco antes de cuarentena, sin
  proyectar como factura la instantánea ambigua.
- P3-21: cuenta borrada fuera de la lista y cuenta viva dentro, con mutación
  accounts-deleted que rompe precisamente ese filtro. B03 se mantiene.

Evidencia Mac ~/evidence/1593-r4/RESULTADOS.md: **152/152 pgTAP** de promoción,
**24 controles SQL y3 Edge** detectados. Regresiones de los seis puntos
RED→GREEN con logs. Catálogo completo NOSUPERUSER BYPASSRLS: nightly59/33PASS,
rama60/34PASS, mismas26 suites rojas,1266→1418 aserciones,**cero regresiones**.
Baseline R2 mismo actor/runner y SHA nightly sin cambios. Edge completo
**644PASS/0FAIL/2ignored** históricos. Formato, lint producción/nuevos módulos,
superficies, quality, retirada y diff-check PASS. Ocho require-await del test
checkout siguen históricos. Sin Rust tocado: clippy/nextest/lifecycle/telemetría
omitidos; sin target propio creado. Docker/Edge con lock/trap, sin red real.

Issue #1593 y Plane VANTA-39 pasan a Por revisar al cerrar desde servidor.
Runbook actualizado sin las frases contradictorias de3+6 ni soporte obligatorio
para una reserva sinID ya caducada. Decisiones multi-cuenta aceptado y caducidad
configurable6meses permanecen. Sin Polar/Clerk reales, productos, secretos nuevos,
deploy, scheduler, merge, release ni promoción.

Siguiente: publicar SHA del bare a PR1659, ejecutar CI y re-review independiente
R4; sandbox autorizado y QA visual/Windows siguen pendientes. El check remoto
observado (GitGuardian SUCCESS) acredita d90b8ec04/R3, no R4. Seis descuentos
Polar Pro200/Plus300 EUR repeating1/3/6, sin productos nuevos; catálogo vacío
y campaña inactiva. #1620/#1639 conservan su coordinación pendiente.

## Histórico · #1593 / VANTA-39 · Ronda 3 entregada al bare · 15/10/2026

PR draft [#1659](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1659),
todavía en el SHA de R2 d16f28426 hasta que publique el orquestador. Misma rama
vantareapp/isa-1593-descuento-informes, worktree Mac ~/wt-1593, base nightly
3f82af867. SHA final y commits separados por punto en ~/orq/1593.buzon.md.

- P1-2: derecho de primer mes por cuenta durante la semana, recuperable tras
  expirar el intento. GET remoto devuelve el enlace abierto sin duplicarlo;
  solo expired/failed permite otro. CAS y datos durables sobreviven GC, pago
  consume una sola vez; incierto sin ID devuelve 503 y requiere reconciliar.
  No continúa silenciosamente a precio normal. B03 y RPC solo servidor probados.
- P2-4: canceled/paused anteriores se dan por limpios con fecha/motivo durable,
  sin PATCH prohibido. Prueba de lote confirma el premio en la suscripción
  vigente en la siguiente pasada, incluyendo el fallo remoto real 422.
- P2-5: reconciliación alimenta el ledger por order ID aunque el inbox ya
  completó/quarantinó su efecto. Traza de origen/fecha y huecos durables por
  datos incompletos; incidencia Owner y sin rearme hasta reparar. Un refund
  inicial sigue siendo autoritativo aunque otra factura tenga datos incompletos.
- P3-9/10/13: ciclo después de trial incluido, factura inicial ausente visible
  y resolución automática; false o retirar el flag nunca apagan contabilidad.
- Decisiones de Isaac P3-11/12: multi-cuenta aceptado sin control ni más PII.
  Saldo pendiente caduca a seis meses de calendario Madrid desde la concesión,
  duración única en private.report_promotion_policy.reward_valid_months,
  guardada por tramo. No cambia tramos existentes al editar la configuración;
  bloques ya confirmados terminan naturalmente sin retirarlos por caducidad.
  Fechas de caducidad disponibles en payload Owner; no UI Rust nueva.

Evidencia ~/evidence/1593-r3/RESULTADOS.md: **133/133 pgTAP** de promoción,
**20 mutaciones SQL y 5 Edge** detectadas con fallo de comportamiento. Catálogo
completo NOSUPERUSER BYPASSRLS: nightly 59/33 PASS, rama 60/34 PASS, mismas
26 suites rojas del entorno, 1266→1399 aserciones, **cero regresiones**.
Baseline R2 reutilizado con mismo runner/actor y base nightly verificada sin
cambios; comparación final guardada. Edge completo **640 PASS / 0 FAIL /
2 ignored** históricos. Lint producción/nuevos módulos, formato, superficies,
quality, retirada y diff-check PASS. Dobles antiguos completan la RPC contable,
sin suprimir checks. Ocho require-await del test checkout siguen históricos.
No Rust modificado: clippy/nextest/lifecycle/telemetría omitidos esta ronda.

La mutación histórica de quitar solo el guard de prepare sobrevive por las
otras barreras y por ausencia de suscripción tras B03; se conserva su evidencia.
El control deleted ahora rompe la frontera nueva de recuperación y cae en la
aserción de cuenta borrada, sin desactivar defensas de producto.

Sin Polar/Clerk/Storage reales, productos, secretos nuevos, deploy, scheduler,
merge, release ni promoción. Lock huérfano del reinicio comprobado y liberado;
gates posteriores con lock y trap, sin contenedores propios pendientes. Sin
target Rust creado. QA visual/Windows y sandbox siguen pendientes. Polar no
cambia: seis cupones fijos EUR Pro200/Plus300, repeating1/3/6, sin productos.

Siguiente: el orquestador sube el SHA del bare al PR, ejecuta CI y pide revisión
independiente R3. El check remoto visto solo acredita R2 (GitGuardian SUCCESS).
Catálogo sigue vacío, campaña inactiva; integración #1620/#1639 y activación
requieren su coordinación/autorización. Runbook:
supabase/functions/billing-report-promotion/README.md.

## Histórico · #1593 / VANTA-39 · Ronda 2 · 15/10/2026

PR draft [#1659](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1659).
Revisión DeepSeek NO APTO leída y corregida; pendiente revisión independiente nueva.
Base de ronda `cc1989b0b`, nightly `3f82af867`, misma rama
`vantareapp/isa-1593-descuento-informes` y worktree Mac `~/wt-1593`.
SHA final y commits por punto, push al bare y FIN: `~/orq/1593.buzon.md`.
El PR remoto sigue en la entrega anterior hasta que lo suba el orquestador.

- P1: cierre 02/11/2026 **19:00 Europe/Madrid** exclusivo; bordes y DST probados.
- P2-1: el premio sigue el plan/suscripción activos; conserva alta/ventana y saldo,
  audita traslados, limpia el descuento anterior y soporta entregas fuera de orden.
  Este caso ya no lanza conflicto ni manda el webhook a cuarentena.
- P2-2: saldo por periodos de facturas pagadas con descuento, sin prorrateo; la
  factura inicial va separada. No se consume por el reloj del espejo. Cupón finito
  de 6/3/1 según saldo restante: un traslado/reparación no regala meses extra.
  Rearme de un mes solo tras factura real, con clear/attach y fase durable que
  recupera respuestas perdidas. PATCH tardío conserva los cobros pendientes.
- P2-3: error saneado durable por cuenta, visible al Owner; sigue el lote.
  Presupuesto 45 s y cursor del último cliente procesado.
- P3: porcentaje/duración/validación en allowlist; comparación del mayor ahorro y
  ciclo leído de Polar; conserva beneficios ajenos. RPC de checkout anterior a
  reservar intento, inyectable y probado con campaña encendida. Config gateway
  verify_jwt=false y gate obligatorio, sin activar deploy. Owners explícitos.
  Marca/reserva durable de primer mes; facturas e historial la consumen aun sin flag.
- Política: devolver la factura inicial pierde el premio; dos spams bloquean nuevos
  tramos **desde la segunda revisión**, conservando los ganados antes de ella,
  aunque el cron vaya tarde. El corte queda persistido. Miniapp refleja incidencia,
  devolución y conservación de meses tras spam.

**Evidencia `~/evidence/1593-r2/`:** 98 pgTAP de promoción PASS, 15 controles SQL
RED y tres controles Edge RED de comportamiento (lote, checkout, gateway).
SQL completo con el MISMO runner NOSUPERUSER BYPASSRLS: nightly 59 suites/33 PASS,
rama 60/34 PASS; 1266→1364 aserciones aprobadas y **0 regresiones**. Se conservan
26 suites rojas comunes; no se ocultan. Cuatro que pasaban con el superusuario de
R1 exponen requisitos de fixtures (dblink, schema extensions, SET ROLE); no se
presentan como regresiones de producto ni se elevan privilegios para taparlas.
Edge **632 PASS / 0 FAIL / 2 ignored**. Clippy admin PASS, Nextest **18/18**, fmt,
lint de producción/nuevos módulos, superficies deploy, calidad y retirada PASS.
El test de checkout conserva ocho require-await históricos, idénticos a nightly;
comparación JSON y fallo inicial de lint guardados. No cambian runtime/domain/ipc/
testdata: lifecycle y telemetría omitidos. QA visual/Windows siguen sin acreditar;
permiso de captura Mac ausente en R1, no se afirma captura nueva.

Sin Polar/Clerk/Storage reales, credenciales nuevas, productos, deploy, scheduler,
merge, release o promoción. Catálogo vacío y flag deshabilitado. Siguen haciendo
falta los seis descuentos fijos (Pro 200 / Plus 300 céntimos, repeating 1/3/6),
no productos nuevos; el de un mes sirve también saldos parciales. Reconciliar
historial de órdenes antes de activar/retomar si faltaron webhooks. Distribución y
atribución de creador frente a #1620 y fusión con la UI #1639 siguen al orquestador.
No se promete atomicidad entre una petición Polar ya enviada y un borrado B03.

Siguiente: revisar diff/controles, subir SHA del bare a PR #1659, ejecutar CI del
nuevo SHA y repetir revisión independiente. Después, sandbox autorizado para
facturas, traslados, rearmes, devoluciones y pausas; sin activación automática.
Contrato vigente: `supabase/functions/billing-report-promotion/README.md`.

## Histórico · #1593 / VANTA-39 · Entrega inicial · 15/10/2026

Implementación aislada desde nightly `3f82af867`, rama
`vantareapp/isa-1593-descuento-informes`, worktree Mac `~/wt-1593`.
Encargo aprobado del 15/10: Pro/Plus mensual, primer mes lanzamiento, siguientes
normales salvo 2 aceptados → 3 meses / 5 → 6. Un premio por cliente/entorno;
dos spams lo revocan. Consume decisiones finales #1594 y preserva B03/#1622.
SQL privado/RLS, operaciones con lease, GET/PATCH y recuperación de respuesta
perdida; cliente Polar abstracto probado con dobles. Owner recibe y muestra
aceptados, tramo y último descuento confirmado. Progreso en Hub queda propuesta.

Estado: preparado para revisión, no integrado ni activado. Catálogo vacío y
feature flag off. **Sin** Polar/Clerk/Storage reales, productos/descuentos reales,
secretos, deploy, scheduler, GitHub push/PR, merge, release ni promoción.
Hito backend `7c7583caa`; SHA final y commits entregados al bare local constan en `~/orq/1593.buzon.md`.

Evidencia local `~/evidence/1593/`: 46 pgTAP nuevos PASS; nueve mutaciones de reglas
reproducen RED; catálogo completo 59→60 suites, ninguna común empeora (22 suites
heredadas rojas conservadas, no se ocultan). Edge **613→624 PASS**, 0 FAIL,
2 ignored históricos. Clippy y build admin PASS, Nextest **18/18** (incluye
regresión nueva); fmt/lint, deploy surface, calidad/retirada PASS. SQL y Edge bajo
lock Docker, contenedores desechables sin red; Deno con caché y sin permiso de red.
No cambian runtime/domain/ipc/testdata: lifecycle y telemetría omitidos.
QA visual pendiente: GPUI demo arranca, pero macOS devuelve
`could not create image from window`; `CGPreflightScreenCaptureAccess()=false`.
No se presenta una captura ni se afirma QA visual o Windows.

Decisiones conservadoras para revisar antes de activar: fin de altas el
02/11 **00:00** exclusivo (hora final no especificada); 45 días son 1080 horas;
seis meses del tramo mayor empiezan en el siguiente cobro. #1620 conserva su
campaña de productos de lanzamiento a precio permanente: esta implementación
solo admite **normales** mensuales y no migra suscripciones. Códigos de esa
campaña no se importan; Isaac debe decidir su distribución/atribución en esta.
Prerrequisito de códigos: descuento 20 % / 2 meses con scope normal y atribución
conservada al aplicar lanzamiento; no hay entrada de códigos nueva en la app.

Crear después, con autorización: seis descuentos Polar EUR, Pro fijo 200 céntimos
repeating 1/3/6 meses y Plus fijo 300 repeating 1/3/6, cada uno limitado a su
producto normal mensual. No hace falta crear productos nuevos. Configurar IDs,
secreto de cron/flag y verificar facturas en sandbox antes de producción.
B03 se comprueba antes de PATCH y ACK; una petición ya enviada no tiene
atomicidad con el borrado de otro proveedor: reconciliar/cancelar tras esa carrera.
Integración de la UI nueva de #1639 pendiente de merge de dependencias; el campo
opcional está listo y su pequeño bloque debe conservarse en el detalle nuevo.

Siguiente acción del orquestador: revisar diff/evidencia y estas decisiones,
resolver integración con #1639, generar PR/CI y solo promover tras autorización.
Contrato/runbook completo y lista Polar:
`supabase/functions/billing-report-promotion/README.md` desde raíz Git.
## VANTA-83 / #1661 · ronda 5 terminada para revisión · 16-oct-2026

- Código validado d037f8f661083791c848ba7081452d3488b974c1; PR draft #1666
  hacia nightly. Re-review r3 APTO; esta ronda requiere revisión nueva.
- F1 definitivo: refund del origen o de factura de la suscripción, o revocación,
  retira el descuento de creador mediante GET/PATCH/ACK durable e idempotente.
  Fencing, marcador anterior al primer pago y cuenta borrada; fallo visible Owner.
  Founders conserva prioridad para detener renovación antes de limpiar creador.
- F2 riesgo aceptado por Isaac: puede usar el código cualquiera que lo conozca.
  F3 UUID y pertenencia por creador/entorno/intervalo; Owner registra ambos cupones.
  F4 runbook de rotación sin ampliar managedIds ni reiniciar repeating.
  F5 webhook real probado: initial solo desde billing_reason, nunca metadata.
- Consulta Polar real autorizada: solo GET con token de lectura por stdin SSH,
  nunca impreso ni guardado en Mac. Mapa real completo y plan online en
  C:/VantareServer/evidence/polar-auditoria/POLAR_PRODUCT_MAP.production.json
  y plan-catalogo-online.txt. Producción ready=true, writes=0, inventario
  0 clientes/0 subs activas/0 pedidos (2026-10-15T23:45:37.832Z).
  Se revalida al aplicar. aplicar-catalogo.txt contiene comando exacto para Isaac;
  Deno instalado en Mac, requiere otro token con escritura. Bundle conservado.
- Rojo→verde: online sin escrituras, initial falsificado, retirada ausente y
  pertenencia SQL. Final: 286 pgTAP, 260 Edge y 25 Owner Nextest PASS;
  check workspace, Clippy Owner -D warnings, fmt Rust/Deno y quality/retirement
  PASS (456 huellas). Logs C:/tmp/founders-1661-evidence y Mac ~/orq/founders-1661-evidence.
- No repetir Nextest global/lifecycle/telemetría: R5 Rust solo toca Owner;
  se conservan R4 1798 Nextest (14 omitidas), lifecycle y 25 telemetría PASS.
- Plane Por revisar al entregar; SHA final y CI verificados en PR/issue.
  Sin apply, dinero, deploy, merge de feature, release ni capturas (#1655).
  #1593 debe adoptar escritor común/preservar plazos y respetar revocación;
  #1624 debe rebasarse. Web intacta. IVA y renovaciones sandbox pendientes.

## VANTA-83 / #1661 · ronda 4 terminada para revisión · 16-oct-2026

- Pro Plus confirmado 9,99/99,90 EUR; primer periodo 6,99/69,90.
- Creador puede acompañar al lanzamiento: solo atribución en primer checkout,
  20 % desde renovación. Cupones API-only mensuales/anuales configurados en
  polar-launch-prices.json (11/12 meses). Comisión manual 30 % mes 1 y 10 % meses 2–12.
- Claim y atribución atómicos; primer pago obligatorio, lease/GET/PATCH/ACK,
  reintento sin reiniciar repeating y fallo visible en Owner. Informes puede
  reabrir selección tras el primer pago; mayor ahorro, empate informes,
  perdedor registrado. Founders añade Stable + Nightly vitalicios; refund retira ambos.
- [Contrato #1593](../../billing/creator-renewals-1661.md). Rama leída sin tocar;
  coordinación en issuecomment-6204073057 de #1593. **Pendiente en su integración**:
  adaptar el escritor al arbitraje/lease y preservar plazo/saldo al volver de
  informes; no activar dos escritores independientes ni afirmar prueba conjunta.
- Código 52fab00d6ad0e4932d434bd3ffab35613e79aa2b. PR draft #1666 → nightly;
  contiene merge autorizado eb553c7fe; sin integración de esta feature.
- RED creador + campaña y Nightly contra baseline; 252 Edge, 247 pgTAP,
  1798 Nextest PASS (14 omitidas por perfil), check/Clippy global/fmt,
  lifecycle y 25 telemetría PASS; quality/retirement PASS (456 huellas).
  Primer Nextest falló por fixture nueva desordenada; se corrigió el orden,
  conservando la validación estricta. Log del fallo y pasada verde conservados.
- Plan offline completo regenerado en C:/VantareServer/evidence/polar-auditoria/plan-catalogo.txt.
  Modelo válido; apply_ready=false hasta inventario vivo verificado. Comando
  de Isaac en aplicar-catalogo.txt vecino; no se ha ejecutado apply ni consultado Polar real.
- Plane se devuelve Por revisar con PR y resumen. CI remota del push final se
  comprueba en la entrega; no se afirma despliegue, merge ni release.
- Sin dinero, servicios comerciales reales ni capturas (#1655). Web intacta,
  contrato VANTA-42 actualizado; #1624 debe rebasarse sin tocar su rama.
  Validación de IVA/renovaciones reales y activación pendientes del operador.

## VANTA-83 / #1661 · ronda 3 de acabado (16/10/2026)

Re-review R2 **APTO**, informe `C:/VantareServer/evidence/ds-rev-1661/review-r2.md`.
N2: creador solo propiedad propia y UUID válido, rechazo anterior al claim.
N3: aplicación de producción exige inventario en vivo vacío antes de escribir:
cero clientes de organización y cero suscripciones activas/pedidos por producto
existente afectado. Consulta fallida/incompleta también aborta. Ready calculado:
modelo válido + inventario verificado; offline false, sin afirmar revisión real.
Merge autorizado de `origin/nightly eb553c7fe` sin conflictos; incluye cola nueva
y retirada de CI Linux. No se fusiona la rama de issue en nightly.
Regresiones R3 RED contra versión anterior; GREEN final: **181 Edge PASS**,
**1797 Nextest PASS**, 14 omitidas por perfil; **check y Clippy global PASS**,
fmt/quality/retirement PASS y **11 tests del alcance de gates PASS**. Rust serial
por cola nueva, MIN_GB=0; no ha hecho falta fallback de Clippy por crates en R3.
SQL/lifecycle/telemetría no se repiten en R3: no cambia schema ni su código;
evidencia de rondas anteriores conservada. Diff R3 y merge revisados.
PR #1666 draft a nightly; rama ya contiene eb553c7fe y no está BEHIND.
Plane Por revisar al cierre; CI remota pendiente. Sin promoción a nightly,
despliegue ni release. Evidencia en `C:/tmp/founders-1661-evidence` y Mac
`~/orq/founders-1661-evidence`; siguientes acciones: revisión R3/CI y operación
manual del catálogo con mapa completo, IVA sandbox y ventas cerradas durante corte.
Plan/bundle/comando se regeneran; ninguna consulta ni mutación contra Polar real.

## VANTA-83 / #1661 · ronda 2 de seguridad (15/10/2026)

Review R1 NO APTO: B1/I1 y M1–M4 corregidos. Admisión SQL persistente de
Founders por cuenta/entorno antes del grant; rechazo de Launch nueva con
cuarentena e incidencia crítica Owner, sin cortar replay/reembolso histórico.
Checkout bloqueado ante admisión o pago recibido pendiente con binding.
Venta separada por entorno, ACL verificadas, precio configurado e IVA coherente;
reactivar Pro vuelve a cancelar renovación con recibo por revisión remota.
Una confirmación vieja no completa una reactivación posterior. Reembolsar
Founders no reactiva Pro (decisión aceptada), ni hay refunds automáticos.

Decisión adicional de Isaac: campaña de beta pública con **descuento `once`**
sobre productos normales, sin productos recurrentes de lanzamiento nuevos.
Pro 599→399 / 5999→3990, Plus 999→699 / 9990→6990; renueva siempre al normal.
Ventana por entorno en JSON, producción 26-oct→26-nov 19:00 Madrid.
Checkout aplica descuento servidor, sin trial ni entrada libre de códigos;
rechaza creador + campaña, valida código exacto fuera de ella y cambia la
huella del intento al cambiar oferta. Los tests del modelo retirado de productos
separados se sustituyen por tests de precio normal, `once`, fechas, no acumulación,
historia, preflight, ownership, reintentos, token y salida exclusiva.

RED: cuatro regresiones webhook contra ec47efa5; SQL R2 sin columna de entorno;
cuatro regresiones de checkout once contra handler original. GREEN Mac:
188 pgTAP y 176 Edge PASS tras cambio de modelo. Check workspace y Clippy del
crate Owner PASS; Nextest Owner **25/25 PASS**. Clippy workspace falló por RAM dos
veces, evidencia conservada; alcance incremental de crate tocado, un job,
sin sccache, VANTARE_CARGO_MIN_GB=0. Sin repetir telemetría/lifecycle: runtime,
IPC y servicios Rust no cambian en R2; validación completa anterior conservada.

Plan completo regenerado sin token/--apply en servidor:
`C:/VantareServer/evidence/polar-auditoria/plan-catalogo.txt`,
`production_apply_ready: true`. Comando exacto (no ejecutado): fichero vecino
`aplicar-catalogo.txt`; bundle Mac `~/orq/polar-auditoria/isa-1661` fuera del
worktree desechable. Isaac debe aportar mapa completo, token en entorno,
verificar IVA en sandbox y revisar/publicar los nuevos productos draft.
No consultas ni cambios contra Polar real; web intacta, #1624 debe rebasarse.
Entrega R2 aislada: push y PR #1666 draft a nightly. Siguiente: orquestador revisa
R2/CI y coordina #1624/VANTA-42; Isaac verifica IVA en sandbox y decide aplicar
el catálogo con su mapa completo. Sin merge, deploy, release, capturas (#1655)
ni operaciones reales. fmt, quality y retirement PASS. Evidencia R2 conservada
en `C:/tmp/founders-1661-evidence` y Mac `~/orq/founders-1661-evidence`.

## VANTA-83 / #1661 · Plan Founders (15/10/2026)

Rama `vantareapp/isa-1661-founders`, base asignada
`28800654c5bb4ca425b49bd827d0ee8cbbeeb155`, worktree propio isa-1661.
Plane En curso; PR draft [#1666](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1666)
a nightly; Project Vantare, `area:licencias`, sin milestone asignado.

Decisión definitiva de Isaac: **Founders es un plan de 50 EUR una vez**,
todo el catálogo presente/futuro para siempre; desde la beta pública del
26-oct-2026 19:00 Madrid **sin fecha final**, con interruptor SQL de venta.
Pro/Pro Plus pueden comprar: derecho inmediato y cancelación de renovación al
final del periodo pagado, sin reembolso. Una única política `end_period`,
recibo persistente de cancelación y estado pendiente/completado visible en Owner;
los errores reintentan mediante el inbox existente. Alternativa proporcional
retirada con autorización de Isaac por simplicidad. Sin operaciones reales.

Launch Edition retirada del catálogo de compra y de los botones. Se conserva
la lectura de mappings, pagos y derechos históricos, migraciones y tests.
El script prepara Founders en español. El producto real ya existe según Isaac;
los IDs se centralizan en `supabase/functions/scripts/founders-production-config.json`,
fragmento para fusionar con `POLAR_PRODUCT_MAP`, sin aplicar cambios reales. El contrato incorpora primer periodo Pro
3,99/39,90 y renovación 5,99/59,99, extra Pro Plus, creador no combinable,
informes desde mes 2 y beta pública. El modelo recurrente antiguo de #1620
requiere reconciliación antes de aplicar catálogo en producción; se impide esa
aplicación. **#1624 debe rebasarse sobre este PR**, sin tocar su rama aquí.

Derecho `vantare.plan.founders`, servicios v10/control v5/fotos v10, textos de
cuenta ES/EN/IT/PT-BR. [Contrato y payload web para VANTA-42](../../billing/founders-1661.md).
Repo web intacto. Founders no concede roles ni canales privados.
Límites: credencial perpetua offline no revocable hasta reconexión; para cerrar
venta futura, desactivar también producto/enlaces entregados de Polar.

Validación final local: **152 pgTAP PASS** (42 Founders, 57 Owner,
34 reembolsos, 19 tombstones), **193 Edge PASS** en Mac con lock Docker.
**1795 Nextest PASS** (14 omitidos por perfil) y **494 pruebas incrementales
Hub/Owner PASS** (4 omitidas), check/Clippy/fmt PASS. Lifecycle PASS y
telemetría **25/25 PASS**. Gates de Windows seriales, target propio;
última fuente Rust validada `5f39b449880b7a637ecd29559b9e0e9a1fbb2bac`.
El cierre posterior solo añade compatibilidad SQL para una suscripción ya
cancelada, su test y evidencia/texto. Quality/retirement PASS (456 huellas).
Regresión de credencial RED con normalizador original. Diff completo revisado.
Logs en `C:/tmp/founders-1661-evidence` y Mac `~/orq/founders-1661-evidence`.
Conservados fallos previos de RAM/mmap y cortes del orquestador/T3; repetición
sin sccache con un job y VANTARE_CARGO_MIN_GB=0 autorizado.

Entrega aislada: PR #1666 draft a nightly, push autorizado; Plane pasa a
Por revisar con resumen. Última consulta CI: promoción, quality ratchet y
GitGuardian PASS; native-linux y agregado bloqueante en curso. No se afirma
CI completa ni integración. Sin captura (#1655), deploy, dinero, merge ni release.
Siguiente: orquestador revisa PR/CI y coordina rebase de #1624 y compra web
VANTA-42; Isaac incorpora el fragmento a la configuración y valida apertura cuando corresponda.

Actualización posterior: inventario real comunicado por Isaac documentado: Pro mensual
4,99 EUR, Launch Edition histórica 30 EUR y Founders 50 EUR. Pro anual, 5,99/59,99
y Pro Plus aún no existen en producción. 69 pruebas offline de mapping y catálogo PASS, incluida la regresión del fragmento de
Founders; sin repetir Rust/SQL porque no cambian código nativo ni schema.

## #1627 / PR #1639 · VANTA-21 · ronda 5 (15/10/2026)

Worker Codex macOS arm64, sin subagentes ni servicios reales. Seguimiento por
excepción explícita en `~/orq/1627.buzon.md`; sin Notion/Plane/GitHub.
Entrada `980649944`; worktree `~/wt-1627r5`, misma rama de issue.

R5 corrige reparación con cupo agotado (trigger de aceptación suspendido solo
para restaurar decisiones en la misma transacción), añade auditoría por fila con
reviewer original y marcador de reparación (también si fue borrado; barrera de
auditoría suspendida solo bajo lock DDL en esa transacción y restaurada antes
del commit), y repone `admin_report_owner_changed`
(40001) tras el lock tanto para informes antiguos como contribuciones.
Spam antiguo conserva motivo. Las decisiones de ambos orígenes son finales;
la UI ofrece Aceptado/No aceptado/Spam solo antes de decidir y permite guardar
versión desde Aceptado/Arreglado. **No se recupera «Arreglado en X» ya perdido
por R3**: el Owner debe confirmarlo de nuevo desde evidencia; los `fixed` aún
válidos se conservan.

El borrado relee suscripciones después del tombstone #1622 para incluir compras
anteriores a la barrera, y consulta Polar por el UUID del checkout para incluir
compras completadas cuyo webhook aún no llegó. Combina/deduplica ambos orígenes.
GET Polar 404 deja evento sanitizado y permite continuar;
los errores transitorios siguen siendo incompletos/reintentables. Procedimiento
manual del Owner en `supabase/functions/native-admin/README.md` (panel del mismo
entorno, comprobar/cancelar y repetir con la confirmación original). Sin retirar
barreras ni ampliar el candidato a producción.

| Check local | Nightly bf5eead43 | Rama R5 |
| --- | --- | --- |
| Catálogo SQL completo, Docker sin red | 59: 34 PASS / 25 FAIL | 74: 49 PASS / 25 FAIL |
| 59 suites SQL comunes | 1306 aserciones PASS | 1306 PASS; cero diferencias |
| Gestión pgTAP | 57 / 1 suite | 206 / 16 suites PASS |
| Seguimiento canónico | 35 PASS + concurrencia/rollback | 35 PASS + concurrencia/rollback |
| Edge/Deno sin red | 613 PASS / 2 omitidos | 643 PASS / 2 omitidos |
| Clippy admin/services `-D warnings` | PASS | PASS |
| Nextest admin/services Mac serial | 172 PASS | 178 PASS |

Rojo→verde conservado para reparación con cupo ocupado, auditoría con reviewer
borrado, dueño cambiado, motivo/finalidad de informes antiguos, UI, suscripción
tardía local y compra Polar con webhook retrasado/404. La reparación se prueba
reaplicando el fichero real y verificando idempotencia y barreras restauradas.
Los 25 fallos genéricos son heredados, idénticos en ambas ramas; no se declaran
verdes. Nightly tuvo un fallo intermitente inicial de login; repetición serial
completa 172/172. Fmt Rust/Deno, quality y 456 huellas de retirada PASS.

Evidencia y SHAs finales: `~/evidence/1627r5/RESULTADOS.md`, `TABLA-SQL.md` y buzón.
Rust 1.95 fijado, jobs=4 y target propio `~/target-1627r5` retirado al cerrar.
PowerShell no está instalado y el wrapper usa Win32: Cargo directo en este Mac.
Sin cambios runtime/domain/ipc/testdata; lifecycle/telemetría no se repiten.
No valida Windows/DPI/teclado, SaaS real, CI remoto ni despliegue/upgrade remoto.
Se han corregido migraciones del candidato R3/R4, sin aplicar nada a servicios
reales; un entorno que ya las registró requiere plan de upgrade del orquestador.
Pendiente revisión del orquestador; sin merge, promoción, deploy ni release.

## #1627 / PR #1639 · VANTA-21 · ronda 4 (15/10/2026)

Worker Codex macOS arm64, sin subagentes, GitHub ni servicios reales. Excepción
explícita del orquestador: sin Notion/Plane; seguimiento en `~/orq/1627.buzon.md`.
Rama `vantareapp/isa-1627-miniapp-gestion`, entrada `1ce7c0edd`.
Nightly `bf5eead43` (#1622 incluido) fusionado mediante merge `9a70cbc7`.
Código entregado por hitos, incluido borrado separado `83494734`; SHA final de
la entrega documental y copia al bare `~/vantare.git` en el buzón y la evidencia.
Pendiente de revisión del orquestador; sin promoción de canal, deploy ni release.

**Regla de informes:** una decisión de contribución es final. Aceptado,
rechazado, spam y arreglado no vuelven a Recibido/En revisión, tampoco los
históricos sin fila de revisión. SQL devuelve conflicto y la UI oculta esas
vueltas. No se añade una acción Reabrir. Arreglado sigue ocupando 1/día y
2/semana UTC/cuenta; también cuentan las revisiones aceptadas si un servidor
anterior alteró el estado. La migración restaura el estado de esas revisiones,
sin borrar su nota/fecha ni los arreglos que todavía conservan estado `fixed`.
No recupera «Arreglado en X» ya borrado al reabrir en R3; debe volver a confirmarse
con evidencia. R5 añade auditoría por fila reparada y evita consumir de nuevo el cupo. Los informes antiguos
`testing_center_reports` admiten Spam; sus títulos se alinean a la izquierda.

**Anual cerrado por Isaac el 15/10:** 30 % del pago anual completo, sin
prorrateo. 100,00 € → 30,00 € al pagar en el mes 1; renovación en mes 13 → 0 €.
No autoriza pagos reales ni producción.

**Borrado conectado a #1622:** Edge compara el correo actual de Clerk antes
de iniciar la solicitud; SQL vuelve a proteger dueño y actor bajo locks.
La barrera, anonimización y auditoría se confirman juntas antes de cancelar
Polar, borrar Clerk y drenar Storage con el limpiador común. Una solicitud
privada conserva solo hash del correo normalizado, UUID/issuer/subject y fecha.
Un fallo posterior exige repetir con el mismo correo; no necesita recuperar
PII ya borrada y acepta 404 de Clerk solo con esa solicitud previa. No hay
reembolso ni reintento automático. Sigue limitado a sandbox.

Compatibilidad del merge: se conservan locks UUID de #1622 y su identidad
Clerk; el resolver mantiene además el bloqueo de gestión. El espejo de
pagos/refunds acompaña al ledger comercial de nightly, sin saltarse la
revocación por reembolso. Fixtures de identidad y la prueba concurrente se
adaptan al dispatcher, sin ampliar permisos de producto.

| Check local | Nightly bf5eead43 | Rama R4 |
| --- | --- | --- |
| Catálogo SQL completo, Docker sin red | 59 suites: 34 PASS / 25 FAIL | 72: 47 PASS / 25 FAIL |
| Aserciones de suites SQL comunes | 1306 PASS | 1306 PASS; cero pérdidas |
| Gestión pgTAP | 57 checks / 1 suite | 178 checks / 14 suites, todas PASS |
| Triaje / seguimiento, runners canónicos | 83 / 35 PASS | 83 / 35 PASS |
| Locks de admin frente a borrado | 4 órdenes PASS | 4 órdenes PASS |
| Borrado miniapp frente a webhook | No existe | 2 órdenes PASS, espera observada |
| Edge/Deno sin red | 613 PASS / 2 omitidos | 638 PASS / 2 omitidos |
| Clippy admin/services `-D warnings` | PASS | PASS |
| Nextest admin/services Mac, serial | 172 PASS | 178 PASS |

Los 25 fallos del catálogo genérico se conservan en ambos árboles: no se
presentan como SQL verde. Las 13 suites exclusivas de gestión pasan. Los
runners canónicos cubren cuota concurrente, snapshot obsoleto, ACL y rollback.
La aserción comercial de auditoría ahora exige actor/acción/objetivo sin copiar
resultados de cuentas; conserva la comprobación en lugar de omitirla.
Fmt Rust/Deno, quality y retirada (456 huellas) PASS. Rust 1.95 fijado,
`CARGO_BUILD_JOBS=4`, target propio `~/target-1627r4`, retirado al cerrar.

Evidencia: `~/evidence/1627-r4/RESULTADOS.md` y `TABLA-SQL.md`, logs completos,
comparación por número de aserción y capturas GPUI demo `informes.png`,
`informe-decidido.png`, `borrado-confirmacion.png`. Se inspeccionaron títulos,
ausencia de reapertura y confirmación de correo; no son pruebas de SaaS real.

Límites: Windows/DPI/teclado físico, OAuth/Clerk/Polar/Storage reales, CI remota,
despliegue y actualización de un esquema remoto previo no se verifican.
SQL completo validado desde catálogo limpio; la intercalación de migraciones
R1/R3 con #1622 requiere revisar el orden de aplicación antes de un despliegue.
Sin cambios en runtime/domain/ipc/testdata: no se repiten lifecycle/telemetría.

## #1627 / PR #1639 · VANTA-21 · corrección R1 (15/10/2026)

Worker Codex macOS arm64, encargo del orquestador, sin subagentes ni servicios
reales. Excepción explícita: no Notion/Plane/GitHub; seguimiento en
`~/orq/1627.buzon.md`. Rama `vantareapp/isa-1627-miniapp-gestion`, entrada
`52b1d3c39`; nightly `64c493e4f` fusionado primero mediante merge `2354cd416`.
Se recoge mediante el bare local `~/vantare.git`; no promoción de canal,
despliegue, release ni CI remoto. SHAs finales en el buzón y la evidencia.

Las contribuciones ya pasan por el motor de revisión de #1594: nota humana,
aceptación 1/día y 2/semana UTC por cuenta, revisión duradera y purga a 90 días
de logs/telemetría. `human` identifica revisión manual sin fingir propuesta de
modelo; la ruta pública anterior conserva propuesta obligatoria y permisos.
Spam se lee, filtra y confirma en la miniapp. La decisión sigue siendo inmutable;
un cambio incompatible devuelve conflicto. El trigger compartido retira los metadatos de arreglo al salir de `fixed`;
R4 bloquea la reapertura de contribuciones decididas.

Personas usa resúmenes sin pagos y recuentos agregados. Creadores agrega las
líneas una sola vez. En Docker, con 3.000 cuentas, 36.000 pagos y 100 creadores:
Personas 16,8 ms y Creadores 958,7 ms; antes la búsqueda excede el límite sintético
de 6 s y se cancela. Las lecturas auditan quién/qué/cuándo/objetivo sin copiar PII
ni pagos. La primera compra posterior al watermark usa el ledger, sin releer todo
Polar. Un refund identificable pero inválido pone esa factura pendiente de
revisión y bloquea su comisión; el resto se muestra. Cuarentenas y pagos históricos
atrasados requieren reconciliación revisada, sin un nuevo barrido automático.

**Decisión de Isaac, 15/10/2026: anual = 30 % del pago anual completo.**
La tasa activa está centralizada en `private.native_admin_commission_rate`.
Un anual de **100,00 € genera 30,00 €** al pagar en el mes 1; renovación en
mes 13 genera 0 €. No se prorratea entre meses. Esta decisión fija el cálculo;
no autoriza pagar comisiones reales ni activar producción.

UI: «· anual», etiqueta «—», Owner y Tester simultáneos, tarjeta Clientes/Ventas,
fechas «2 sep» y nota obligatoria de revisión. Capturas GPUI demo frente al HTML
en `~/evidence/1627-r3/comparativa.html`; no representan acceso a SaaS real.

Verificación: Docker con todas las migraciones y 133 pgTAP de gestión; motor
compartido con runner canónico #1594, 83 pgTAP + concurrencia/ACL; seguimiento
#1610, 35 pgTAP + concurrencia/rollback. Edge completo 613 PASS / 2 omitidos.
Clippy `-D warnings` y fmt con Rust fijado 1.95 PASS; Nextest admin/services
177 PASS con tests seriales y `CARGO_BUILD_JOBS=4`. Dos ejecuciones paralelas
mostraron fallos intermitentes existentes de callback; logs conservados.
Comparación de todas las suites SQL comunes bajo el runner genérico: mismos
937 asserts válidos y 22 suites incompatibles en nightly y candidato, sin nuevos
fallos. Se usan los runners canónicos para triaje y seguimiento, que sí pasan.
Quality/retirada: 456 huellas PASS. Target propio `~/target-1627r3`, borrado al cerrar.

Límites: Windows/DPI/teclado físico y OAuth/Clerk/Polar reales pendientes;
en esta R1 histórica el borrado aún no estaba conectado; R4 lo sustituye.
Los efectos externos nuevos siguen limitados a sandbox. Falta revisión del
orquestador. La decisión anual queda cerrada el 15/10/2026. No hay activación en producción.
Evidencia anterior r1: `~/evidence/1627/RESUMEN.md` (histórica).

## #1608 · R11 · Guarda y permisos de triage (15/10/2026)

Base `1ac73ce20`; comparación con nightly `64c493e4f`. Solo cambian el fixture
de triage y este handoff. `run-triage-local.py` ejecutado en ambos árboles:
**83/83 PASS**, incluidos rollback, cap concurrente y login real del worker.
La versión anterior de la rama reproduce el aborto tras ocho checks.
Catálogo completo con B03: los dos checks de permisos pasan; triage queda en
**43/84** frente a **42/83** en nightly, con los fallos de admisión ya documentados.
Su ruta B03 de borrado sigue sin una ejecución completa en verde en este contexto;
la cobertura de identidad citada en R10 procede de la suite comercial.
Catálogo repetido: **48 suites nightly / 59 rama**, ninguna común empeora.
Evidencia y comparación por aserción: `~/evidence/1608-r11/RESULTADOS.md`.
Sin ejecución nueva de otros runners de checkpoint ni de Docker/PowerShell.
SHA y entrega al bare local en `~/orq/1608.buzon.md`; revisión del orquestador pendiente.

## #1608 · R10 · Fixtures Clerk y revocación de replay (15/10/2026)

Encargo del orquestador sobre PR #1622; base `28b71186f`, nightly comparada
`64c493e4f`. Worktrees propios `~/wt-1608-r10` y
`~/wt-1608-r10-nightly`. Commits: `07d80038` (revocación/P3), `0d79ae42`
(fixtures/runner). SHA de entrega documental y push local en
`~/orq/1608.buzon.md`. Sin GitHub, Notion, Plane ni subagentes, por excepción
expresa; el orquestador gestiona el seguimiento y revisa el diff.

**R9-P1-1 resuelto:** las 12 suites que se rompían con B03 vuelven a pasar
con sus archivos originales del repo, sobre el catálogo completo:
hardening **48/48**, Clerk bootstrap **31/31**, native bridge **28/28**,
checkout **20/20**, report submission **55/55**, screenshots **80/80**,
agent jobs **71/71**, closeout **45/45**, candidate feedback **45/45**,
triage outbox **40/40**, F2 **6/6**, F3 **8/8**. También se recuperan todas
las aserciones que la identidad rompía en las suites previamente rojas:
Codex **60/61**, privacidad **34/33** (plan antiguo desajustado), core **61/72**,
access **33/56** (aborta), participación **14/20**, followup **5/35** (aborta)
y triage **42/83**, igual número aprobado que en nightly. El test nativo de
concurrencia `.psql` también pasa **6/6** en ambos árboles.

Los fixtures crean perfil y binding Clerk antes de filas dependientes y usan
claims completos (`iss/sub/role/sid/azp`). La detección del registro B03 selecciona
la ruta de fixtures. R10 verificó el catálogo completo y el procedimiento de
hardening descrito abajo; eso no demuestra el resultado de cada runner de
checkpoint ni de la imagen Docker. El runner propio de triage se ejecutó en R11.
No se modifican ACL, RLS ni funciones de producto para satisfacer esos tests.

Cambios de significado explícitos por el modelo nuevo (no se eliminan checks):

- Bootstrap: Auth de Supabase y un `sub` UUID ya no crean/resuelven cuentas;
  se comprueba su rechazo. Un login Clerk hace bootstrap explícito antes del
  claim de dispositivo; se conservan UUID estable, separación por subject y
  ausencia de vinculación por correo. Identidad incompleta devuelve `28000`.
- Bridge nativo: el issuer debe coincidir exactamente con el registro. La
  barra final se rechaza y se comprueba que no crea un alias. El alias legado
  canónico se siembra como hace la migración B03; no se normaliza al leer.
  Una identidad exacta ya vinculada no se puede reasignar a otro UUID (`23505`).
  Son 28 checks en lugar de 27 por el rechazo explícito adicional de la barra.
  La carrera conserva dos sesiones que compiten por la MISMA identidad exacta.
- `native_account_data_upgrade`: el FK de validaciones continúa existiendo,
  ahora hacia `profiles` tras B03; antes del corte sigue hacia `auth.users`.
- Core: la misma promoción con SHA incoherente se rechaza por el guard previo
  de referencias (`23503`) en vez del CHECK posterior (`23514`).
- Triage (corregido en R11): con B03, `current_account()` debe ser la única
  función privada ejecutable por authenticated y no puede haber privilegios
  sobre tablas ni columnas privadas. Sin B03 se conserva exactamente el check
  de nightly: schema `private` cerrado. El borrado usa el webhook y conserva
  el UUID duradero del reviewer en auditoría privada; el borrado del autor sigue
  purgando contexto y reviews. La aserción de auditoría sigue exigiendo tres
  filas (en el catálogo completo falla por las mismas dos reviews que no llegan
  a crearse en nightly). Este cambio de etiqueta no se presenta como fallo
  literalmente idéntico; está detallado en `COMPARACION.json`.

**R9-P2-1 resuelto:** migración aditiva
`20261015110000_isa_1608_revoke_deleted_authorizer.sql`. Retirar replay puede
limpiar la referencia al Owner borrado. Conserva TODOS los locks de UUID en
orden; solo deja de atribuir el tombstone del autorizador retirado a esa limpieza.
El reporter sigue sujeto a la barrera. La excepción exige que los ocho campos
de replay/autorización queden vacíos/falsos y que TODOS los demás campos sean
idénticos. No permite cambiar report, diagnóstico ni propietario.
Regresión **RED 7/11 → GREEN 11/11**, con revocación real como authenticated,
limpieza de los ocho campos, auditoría y diagnóstico conservados; cambios
adicionales y reporter borrado siguen rechazados. El runner incluye
`--before-deleted-authorizer` para reproducir RED. P3: eliminado el segundo
`p_account is null` redundante en el helper de reports.

**Verificación nueva, no heredada de R9:** catálogo completo sin adaptar
fixtures: **48 suites nightly / 59 rama**, una DB clonada por suite; ninguna
suite compartida pierde checks aprobados ni pasa de PASS a FAIL. Los tests
nuevos de upgrade se ejecutan además con sus datos anteriores a la migración:
identidad **18**, conflicto **4** y refunds **26**, todos PASS. En el catálogo
completo esos tres salen rojos por no sembrar el estado anterior: no son
fallos compartidos con nightly (sus archivos no existen allí).

`run-supabase-hardening-postgres.ps1` reproducido con PostgreSQL **17.11**
instalado y pgTAP, sin pwsh/Docker: **1059 checks pgTAP PASS**, clean/upgrade/
restore, 8 pares de carreras y comprobaciones de resultados, sentinel/RLS/ACL,
archivos truncado/corrupto rechazados (**48 filas PASS** en el resumen).
El propio `.ps1` actualiza sus fixtures de carreras (sesión completa y hashes),
separa el checkpoint histórico del corte B03 y guarda dump antes de liberar
la DB clean y sus roles globales para el upgrade. No se reejecutan resolutores
antiguos después del corte. El intérprete local extrae sus SQL/heredocs y no
reescribe fixtures. La sintaxis PowerShell y la imagen Supabase no se han
ejecutado en este Mac; el procedimiento y sus diferencias están en RESULTADOS.
Nightly ejecutada con el mismo intérprete: clean hardening48/Clerk31 pasan,
projection42/43 falla y las carreras originales fallan por fingerprints no
válidos; no se afirma que el script entero pase en nightly.

Runner comercial: **19 suites / 574 pgTAP**, **108 rutas / 638 checks** de
carreras PASS. Edge desde raíz, con tipos y config del repo: **594 nightly /
613 rama PASS, 0 FAIL, 2 ignored**. Deno `supabase/tests`: mismo TS2353 en ambos;
sin check, **28 PASS / 5 FAIL**, mismos cinco nombres. Calidad: **456 PASS**.

**R9-P2-2 rectificado:** la tabla nueva enumera cada resultado rojo y enlaza
su salida nightly/rama. Solo se llaman idénticos los fallos contrastados por
aserción, SQLSTATE y salida normalizada. Codex60/61 y privacidad34/33 mantienen
planes desajustados en ambos. Quince suites rojas comunes conservan etiquetas y
abortos iguales. **No se presentan como abortos idénticos** estos tres casos:
Pilot11 pasa de `23503 pilot_profiles_account_id_fkey` a `42501 authentication
required`; GitHub delivery8 pasa de permiso denegado a `23503
account_owner_unresolved`; Linear outbox8 pasa de FK ausente a ese guard previo.
Los tres siguen rojos sin perder checks aprobados, pero su causa exacta cambia.
Triage42 se documenta arriba por su cambio explícito de contrato. No se califican las 12 regresiones
corregidas como fallos preexistentes. Evidencia completa:
`~/evidence/1608-r10/RESULTADOS.md` y `COMPARACION.json`.

Límites: PostgreSQL/Storage local sintético; ningún servicio, secreto ni dato
real; sin dependencias nuevas. Rust omitido: sin cambios propios en `native/`.
Sin CI remota, despliegue, merge, promoción, release ni autorización de venta.
Siguen pendientes staging gestionado e inventario real de buckets antes de vender.
Docker lock tomado y liberado; sin servidor PG ni stack propio al terminar.
Siguiente: review del orquestador; entrega únicamente al bare local.

## #1608 · R9 · Identidad de servidor y batería completa (15/10/2026)

Base autorizada `494f5c452`; nightly `64c493e4f` incorporada sin conflictos
mediante merge `18ff846c`. Cambios propios: `b9b06d33` (adaptadores), `f711fc2d`
(revocación de replay), `0d3da715` (llamadores de identidad) y `1cfe19da`
(fixtures vigentes). El merge conserva los handoffs de ambos proyectos. Worktree `~/wt-1608r8`, rama worker propia:
la rama original estaba ocupada por otro worktree limpio en el SHA inicial.
Entrega al bare local con el refspec explícito hacia
`vantareapp/isa-1608-cierre-comercial`; SHA final/push en el buzón del orquestador.

**R8-P1-1:** los adaptadores service-only ya no fabrican claims `{sub,role}`.
Pasan el UUID verificado a tres funciones privadas `…_for_account`; wrappers
antiguos usan la misma implementación con `private.current_account()` real.
No se concede EXECUTE de helpers a clientes, servicio, triage, Pilot o publicador.
Se conservan validación, consentimiento, membresía, hashes, cuotas, retries y
crédito. Cada helper bloquea el UUID y comprueba el tombstone antes de filas;
una cuenta borrada no puede enviar. `current_account()` y sus ACL no cambian.

RED F1IP 22/26 → GREEN **26/26** con todas las migraciones. Regresión ampliada
**52/52**: triage/adjunto, claims conservados, ACL, Owner humano, calendario,
resolutores de servicio, dispositivos, entitlements, JWT native-data y borrado.
La preview sintética exacta de #1594 pasa **27 checks** tras TODAS las migraciones,
sin grants de envío artificiales. Batería comercial final: **19 suites / 569 pgTAP**,
**108 rutas / 638 checks** de carreras, incluidas las nuevas tablas triage.

Fixtures actualizados sin relajar producto: ledger37 comprueba acceso efectivo
(B02 conserva la fuente financiera), canonical8 exige bootstrap/sesión completa,
admin57 usa registro/claims verificados y rechaza issuer no exacto, roadmap31
acepta que B03 haya retirado handle_new_user. Los cuatro pasan sobre el catálogo
completo y conservan sus pruebas anteriores a B03 (admin56 en ese contexto).

La batería completa encontró otra regresión real: retirar replay después de una
autorización Owner fallaba con `account_owner_is_immutable`. Corrección aditiva
limitada a borrar los campos de replay/autorización con el mismo `report_id`.
En R9 ambos UUID conservaban bloqueo y comprobación de tombstone; el test
6/6 fijaba incorrectamente como válido bloquear la revocación si el autorizador
estaba borrado. **Decisión del orquestador en R10: ese bloqueo es un bug**;
la corrección y el nuevo RED/GREEN figuran arriba. El cambio de report sigue
rechazado y no hay excepción general para cambios de propietario.

**Inventario de causa raíz:** todas las migraciones + catálogo instalado de
nightly/rama: solo dos fabricantes de claims, ambos corregidos; 33 funciones
leen identidad y 38 contando wrappers transitivos, revisadas individualmente.
Servicios nativos/admin/billing/jobs usan parámetros o bindings explícitos;
Storage usa propietarios persistidos/manifest/ruta y su preflight sin filas.
Inventario y evidencia: `~/evidence/1608-r9/inventario-identidad.md`;
tabla por TODAS las suites: `~/evidence/1608-r9/RESULTADOS.md`.

**Rectificación R10 de la entrega R9:** era incorrecto presentar las suites
rojas de la rama como fallos compartidos o solo como snapshots históricos.
La review R9 y la nueva ejecución R10 demuestran que **12 suites pasaban en
nightly y fallaban en la rama**. R10 corrige sus fixtures EN EL REPO y las doce
pasan sobre todas las migraciones, sin traducción externa de fixtures ni grants
adicionales. No se debe usar el informe R9 para afirmar paridad con nightly.
La comparación válida y sus fallos concretos están en
`~/evidence/1608-r10/RESULTADOS.md`, con logs separados de ambos árboles.
Los recuentos y checkpoints que preceden a esta rectificación son evidencia
histórica R9; la sección R10 de arriba fija el resultado y los límites vigentes.

**R8-P3-1 documentado:** son **11 policies TO public en 10 tablas distintas**,
no 11 tablas: profiles aporta SELECT y UPDATE. Son profiles, licenses, devices,
user_entitlements, billing_customers, billing_subscriptions, subscriptions,
license_events, license_validations y hwid_changes. Con SELECT de tabla como
los defaults de Supabase, anon recibe **42501** por no tener EXECUTE sobre
current_account, en lugar de 0 filas; sin fuga. Sonda local 12/12. No se abren
ACL anon. Los clientes vigentes usan authenticated o el servidor autorizado.

Sin Notion/Plane/subagentes/GitHub, por excepción explícita; ningún servicio,
secreto o dato real, ni dependencia nueva. PostgreSQL17/pgTAP local desechable y
schema Storage del fixture R6; no se usó Docker en R9, ni queda stack propio.
Rust no ejecutado: sin cambios propios en native frente al merge de nightly.
Storage/PostgREST HTTP no repetidos; evidencia anterior R8 sigue siendo histórica.
No CI remota, despliegue, promoción, release ni venta. Siguen siendo obligatorios
el staging gestionado y el inventario de buckets de producción antes de vender.
Siguiente: review del orquestador sobre el diff y los fallos compartidos del
informe; el seguimiento y los estados del tracker los gestiona el orquestador.

Reproducción mínima de R8-P1-1 (sin DSN ni servicios reales):

```sh
python3 supabase/tests/run-commercial-local.py --pg-bin <PG17/bin> \
  --storage-schema <schema-Storage-local.sql> --output <evidencia> --testing-identity
# RED: mismo comando con --before-testing-identity.
# Default, sin --testing-identity: 19 suites y todas las carreras.
# RED de privacidad: --testing-identity --before-posthog-consent-clear.
```

## #1608 · R8 · Entrega local para revisión (15/10/2026)

Inicio `d5796ad1a`; correcciones `9496d71d` (Pilot) y `54a605a3` (deriva de
parches, regresiones HTTP y requisitos comerciales). Cinco archivos de rama,
sin Rust ni dependencias nuevas. R7-P1-1 RED SQL42501/HTTP403→GREEN200 con JWT
emitido por handler real; tras borrar, el mismo JWT queda bloqueado (403).
R7-P3-3 cuatro RED→GREEN atómicos; P3-4 riesgo de escritor futuro documentado;
P3-1/P3-2 obligatorios antes de vender, pendientes del orquestador/Isaac.

63 migraciones; 12 suites/352 pgTAP PASS, histórico232, upgrades18/4/26,
Pilot90+10+concurrencia; 80 tablas/105 rutas/620 checks, aliases40,
owners10/multipart64/buckets17, locks17/admin24 PASS. PostgREST/JWT/Ed25519 y
reconciliación SQL/HTTP PASS. Edge609/0/1 ignored desde raíz, con tipos.
Storage original v1.70.3: RED retiene, restauración drena los mismos uploads;
readonly conserva cola con 503, RW200 drena: **0 uploads/partes/colas/archivos**.
Quality456, fmt, lint producción, compile Python, surface y diff PASS.
Lint adicional del fixture TS sin modificar detecta su import HTTPS histórico
(no-import-prefix); conservado, sin excluir regla ni cambiar dependencias.
Fallos iniciales de permisos TMP Deno/iat redondeado del fixture conservados y
corregidos en la ejecución. Evidencia `~/evidence/1608-r8/RESULTADOS.md`.

Stack propio r8stack/sidecar/proxy retirados, auth sintética retirada y lock
liberado; stack ajeno intacto. Árbol final/SHA/push al bare local en buzón e
informe. Sin Notion/Plane/GitHub/subagentes/servicios reales, CI remota, merge,
promoción, deploy, release o venta. Rust y QA física omitidos por alcance.
Siguiente: review del diff por el orquestador; sin aceptación comercial implícita.

## #1608 · R8 · Migración y requisitos previos a vender (15/10/2026)

R7-P3-3: cada uno de los cuatro reemplazos de texto Pilot comprueba su patrón
y lanza RAISE específico si falta. RED: los cuatro cambios de fuente se
aceptaban en silencio; GREEN: los cuatro se rechazan y revierten funciones y
trigger completos. Runner reproducible `--pilot-patch-drift
owner|deletion|objects|uploads`, evidencia `~/evidence/1608-r8/patch-{red,green}-*/`.

**Requisitos obligatorios antes de vender (R7-P3-1/P3-2):**

- Probar en staging gestionado `commercial_storage_cleanup.py` contra la versión
  Storage y backend S3 que se desplegarán, con NULL/UUID, abort, fallo real,
  recuperación y retries; acreditar 0 uploads/partes/bytes/colas. El test local
  v1.70.3 no lo sustituye. Si cambian GUC, version preflight o codificación del
  uploadId, la adaptación falla cerrado: 503 y cola conservada. Validación y
  despliegue gestionado siguen pendientes del orquestador/Isaac.
- Inventariar buckets de producción con `owner IS NOT NULL OR
  nullif(owner_id,'') IS NOT NULL`, con autorización separada y sin exportar PII.
  Si hay propietarios de usuario históricos, resolver su retirada mediante
  una entrega de purga por API y verificarla antes de vender. Este corte no
  purga esos owners ni demuestra su ausencia. Registrar también el contrato
  global sin PII de objetos sin owner/manifest, según `tools/storage/README.md`.

**R7-P3-4, riesgo aceptado en este alcance:** la excepción de auditoría de
lecturas identifica la acción por el texto de la fila. No demuestra por sí
sola la procedencia de una lectura. Hoy `admin_audit_log` no admite INSERT de
anon/authenticated/service_role/Pilot/publicador: el único escritor de aplicación
es `native_admin_execute`, SECURITY DEFINER con Owner vivo verificado, acciones
cerradas y campos de auditoría construidos por el servidor; no acepta una fila
arbitraria. Cambiar el texto en una petición tampoco permite omitir el actor
borrado ni mutar un target borrado. Por eso no hay un bypass alcanzable por
estos clientes. Un escritor DEFINER futuro podría etiquetar una mutación como
lectura: deberá revisar esta excepción antes de añadirlo o ampliar ACLs.
Un marcador GUC o un booleano en la fila tendría la misma autoridad que el
escritor; autenticar de verdad el origen requeriría separar el canal/rol de
auditoría, complejidad injustificada aquí. Se conserva el límite explícito;
no se afirma que PostgreSQL autentique el nombre de acción.

## #1608 · R8 · Identidad Pilot tras B03 (15/10/2026)

R7-P1-1: migración aditiva concede solo USAGE de `private` y EXECUTE de
`private.current_account()` a `pilot_profile_writer`; no accede a tablas de
identidad ni recibe el rol authenticated. Policy de recibos y RPC privada Pilot
usan ahora esa identidad validada, igual que perfil/foto y RPC públicas.
RED reproducido `42501 permission denied for function current_account`;
GREEN 20 pgTAP después de todas las migraciones. Incluye alta sin foto, cambio
con foto, replay, binding inválido y cuenta borrada; inventario de permisos de
owners de funciones/roles explícitos de policies. No otro rol sin BYPASSRLS
queda pendiente: el publicador de roadmap no usa este resolver ni recibe acceso.
PostgREST real con JWT emitido por handler nativo: 200 alta/replay/foto;
el mismo bearer después de borrar da 403. Evidencia `~/evidence/1608-r8/`.
Rama aislada desde `d5796ad1a`; seguimiento del orquestador por excepción,
sin Notion/Plane/GitHub/servicios reales. Resto de R8 en curso.

## #1608 · R7 · Cierre para revisión (15/10/2026)

Base `88051556` incorporada en merge `f59faf2b`. R6-P1-1/P2-1 resueltos con
Storage **original**: preflight sin filas, abort backend real, 200 tras recuperación;
0 uploads/partes/bytes/colas. P2-2: lecturas admin auditadas con targets borrados,
actor vivo obligatorio; mutaciones siguen bloqueadas. P3-2 merge resuelto;
P3-3 contrato global sin PII explícito. **DUDA P3-1**: propietarios de buckets
históricos no se purgan; inventario real pendiente de Isaac/orquestador.
Catálogo ampliado a #1612: purga perfiles/recibos y atribución de fotos por ruta.
Checks nuevos: SQL337 + histórico232 + upgrades18/4/26, Pilot90/10+concurrencia,
80 tablas/105 rutas/620 checks, aliases40, owners10, multipart64, buckets17,
locks17, admin24, JWT/RLS/Ed25519 PostgREST y reconciliación real. Edge609/0/1 ignored;
Storage HTTP signed, readonly→RW y retries; fmt/lint/surface/Python/diff/456 huellas PASS.
Evidencia `~/evidence/1608/r7/RESULTADOS.md` e
[informe R7](../../analysis/review-cuentas-pagos-2026-10.md). SHAs/push/FIN en buzón.
Origin bare Mac, sin GitHub/CI remota ni trackers; excepción sin Notion/Plane/subagentes.
No merge a nightly/promoción/deploy/release/venta ni producción. Review externa
pendiente. Los apartados R5/R6 siguientes son evidencia histórica, sustituidos
por este estado para Storage; no requieren activar ninguna imagen propia.

## #1608 · R7 · Barrera tras incorporar #1612 (15/10/2026)

El gate de catálogo detectó dos tablas nuevas desde nightly: pilot_profiles ya
hereda la barrera; pilot_private.operations queda cubierto por el mismo guard.
Añadidas tres carreras reales: perfil, recibo y foto sin owner atribuida por
UUID/hash.jpg. Borrado elimina perfil y recibos, y encola también esas fotos.
GREEN: 105 rutas / 620 checks, catálogo con pilot_private y cobertura completa;
cinco regresiones pgTAP de purga. No se rebaja el gate que detectó la omisión.
Las antiguas carreras de audit de lectura pasan a mutación set_tester: las
lecturas de borrados ahora tienen sus siete controles positivos/negativos propios.
Paquete #1612 original verificado aparte: 90 pgTAP, concurrencia y 10 rollback.
Evidencia `~/evidence/1608/r7/`; fuera de native, sin cambios Rust propios.

## #1608 · R7 · Storage gestionado (15/10/2026)

R6-P1-1/P2-1: imagen original v1.70.3, sin variante. El preflight abort
se descarta con RETURN NULL; nunca persiste INSERT/UPDATE tras tombstone.
Ruta/upload/rol/operación verificados; Storage original elimina backend y metadata.
RED 503 retenía upload/parte/bytes/cola → GREEN con originales NULL/UUID,
partes reales, PNG y dos entregas webhook firmadas. Fallo backend readonly
conserva 503 y pendientes; recuperación RW y replay convergen a 200 y 0/0/0/0.
Evidencia `~/evidence/1608/r7/`; procedimiento y límites en
[tools/storage](../../../../tools/storage/README.md). Imagen/parche propios retirados.
R6-P3-1 documentado como DUDA: buckets globales no tienen purga de owner
histórico; inventario prod no autorizado, pendiente del orquestador/Isaac.
R6-P3-3: configuración global sin owner/manifest debe excluir PII.
Sin despliegue, producción, venta ni actualización de trackers del orquestador.

## #1608 · R7 · Lecturas admin de borrados (15/10/2026)

R6-P2-2 corregido: el actor vivo mantiene el control Owner y las lecturas
search/get conservan el UUID borrado en su auditoría. Los targets borrados de
lectura no se tratan como mutación; actor y objetivos mantienen orden de locks.
RED real sin migración: search falla por audit y get por el lock exterior.
GREEN: siete regresiones pgTAP, mutación y actor borrados siguen rechazados.
Evidencia `~/evidence/1608/r7/admin-red/` y `sql-final/`.
Storage gestionado e integración #1612 siguen en validación; no producción.

## #1608 · Ronda 7 · Integración de base (15/10/2026)

Merge de origin/nightly conservando los handoffs de #1608 y las entregas
#1612/#1620. Conflicto exclusivamente documental resuelto sin eliminar secciones.
R6-P1-1/P2-1 y regresión admin en curso; no despliegue ni promoción.

## #1608 · Ronda 6 local · R5-P1-1 y cierre de worker (14/10/2026)

Entrega para review de Claude en la rama `vantareapp/isa-1608-cierre-comercial`,
inicio `0a8e794f`, base histórica `e5c90be5`. Tres hallazgos de r5 corregidos
con commits locales por hallazgo; HEAD completo y FIN en `~/orq/1608.buzon.md`.
GitHub #1608 / PR #1622 / proyecto Vantare: sin acceso ni estado remoto nuevo.
No hay push, CI del SHA nuevo, merge, promoción, deploy, release ni venta.
Seguimiento del orquestador conforme a la excepción del encargo; sin Notion,
Plane ni subagentes. VANTA-16/17/15 son referencias del contexto, no estados
consultados/actualizados por este worker.

**Abort:** SQL DELETE de metadata no sería seguro: el backend guarda metadata
incluso sin partes, y partes con bytes fuera de SQL. Se prepara una variante de
Storage v1.70.3 en `tools/storage/`: digest y hash de fuente fijados; parche
solo de abort para sesión de servicio verificada, validación bucket/key/upload,
sin upsert de prueba. Usuarios conservan autorización original. Backend real
se limpia antes del DELETE original de upload (cascade partes). Ningún INSERT
ni UPDATE obtiene bypass SQL por rol/GUC. Deriva/reaplicación del parche falla.
El limpiador Edge separa el drenaje de objetos; abort/list/ACK fallidos mantienen
upload en cola y HTTP 503 sin impedir limpiar objetos terminados independientes.

**RED→GREEN real:** imagen original y limpiador de `0a8e794f`: manifest NULL y
UUID, parte multipart con bytes y PNG privado de 68 bytes, dos retries; persistían
upload+parte+cola+PNG. Con solo limpiador corregido y Storage original, el PNG
se elimina y el upload sigue pendiente. Con variante preparada, upload/parte,
ambas colas y bytes desaparecen; dos retries idempotentes. Nueve rechazos HTTP
por ruta incorrecta, JWT no-service firmado y service JWT falsificado; INSERT
service tras tombstone sigue rechazado. Un fallo inyectado del abort conserva
upload/parte/cola, pero elimina PNG. Fallo **real** de backend readonly mantiene
1/1/1; al restaurar RW convergen también los mismos fixtures RED y todos los
pendientes: **0 uploads / 0 partes / 0 cola uploads / 0 cola objetos**, backend
sin archivos. La última entrada durable que no estaba en el listado de fixture
se recuperó desde la cola real y se drenó; intento anterior/errores conservados.

**Checks nuevos:** Storage HTTP local real anterior; admin 24 + locks r5 17;
buckets 17, inventario 78 tablas / 102 rutas / 603 checks; aliases 40;
56 migraciones del checkout y nueve suites pgTAP **317 PASS** con Storage real;
Edge **553 PASS / 0 FAIL / 1 ignored** con tipos; fmt/lint dos TS, deploy surface,
Python compile, diff check y **456 huellas PASS**. Evidencia `~/evidence/1608/r6/`.
Errores de preparación conservados: dump posterior a app tuvo triggers/policy
que necesitan private/public; se retiraron del dump solo esos objetos de app
para reinstalarlos mediante migraciones intactas. pgTAP del contenedor era
symlink Nix: copia dereferenciada temporal a Homebrew. Bootstrap amplía columnas
owner de buckets; coverage FK detectó la herencia omitida y se corrigió el guard,
no el gate. Estado/convergencia verificados antes de detener servicios propios.

**Límites:** la imagen original v1.70.3 no converge el abort de manifest;
la variante requiere review/decisión de integración del orquestador y activación
separada. Un proveedor que no admita esa imagen necesita alternativa validada;
no se promete compatibilidad gestionada ni despliegue automático. No hay
servicios/cuentas/pagos reales, lectura de .env o secretos instalados, nuevos
paquetes/dependencias ni cambios nativos. Rust/Nextest/lifecycle/telemetría,
upgrades históricos y GUI/OAuth/Clerk/Polar/S3 gestionados no se repiten: alcance
SQL/Edge/Storage local; se conserva evidencia histórica sin presentarla como nueva.

## #1608 · Ronda 6 local · R5-P3-1 (14/10/2026)

`storage.buckets.owner uuid` y `owner_id text` reciben la barrera común:
propietarios UUID/Clerk, OLD/NEW e inmutabilidad, INSERT/UPDATE tras tombstone
rechazados; DELETE autorizado sigue permitido. Buckets globales sin propietario
conservan configuración. Inventario real con ambas columnas y trigger activo.
RED exacto INSERT de supabase_storage_admin permitido → GREEN 17 checks.
Objetos/uploads/partes heredan el propietario del bucket y rechazan padre
invisible; el borrado encola también objetos/uploads con owner propio NULL.
Bootstrap reproduce owner/owner_id reales; cinco nuevas rutas de carreras,
102 rutas/603 checks, sin debilitar el gate de cobertura FK.
Runner `--storage-buckets --storage-schema <dump local>`; RED con
`--before-storage-buckets`. Evidencia `~/evidence/1608/r6/buckets-{red-exact,inherited-green}/`.
Dump del stack real elimina solo triggers/policy de la app para cargarlos después
mediante las migraciones originales; errores de preparación conservados.
No se afirma API de buckets de usuario ni se borran buckets/datos instalados.
R5-P1-1 sigue en preparación; solo local, sin push/merge/promoción/deploy/release.

## #1608 · Ronda 6 local · R5-P2-1 (14/10/2026)

Inicio autorizado `0a8e794f`, rama/worktree indicados, review r5 completa.
`native_admin_execute` toma actor+objetivo ordenados antes del primer lock de
fila (incluido reporter en get/set report); helper Owner cubre native_admin_begin.
RED exacto wrapper→borrado `40P01` → GREEN cuatro carreras actor/objetivo,
ambos órdenes, espera advisory y `28000` para administración tras tombstone.
24 checks; llamadas/guardas productivas reales, prefijo de pg_proc sin sustituirlas.
Auditoría de callers de las 14 RPC en catálogo completo: cinco funciones;
reconciliation/lifecycle/expire ya protegidas en r5, refresh thin SQL sin filas,
admin era el wrapper omitido. Evidencia `~/evidence/1608/r6/rpc-callers.json` y
`admin-{red,green}/`; pendientes R5-P1-1 y R5-P3-1. Solo local, sin push,
subagentes, GitHub, merge/promoción/deploy/release ni servicios/datos reales.

## #1608 · Ronda 5 · Entrega local para revisión (14/10/2026)

Correcciones de los cuatro hallazgos de la review r4 y evidencia final en el
[informe](../../analysis/review-cuentas-pagos-2026-10.md). **Queda pendiente el
abort NULL-manifest por preflight Storage v1.70.3; no se declara cierre completo.**
Barrera: 77 tablas protegidas/97 rutas/577 checks; multipart ocho carreras/64
checks; locks 17; aliases40, pgTAP317, upgrades18+4+26, Edge553/1 ignored,
lint/fmt nueve TS, surface y 456 huellas PASS. SQL, PostgREST y Storage HTTP
locales reales. Disputas borrada+viva y outage SQL también PASS; interacción
con el lock temprano corregida con RED→GREEN.
Commits por hallazgo `21e3f262`, `3758ff12`, `f86fafb6`, `c9f0c727`; reintento
API/ACK perdido `d2a96ce5`. HEAD final y cierre en `~/orq/1608.buzon.md`.
Evidencia `~/evidence/1608-r5/`, errores originales conservados, sin bypass ni
dependencias nuevas. Locks siempre UUID→fila; 40001 requiere rollback/retry
completo. Metadata ajena sin identidad de cuenta y configuración Storage no
se presentan como nuevas raíces de producto cubiertas por el bootstrap.
Sin Rust ni gates nativos (sin cambios native/runtime/domain/ipc/testdata),
GUI/servicios gestionados/partes con bytes. Sin datos reales, .env/secretos,
subagentes, push, trackers/GitHub, merge, promoción, deploy o release.
Siguiente: orquestador revisa diff/SHAs y acota la corrección del servicio
Storage para abort sin upsert de permisos sobre la cuenta ya borrada.
Seguimiento remoto #1608/#1622/VANTA-16/17/15 reservado al orquestador.

## #1608 · Ronda 5 · Reintento de abort y validación real (14/10/2026)

R4-P1-1, mismo alcance: si la API aborta y se pierde ACK SQL, la siguiente
entrega admite únicamente 404 XML `NoSuchUpload`; otros 404/403/500 siguen
fallando y conservan cola. Respuesta limitada a 8 KiB, sin mensajes/PII.
RED exacto del reintento → GREEN siete Edge, y API HTTP real dos veces con
Storage v1.70.3: abort inicial elimina upload, reintento NoSuchUpload permite
ACK y deja cero pendientes. Firmante validado también por SignatureV4 de la
imagen distribuida. No se afirma subida de partes/bytes ni S3 gestionado.
Reconciliador con error SQL 42501 real sigue abortando la página; restores de
ACL del fixture local verificados. Upgrades identidad18/conflicto4/refunds26
PASS. Evidencia `~/evidence/1608-r5/storage-http-{probe,retry}.log`,
`abort-retry-{red,green}.log`, `reconcile-outage.log` y `upgrade-*`.
Sigue abierto el abort NULL-manifest por preflight Storage; no hay bypass.

## #1608 · Ronda 5 local · R4-P2-2 (14/10/2026)

14 RPC de Billing/operacional adquieren todos sus UUID ordenados antes de
filas; incluye propietario previo y solicitado, batches y barrido de expiración.
La recolección checkout queda acotada a su cuenta; el barrido omite tombstones.
PostgreSQL puede tomar la fila antes de un BEFORE ROW: la barrera de DML usa
try-lock y aborta con 40001; nunca espera el UUID mientras conserva esa fila.
El contrato del caller es siempre UUID→fila, conjunto completo en orden UUID;
40001 exige rollback y reintento de toda la transacción. INSERT aplica la misma
regla porque puede seguir a escrituras previas de varios UUID. Sin bypass.
RED 40P01 exacto (prefijo operacional real) → GREEN writer-first/delete-first,
DML fila primero rechazado con 40001 y dos UUID en orden inverso, sin efectos
parciales y con reintento completo. 97 rutas/577 checks de escrituras PASS,
317 pgTAP y 40 aliases PASS. Evidencia `~/evidence/1608-r5/locks-*-final`,
`sql-full-3`, `writers-green-2`, `multipart-green-2`.
API Storage HTTP real: creación multipart y abort con owner UUID PASS usando
solo claves sintéticas locales. Abort owner NULL con manifest NO PASA:
canUpload hace upsert antes de abort y la barrera lo rechaza tras tombstone;
upload+cola permanecen (1+1), sin ACK. Se requiere revisión del servicio Storage
para permitir abort sin preflight de INSERT, sin abrir un bypass SQL. Este
límite impide afirmar limpieza multipart completa o cierre comercial total.
El orquestador revisa el diff y mantiene #1608/#1622/VANTA-16/17/15. Sin estado
remoto nuevo, push, merge, promoción, deploy, release ni producción.

## #1608 · Ronda 5 local · R4-P1-2 (14/10/2026)

Inbox verifica tombstone bajo UUID antes de escribir, relee enlaces y devuelve
receipt tipado `account_deleted` sin fila ni payload. El reconciliador aísla
ese resultado; cualquier error real o vínculo contradictorio sigue abortando.
Diagnóstico durable privado solo entorno+hash, idempotente, sin UUID/PII.
Disputas usan la misma clasificación por orden durable y entorno.
RED exacto 28000 con PostgreSQL/PostgREST/Supabase JS reales → GREEN cuenta
borrada seguida de viva, dos páginas y repetición: orden viva única, avance a
subscriptions, sin nuevo payload borrado; conflicto borrada/viva sigue fallando.
140 tests Edge billing/reconciliación PASS con tipos. Intentos sin permiso de
lectura y estrechamiento de receipt conservados, sin --no-check.
Evidencia `~/evidence/1608-r5/reconcile-{red,green-2}.log`; fixture local,
no Polar gestionado. Queda revisar locks y límite abort manifest Storage.
Seguimiento remoto exclusivamente por el orquestador.

## #1608 · Ronda 5 local · R4-P1-1 (14/10/2026)

Multipart/partes del esquema Storage real reciben la barrera propia, incluida
atribución por manifest y upload padre. RED reproducido → GREEN ocho escenarios
con dos transacciones, rol Storage real, SQLSTATE y commit verificados.
Uploads anteriores al tombstone se encolan para abort S3; ACK solo después de
éxito de API, sin SQL DELETE de Storage ni secretos nuevos. Cleanup Edge aborta
antes de borrar objetos; fallos mantienen cola y reentrega Svix.
El firmante S3 usa las credenciales existentes anon/service y WebCrypto;
STORAGE_S3_TENANT_ID es el tenant para local/custom domain y STORAGE_S3_REGION
la región (us-east-1 por defecto). Configuración y deploy reales fuera de alcance.
Límite bajo investigación: Storage v1.70.3 comprueba canUpload con un upsert
antes del abort, que puede ser rechazado para manifest tombstonado. No se
introduce un bypass de escritura para que una limpieza aparente pasar.
Evidencia `~/evidence/1608-r5/multipart-{red-2,green}`, seis Edge PASS.
Sigue reconciliación y locks; seguimiento reservado al orquestador.

## #1608 · Ronda 5 local · R4-P2-1 (14/10/2026)

Inicio autorizado `e66c6c90`, rama/worktree de #1608, sin trackers/GitHub/push.
Review r4 completa: dos P1 y dos P2; ningún P3 adicional confirmado.
R4-P2-1: migración aditiva resuelve `owner_id text` por UUID o identidad
Clerk durable sin casts arbitrarios, conserva owner histórico y manifest.
Subject ambiguo entre UUID se rechaza incluso con claims: Storage no conserva
issuer en la fila y no sería seguro atribuirla después. Cleanup encola sujetos
textuales solo cuando son inequívocos; no bloquea por owners ajenos desconocidos.
RED exacto 22P02 → GREEN INSERT/UPDATE/DELETE, borrado, cola y DELETE de
limpieza con el esquema Storage v1.70.3 y rol supabase_storage_admin.
Evidencia `~/evidence/1608-r5/owner-{red,green-3}`; primer intento PL/pgSQL
fallido conservado. Runner exige dump del stack local real, no el bootstrap UUID.
Pendientes en esta ronda: multipart, reconciliador y orden UUID→fila.
Seguimiento #1608/#1622/VANTA-16/17/15 exclusivamente por el orquestador;
no se afirma estado remoto nuevo, CI, merge, canal promovido ni producción.

## #1608 · Cierre comercial ronda 4 local · Mac arm64 (14/10/2026)

Review `~/orq/review-1622-sol-r3.md` entera, R3-P1-1: reset concurrente
reinserta dispositivo. Encargo recibido de Claude/Isaac, sin subagentes ni
GitHub/push. Inicio limpio `3ce0eadc`, misma rama
`vantareapp/isa-1608-cierre-comercial`, worktree
`/Users/isaacalbala/vw-isa-1608-cierre-comercial`, base local `e5c90be5`.

Migración nueva `20261014140000_isa_1608_account_write_barrier.sql`:
helper único lock UUID→tombstone y trigger en **74 tablas**, incluidas rutas
FK indirectas/composites, aliases, PII, devices, grants, Storage/manifest,
Testing, admin e inbox vinculado. OLD/NEW, propietarios ordenados y releídos,
identidad durable, snapshots antiguos rechazados. Cleanup bajo UUID y marca
final en misma transacción; sin bypass. Grants/entitlements/operacional solo
revocados; los otros writers tardíos se rechazan. Reset adquiere UUID antes
de fila, claim antes de conflicto; resolvers nativos/bootstrap releen.
No se reescriben migraciones históricas ni se activa infraestructura.

Inventario completo de **87 tablas / 50 migraciones y entradas Edge**, con
protegida sí/no y test, en [informe](../../analysis/review-cuentas-pagos-2026-10.md).
94 rutas con dos transacciones reales y control válido observado por tabla:
**RED189 → GREEN559**; 74 tablas con cobertura real, catálogo/FK y ACL verificados.
Regresión anterior aliases **40/40 PASS**; Edge con tipos **551 PASS/1 ignored**;
retirada456 PASS. Evidencia `~/evidence/1608-r4/checked-{red,green}/`,
`aliases-green/`, `deno-functions.log`, manifest final y logs de intentos.
Runner `--writers` sin pgTAP; integrado también al final del gate normal.

Límites nuevos expresos: pgTAP317/upgrades48 no repetidos por extensión ausente
(0A000 conservado); HTTP/PostgREST/Ed25519→SQL no repetido por binario ausente.
Invocación extra con todos los tests históricos Supabase falla TS2353 ajeno al
diff; suite Edge551 con tipos sí pasa, sin --no-check. Sin Rust/TS modificados:
gates nativos/telemetría/lint TS omitidos. No instalar dependencias nuevas;
solo caché de paquetes Deno ya declarados. Sin herramientas nuevas.

Última lectura es la **copia de review r3**, 12:13 UTC: #1608 OPEN/in-review,
area:plataforma/Project Vantare/sin milestone, updatedAt11:40:15Z;
VANTA-16/17/15 Por revisar y draft#1622 a nightly en `3ce0eadc`.
No consultado ni actualizado desde este Mac; sin CI del nuevo HEAD.
Commit/SHA final local en `~/orq/1608.buzon.md`; orquestador recoge la rama,
revisa, repite pgTAP/upgrades/HTTP, y actualiza seguimiento. Canal: rama de issue.
Sin merge/promoción/release/deploy/producción/servicios/cuentas/datos reales.
Activación y esquema/Storage gestionado requieren revisión separada; no venta.
Política conservadora de rechazo de writers tardíos; filas/advisory pueden
abortar por deadlock bajo otro orden DML. No se promete ausencia global de
contención: nunca se acepta el writer omitiendo la relectura. Perfil remoto
apagado; registry/reconciliación inertes; historial previo privado conservado.

## #1608 · Cierre comercial ronda 3 local (14/10/2026)

Review `C:/tmp/ola2/review-1622-sol-r2.md` entera: R2-P1-1 único hallazgo,
sin P2/P3 adicional confirmado. Inicio limpio `c30e7c4c`, misma rama/worktree
`vantareapp/isa-1608-cierre-comercial` / `C:/tmp/1608-cierre-comercial`, base
`e5c90be5`. Dos transacciones SQL reales: update de alias bloqueado por el UUID,
borrado confirma primero y update restaura email aun con evento anterior;
retry de borrado no reparaba. RED16/40, cuatro casos (ambos subjects y tiempos).
B03 relee identidad FOR UPDATE bajo lock del UUID y comprueba tombstones antes
de escribir: GREEN40/40, PII/versiones/tombstones y trazabilidad/Storage intactos.
Regresión Python en runner normal y `--concurrency`, sin dependencia nueva.

Gates nuevos: pgTAP317 + upgrades48 + concurrencia40 = 405 PASS; JWT/PostgREST
y Ed25519/SQL real PASS; Deno551 PASS/1 ignored; calidad456, deploy surface,
check scripts y diff--check PASS. Logs `C:/tmp/1608-comercial-r3/`; primer gate
HTTP con ruta Deno inexistente conservado y corregido solo en invocación.
Sin native/TS nuevos: gates Rust/telemetría/lint TS omitidos por alcance.
Detalle y comando en [informe](../../analysis/review-cuentas-pagos-2026-10.md).

Encargo **solo local/tests**: un commit por hallazgo; HEAD final en buzón1608.
No push ni cambio remoto de issue/PR/Plane/CI. Última lectura #1608 OPEN/
in-review, area:plataforma, Project Vantare/sin milestone, updatedAt11:40:15Z;
VANTA-16/17/15 Por revisar, draft#1622 a nightly/auto-merge OFF en `c30e7c4c`.
Siguiente: orquestador revisa nuevo HEAD y actualiza seguimiento; no atribuir
la CI antigua al arreglo local. Migración corregida aún no desplegada; no
actualiza automáticamente un esquema que ya hubiese aplicado el cuerpo viejo.
Sin producción, datos/cuentas/compras reales, merge/promoción/release/deploy;
activación/confianza y aceptación comercial real siguen pendientes separadas.

## #1608 · Cierre comercial ronda 2 (14/10/2026)

Review independiente `C:/tmp/ola2/review-1622-sol.md` completa: dos P1 de
datos históricos, ningún P2/P3 adicional confirmado. Misma rama/PR draft
#1622 y base `e5c90be5`; inicio limpio `76c1b948`. VANTA-16/17/15 En curso
durante ejecución, Por revisar al cierre por escritura/lectura en issue/buzón.
P1-1 RED de upgrade: 10/18 aserciones fallan (UUID/compras/PII/tombstone/Storage)
y la migración acepta aliases de UUID distintos. B03 añade el vínculo canónico
al UUID original sin borrar aliases; conflicto 23505 aborta toda la transacción.
Pruebas pre-B03 reproducibles por `run-commercial-local.py --upgrade identity`
y `--upgrade identity-conflict`. Evidencia `C:/tmp/1608-comercial-r2/`.
GREEN 18/18 y conflicto/rollback 4/4 sobre PostgreSQL18 desechable.
P1-1 commit `a0db4d98`. P1-2 RED 14/26: partial/pending/agregado anteriores
conservaban grant y read model activos. B02 proyecta cada agregado/refund
persistido con UUID/entorno/fuente/versión reales y refresca usuarios bloqueados
en la misma transacción, con writers serializados. No reescribe grants ni ledger;
otra compra/suscripción/entorno y failed/canceled permanecen. Regresión
`run-commercial-local.py --upgrade refunds`. Solo local/tests; sin prod/servicios reales,
secretos/dependencias/promoción. SHAs y gates finales se verificarán en issue/buzón.
GREEN P1-2 26/26 con estado insertado antes de las tres migraciones comerciales.
P1-2 commit/código probado `d6e3caf57dc9ca1ce7dc4771df1405a11b3f8d1b`.
Gates nuevos: 551 Deno PASS/1 ignored, 317 SQL existentes + 48 upgrade = 365,
JWT/PostgREST y Ed25519/SQL real PASS; calidad456, superficies deploy,
check scripts HTTP y diff--check PASS. Sin fuente TS/nativa nueva: lint TS,
fmt/check/Clippy/Nextest/lifecycle/telemetría omitidos por alcance.
Riesgos: B03 aborta con aliases contradictorios; B02 bloquea writers durante
backfill (volumen/duración reales no medidos). No infiere enlaces de suscripción
ausentes del ledger. Informe actualizado con comandos y fallos iniciales
conservados. Entrega en la misma draft #1622; siguiente: review/CI del nuevo SHA;
activación/confianza/despliegue/aceptación real siguen separados.

## #1608 · Cierre comercial B03 → B01 → B02 (14/10/2026)

Encargo explícito de Isaac: implementar los tres planes en rama nueva, solo
local/tests. Worktree `C:/tmp/1608-cierre-comercial`, rama
`vantareapp/isa-1608-cierre-comercial`, arranque #1615 `7aab0699`.
#1615 entró en nightly `e5c90be5`; rebase de **solo los commits de cierre** a
esa base antes del push. El HEAD/PR/checks finales están en issue/buzón.

B03/B01/B02 implementados con RED→GREEN por bloqueo; detalle/decisiones/riesgos
en `docs/analysis/review-cuentas-pagos-2026-10.md`. 551 Deno PASS/1 ignored,
317 pgTAP PASS + JWT/PostgREST real y emisión nativa Ed25519 sobre SQL real.
Se preservan los fixes de #1615; nuevo registry/trust y reconciliador vacíos/
inertes. Sin Rust nuevo. Queda review/CI y activación/aceptación real separadas,
sin producción/secretos/precios/datos reales/merge/promoción/release.
Código probado `05e79d1a1cb68c48f07213aaa89a7d0a69e2b43a`, base `e5c90be5f63347fa4d50b4110e1946201c1957c0`.
HEAD/PR/estados verificados finales en issue/buzón. Siguiente: review del cierre.
## #1620 / PR #1621 · lanzamiento sin trial, decisión B (14/10/2026)

Encargo explícito al worker Codex macOS arm64; base limpia `c6739de8`, rama
`vantareapp/isa-1620-precios-polar`, nightly `953f041c` ya incorporado.
Project Vantare/area:licencias; VANTA-N omitido conforme a autorización previa.
GitHub/Plane/PR/CI y última actualización remota no verificables desde este Mac:
el orquestador los actualiza al recoger/revisar el commit local.

Isaac decide B tras su compra sandbox: ningún producto de lanzamiento tiene
prueba gratis, tampoco por enlace/código de creador. Siete días solo para
Pro normal mensual/anual; Plus normal sigue sin trial. Sustituye la decisión
anterior de heredar trial Pro en lanzamiento. POST de lanzamiento sin campos
de trial; existentes con cualquier campo informado reciben PATCH separado
`trial_interval: null, trial_interval_count: null`, sin precios ni otros campos.
Se conservan IDs, precios activos/archivados, mapa, derechos y productos normales.

El preflight general conserva guardas y admite ese desvío reparable. El del
enlace exige los cuatro productos de lanzamiento sin trial tras reconciliar,
antes de crear descuento/enlace o devolver un enlace existente. Cada respuesta
de producto de lanzamiento debe quedar sin trial; el PATCH valida también ID y
organización. El enlace sigue rechazando cualquier override antes de escribir.
Mismo apply con/sin creador; reparación idempotente y reintento tras PATCH
confirmado con respuesta perdida. No se migran suscripciones/checkouts previos.
Runbook, contrato de producto y fragmento ISA-1620 actualizados.

Tres ciclos de comportamiento RED→GREEN: creación (44 PASS), reparación
(45 PASS), rechazo de respuesta con trial (46 PASS); catálogo final **47 PASS**
con identidad/reintento y enlaces nuevos/existentes, cuatro planes/configuración
parcial. Suite Deno completa **590 PASS/0 FAIL/1 ignored** (PostgREST no
configurado), tipos/lint/fmt, quality/retirada **456 huellas**, superficie deploy
y validador del fragmento PASS. Lint conserva exclusión existente no-import-prefix.
Primera suite lanzada desde subdirectorio: cuatro NotFound de fixtures .github;
log conservado, repetida correctamente desde raíz Git sin tocar tests ajenos.
Tests con entorno vacío, sin red, caché instalada y escritura solo en /tmp.
Rust/UI/telemetría/SQL omitidos: ningún cambio en esas áreas ni Edge desplegado.

Evidencia `~/evidence/1620/no-launch-trial/RESUMEN.md`; SHA final en
`~/orq/1620.buzon.md`. Solo rama local, sin push/merge/promoción/release/deploy,
servicios reales, secretos, dependencias nuevas o subagentes. Diff revisado.
Siguiente: revisión del orquestador y actualización de issue/PR; por su vía
autorizada aplicar en sandbox, confirmar cobro hoy en enlaces de creador y
siete días solo en Pro normal, revisar checkouts/compras previos por separado.

## #1620 / PR #1621 · nombres de cliente (14/10/2026)

Worker Codex macOS, encargo explícito sin subagentes, GitHub/Plane ni push.
Base local `0d03e6c0`, con nightly `953f041c` ya incorporado; rama
`vantareapp/isa-1620-precios-polar`, Project Vantare/area:licencias.
Se conserva la omisión autorizada de VANTA-N: trackers/PR/CI al orquestador.

Productos nuevos: Pro/Pro Plus y sufijo ` · Precio de lanzamiento`, con
Markdown del contrato y ciclo visible en el precio. Existentes: PATCH
idempotente solo name/description, separado de la lógica monetaria previa.
Launch Edition del mapa: mismo ID/precio/capabilities, nuevo texto que limita
la licencia a módulos existentes y mejoras, Engineer inicial, Testers sin
Nightly. Preflight rechaza edición ausente/ambigua/archivada/recurrente.
Sin i18n de producto documentado en Polar; ES sin duplicar productos.

RED cuatro tests fallidos por comportamiento → catálogo **42 PASS/0 FAIL**:
creación, reparación de nueve productos, precios archivados preservados,
mapa e IDs, cero escrituras al repetir, preflight, respuesta sin corrección
rechazada y reintento tras respuesta perdida. Evidencia en
`~/evidence/1620/checkout-names/01-red.log` y `01-green-final.log`.
Una primera ejecución GREEN falló por un UUID histórico inválido en el test;
se corrigió el dato sintético, conservando el log `01-green.log`.

Sin servicios reales, secretos, dependencias, push, merge, promoción o release.
Hito 1 local `b4605025`; hito 2 añade `theme=dark` a URLs nuevas/reutilizadas,
sin PATCH del enlace ni campo theme en POST. Query/fragmento/locale/ID/código
se conservan, cero writes en rerun: 1 RED → catálogo **43 PASS/0 FAIL**,
`02-red.log`/`02-green.log`. Investigación oficial del 14/10 en
[personalización Polar](../../billing/isa-1620-polar-checkout-personalizacion.md)
y `~/orq/polar-checkout-personalizacion.md`: logo/avatar, medias, tema,
color, textos, campos, idioma y dominio, con scopes y pasos del operador.
No hay controles de carmín/CSS/dominio alojado documentados; propuesta de
logo y medias con acento Orbit, y embed como entrega web separada.
Localización ES/EN del formulario exige feature beta; no traduce productos.
Gates finales de esta ronda: **586 PASS/0 FAIL/1 ignored** en la suite Deno
completa (PostgREST no configurado), incluyendo catálogo 43 PASS; tipos,
lint (exclusión no-import-prefix ya existente), fmt, quality/retirada456,
superficie deploy, fragmento ISA-1620 y planes offline sandbox/production PASS.
Tests con entorno vacío, sin permiso de red, ficheros solo /tmp.
Rust/UI/telemetría y SQL omitidos: ningún archivo de esas áreas cambia.
Informe/evidencia en `~/evidence/1620/checkout-names/RESUMEN.md`.
Diff completo revisado, sin nuevas dependencias ni cambios de precios de tabla,
gates o workflows. SHAs finales en
`~/orq/1620.buzon.md`. Siguiente: orquestador revisa diff y actualiza issue/PR,
aplica solo por su vía autorizada y verifica aspecto real en sandbox.

## #1620 / PR #1621 · correcciones de sandbox (14/10/2026)

Encargo explícito al worker Codex macOS, sin subagentes ni acceso GitHub/Plane,
sin servicios reales ni push. Base local `92e383d3`, nightly ya incorporado
`953f041c`; rama `vantareapp/isa-1620-precios-polar`, Project Vantare/area:licencias.
VANTA-N omitido por autorización anterior: el orquestador actualiza trackers y
recoge los commits locales. No se hereda CI ni se afirma integración de estos fixes.

Arreglo 1: tokens de organización como único modo soportado; POST de productos,
descuentos y enlaces sin `organization_id`. GET de organización siempre valida
el ID esperado; guarda del portal conservada. Dos regresiones RED (payload e
identidad sin creador) antes del cambio; GREEN del catálogo registrado en
`~/evidence/1620/sandbox-fix/01-green.log`. La prueba recorre draft, publicación
simulada, enlace y rerun sin escrituras. No acredita ejecución contra Polar.
Arreglo 2: CLI exportada como `runCatalog` con fetch inyectable para probarla
sin red y con archivos temporales reales. RED: el 422 dejaba un archivo vacío;
GREEN: no hay salida durante HTTP ni tras fallar, reintento en la misma ruta
produce JSON completo y salida existente falla antes de HTTP sin sobrescribir.
Creación exclusiva al final, sync y retirada si falla escritura; preflight
requiere lectura de salida (comandos actualizados). Catálogo 37 PASS; logs
`02-red.log`/`02-green.log`. Sin garantía ante kill durante escritura.
Arreglo 3: diagnóstico 4xx proyecta solo `type`/`loc`/`msg` válidos, con token
de sesión redactado incluso dentro de esos campos. Nunca vuelca headers,
input, ctx ni cuerpo completo; 5xx/JSON ilegible/formato desconocido genéricos.
RED→GREEN con 400/401/403/422/429, validación directa y envoltorio detail,
ecos del token y respuestas inválidas; catálogo 38 PASS, `03-red.log` y
`03-green.log`.
Gates finales: suite Deno completa **581 PASS, 0 FAIL, 1 ignored** (PostgREST
no configurado); catálogo 38 PASS. Tipos, lint (exclusión existente
`no-import-prefix`), fmt del área, superficie deploy, planes offline
sandbox/production, quality y retirada **456 huellas** PASS. Entorno vacío,
sin permiso de red, escritura solo temporal `/tmp`; sin dependencias nuevas.
Rust/UI/telemetría y SQL omitidos: ningún cambio en native, runtime, domain,
IPC, testdata o SQL. Diff completo revisado; sin push, merge adicional,
promoción, release, deploy, pagos ni servicios reales. Solo rama local;
SHA final y lista de commits en `~/orq/1620.buzon.md` y resumen de evidencia.
Siguiente: revisión del diff por el orquestador, actualización GitHub/Plane
y repetición sandbox real por su vía autorizada.

## #1608 · Integración de nightly (14/10/2026)

Encargo explícito tras review r3 APTA: nightly → rama de issue, con merge,
sin rebase ni promoción. Worktree limpio `8fecf307`, fast-forward al remoto
`812ed8ec` conservado. Merge probado `eca5155f6a51aad620e5af5d4ad51368edcaaa83`,
padres `812ed8ec` + `origin/nightly@5b781964`, incluye #1611/#1617/#1618.
Conflicto único `native/services/src/app.rs`: rechazo definitivo conserva
revocación/ACK y éxito conserva analytics consentido tras transferir derechos.
Los otros 66 archivos entrantes son idénticos a nightly. Sin política nueva,
UI nueva, dependencias o tests relajados; B01/B02/B03 permanecen No-Go comercial.

Gates nuevos GREEN: fmt/check/Clippy; Nextest 1697 PASS/12 skips heredados
(cinco bancos manuales #1611 más los siete previos); lifecycle 18 PASS;
telemetría 25 PASS/0 skips (ACC 814.150 s); Deno534 PASS/1 ignored PostgREST;
SQL230 y followup35+F1/F1IP/F2/F3/F4/concurrencia/rollback PASS. Integridad456,
138 tests scripts GitHub, paneles8, followup4, snippet y guardas de superficie PASS.
Logs `C:/tmp/1608-merge/`, target propio, cola/dos jobs y QA aislada. Fuente Rust
sin cambios tras la prueba; cierre posterior documental. Fallos de entorno
Deno y sonda conservados/corregidos en invocación; cache anterior de Functions
apartada y conservada fuera del repo, sin editar dependencias. B01 RED separado.

Misma PR #1615 ready a nightly; auto-merge preexistente desactivado reversiblemente
antes del push porque no se autoriza promoción. HEAD final/push/CI y Plane
VANTA-16/17/15 Por revisar por escritura/lectura en issue/buzón al publicar;
no se hereda CI anterior. Informe actualizado. Siguiente: revisión del nuevo
SHA y decisión del orquestador sobre integración. Sin producción, compras,
datos reales, QA GUI física, promoción ni release.

## #1608 · Revisión cuentas y pagos (14/10/2026)

Ronda 3 sobre `b5be4303`, rama `vantareapp/isa-1608-cuentas-y-pagos`,
base nightly `69fa2d65`; misma PR draft [#1615](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1615).
Entrega para revisión de Plane VANTA-16/17/15; escritura/lectura final tras el push en issue/buzón; GitHub #1608 OPEN/in-review,
area:plataforma, Project Vantare y sin milestone. Sin merge, producción ni compras.

Review Sol r2 `C:/tmp/ola2/review-1615-sol-r2.md` leída completa. R2-N1
reproducido: dos RED en AccountPoll detached con candidato previo, con/sin
identidad restaurada. Arreglo mínimo: identidad distinta o ausente exige
`revoke_local` antes de guardar la sesión. Sin núcleo se rechaza el cambio y
se conserva la cuenta anterior; el reintento gestionado exige ACK durable.
Misma ruta de revocación que logout y rechazo definitivo de OAuth; services
no escribe el binding del núcleo. Fix `64e9eec5`, tests/código probado `04cfe8df`;
GREEN focal 49/49. fmt/check/Clippy PASS; Nextest nuevo 1654 PASS/7 exclusiones
existentes; lifecycle 18 PASS. Quality/retirada 456 huellas, canal 45 y notes 26
tests PASS; fragmento válido. Logs `C:/tmp/1608-r3/`, fallo inicial de tamaño
Clippy conservado y resuelto con callback común, sin allow ni tests relajados.
Login/candidato/ACK con fixture IPC; Owner real/Launch/reinicio Free se valida
por separado en la regresión existente. Sin promesa de login comercial real.
No hay consumidor nuevo de borrado: B03 conserva su plan y No-Go.
Deno/SQL/telemetría conservan evidencia de ronda 2, no repetida porque solo cambia
services/documentos. HEAD/push/PR/CI finales tras publicar en issue/buzón;
combinación con nightly actual/#1612/#1523 y aceptación comercial pendientes.

Los arreglos de las rondas anteriores se conservan:

- N1/F08/F02 `d6aec3ca`: auxiliar sin CoreLink no confirma logout ni inicia
  renovación HTTP; devuelve error y conserva estado para reintento gestionado.
  Con núcleo exige Invalidate ACK durable antes de retirar candidato/sesión.
  RED→GREEN con Owner real; Launch v1 perpetua reforzada con RED contrafactual,
  logout gestionado vía host y reapertura en Free. El almacén del núcleo sigue
  bajo su único propietario; no se promete revocación autónoma sin él.
- N2/F02 `381bee42`: HTTP 400 OAuth invalid_grant es Authentication. Refresh
  automático/explicito de licencia/cuenta/perfil comparte ACK, retirada del
  candidato y tombstone de sesión. 400 genérico/malformado y 429/503 conservan
  derechos. RED→GREEN 6 focales, sin userinfo/native-license después del rechazo.
- N3/F04 `5b5ab24c`: lectura/firma reciben el entorno del servidor; loader filtra
  grants por entorno sin relajar el normalizador ni perder soporte. RED 409 con
  production+sandbox → GREEN 67 tests emisor/handler.
- Atribución `71388711`: binding durable Polar/entorno/customer prevalece sobre
  external_customer_id contradictorio. RED→GREEN 52 tests procesador.

Evidencia anterior de ronda 2 `C:/tmp/1608-r2/`: fmt/check/Clippy PASS; Deno completo 524 PASS/
1 ignored PostgREST; SQL desechable 230 GREEN, B01 1 RED; B02 4 RED separados.
Nextest nuevo 1652 PASS/7 skips; lifecycle 18 PASS; telemetría 25 PASS. Cola y target propio, APPDATA/
LOCALAPPDATA aislados. Fallos iniciales de fixture/mtime/permisos/lint conservados.
Sin baselines recalibrados ni tests debilitados. Código de ronda 2 probado `03fb0dea`; cierre posterior documental. SHA/push/CI de esa ronda
verificados en issue/buzón, sin heredar verde de ba02b093. Nueve fixes de ronda 1 se
conservan; sus SHAs/evidencia y los planes actuales están en el
[informe](../../analysis/review-cuentas-pagos-2026-10.md).

No-Go comercial: B01 bearer/reset requiere corte JWT/RLS; B02 refunds
ordinario/Pro/parcial/agregado requiere ledger SQL/reconciliación; B03 requiere
retención/tombstones/guardas de datos. Plan por bloqueo con archivos, riesgos,
pruebas y decisiones de Isaac en el informe. #1523 OPEN/draft `33be660d` leído,
sin integrar ni trasplantar fragmentos. El fallback external ID sin binding
sigue bajo ese corte. Coordinar `account.rs` (Exchange) y `app.rs` (refresh/logout)
con #1612 al integrar. Aceptación comercial/GUI/servidor pendiente de autorización.

# Handoff vivo — Plataforma, cuenta, servicios y distribución

Estado de la base indicada; releer la issue antes de ejecutar.

## #1620 / PR #1621 · merge local de nightly (14/10/2026)

Encargo del orquestador al worker Codex en macOS arm64: incorporar nightly
mediante merge, sin rebase ni push. Padres: versión revisada
`27caa91e1470032da2bc577d85b1377f8dd56d0f` y `origin/nightly` obtenido por
fetch `953f041c5034d12648c4e23463dd953dc04a0e19`; base común `8194c949`.
Rama `vantareapp/isa-1620-precios-polar`, Project Vantare/area:licencias.
Issue/PR y estado remoto conservan la última referencia de ronda 5;
no hay acceso GitHub desde este worker ni verificación remota de CI actual.
Falta VANTA-N conforme a la omisión anterior: avisado en buzón al orquestador,
que recoge la rama y actualiza issue/Plane después de revisar.

Dos conflictos resueltos conservando ambos lados:
`supabase/functions/billing-webhook/process.test.ts` concatena los tests de
Pro anual/lanzamiento de #1620 y los de reembolsos/atribución de nightly,
con cierre independiente de cada test; formateado el bloque entrante de
binding, sin cambiar aserciones. Este handoff conserva las entradas de
#1620 y #1612, además de las entradas #1608/#1609 fusionadas automáticamente.
Los otros 76 archivos modificados respecto a la base común coinciden byte
a byte con su padre correspondiente. Lógica revisada de catálogo/mapping
intacta; sin modificaciones propias de Rust/SQL ni dependencias declaradas.

Gates del merge: Deno completo **577 PASS, 0 FAIL, 1 ignored** (PostgREST
local sin configurar); check de 8 TS y JSON, lint de 8 TS con la regla
existente `no-import-prefix` excluida, fmt de 9 archivos PASS. Integridad y
retirada **456 huellas**, superficie deploy y planes offline sandbox/production
PASS. Tests ejecutados con entorno vacío, sin permiso de red;
`--node-modules-dir=none`, sin artefactos node_modules en el checkout.
Primera suite `--cached-only` bloqueada por standardwebhooks ya declarado
sin caché; se descargó esa dependencia de tests existente sin cambiar
manifiestos. Fallo inicial de fmt conservado y corregido solo en el test.

Evidencia `~/evidence/1620/`, HEAD final y resumen por conflicto en
`~/orq/1620.buzon.md`. pgTAP/PostgREST/Rust/UI/telemetría nativa omitidos:
el encargo pide Deno y gates del área; cambios entrantes Rust/SQL idénticos
a nightly, sin resolución propia. El merge no acredita esos gates ni el
sandbox Polar real. Siguiente: orquestador revisa diff/evidencia y recoge
commit local; promoción a nightly requiere su circuito autorizado.
Sin push, deploy, servicios reales, secretos, release, pagos ni gasto.
Canal alcanzado: rama de issue local, con nightly incorporada como padre.

## #1620 · respuesta ronda 5 independiente (14/10/2026)

Informes `C:/tmp/polar-loop/r5-sol-a.md` y `r5-sol-b.md`: SIN HALLAZGOS,
VEREDICTO APTO. No enumeran defectos que reproducir ni corregir. Muse no
completa revisión: usa otro checkout y sus lecturas de informes/issue/PR
son rechazadas; no aporta hallazgos ni veredicto y no cuenta como aprobación.
Sin fixes ni RED→GREEN nuevos; este cierre solo actualiza el handoff.

Verificación local del worker sobre `5b1feb8c`: suite Deno 571 PASS,
0 FAIL, 1 ignorado (PostgREST local no configurado); catálogo 34 PASS.
Lint/fmt y superficie deploy PASS. Planes offline sandbox/production PASS
sin permisos de red/entorno; se usan dependencias ya cacheadas, sin añadirlas.
Logs `C:/tmp/polar-loop/r5-worker-*`. Diff documental revisado y diff check
PASS; commit/HEAD/push/checks remotos en `C:/tmp/polar-loop/r5-respuesta.md`
y comentario de entrega #1620/#1621.

PR #1621 OPEN draft a nightly; issue OPEN/state:in-review, area:licencias,
GitHub Project Vantare, sin milestone. Rama `vantareapp/isa-1620-precios-polar`,
base común `8194c949`; sin incorporar ni promocionar nightly.
Falta VANTA-N: aviso al orquestador; se conserva la omisión explícita anterior
y no se crea tarea. Siguiente: completar review independiente y sandbox
autorizado del runbook, incluidas facturas, trial, cambios de plan, atribución
y recuperación. No levanta no-go #1514/#1506. Rust/UI/lifecycle/telemetría y
pgTAP omitidos porque esta ronda no cambia producto ni SQL.
Sin API Polar, secretos, dependencias nuevas, deploy, merge/promoción,
auto-merge, release, venta, pagos ni gasto. Sin subagentes.

## #1620 · respuesta ronda 2 independiente (14/10/2026)

Sol A sin hallazgos. P2 Sol B confirmado: el Checkout Link compartido podía
añadir trial a Plus o sustituir siete días de Pro. `linkMatches` ahora exige
ambos campos de trial ausentes/null para heredar la configuración del producto;
rechaza drift antes de escribir y valida también la respuesta de creación.
Cuatro regresiones RED → GREEN: dos meses, siete días y cada campo aislado;
incluyen los cuatro productos y un PATCH pendiente que debe quedar intacto.
Control de campos ausentes/null e idempotencia PASS. Logs
`C:/tmp/polar-loop/r2-p2-trial-{red,green}.log`.
Muse no completa revisión ni aporta defectos nuevos/veredicto; no se cuenta
como aprobación. Suite Deno 571 PASS/0 FAIL/1 ignorado; catálogo 34 PASS.
Tipos/lint/fmt, quality 456 huellas, superficie deploy, planes offline sin
permisos de red/entorno y diff check PASS. Primeros intentos de tipos/suite
fallaron por flags/config/cwd/permisos; logs conservados y repetición correcta
PASS, sin cambiar tests existentes ni gates. Commit/HEAD/push y CI al cerrar
en `C:/tmp/polar-loop/r2-respuesta.md` y #1620/#1621. PR draft a nightly;
base común `8194c949`, nightly consultado `e5c90be5`. Sin VANTA-N, se avisa al
orquestador y no se crea tarea, conforme al encargo anterior.
Siguiente: review y sandbox autorizado, incluido enlace sin override de trial;
no levanta no-go #1514/#1506. Sin API Polar, secretos, dependencias nuevas,
deploy, merge/promoción, release ni gasto. Rust/UI/telemetría y pgTAP omitidos:
no se modifica código nativo ni SQL.

## #1620 · respuesta ronda 1 independiente (14/10/2026)

P1 Sol A/B confirmado: `published` no existe. Enum y gate usan `public`/
`private`; draft sigue pendiente. Dos regresiones RED → GREEN y control de
activación parcial; catálogo 24 PASS. Logs `C:/tmp/polar-loop/r1-p1-*`.
P2 Sol A confirmado: Polar conserva descuento al cambiar producto. Preflight
exige `customer_portal_settings.subscription.update_plan: false` con GET de
organización; bloquea configuración habilitada/ausente/inválida/ajena antes
de escribir, también sin creador si hay descuentos existentes. No cambia
ajustes automáticamente. Runbook bloquea cambios administrativos/programados
mientras siga vigente el descuento; configuración/verificación real pendientes.
Tres regresiones RED→GREEN, logs `r1-p2-scope-*`.
P2 Sol B confirmado: antes de PATCH rechaza IDs observados no guardados en
entrada durable, para impedir perderlos tras timeout y GET sin archivados.
Runbook explica registro forward/inverse, validación y reintento; conserva
pruebas anteriores de histórico ampliadas con la guarda. Dos RED→GREEN
(normal/lanzamiento), timeout confirmado antes del reintento e histórico
resoluble; catálogo 29 PASS. Logs `r1-p2-history-*`.
Muse no completa review ni añade hallazgos. Gates finales: suite Deno
566 PASS/0 FAIL/1 ignorado; tipos/lint/fmt, quality 456 huellas, planes offline
sandbox/production y diff PASS. Deploy surface rechazó node_modules generado
por la suite; preview verificó solo esa ruta, retirada por Git tras rechazo
automático de Remove-Item; repetición PASS. Logs `C:/tmp/polar-loop/r1-*`.
Diff completo revisado; no dependencias nuevas ni cambios de jueces/ignores.
Rama/PR #1621 draft a nightly conservados; HEAD/push/checks remotos y detalle
por hallazgo en `C:/tmp/polar-loop/r1-respuesta.md` y comentarios de entrega.
Issue OPEN/state:in-review, area:licencias/Project Vantare, sin milestone.
Base común `8194c949`, nightly consultado `e5c90be5`. Plane sigue omitido
según encargo previo sin VANTA-N. pgTAP omitido sin Docker/psql y SQL intacto;
Rust/UI/telemetría omitidos sin cambios nativos. Siguiente: review y sandbox
autorizado con configuración del portal, cambios programados, facturas,
identidad/refund/derechos e idempotencia; producción requiere OK separado.
Sin API Polar, secretos, deploy, merge/promoción, release ni gasto.

## #1620 · ronda 3 P2-2 (14/10/2026)

Decisión del orquestador: productos propios de lanzamiento 3,99/39,90 y
6,99/69,90; anuales decididos, sin antiguo gate. Un código exacto por creador,
-20 % porcentual repeating/2 meses, solo sobre los cuatro productos de
lanzamiento. Mes 3 mensual vuelve a 3,99/6,99; renovación anual a 39,90/69,90.
Después del mes, la web retira sus ofertas y solo distribuye enlaces de
creador, conservando productos. Plane omitido por instrucción explícita del
encargo; no se crea VANTA-N ni se reutiliza Notion histórico.

Normales e históricos preservados; `polar_launch_product_id` opcional con
inverso estricto a la misma clave/derechos. Checkout app sigue normal. Un
descuento/enlace por creador; sin descuentos de lanzamiento ni sufijos.
Preflight conserva P1-1/P2-1/P2-3; rechaza drift, colisiones y descuentos v1
compuestos sin migrarlos automáticamente. Comisión contable: 30 % mes 1,
10 % meses 2–12 sobre lo pagado; luego renegociar. Sin payouts.

DUDA API concreta: servicio oficial rechaza Checkout Links con productos draft.
Alternativa mínima implementada: draft/descuento y
`creator_link_pending: publish_launch_products_then_rerun`; tras activar
productos en paso autorizado separado, rerun crea enlace, otro escribe cero.
No publica productos automáticamente. Exclusividad por enlace es distribución,
no impedir reenvíos; cambio/publicación web pendiente en su entrega.

Cuatro regresiones P2-2 RED→GREEN; catálogo 21 PASS y webhook con alta,
renovación/cancelación de los cuatro productos y mismos derechos. Logs
`C:/tmp/ola2/1620-r3-*`. Errores intermedios de types/ruta/encoding corregidos
sin omitir gates. Suite final 558 PASS/0 FAIL/1 ignorado; check/lint/fmt,
quality 456, deploy surface y diff PASS. node_modules generado retirado solo
por Git tras preview y rechazo automático de limpieza PowerShell; superficie
repetida PASS. HEAD final en comentario de PR #1621 y buzón; evita
SHA autorreferencial. [Comandos/runbook](../../billing/isa-1620-polar-launch-catalog.md).

Rama `vantareapp/isa-1620-precios-polar`; base común `8194c949` incorporada en
`ce143d6f`, tip nightly consultado `e5c90be5`. PR draft a nightly. Issue en
GitHub Project Vantare/area:licencias. Siguiente: review independiente, sandbox
autorizado con facturas/trial/refund/identidad/derechos/enlaces/idempotencia y
pgTAP con PostgreSQL desechable (Docker/psql ausentes aquí). Rust/UI y telemetría
nativa omitidos sin cambios. Sin API Polar, secretos, deploy, merge/promoción,
release ni gasto.

## #1620 · ronda 2 (histórica, sustituida por ronda 3)

P1-1 `4ae058f0`, P2-1 `c25fc327`, P2-3 `5f85e868`, P3 `c80fb148`, docs `35a721fd`.
549 PASS/0 FAIL/1 ignorado; check/lint/fmt/quality 456/deploy surface PASS.
P2-2 pendiente entonces por códigos compuestos; decisión ronda 3 anterior
lo resuelve. Logs `C:/tmp/ola2/1620-r2-*`. Sin API/secretos/pgTAP.

## #1620 / VAN-782 · entrega inicial (histórica, sustituida por ronda 2)

[Tarea Notion](https://app.notion.com/p/3f9e51695c6581229de0e11deabcd9ab), proyecto
Billing y licencias. Rama `vantareapp/isa-1620-precios-polar`, heredada de
#1500@9e041ab8; merge de origin/nightly@8194c949 en `ce143d6f`, preservando la
regla vigente del trial anual de Pro. Checkout fuente dirty no modificado.
#1500/#1499 quedan sustituidos por este catálogo completo; no integrados por ello.

Tabla Pro 5,99/59,90 y lanzamiento 3,99/39,90; Plus 9,99/99,90 y
6,99/69,90. Anuales de lanzamiento pendientes con gate explícito. Código de
creador por plan: descuento fijo compuesto equivalente a 20 % extra sobre
lanzamiento (3,19/31,92/5,59/55,92); duración y comisión corregidas en ronda 2.
Script Deno idempotente por API, offline por defecto, duplicados/paginación y
drift rechazados, entorno/organización validados, producción con confirmación.
Productos nuevos draft; mapa generado conserva IDs/precios históricos y trials
Pro; no se inventan IDs en el snapshot sandbox. Pro Plus anual comparte derechos
con mensual; migración de checkout y pgTAP preparados.

[Runbook y comandos exactos](../../billing/isa-1620-polar-launch-catalog.md).
Tests Deno vigentes 544 PASS / 1 ignorado; sin dependencias nuevas, tests focales,
formato/check/lint y plan offline. PostgreSQL omitido: no Docker/psql; Rust/UI
omitidos sin cambios nativos. Evidencia local C:/tmp/buzon/1620-deno-tests-final.log.
Siguiente: revisar PR draft a nightly y después Isaac ejecutar con token privado
sandbox, confirmar anuales, comprobar renovaciones/creadores y autorizar producción.
No hay token, llamadas Polar, deploy, campaña activa, payouts, merge a canal,
release ni publicación. El checkout de la app aún no autoaplica los descuentos;
usar Checkout Links/API de Polar tras la validación autorizada. `plan.md` retirado
por #1601: no recreado, sin cambio público de disponibilidad.

Entrega publicada: [PR draft #1621](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1621)
a nightly; código `83da120e`, runbook `97db909a`. #1500 cerrada como sustituida,
sin merge. Push de rama verificado; CI del candidato se consulta en #1621.
Notion VAN-782 pasa a En revisión con evidencia y anuales/sandbox/pgTAP pendientes.

## #1612 / VANTA-9 · Perfil privado y Ajustes (14/10/2026)

Ronda 7 terminada en rama, fix/código validado `376181f2885f032126264a2f27584d0466dca9be`,
base integrada `e5c90be5`, PR draft #1619. Review R6 completa: P2-1 local
(editar durante primera carga conservaba controles vacíos y borraba campos guardados).
RED exacto nombre/simuladores; GREEN con editor GPUI real, Local protegido y reapertura,
sin sleeps. Guardar bloqueado hasta primera carga, incluso tras error/logout/Descartar;
mezcla por campo conserva datos no tocados y respeta borrados explícitos.
Caso adicional Descartar antes de cargar también RED→GREEN; conserva el bloqueo inicial.
Sin P3 nuevos en R6; P2/P3 de R5 siguen inertes y pendientes antes de reactivar sync.

Gates de `376181f2`: fmt/check/Clippy -D warnings PASS; Nextest **1751/1751**,
12 skips existentes (paridad 96,547 s); lifecycle **18/18**. QA con TMP/TEMP
exclusivos `C:/tmp/1612-r7-final-tests`, target propio native/target/gates, cola/dos jobs.
Se conserva el fallo de la primera pasada final en Strategy: fixture por PID sin
limpieza colisiona con un destino anterior. Reproducción controlada exit101 y
caso aislado PASS; [#1623](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1623)
registra el hallazgo, sin cambiar Strategy ni debilitar tests. La primera pasada
amplia anterior sobre `95aee8a2` también pasó 1751/1751 y lifecycle18.
Quality/456 huellas y fragmento PASS. Telemetría/SQL/Deno omitidos en r7:
solo Hub/documentos, sin runtime/domain/IPC/testdata ni SQL.

Evidencia `C:/tmp/ola7/1612/report.md`, RED/GREEN y fallos iniciales conservados.
Cierre posterior solo documental; HEAD/push/CI y Plane Por revisar verificados
al publicar en issue/PR y FIN del buzón. Sin merge/promoción/release/producción,
dependencias nuevas, subagentes, capturas nuevas ni instalación/datos reales tocados.
Siguiente: review del nuevo SHA y QA física del recorrido worker/IPC con primera
carga retenida, guardar/reabrir y Descartar. La ventana oculta prueba editor y
persistencia, no toda la app instalada. Sync sigue APAGADA.

La decisión de perfil local y evidencia de la entrega anterior se conservan debajo.

Decisión recibida de Isaac el 14/10: entrega de perfil guardado en el PC y
arreglos de Ajustes; **sync de perfil apagada y pendiente**. Un único interruptor
`PILOT_SYNC_ENABLED = false` en `native/services/src/app/pilot.rs` corta tanto
la preparación OAuth como las llamadas al puente/RPC/Storage desde los tres
comandos de perfil. Backend y pruebas preparados, sin activar ni borrar.
P2-1 y P3-1 de review r5 quedan inertes; deben resolverse antes de reactivar.
RED: PilotLoad abre conexión. GREEN: guardar texto multilínea/foto, cargar,
PilotSync y reabrir conservan la copia local y no abren conexiones, con/sin
identidad restaurada. Evidencia `C:/tmp/1612-local-sync-off`.
Entrega local validada sobre `414474ca39dac7532d6b5d115e0002c8263f9658`.
Corte cliente `6fab68b8`; primera integración nightly8194c949 en `685d4d63`
(gates completos verdes), seguida de nightly@`e5c90be5f63347fa4d50b4110e1946201c1957c0`
con #1608 en `db52700e`. Conflictos iniciales conservan ambos bloques del handoff,
todos los tests de privacidad y Services v8 + DTO piloto aditivo. Segundo merge
sin conflictos, con arreglos de cuenta intactos. La fixture de sync preparada
falló al no adjuntar CoreLink (final-test.log); se comparte el helper existente
solo cfg(test), sin relajar producción. fixture-green 2/2 PASS, incluido perfil
local sin red; fallo y explicación conservados.

Gates finales de `414474ca`: fmt/check/Clippy -D warnings PASS; Nextest
**1747/1747** (12 skips, paridad lenta 91 s), lifecycle **18/18** y telemetría
**25/25** (ACC 773 s; suite 818 s) PASS. quality/456 huellas y fragmento PASS.
Target propio native/target/gates, CARGO_BUILD_JOBS=2, datos aislados y plazo
1800 s por gate. pnpm no aplica (Rust/GPUI); sin cambios propios nuevos en SQL,
sin repetir pgTAP/Deno ni consultar producción. Cierre posterior solo documental.
HEAD/push, CI y VANTA-9 Por revisar se verifican en issue/PR y FIN del buzón.
Sin merge de PR #1619, auto-merge, promoción ni release. Únicos merges del worker:
nightly hacia esta rama de issue, autorizados por Isaac.
Siguiente: review de entrega local y QA física en portable aislado (guardar y
reabrir nombre/descripción con Enter/foto; Guardar/Descartar). Integración nativa
#1608 compilada; API OAuth/Storage reales y colocación de bandera pendientes.
Reactivar sync exige otra decisión y resolver P2-1/P3-1 r5 antes del cambio.

El roadmap público sigue en Plane; plan.md está retirado y el estado público
del encargo sigue En marcha (no Entregado). Las rondas siguientes son historia
de la preparación de sync, no el comportamiento activo de esta entrega.

Rama `vantareapp/isa-1612-perfil-y-ajustes`, base `origin/nightly@0807fbd0`.
[Issue #1612](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1612),
[PR draft #1619 a nightly](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1619),
Plane VANTA-9 / GitHub Project Vantare / area:plataforma.

Ronda 5 CLI: fixes publicados en `82c8340fb05f013381b8da00d0c3f7b7f9de7b0b`,
tras review r4 de `37ced450` (P2=3/P3=1). Base aprobada conservada.

| Hallazgo | Commit | RED y GREEN |
|---|---|---|
| P2-1 recibo histórico | `f00f3607` | RED R1 != R2; una llamada carga C/R2, la siguiente edición usa CAS R2; B pendiente conserva la negativa |
| P2-2 rechazo definitivo | `11a5511c` | RED A retenido tras 22023 y presupuesto incompatible; preflight impide nueva A, retiro durable conserva borrador/reancla y B corregido confirma tras reinicio |
| P2-3 conflicto HTTP | `c50a7b5f` | RED HTTP500/40001 => Offline y SQLSTATE40001 != PT409; GREEN PT409 y compatibilidad anterior, App muestra conflicto, R2 durable sin reenviar B al reiniciar |
| P3-1 duplicado de foto | `f63c9fc1` | POST duplicado -> GET JPEG/SHA -> recibo A -> B/CAS1 -> reapertura sin pendiente, con/sin reinicio |

HTTP incierto y recibos ilegibles/distintos conservan A. El pendiente sin
operación exige revisar/corregir y guardar; solo formatos locales anteriores
crean una operación durante su conversión. Un rechazo retira A antes del
refresco: si este falla, conserva la última revisión conocida y no resucita A.
Una sola llamada PilotLoad de App carga C/R2 tras recibo o muestra conflicto
real, con borrador/revisión persistidos. Preparación de tests compartida en
`ddda32dc`/`82c8340f` para cumplir Clippy sin reducir comprobaciones.

17/17 piloto PASS; fmt/check/Clippy -D warnings, quality/456 huellas y fragmento
PASS. Nextest 1681/1681 (7 skips existentes, paridad lenta 101 s) y lifecycle
18/18 PASS sobre `82c8340f`, con target propio native/target/gates, dos jobs,
datos aislados y plazo 1800 s por comando. Telemetría omitida en r5: sin cambios
en runtime/domain/IPC/testdata. Cierre posterior solo documental.
SQL 90 pgTAP, concurrencia/PT409 y retirada 10 postchecks/cuatro negativas PASS,
también sin SUPERUSER. PostgreSQL 18.6 y pgTAP 1.3.4 instalados desde Ubuntu
oficial en WSL; cluster nuevo 18/main detenido y arranque manual verificado.
Las pruebas se ejecutaron únicamente en bases desechables de loopback.
Evidencia `C:/tmp/ola5/1612`; fallos iniciales conservados y explicados allí.
Backend solo preparado, sin producción. P3 cerrado, sin cambios visuales,
login/Storage reales, QA física, integración #1608, merge/promoción/release.
PR draft a nightly DIRTY; CI solo GitGuardian PASS visible, sin CI completa
verde. Cierre/push final, estado Por revisar de VANTA-9 y última actualización
verificada constan en issue/PR y buzón. Sin merge/rebase, promoción ni release.
Siguiente: review del SHA final e integración compilada con #1608 por el
orquestador; API login/Storage y QA física pendientes. Activar el backend
requiere autorización separada de Isaac.

Ronda 4 CLI terminada en rama tras review r3 `8eadf36e` NO APTO (P2-1=1).
Corte Rust/SQL validado y publicado `d9df6b17256f31bc9499772b3aafe3069fe134fa`.
RED exacto: A aún en curso, load ve R, B reemplaza el intento y termina en
Conflict. GREEN: UUID v4 durable con contenido/foto y CAS inmutables; B conserva
su copia local y solo recibe otra clave después de confirmar A. Eliminadas
huellas y reconciliación por SELECT. Servidor preparado: `last_op_id`, recibos
privados por cuenta/op_id y lock transaccional; duplicado devuelve el resultado
original incluso después de un guardado de otro dispositivo.

fmt/check/Clippy `-D warnings` PASS; Nextest 1679/1679 (7 skips existentes,
paridad lenta 125 s), lifecycle 18/18 PASS. Los 15 tests de piloto pasan:
texto/foto, reinicio, confirmación de A/B perdida, edición intermedia, dos
dispositivos y negativas de documento/hash/revisión. Ambos formatos locales
anteriores preservan el pendiente; no recuperan retroactivamente confirmaciones
sin op_id. SQL 90 pgTAP, concurrencia real por barreras, aborto/reintento con la
misma clave, diez postchecks y cuatro negativas de retirada PASS también sin
SUPERUSER. Quality/456 huellas y fragmento PASS. Telemetría no repetida: no hay
cambios en runtime/domain/IPC/testdata. Datos de pruebas aislados, target propio
`native/target/gates`, dos jobs y plazo de 1800 s por gate.

PR draft #1619 actualizada, push d9df6b17 y VANTA-9 Por revisar verificados
14/10/2026 06:27 CEST. Cierre posterior solo handoff/changelog; HEAD final y CI en
issue/PR y buzón. No se declara CI completa verde. Origin/nightly `5a796e89`,
base aprobada `0807fbd0`, PR DIRTY: falta review del SHA nuevo e integración
compilada con #1608 por el orquestador. Sin merge/rebase, promoción ni release.
Evidencia `C:/tmp/ola4/1612`: RED Conflict y GREEN, gates y SQL; conserva también
un primer fixture RED que devolvía Protocol y un fixture antiguo con load extra,
corregidos antes de los gates finales. No son fallos omitidos del gate final.

Backend solo preparado, sin consulta/aplicación de Supabase real. Recibos sin
poda automática: cualquier retención futura debe conservar idempotencia.
Sin diseño/capturas nuevas, login/Storage HTTP reales, juego físico ni validación
integrada. Las fotos del fixture no certifican la API completa de Storage.
Bandera sigue pendiente de colocación diseñada. Sin instalación/datos reales
tocados, herramientas/dependencias nuevas ni subagentes. Siguiente: review del
orquestador; activación backend requiere autorización separada de Isaac.

Histórico ronda 3 CLI tras review r2 `daa2ca20` NO APTO (P2=1/P3=1):
P2-1 reproducido: A confirmado sin respuesta, Guardar B antes de reconciliar
y reiniciar devuelve Conflict. Arreglo `98429184` + `c2a59c4e` (Clippy), GREEN 11/11 servicios:
huella durable del CAS enviado separada del pendiente, reconciliación de R+1
antes de enviar B con revisión real; documento/hash distintos siguen Conflict.
La matriz cubre texto/foto, con/sin reinicio y conflicto real; se prueba también
lectura/edición/reapertura del formato local previo. P3-1 `db7a3783` RED al
cambiar las coordenadas ya enviadas, GREEN 11/11 Hub: zoom/nudge y arrastre
congelados durante busy; respuesta libera la edición. Sin diseño nuevo.
Rust `c2a59c4e`: fmt/check/Clippy -D warnings PASS; Nextest 1675/1675
(7 skips existentes, paridad lenta 114 s), lifecycle 18/18 PASS. Quality y
456 huellas, más fragmento de changelog PASS. Telemetría y pgTAP no repetidos:
esta ronda solo modifica servicios/Hub, sin runtime/domain/IPC/testdata ni SQL;
la evidencia de ronda 2 se conserva como histórica. Datos de tests aislados,
target propio `native/target/gates`, dos jobs y plazo de 1800 s por comando.
Push `c2a59c4e` y PR draft a nightly verificados. VANTA-9 Por revisar verificado
14/10/2026 05:48 CEST. El cierre posterior solo cambia handoff/changelog;
HEAD final y CI constan en issue/PR y buzón. CI final pendiente de ejecución.
Nightly remoto `5a796e89` ha avanzado; GitHub marca DIRTY/conflicto de integración.
La base aprobada permanece `0807fbd0`: review e integración del conjunto con
#1608 pendientes del orquestador, sin merge/rebase, promoción ni release.
Evidencia `C:/tmp/ola3/1612`: también conserva el fallo del test Hub sin
network y el intento de ventana incompatible con Windows headless. La prueba
final ejercita los puntos del modelo que comparten las entradas; no acredita
interacción física ni un worker UI real. No hay capturas nuevas.

Diseño Opus `3aaa3961` conservado: perfil privado local primero, DPAPI por
issuer/subject, foto JPEG 256×256 ≤24 KiB y recorte circular. Puente UUID
existente y CAS; sin cambios en account.rs/account/*, login, pagos ni licencias.
Revisión de ocho páginas en [matriz](../../pilot-settings-review.md). El painter
compartido de bandera/fallback ISO está preparado; falta diseño aprobado de
colocación por widget. No se inventa composición.

Ronda 2 CLI corrige la review Sol (0 P1/4 P2):

| Hallazgo | Commit | Resultado probado |
|---|---|---|
| H1 confirmación perdida | `9a3d3b3f` + `03068639` | Reintento tras HTTP ilegible y reinicio; recupera solo documento/hash idénticos en R+1, otro hash conserva Conflict |
| H2 SQL acepta perfil ilegible | `ae586434` | Tipos/límites/controles/ISO/simuladores y campos futuros legibles; máximos válidos conservados |
| H3 DML elude CAS | `4db253ad` + `5e380ef0` | DML directo denegado; RPC pública INVOKER y escritor CAS privado NOLOGIN/NOBYPASSRLS, sujeto a RLS |
| H4 descripción con Enter | `b487e334` | Guardado/reapertura de dos líneas; UI normaliza CRLF/CR a LF y rechaza otros controles en IPC/SQL |
| H5 cancelar recorte ocupado | `27133332` | Guardia de acciones y botón deshabilitan Cancelar mientras procesa; regresión de la guardia, sin prueba física de worker UI |
| H6 fotos inmutables | `b28cdb4c` + `4e92dbd2` | UPDATE/movimientos y DELETE+INSERT denegados ante policy global adversarial |
| H7 retirada QA | `df21f8c6` + `63b232bc` | Niega falta de consentimiento/perfiles/fotos; retira paquete vacío y conserva cuentas/policies ajenas |

RED→GREEN y logs de esta ronda en `C:/tmp/ola2/1612`. Rust validado
`03068639`: fmt/check/Clippy PASS, Nextest 1672/1672 (7 skips existentes, una
paridad lenta de 123 s), lifecycle 18/18 PASS. Telemetría 25/25 PASS
(corpus largo ACC 898 s, tres tests lentos esperados). Quality y 456 huellas
PASS. SQL `5e380ef0`: 68/68 pgTAP + 9 postchecks de retirada y tres negativas
PASS, PostgreSQL desechable loopback con administrador habitual y con
CREATEROLE sin SUPERUSER. El grant del escritor al administrador permite
transferir ownership; retirada QA con el mismo grantor. [Runbook](../../pilot-profile-backend.md).
Paquete solo preparado, sin aplicar en Supabase. Presupuesto SQL conservador
reserva el máximo de foto dentro de 48 KiB; puede rechazar extensiones cerca del
límite aunque una foto pequeña cupiera, preservando la copia local.

Capturas anteriores y QA de las ocho páginas: `C:/tmp/1612-evidence` (código
`6a5fb75a`); no acreditan el estado ocupado nuevo ni son capturas del HEAD
actual. Sin login/Storage HTTP real, Run/toasts, upgrade ni LMU/ACC físicos;
sin validación compilada del conjunto con #1608. Conserva la separación de
`services/view.rs` y su techo 1750 al integrar ambos PR.

Histórico de ronda 2: push `5e380ef0` verificado; VANTA-9 Por revisar verificado el 14/10/2026
a las 05:10 CEST. El commit de cierre solo cambia handoff/changelog; SHA final
en la issue/PR y buzón `C:/tmp/buzon/1612.md`.
CI se consulta por HEAD final: no se declara verde completa. Nightly remoto
ha avanzado a `552c0d52` por #1607; esta rama conserva la base aprobada
`0807fbd0`, sin merge/rebase ni validación del conjunto nuevo.
Canal alcanzado: rama de issue y PR draft. Sin merge, promoción, release,
producción, instalación/datos reales modificados, herramientas nuevas ni
subagentes. Siguiente: revisión del orquestador; integración y activación backend requieren su
validación/autorización correspondiente de Isaac.
## #1609 / VANTA-22 · Analítica consentida (14/10/2026)

Ronda 3 publicada para revisión desde `f56156e3`; review Sol r2 completa.
P2-1 `86fa6aa8`: RED A/B → GREEN, caché monotónica, admisión por generación,
cola revocable de 32 entradas y acumuladores descartados/revalidados al retirar/cerrar.
Callbacks try_lock sin I/O ni espera; worker persiste fuera del hilo UI.
P2-2 `6b177190` + `4357a6a5`: carga con consent.lock retenido, controles disponibles,
limpieza/importación Setup Busy diferidas en worker cancelable y revocación sin reiniciar.
Busy tipado, wrapper save_with String conservado; resultado al heartbeat por memoria.
Respuesta atrasada descartada si hubo decisión manual: test worker terminado →
revocación → recibir respuesta, sin sleeps. No borra otros avisos de Ajustes.
P3 `88ddc324`: error de decisión no confirmada/reintentar, sin afirmar que fallos
estén apagados. `beb68c4f` cierra Clippy y refuerza la barrera del test heredado:
la cancelación al cerrar no puede sustituir su comprobación final de consentimiento.
Gates finales: fmt/check/Clippy, Nextest 1675/1675 (7 skips), lifecycle 18/18,
services 130 + 2 procesos, Store 9 e integridad 456 huellas PASS. RED y errores
iniciales conservados en C:/tmp/1609-r3; [informe](../../analytics/informe-1609.md).
Código publicado `4357a6a58d66f5648a9d02befc8a0c5b9f5a4dbc`, base `69fa2d65`;
HEAD documental final y CI en issue/buzón. PR #1617 draft a nightly, sin auto-merge
ni merge; VANTA-22 Por revisar verificado el 14/10 a las 04:03:53 UTC.
Origin/nightly consultado `552c0d52`; sin integración con ese tip ni promoción.
**Criterio estricto pendiente:** la invalidación en otra UI depende del refresco
Privacy del worker (espera normal 250 ms, mayor con I/O ocupado). Descarte al
refrescar probado, sin garantía de retirada instantánea de memoria entre procesos.
DUDA al orquestador: frontera compartida requiere review; no se declara APTO ese
criterio. Próxima acción: revisar diff/evidencia y resolver ese límite antes de integrar.
Sin subagentes, diseño/dependencias nuevos, QA GUI física, PostHog real, producción,
datos/instalación reales de Isaac, merge ni release. Telemetría dedicada no requerida
(sin cambios runtime/domain/ipc/testdata); paneles/snippet sin cambios, no repetidos.
Pendientes iniciales de clave/panel real, Marketing/Setup, atribución y registro/pago
backend conservados en informe/contrato. Acciones externas autorizadas: commits,
push, actualización PR/issue y estado Plane. Última comprobación local: 04:03 UTC.

### Ronda 2 (evidencia anterior)

Ronda 2 completada por Codex CLI; review Sol leída completa, sin subagentes.
P1 `58d0a735`: RED A/B → GREEN. Generación persistida y cerrojo SO común
publicación/revocación/POST; con POST activo (8 s), guardar devuelve ocupado
sin éxito falso. P2 `f40bc343`: ID/marcadores borrados; UUID nuevo al reaceptar,
tiempos reiniciados por generación. P2 `55531cc4`: instrumentación GPUI solo
try_send (32 entradas); worker de services persiste, emisor HTTP en services.
Guardado manual del consentimiento conserva su ruta atómica existente.
Gates locales: services 127 + 2 procesos, Nextest 1666/1666 (7 skips), lifecycle
18/18, fmt/check/Clippy/quality PASS (456 huellas). RED y GREEN conservados en
`C:/tmp/1609-r2/`; detalle, límites y omisiones en [informe](../../analytics/informe-1609.md).
Base `69fa2d65`, código publicado `55531cc4`; HEAD documental en issue/buzón.
PR draft [#1617](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1617)
a nightly, sin auto-merge; VANTA-22 «Por revisar» verificado 14/10 02:36 UTC.
CI del nuevo HEAD pendiente; no afirmar integración/release. Nightly consultado
`0807fbd0`; esta entrega no integra ese tip ni promociona canales.
Catálogo/ID en `docs/analytics/eventos.md`; snippet/paneles preparados, sin --apply.
Pendientes: clave/panel real por vía privada del orquestador, Marketing/Setup
(#1591/PR #1600), atribución y registro/pago exactos backend, QA visual/review.
Telemetría dedicada omitida: no se toca runtime/domain/ipc/testdata. Sin diseño
nuevo, producción/PostHog real, datos/instalación reales de Isaac, dependencias,
merge ni release. Evidencia inicial y contratos conservados en el informe y Git.

## #1601 / VANTA-10 · Plane, fase de implementación (13/10/2026)

OK de Isaac/orquestador al plan `C:/tmp/ola2/plan-1601.md`: Plane → Supabase
cada 5 min, tres columnas; archivos antiguos retirados, JSON manual del Hub inerte.
Rama propia `vantareapp/isa-1601-roadmap-plane`, base inicial nightly `298abc33`, actualizada con #1599 (`bc89c8b8`).
Implementación inicial `076531ab`; merge documental `162ba486` preservando
reglas de orquestador/estados y autoridad del roadmap Plane. Corte de código `7edf33e6`; SHA final/CI en el PR
[#1603](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1603) a nightly.
Issue [#1601](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1601),
`area:plataforma`, añadida al GitHub Project Vantare; sin versión comprometida.

Implementación local: API v1 CE con páginas completas y memberships, filtro
Infraestructura/Negocio/canceladas, nombres literales, IDs estables y límites
40 tareas/40 KB sin truncar. Mismo documento/rol/RPC v2/v1; sin cambio de esquema.
Hub carga caché y refresca cada 300 s usando el heartbeat y worker IPC existentes;
acciones explícitas conservan prioridad. Tres columnas con later legado en Planeado.
Web preparada aquí; no se edita otro repo. Action/scripts ClickUp retirados localmente.

RED: test de tres columnas perdía later; los cinco tests web fallaban sin polling.
GREEN final: 18 Python, 6 web, 8 Hub + 6 services roadmap; 57 digest, 45 canal
y 26 release-notes; fragmento ISA-1601 validado; script Plane 9 tests PASS.
fmt/Clippy PASS; Nextest completo final 1646 PASS/7 skips; lifecycle 18 PASS;
telemetría 25 PASS (ACC 832 s). Regresión de reintento de caché RED→GREEN.
La repetición de Nextest chocó con el .exe de telemetría abierto; tras terminar
ACC se repitió en serie y pasó. Evidencia `C:/tmp/ola2/1601-*.log`.
SQL PostgreSQL 18.6 local desechable PASS: idempotencia, cambio único, lectura
v1/v2, vaciado/retirada rechazados. Unidades systemd verificadas en copia temporal
con ExecStart=/bin/true; no prueba despliegue. Quality 456 huellas PASS.
Runbook: [plane-roadmap-runbook.md](../../plane-roadmap-runbook.md).
Credenciales/token/roadmap.env, despliegue, timer y primera escritura NO autorizados
ni ejecutados. Cantidad/tamaño del tablero real pendientes de lectura autorizada;
exceso exige parar y preguntar. Cambio de IDs puede exigir aprobación exacta SQL.
Entrega: PR #1603 (`Closes #1601`), auto-merge desactivado por Isaac tras la
revisión independiente; no reactivarlo. CI remota del nuevo SHA pendiente.
VANTA-10 pasa a Por revisar con el
enlace del PR y FIN en buzón. No se afirma merge ni publicación. El orquestador revisa y gestiona #1582, sustituido por
este publicador. QA GUI y tablero real pendientes: las pruebas son locales con
fixtures/corpus; no hay publicación real, deploy ni release.

Corrección de revisión #1603: revisión Sol leída completa y tres regresiones
RED antes del arreglo. Privacidad: 10 subcasos fallaban; ahora exige recuento
`total_issues` entero y coherente en cada module, rechaza privados vacíos
incluso con cero declarado y conserva JSON/SQL anteriores al abortar.
Paginación: 8 subcasos aceptaban respuestas dudosas; ahora rechaza listas
desnudas y metadatos ausentes. Web: `pagehide` con `persisted=true` conserva
controlador/timer; test de dos restauraciones, sin intervalos duplicados,
y cierre definitivo que cancela y retira el listener.
GREEN de esta ronda: 21 Python, 7 web, check/Clippy/fmt, Nextest 1646 PASS
con 7 skips, lifecycle 18 PASS; SQL local, quality 456 huellas, canal 45,
release-notes 26, digest 57 y bash -n PASS. Telemetría no repetida: no se
tocan runtime/domain/ipc/testdata; los 25 PASS anteriores siguen siendo
evidencia de la implementación inicial. Bfcache probado con eventos simulados;
QA web real pendiente. Logs `C:/tmp/ola2/1603-*.log`, tabla RED→GREEN en
`C:/tmp/ola2/fix-1603-results.md`; SHA del push en issue/PR/buzón.
El runbook documenta estas guardas. Sin nuevas acciones de producción.

## Servidor · VANTA-77 / ISA-1647c · 2026-10-15

Actualización 16/10 por encargo del orquestador: merge de `origin/nightly`
`9e48eb86f8d2cfc43b64010d2b1ac1c58768826a` en esta rama de issue.
Cuatro conflictos resueltos: vigilante ampliado y su instalador con manifiesto,
helper y hardening conservados; README con los avisos ampliados; CLI idéntica
a nightly, incluida la firma `[orquestador] ` de #1650. Vigilante/helper 54 y
CLI 10 PASS; calidad 456 huellas PASS. Suites Python activas de tools: 170 PASS
y 1 FAIL heredado de nightly, catálogo triage desalineado con ocho variantes
nuevas de services::Error (test_review_1602_r5). Reproducido el mismo fallo
en snapshot limpio de nightly; no se corrige fuera del encargo de merge.
SHA y resultados finales en #1647/#1649 y buzón 1647c.
No se despliega ni se envían pruebas reales en esta ronda; no fusiona la PR
ni promociona la rama a ningún canal. Las pruebas de runtime de abajo
corresponden al despliegue del 15/10, no se atribuyen a este merge.

Encargo del orquestador: revisión completa DeepSeek ds-rev1583-1649.
PR [#1649](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1649),
rama `vantareapp/isa-1647-vigilante-plane`, ahora incorpora la base #1583
`vantareapp/isa-1565-servidor@1d7e6edb5` mediante merge entre ramas de issue.
Se resolvió solo el instalador conservando hashes, helper y hardening.
P2-1: scripts ops/linux y todos los archivos del backup 1647b pasan de
svc Modify a RX; dueño Administrators; solo Administrators/SYSTEM escriben.
Backup con ACL propia y SHA256SUMS (integridad acreditada desde la revocación).
Instalación exige SHA-256 de instalador y ambos scripts en snapshot privado;
prueba de alteración abortó sin modificar el script instalado. Scripts Linux,
/etc/vantare y /var/lib/vantare son root, sin escritura de grupo/otros.
P3-6: tres intentos persistidos por campana, después abandono registrado;
ntfy sigue independiente. P3-8: cuerpos API no JSON omitidos con ID/clase.
P3-9: consulta desde última marca con solape 5 min, máximo 30 días al recuperar;
poda IDs antiguos, conserva pendientes. Fuera de esa ventana requiere revisión
manual. P3-10: lanzadores y despliegue reproducibles incluidos en el repo.

54 tests de vigilante/helper + 10 CLI PASS en Windows y Linux; quality
456 huellas PASS; bash -n de seis scripts y cuatro unidades systemd PASS.
Despliegue autorizado con backup root:700 sin secretos:
`/var/backups/vigilante/1647c-20261015T180814Z`, hashes verificados,
dry-run 0/0 y timer enabled/active. Pasada real success/0, 468 IDs, 41 bot,
colas 0/0, marca temporal persistida y código instalado idéntico al repo.
No se enviaron nuevas pruebas. La prueba histórica VANTA-73 queda intacta.
Hubo HTTP 502 transitorio tras recrear la stack; recuperación verificada a 200.
Evidencia saneada: `C:/VantareServer/evidence/1647c/`; permisos antes/después,
prueba de alteración, SQL solo lectura y final-runtime.txt. Sin capturas de app.
Rust y gates nativos omitidos por encargo explícito de tooling sin Rust.

[Runbook y reversión](../../../../tools/server/vigilante-plane.md).
La reversión mantiene ACL seguras y verifica hashes antes de restaurar; no
borra campanas ni comentario. Riesgo previo de ntfy ante pérdida de acuse
sigue documentado; no se afirma deduplicación del receptor. Conservar CLI
vigente de nightly al integrar esta pila antigua. SHA, push, CI y estados
verificados en #1647/#1649, Plane VANTA-77 y buzón 1647c.
Siguiente: revisión del orquestador; **registro de Plane anuncia habilitado**
(ENABLE_SIGNUP=1), pendiente de decisión en VANTA-47. Sin merge de PR,
promoción a nightly/testers/master ni release por el worker.

## 1. Resultado

### Servidor · VANTA-47 / revisión 1647c · 2026-10-15

Encargo de implementación del orquestador sobre PR #1583, rama
`vantareapp/isa-1565-servidor`, base previa `f385f7937` (merge-base nightly
`ee3725407`). Worktree `C:/VantareServer/wt/isa-1565`, inicialmente limpio.
P3-2: cuatro servicios root con NoNewPrivileges, ProtectSystem=strict,
ProtectHome y PrivateTmp, escritura limitada a rutas de copia/estado/latido.
Drop-ins aplicados en vivo con backup root:700 y SHA256SUMS en
`/var/backups/vantare-hardening/20261015T180427Z`; cuatro unidades verificadas,
Plane reiniciado y copia/supervisión/vigilante ejecutados satisfactoriamente.
P3-3: rustup-init 1.28.2 con SHA-256 fijado y contrastado con fuente oficial
y descarga local; sin ejecutar instalación Rust. Riesgos de plane.env en copias
y HTTP LAN documentados, sin cambiar secretos, datos ni red.
P3-5 **pendiente de decisión**: lectura pública enable_signup=True, BD
ENABLE_SIGNUP=1 y 5 cuentas activas/totales. No se acreditó registro cerrado,
no se intentó crear cuenta ni se cambió configuración; avisado en buzón 1647c.
Evidencia saneada `C:/VantareServer/evidence/1647c/`, detalle y reversión en
`tools/server/README.md`. Checks finales, SHA/push y CI se verifican en #1583,
#1565/#1571 y buzón. Siguiente: revisión del orquestador y decisión sobre alta.
Sin merge, promoción de canal ni release. VANTA-77/PR #1649 conserva el vigilante
ampliado encima de esta base y su propio runbook; integrar ambos sin perderlo.

Servicios remotos de cuenta/licencia, Billing, calendario, reportes y distribución; Hub presenta su estado. La existencia del cliente/backend no certifica apertura comercial, producción ni release.

## 2. Autoridad y lectura verificada

Leídos [#1568](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1568), [#1514](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1514) y [#1535](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1535) con sus decisiones/avances; Project Vantare y labels de la issue gobiernan cada entrega. Entradas: [servicios](../../../native/services/README.md), [ADR 0100](../../adr/0100-identidad-clerk-polar-supabase.md), [canales](../../branch-channels.md). #1561 registra esta compactación y su escritura verificada.

## 3. Estado real y canal

Base incorporada mediante merge (sin rebase): `origin/nightly@b2186f82746424b4844a5909efd31530c5bbe5b3`,
que contiene #1570 (handoffs de estado), #1572 (#1563 pedales) y #1573 (#1568 acceso).
Rama `vantareapp/isa-1535-roadmap-testing`, entrega #1535 `3d762e8b`, PR
[#1578](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1578) a nightly.
SHA del merge/push y CI se registran en la issue y `C:/tmp/buzon/1535.md`.
Auto-merge activo por el orquestador; esta escritura no acredita fusion remota ni release.
Servicios IPC v6, DTO v10 y control/derechos v4 son contratos independientes.
#1568 conserva admision protegida, cancelacion serializada y revalidacion;
la correlacion del incidente humano sigue pendiente. SQL #1535 no aplicado.

#1565 (repo privado): rama `vantareapp/isa-1565-descargas-publicas` sobre
`origin/nightly@707514e2`; feed en seco a `Vantare-Downloads`, runners
`self-hosted` solo en privado y presupuesto de artifacts. PR, SHA y checks en la
issue y `C:/tmp/buzon/1565.md`. Sin release, firma ni cambio de visibilidad.

## 4. Decisiones cerradas

- Plane es la única fuente del roadmap desde #1601, publicado en Supabase con lectura anon y compatibilidad v1/v2; no depende del repositorio publico. Clerk identifica; Polar cobra; Supabase conserva UUID interno/datos. No atribuir compras por email, metadata editable o `sub` aislado; identidad ambigua se rechaza/cuarentena.
- DTO de fotos v10, servicios v6 y control/derechos v4 son contratos independientes en esta base.
- Account conserva recuperación aun con herramientas denegadas; negar derechos no inventa un login ni un pago.
- Venta pública exige matriz monetaria/reconciliación y autorización. Implementado, integrado, publicado y validado en producción son estados distintos.
- #1565: descargas y feed solo en el repo público `Vantare-Downloads`; sin feed doble ni renovación automática del bootstrap. La 0.0.976 se publica solo allí y cada instalación reinstala con Setup. Free privado: sin branch protection aplicada; deploy de Functions manual sin mover secretos ([repo-privado-1565](../../repo-privado-1565.md)).

## 5. Arquitectura y ownership

[Services](../../../native/services/README.md) posee red bajo demanda; [Hub](../../../native/hub/README.md) presenta cuenta/calendario/actualización y no autentica ni cobra. Supabase/Clerk/Polar se validan en sus entornos autorizados. Admin es privado y no entra en el instalador público. El mapa de procesos vive solo en [native/README](../../../native/README.md).

## 6. Evidencia y límites

#1535: fmt/Clippy PASS; Nextest 1579/1579 (7 skips), lifecycle 18/18 y
telemetria 25/25 en la entrega aislada. SQL corregido tras Sol+Opus: PostgreSQL
18.6/pgTAP 1.3.4 local 20+31 PASS, LOGIN adversarial, aislamiento de cuentas,
aprobaciones caducadas con dos sesiones y auditoria DEFINER EXECUTE+USAGE.
TLS CA/hostname y control de hostname real PASS sin auth/SQL; tres tests Python.
Quality 456 huellas PASS. Evidencia: `C:/tmp/ola2/1535-evidence/`.
El merge actual tuvo conflictos solo documentales; no repetidos gates Rust
por la condicion del encargo. No acredita esquema Supabase completo, CI remota,
configuracion del host de CI, OAuth, pagos, entorno fisico ni produccion.

#1565: QA aislada `TEST_INSTALLER` PASS (Setup 0.0.975 real → datos →
Setup 0.0.976 de la rama: 4/4 datos idénticos, bootstrap renovado, Check solo a
Downloads; instalación real intacta). Paquete QA = binarios 0.0.975 con
`manifest.version` 0.0.976. Evidencia: `C:/tmp/1565-qa/ev/`, `C:/tmp/1565-b/`.
Revisión Sol (`C:/tmp/ola2/review-1592-sol.md`): actualizador y datos OK;
P1 limpieza Windows (cwd bloqueado), P2 `actions: read` y P2 orden Linux
corregidos con regresión; tests de runner/budget/origen conectados a gates.

## 7. Riesgos y deuda

- P1: acceso al abrir LMU (#1568); no dar la causa real por confirmada solo con RED local.
- P1: readiness comercial, identidad y pagos (#1514/#1506/#1507/#1499/#1501); no abrir venta desde docs.
- P2: SQL #1535 corregido y probado localmente; esquema completo, aplicacion y activacion pendientes. P2-4 aceptado por Isaac en #1535.
- Login/logout físico, expiración, recuperación, instalación/upgrade y QA remota requieren evidencia propia.
- P2 #1565: instalaciones que no reinstalen con Setup 0.0.976 antes de privatizar se quedan sin feed; app Go retirada sin actualización.

## 8. Issues terminadas, activas y pendientes

#1530-#1534 y #1536 cerradas; #1570/#1572/#1573 fusionadas en la base indicada.
#1535 en PR #1578; #1568 mantiene correlacion humana pendiente. Abiertas
#1514/#1506/#1507/#1510/#1511/#1515 y gates comerciales: consultar su estado
antes de actuar. IDs migrados y evidencia previa permanecen en el historico.
#1565 abierta: PR de feed/CI a nightly en revisión; runners en #1583.

## 9. Siguiente acción exacta

Verificar CI/auto-merge de #1578. Cuando figure MERGED en nightly, ejecutar
SOLO LECTURA contra produccion la consulta previa (DEFINER alcanzables, ACL y
registro de migraciones) usando acceso ya configurado, sin imprimir secretos.
Escribir DUDA con resultado y comando exacto para las dos migraciones. Si falta
acceso, preparar pasos para Isaac. No aplicar nada hasta respuesta expresa.
P2-4 aceptado por Isaac en #1535; no implica configurar credenciales ni desplegar.

#1565: revisión independiente del PR. Tras integrarlo, Isaac sigue el runbook
(firma única, publicar solo en Downloads, reinstalar, avisar al tester) antes
de cambiar la visibilidad.

## 10. Última actualización

2026-10-10 · GitHub #1535 · Codex. PR #1578, base nightly y cambios
#1570/#1572/#1573 contrastados. Estado sustituido segun plantilla; diario,
SHA, push y checks en la issue/buzon. Sin autorizacion de produccion.

2026-10-13 · GitHub #1565 · Claude. Feed en seco, CI privada y QA aislada;
PR a nightly sin merge ni release.
