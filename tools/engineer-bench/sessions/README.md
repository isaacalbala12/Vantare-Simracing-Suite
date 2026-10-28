# Campaña LMU sintética compacta — propuesta VANTA-124 / #1786

Campaña nueva y separada. No sustituye los crudos de la campaña abstracta de
930 peticiones ni integra un contrato en el producto. La ejecución decisiva de
Spark Q4_K_M y LFM3 QAD-Q4_0 queda pendiente de la siguiente ventana de GPU.

El origen es el `SnapshotDto` **v11** de `vantare-v2/native/ipc/src/dto.rs`,
en la revisión fijada en `wire_contract.json`. El dominio `Snapshot` no es el
formato serializado. El generador usa biblioteca estándar de Python y no lee el
juego. `synthetic: true` queda en el manifiesto y los casos, fuera del DTO, para
que el parser nativo acepte cada línea sin modificarla.

## Generar y validar sin GPU

Desde `tools/engineer-bench/`:

```powershell
python -B -m sessions.run generate --seed 124 --output D:/VantareServer/inferencia/lmu-corpus-124
```

Produce 18 sesiones (Le Mans/Spa/Monza × LMGT3/Hypercar × práctica/clasificación/
carrera), 83 fotos por sesión y 900 casos. La misma semilla reproduce los bytes;
no sobrescribe directorios existentes. Hay cuatro coches, orden variable, fuel,
neumáticos, ritmo, gaps, posiciones, tráfico multiclase, pit/refuel, lluvia,
daño y banderas. La carrera/práctica tiene 20 vueltas y cuatro fotos por vuelta;
clasificación, cuatro vueltas y veinte fotos por vuelta. Tres fotos adicionales
describen el pit. Son fixtures estilizados, no una simulación física de LMU ni
un estimador del comportamiento real de pilotos. El consumo por vuelta de cada
perfil es constante; el ritmo y el gap varían de forma determinista.

`wire.py` valida la forma completa generada, no pretende ser otro parser general
de IPC. Rechaza versiones, cualidades, duraciones y campos no revisados. El
control independiente opcional usa **el parser y serializador reales**, sin
conectarse al producto:

```powershell
# Desde vantare-v2/ del worktree, siempre mediante la cola del repositorio:
pwsh -NoProfile -File native/scripts/compilar.ps1 cargo build --offline `
  --manifest-path ../tools/engineer-bench/native-probe/Cargo.toml `
  --target-dir D:/VantareServer/inferencia/targets/native-snapshot-probe -j 2

# Desde tools/engineer-bench/:
$photos = @(Get-ChildItem D:/VantareServer/inferencia/lmu-corpus-124 -Filter '*.jsonl' | ForEach-Object FullName)
& D:/VantareServer/inferencia/targets/native-snapshot-probe/debug/engineer-bench-snapshot-probe.exe @photos
```

La dependencia del probe es el crate IPC existente. No añade dependencias al
producto. El roundtrip compara igualdad de `Snapshot`, no bytes JSON ni fidelidad
física del fixture. Los tests Python incluyen versiones erróneas, NaN, quality
inválida, jugador ausente, stale y cambio de época.

## Propuesta de contrato de entrada al LLM

`vantare.engineer.context.proposal.v1` es JSON compacto. El código selecciona la
ventana de **5/20/60 fotos de origen** y prepara estos bloques:

| Bloque | Datos y reglas |
|---|---|
| `current` | Cursor epoch/sequence, estado de fuente, sesión, circuito, clase, vueltas completadas/restantes y segundos restantes; posición general/de clase; gap de clasificación delante/detrás y gap de clase delante; combustible litros, litros/vuelta y vueltas estimadas; neumático y desgaste por rueda; banderas, clima y boxes. |
| `recent` | Número de fotos solicitado/usado/excluido; vueltas cubiertas; ritmo último/medio/cambio; consumo medio y número de vueltas medidas; gap inicial/actual/cambio; eventos con vuelta y sequence. |
| `code_policy` | Ninguna acción autorizada; autoridad estratégica en código; radio crítica local; plan condicional de fuel calculado por el fixture. |

Cada señal actual conserva `value` y `quality`. `stale/unavailable` no se
presenta como valor actual; no se rellena con una foto antigua. Se excluyen del
agregado fotos de otra epoch/sesión/coche. Un sequence más alto de otra época no
gana al cursor actual. No se acorta silenciosamente una ventana insuficiente.
Los tiempos/gaps están en segundos o vueltas con unidad explícita; temperatura
en kelvin; fuel en litros; desgaste es `(1-integridad)*100`, orden FL/FR/RL/RR.
Los gaps espaciales y los de clasificación se mantienen separados. Bandera de
sector o de otro coche no pasa a bandera global; solo `Reliable` puede activarla.
SC se representa como el `Other("safety_car")` nativo más amarilla, no como un
nuevo enum ni como una nueva intención de radio.

El historial conserva como máximo 12 eventos; declara `events_total` y
`events_omitted`. Resume las observaciones de la ventana, no reconstruye fotos
ausentes. La media de consumo usa vueltas medidas incluidas en esa ventana,
deduplicadas por vuelta; el ritmo usa el último tiempo completado observado de
cada vuelta. No se envían los DTOs completos ni el gold al modelo.

