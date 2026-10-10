# Beta: acceso por módulos — #1451

Tarea B1 autorizada por Isaac para la beta del 5 de octubre. Notion no está
disponible; ejecución excepcional con GitHub #1451 por instrucción del encargo.
Cliente: `vantareapp/isa-1451-beta-acceso-modulos`, base #1445 `27ca9066`.
Servidor: `vantareapp/isa-1451-beta-acceso-servidor`, base #1444
`04cb73bc89ecc4f7dded0cbeb0a29a96fe57dd04`; commit
`5be30df40436157502f06872204de27c03a2bb5e` y compatibilidad Wails
`04a8ff549d551942e6fab867a1cb474a31cf4263`; período pagado
`fa72b79860a1a104aff7a4d71d0d7435bb9c91fa`. Sin push, PR, merge ni despliegue.

## Matriz final

| Credencial / capacidades vigentes | Overlays, Studio, Workshop, Launcher, Ajustes, Cuenta, Testing | Strategy | Ingeniero / hijo | Análisis | Calendario |
| --- | --- | --- | --- | --- | --- |
| Sin credencial, error, envelope caducado o caché inválida | Cerrados | Candado | Candado / apagado | Oculto | Oculto |
| Válida, vacía; Pro o launch_v1 | Abiertos | Próximamente | Próximamente / apagado | Oculto | Oculto |
| module.strategy | Abiertos | Abierto | Próximamente / apagado | Oculto | Oculto |
| module.engineer | Abiertos | Próximamente | Abierto / permitido | Oculto | Oculto |
| module.analysis | Abiertos | Próximamente | Próximamente / apagado | Abierto | Oculto |
| module.calendar | Abiertos | Próximamente | Próximamente / apagado | Oculto | Abierto |
| owner, tester, nightly_tester | Abiertos | Abierto | Abierto / permitido | Abierto | Abierto |

Las concesiones se combinan. Engineer sigue siendo opt-in (`--engineer`):
permiso no implica arrancarlo si no está configurado. Al revocar el permiso,
expirar la política o fallar IPC, el supervisor cierra ese hijo por el mecanismo
existente (EOF/WM_CLOSE, plazo y kill), conservando núcleo y overlays.
La política IPC sube a v2; todos los binarios deben distribuirse juntos.
Análisis/Calendario se filtran de rail y paleta, se omiten sus enlaces de Inicio
y su navegación directa se rechaza. Una sección oculta activa vuelve a Inicio.

## Catálogo y layouts

El registro nativo contiene 18 tipos y **no contiene `engineer-radio`**. Ninguno
consume Engineer ni el planificador Strategy: cada renderer ingiere `Snapshot`
y proyecta ViewModels del dominio. `fuel-strategy` consume combustible,
historial y proyección de autonomía del núcleo (`domain::fuel_strategy`), no el
módulo de planificación Strategy. Por eso todos los 18 widgets siguen en Studio
y Workshop para una credencial válida sin módulos. No se añade un filtro vacío
ni un widget nuevo. La política de render de overlays exige credencial válida
para todos los tipos, incluidos Standings y Pedals.

No se muta ni se limpia el documento de layout al cambiar derechos. No existe
hoy un tipo de widget dependiente que se pueda probar ocultando; un layout
nativo con `engineer-radio` no forma parte del esquema actual y este trabajo
no introduce soporte de un renderer inexistente.

## Activación y límites

SQL exacto en `supabase/functions/native-license/README.md` del commit servidor.
Nueva tabla `module_rollout`, cuatro claves cerradas, RLS y permisos solo para
service_role, inicialmente desactivadas. Por usuario se reutilizan las filas
`billing_access_grants` de proveedor `vantare`, origen `support`, sin fecha.
Una consulta de rollout fallida no firma una credencial parcial.
El endpoint `license-credential` omite módulos para conservar la compatibilidad
Go/Wails, cuyo verificador rechaza claves desconocidas. Solo el puente nativo
incluye módulos individuales/globales.

Cambios del servidor llegan en la siguiente renovación, no mediante push. Una
credencial V1 válida cacheada carece de vencimiento global: un módulo perpetuo
persistirá hasta renovar/invalidate/logout. Se conserva ese contrato existente;
V2 sí corta en `exp`, incluso con capabilities vacías. No se reescribe la gracia
de los leases operativos; sus tests siguen cubriendo entrada y restauración.
Sin red con caché válida se conserva la política de esa credencial; sin caché
válida se cierra todo. No se certifica aquí revocación instantánea remota.

