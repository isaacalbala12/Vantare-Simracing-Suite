# #1638 — CI de recuperación e identidad del jugador

`08f52be56` fue evaluado y falló en el [run Windows 38847620638](https://github.com/isaacalbala12/Vantare-Simracing-Suite/actions/runs/38847620638).
El primer hijo había emitido HELLO y procesado una foto: después cerró con
«la radio requiere una licencia válida de Engineer». El segundo encontró
BrokenPipe al escribir. No fueron los plazos de ACK de 10 s: duraron 7,73 s
y 4,20 s. El log completo se conserva en `C:/tmp/1638-ci-failed.log`.

Los tests construyen observaciones neutrales y una autoridad independiente;
no usan el adaptador LMU ni su Gate. Sus fuentes de Engineer, Feed y Host son
idénticas a nightly. Aislados, antes del cambio, pasan **46/46** tests Engineer;
los dos afectados duran **0,187 s y 0,165 s**. La carga de CI es compatible
con que el refresco en segundo plano no llegue antes del TTL de derechos
de **2 s**. El log antiguo no conserva la edad de la política en el instante
de denegación: no permite atribuir ese detalle con certeza absoluta.

Se aplica al banco `engineer::recovery` el aislamiento ya utilizado para otros
tests con plazos: `threads-required = num-test-threads`, prioridad 100, también
heredado por el perfil CI. Evita competir con corpus CPU mientras mide
checkpoint/ACK. No se modifican producto, permisos, TTL, deadlines, aserciones
ni retries; siguen incluidos los tests de denegación y pérdida de autoridad.
Base sincronizada mediante merge de `origin/nightly@8166277cb`.

Gates en serie por cola, `VANTARE_CARGO_MIN_GB=0`: Clippy workspace/all-targets
`-D warnings` PASS; Nextest perfil CI con `--workspace`, Engineer/runtime/domain/
ipc/services y corpus de telemetría **915/915 PASS**, 9 skips,
135,737 s (un corpus ACC lento, PASS). Recovery corre primero: seis PASS, los
dos afectados 0,164/0,175 s; revocación y denegación conservadas. Fmt/diff PASS.
Logs `C:/VantareServer/logs/1638-ci-player-*`. UI completa/lifecycle no repetidos
en servidor por alcance/RAM; CI remota completa se verifica por SHA en #1664.
Se interrumpió un primer build local con selección excesiva de crates antes
de ejecutar tests; log `1638-engineer-before.log`, no contado como gate verde.

El SDK instalado de LMU 1.4.2.0 (`InternalsPlugin.hpp`, `SharedMemoryInterface.hpp`,
pack 4) define dos arrays independientes: scoring `mIsPlayer` @196 y `mControl`
@197; `mControl` expresa quién conduce, no la identidad del jugador. El adaptador
selecciona `mIsPlayer` y enlaza ambas filas por `mID`. La cabecera telemetry
publica `playerVehicleIdx` @128465 dentro de **su** array: no es slot ID ni
posición de scoring. La velocidad escalar es la norma de `mLocalVel`, tres
f64 @184/192/200 de la fila telemetry (m/s). Cambiar local a mundo rota el
vector; no convierte una norma casi nula en movimiento.

Se contrasta Imola en streaming con hashes de cada cuerpo y footer, sin cargar
el archivo íntegro. Evidencia privada: `C:/VantareServer/logs/1638-player-imola-audit.json`;
extractor `C:/tmp/1638-player-audit.py`. El primer frame une exactamente
`scoring[37].mIsPlayer=1 → mID=0 → telemetry[37]`, igual a la cabecera 37;
`mControl=0`. Telemetry y scoring publican ambos velocidad del orden de 1e-7 m/s.
La auditoría registra discrepancias, IDs/índices, máximos de velocidad de jugador
y de IA, inputs y vueltas sin nombres. Resultado íntegro en la evidencia y
comentario de #1638/#1664.

Regresión adicional sobre una captura real **en movimiento** de 44 coches:
intercambia las filas telemetry 0/43, actualiza su cabecera, varía `mControl`
y exige conservar el jugador scoring[43], su ID, velocidad **15,5922 m/s**,
reloj y RPM. La fila scoring[0] sigue sin recibir inputs del jugador. Esta
permutación es una frontera sintética explícita sobre el fixture real;
no se presenta como otra grabación física.

Los dos `diagnostic.json` A/B solo guardan índice 36, 37 coches, clock y vector:
normas **6,81e-8 y 9,42e-8 m/s**; reloj 102,5125/409,9625 s. No contienen
`mIsPlayer`, `mID`, `mControl`, poses, inputs ni SHM cruda. Por tanto, no prueban
por sí solos la asociación de identidad en esos intentos ni si Isaac conducía.
No hay evidencia de un error de offsets/índice en Imola y no se alteran las
lecturas productivas ni se elimina el requisito de movimiento del A/B.
Antes de interpretar otro aborto, recoger en una misma foto scoring/index/ID/
isPlayer/control, header/index/ID telemetry, ambos vectores, pose e inputs;
contrastar con Isaac. Reloj avanzando por sí solo **no prueba movimiento**.