El plan de boxes es **solo un fixture de fuel**, con reserva de una vuelta,
sin autoridad para decidir estrategia de producto o conceder permiso de entrada.
Solo se publica para carrera en curso y datos presentes. Conserva confirmación
obligatoria y permiso desconocido; en práctica/clasificación/stale queda
indisponible. El LLM comunica ese plan, no lo calcula.

## Casos y evaluación

864 casos compactos: 18 perfiles × dos idiomas × tres historiales × ocho tareas.
Hay radio de fuel y vuelta completada, preguntas de fuel/gap/boxes, resumen,
última foto stale y reinicio de epoch. Los casos de radio parten de una decisión
de código (umbral de fuel o vuelta recién completada); no prueban la máquina de
ACK completa de `Families`. No incluyen decisiones críticas de spotter en el
LLM: siguen locales. La pregunta/tarea específica está siempre en el último
mensaje de usuario. Las preguntas de voz se evalúan como transcripción textual;
no miden STT, TTS ni audio.

36 controles adicionales usan **una sola foto DTO cruda actual**, sin historial;
van etiquetados `raw_current_dto` y no se mezclan con los contextos compactos.

La radio tiene presupuesto 128 tokens y máximo 32 palabras, sin JSON. Las otras
tareas usan 512 tokens y máximo 90 palabras de texto, con JSON schema de tipos y
enums (sin constantes con la respuesta). Temperatura 0, seed 124, thinking OFF,
streaming con `include_usage`, sin reintento ni fallback. Un stream incompleto,
truncado o sin usage es error; no se beneficia de su latencia corta.

`evaluate.py` comprueba schema, cifras por campo contra el estado **actual**,
tolerancia absoluta 0,02 para decimales y exactitud para enteros/cursor; verifica
que el texto numérico no introduzca otras cifras y que fuel/gap aparezcan también
en la frase. El radio permite distintas redacciones, no una frase literal.
El proxy léxico de idioma se registra aparte y no decide el modelo. Idioma,
unidades en lenguaje natural, números escritos con palabras, implicaturas,
pronósticos y acciones inventadas requieren revisión humana. El informe no debe
llamar «calidad aprobada» a un simple pase automático de estas comprobaciones.

## Ejecución en la próxima ventana

Un solo motor cargado, Windows ROCm fijado, cuatro slots de 8192 tokens, KV f16,
batching continuo. Verificar esa configuración en `/props` y los logs antes de
iniciar. **El runner no instala ni arranca motores.** El cliente mantiene como
máximo tres peticiones largas y una de radio. Espera el primer contenido de una
larga (o su terminación/error) para admitir radio y registra cuántas largas
seguían activas. Una larga muy corta puede terminar antes: no se inventa
solapamiento ni se rellena la salida para forzarlo. No equivale a una prioridad
nativa de slots de llama-server.

```powershell
python -B -m sessions.run run `
  --cases D:/VantareServer/inferencia/lmu-corpus-124/cases.json `
  --output C:/VantareServer/evidence/vanta124/lmu-compact/spark `
  --base-url http://127.0.0.1:18081/v1 --model spark-x2.6-1.7b-q4km-rocm `
  --passes 5 --engine-pid PID_REAL --quiet-window-id VENTANA_AUTORIZADA

# Después de parar Spark y cargar exclusivamente LFM3, repetir con:
# --base-url http://127.0.0.1:18082/v1 --model lfm3-1.7b-qad-q4_0-rocm
```

Cinco pasadas dan 4500 peticiones por modelo, incluidas 180 del control crudo.
Antes de medir, `/apply-template` + `/tokenize` verifican todos los prompts con
el motor real, fuera de las latencias. Si prompt + presupuesto supera 8192 se
aborta; no se recorta contexto. Los conteos CPU previos de mensajes + schema,
con tokenizadores fijados, fueron 891–1488 tokens compactos y 2412–3481 para el
DTO crudo; aún hay que medir la plantilla real en la siguiente ventana.

`guard.ps1` comprueba RAM y cargo/rustc/link/cl cada 500 ms: menos de 512 MiB o
una compilación marca `ABORT.json`, detiene nuevas admisiones y contamina la
campaña. Los streams ya enviados pueden tardar hasta su timeout en terminar;
el guard del launcher debe seguir protegiendo el proceso del motor y abortarlo
si baja de RAM. El runner no mata procesos ajenos. RAM/VRAM se recogen por PID
con el sampler WDDM existente a ~1 Hz: son picos muestreados, no garantías.

Los archivos nuevos contienen payload/hash, eventos SSE, usage, errores,
tiempos, cursor, admisión y evaluaciones. Conservan errores en el denominador,
separan TTFT p50/p95 de éxitos, tasas por stream y throughput HTTP agregado.
No se comparan como si fueran decode puro. No sobrescribe archivos/directorios.
No hay ganador hasta ejecutar ambos modelos y revisar las respuestas humanas.