Margen offline existente, sin ampliarlo: el puente firma V1, sin vencimiento
global; overlays y módulos perpetuos cacheados no tienen límite temporal fijo.
Owner obtiene hasta 30 días, tester 14 días y nightly_tester 72 horas desde la
emisión, acortados si vence antes la asignación. **No hay garantía mínima de
tres días**: una asignación próxima a vencer, un período pagado próximo a
terminar o una credencial V2 con `exp` cercano pueden durar menos. La gracia
existente es una hora para juego ya identificado, nunca tres días adicionales;
no prolonga el envelope V2. La lectura de política del núcleo no consulta HTTP.
El test offline restaura caché V1/V2, con capacidades vacías o Strategy, constata
un servidor local inalcanzable y avanza el reloj 2/3 horas y hasta el límite de
tres días de un envelope V2 de prueba. V1 sigue abierta; V2 corta al vencer.
Esto prueba el núcleo, no una caída real de Cloudflare ni OAuth de Clerk.

Cancelar al final del período (`cancel_at_period_end=true`) conserva
`paid_through`: el test Deno enlaza la
transición de suscripción cancelada en día 13 con la firma del fin pagado 17 días
después. Rust restaura la autoridad y mantiene Pro sin red hasta el segundo
anterior al fin; fuera de una partida con gracia lo retira exactamente al vencer
y después. **En una partida elegible la gracia existente puede conservar Pro
una hora después de `paid_through`**. La cancelación inmediata
(`cancel_at_period_end=false`) revoca en el servidor según el contrato existente.
Son límites a revisar por el orquestador; no se modifica ese comportamiento.
En esta beta Pro no
abre módulos y su fin no cierra los overlays de una credencial V1 válida.
Una renovación HTTP fallida no invalida la caché del núcleo; el Hub puede mostrar
el error hasta su siguiente lectura de estado local. No se modifica OAuth.

## Verificación

Evidencia y logs exclusivamente en `C:/tmp/isa-1451-evidence/`.
Deno: 80 tests de native-license/license-credential y lifecycle de suscripción
pasan; formato pasa.
Lint compatible pasa excluyendo no-import-prefix, que rechaza un import HTTPS
preexistente; lint sin excluir esa regla falla por ese import heredado.
Gates Rust y límites de runtime se registran en el informe de entrega.
La comprobación adicional Clippy de `parity-capture` encuentra 19 errores
heredados: 17 en `hub/src/analysis/view.rs` sin modificar y dos sobre los
parámetros por valor de `capture::run`, cuya firma se conserva. No se amplía
esta tarea para limpiar la escena de Análisis ni se rebajan reglas de lint.
El gate obligatorio Clippy del workspace sin esa feature sí pasa.

Manual: renovar una cuenta vacía y comprobar Studio/Workshop/Launcher; buscar
Strategy/Ingeniero en paleta (candado Próximamente), buscar Análisis/Calendario
(no aparecen), comprobar Inicio sin enlaces de calendario. Conceder cada módulo,
renovar y comprobar su sección. Con Engineer opt-in activo, revocar y renovar:
solo su hijo debe terminar. Repetir con owner sin filas individuales. Activar
y desactivar rollout global y renovar una cuenta sin grants.

No se aplicó SQL ni se probó Supabase desplegado, cuenta Clerk real, LMU o OBS.
Las pruebas de proceso usan políticas sintéticas claramente identificadas;
la matriz del núcleo sí verifica credenciales firmadas con claves de test.

Captura visual parcial: primer Inicio sin módulos guardado y observado junto
con la referencia Wails y su mapa de diferencias. Se conserva en
`primera-inicio-base.png` fuera del repo. Confirma la retirada de Calendario y
Análisis y los candados de Strategy/Ingeniero; es anterior al último ajuste del
rótulo contextual de Calendario. La escena nativa conserva un preview no
disponible donde Wails muestra miniaturas: paridad heredada fuera de B1.
La captura owner todavía no puede abrir ventana: otro worker (#1454) mantiene
`Global\VantareParityCapture` mediante `hold-screen.ps1`. No se interrumpe ni se
elude ese mutex. Quedan por verificar visualmente owner, solo Strategy, las
paletas y la captura final sin módulos. Las políticas de los tres casos salen
del test de credenciales firmadas y la proyección compartida sí está cubierta
por tests; eso no sustituye los PNG pendientes. Ver `bloqueo-captura.md` y
`capture-beta.ps1` en la carpeta de evidencia para reanudarlos.

Gates finales sobre el código entregado: `cargo fmt --check` pasa;
`cargo clippy --workspace --all-targets -j 2 -- -D warnings` pasa;
`cargo nextest run --workspace -j 2` pasa (1024/1024, cuatro omitidos,
333.993 s); `cargo test --workspace --test lifecycle -j 2` pasa (Engineer
5/5 y supervisor 12/12, ejecución de estos tests serializada).
Compilación de QA `parity-capture` pasa; su Clippy adicional conserva los
19 errores heredados descritos. No se verificó ejecución Unix desde Windows.
