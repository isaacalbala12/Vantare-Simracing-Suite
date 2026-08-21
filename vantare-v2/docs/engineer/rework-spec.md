# Spec — Rework del Ingeniero: radio bus + motor de familias (borrador)

Fecha: 2026-08-21. Estado: **aprobado por Isaac (2026-08-21)**; issues GitHub
en creación. Ideación previa:
`docs/ideas/rework-ingeniero.md`. Base: `origin/nightly@7735f098` con la
telemetría Go-first integrada.

## 1. Objetivo

Reconstruir el Ingeniero sobre la telemetría canónica como algo **mejorable,
expandible y fácilmente mantenible**, informado por el feature set de
CrewChief (clean-room). El resultado de septiembre es una base técnica simple
y unificada mergeada a nightly/testers: radio bus operativo, spotter audible,
familias creciendo gradualmente y voz precacheada — no paridad completa.

## 2. Decisiones de producto fijadas (Isaac, 2026-08-21)

- **D1** — El Ingeniero es producto aparte (página Orbit + servicio), con
  **una sola telemetría** compartida con el Studio. Cada vez que habla, sale
  un widget de radio en el overlay (fase beta para septiembre).
- **D2** — Éxito de septiembre: **base técnica simple y unificada** para
  testers en formato beta; no se exige feature nueva visible más allá de eso.
- **D3** — Permiso de ruptura sobre el stack ENG viejo si el diseño nuevo es
  claramente mejor. El stack anterior es indiferente; queda en git.
- **D4** — Crecimiento gradual de familias: es aceptable que el motor nuevo
  diga temporalmente menos que las 6 familias actuales.
- **D5** — La voz es importantísima: se confirma el TTS y se **precachean
  las frases** con él. TTS **local (Kokoro)**; no se paga nube de momento.
- **D6** — Para voz dinámica futura, la vía de trabajo es **espeak-ng como
  proceso separado** (mera agregación GPL); requiere validación legal antes
  de release. No bloquea nada de este corte.
- **D7** — **Wake word experimental en nightly para septiembre**, tras flag,
  para poder probarlo. Su activación en beta pública sigue bloqueada por el
  gate humano FAR/FRR (ENG-13). PTT (ENG-14) es el plan B.
- **D8** — La radio es **plataforma**: Strategy será el segundo productor.
  El bus debe estar mergeado para testers en nightly en septiembre.
- **D9** — Hasta que avance el rework del lenguaje de overlays, el foco es
  **el QUÉ dice el ingeniero**, no el cómo se ve in-game.
- **D10** — El catálogo se diseña informado por CrewChief
  (`docs/engineer/audits/g3-parity-audit.md`), clean-room: comportamiento
  como referencia, textos y código propios.
- **D11** — «Simpleza mejor que complejidad» es criterio de diseño con regla
  dura: una familia que necesita más de ~1 archivo, o es spotter o está mal
  diseñada.

## 3. Asunciones explícitas (a validar en la Fase 0)

- **A1 (RESUELTA, spike 2026-08-21)** — Veredicto: **reescribir el bus lean**.
  `messagepolicy` es ~58-60 % ceremonial de paridad acoplado a
  `projection/engineer` (extraerlo costaría ~3-4× el rework); su lógica
  genérica de cola (~480 líneas: orden total, preempción, dedup/coalescing,
  cooldown, presión) se copia a un `internal/radio` nuevo de ~280 líneas.
  **Se reutilizan tal cual:** `delivery/contract.go` (260 líneas, cirugía de
  1 import: `Decision` → `RadioMessage`), `audio/queue+config+router
  cache-only+player` (~560 líneas, autónomos). `presentation` se rehace como
  resolver **registrable** (~150 líneas): el actual es cerrado por
  construcción (20 intents hardcodeados en `definitions()`/`catalogs()`, 3
  sitios a editar por intent nuevo). Esfuerzo estimado del bus: 3-5 días vs
  2-3 semanas extrayendo.
- **A2** — Kokoro local pasa la escucha perceptual de Isaac en es/en/it/pt-BR
  con números correctos; pipeline pineado y audio como asset versionado.
- **A3** — El carril rápido del spotter consigue p95 <150 ms decisión→inicio
  de audio en el binario Wails real sin romper el aislamiento de consumidores
  de la telemetría (puerto async F7). Benchmark al principio, no al final.
- **A4** — Un detector de wake word con licencia permisiva (p. ej.
  openWakeWord, Apache 2.0) entrenado con voz sintética funciona de forma
  demostrable tras flag, sin tocar el gate humano de release.
- **A5** — Las señales de las primeras familias del catálogo existen ya en la
  observación canónica (las que no, p. ej. daños, se etiquetan y esperan a
  que el dominio suba a Telemetry Core).

## 4. Arquitectura objetivo

```
LMU (driver único) → TelemetryEngine.Apply (canónico)
  → builders Overlay v2 → widgets Studio (incl. widget radio, beta)
  → puerto async Engineer (F7) → motor de familias → RADIO BUS
                                                     ├→ audio precacheado
                                                     └→ evento UI/overlay
Entrada experimental (flag): mic (proceso hijo) → wake sintético / PTT
  → whisper condicionado → router de diálogo determinista (ya existe)
```

### 4.1 Radio bus

Contrato pequeño y versionado (`radio.v1`):

```go
type RadioMessage struct {
    Source   string        // "engineer" | "strategy" | ...
    Intent   string        // clave de catálogo, p. ej. "spotter.car_left"
    Priority Priority      // P0 spotter > ... (orden total)
    TTL      time.Duration // caducidad de relevancia
    Locale   Locale        // es | en | it | pt-BR
    Payload  map[string]string // valores acotados (números, gaps)
}
```

Implementación (según spike A1): paquete nuevo `internal/radio`
(~280 líneas: `message.go`, `bus.go`, `policy.go`) que copia la lógica
genérica probada del scheduler viejo (dedupKey, coalescing, cooldown,
orden total, burst anti-starvation, presión de cola) sin `Evidence/
SemanticClaim/Manifest/capabilities`; `delivery` reutilizado con cirugía de
1 import como transporte; `audio` (queue/config/router cache-only/player)
reutilizado tal cual; resolver de presentación nuevo **registrable**
(`Register(intent, definición, frases×4)`) para que Strategy y las familias
nuevas añadan intents sin tocar el resolver.

**Caveat de seguridad:** la política Spotter vieja (`spotter_policy.go`,
supersession left/right→three_wide, clears delivery-aware, expiración de
contexto) NO es ceremonial — codifica semántica ganada en 4 re-reviews de
ENG-05/06. El módulo spotter nuevo debe conservar esos comportamientos con
regresiones equivalentes antes de retirar el viejo.

Semántica que el bus garantiza (heredada de lo ya demostrado en ENG-05/06):
orden total estable, preempción P0 (spotter corta audio no crítico, nunca al
revés), cooldown/coalescing por intent, TTL (nunca se emite caducado), ACK
`queued/started/terminal`, degradación a visual si el audio falla o no está
cacheado. Salida dual siempre: evento UI + audio opcional.

### 4.2 Motor de familias

Interfaz única: `Evaluate(snapshot, state) → []RadioMessage`. Familias
registradas en una tabla con prioridad/cooldown/TTL como **datos**, no
código. Familias simples ≈50 líneas. El spotter es el único módulo especial
(geometría), y **unifica** las dos geometrías actuales
(`internal/engineer/spotter` + `builder_spotter` del frame v2) en una sola
autoridad que sirve a mensajes y a frame.

### 4.3 Carril rápido del spotter

El presupuesto de 150 ms se reparte: frame→decisión (≤ pocos ms), bus→start
(~65 µs medidos en ENG-06), arranque de player WASAPI (10-50 ms). Clips de
spotter en WAV/PCM para evitar decode en el carril. El benchmark end-to-end
en Wails real es entregable de la Fase 1, no del final.

### 4.4 Voz (precacheo)

Generador batch build-time: catálogo × 4 locales × clips de números →
`tts.Cache` (cache-only ya productivo). Kokoro local, modelo y voces
pineados; el audio generado se archiva como asset versionado. Sin TTS en
runtime ni en el hot path.

### 4.5 Entrada de voz experimental (flag)

Proceso hijo propietario del micrófono (memoria-only, cero grabación), wake
word sintético + whisper.cpp condicionado, conectado al router de diálogo
determinista ya existente (`engineer.dialogue.v1`) y a PTT (ENG-14). Todo
tras flag de nightly; su inmadurez no puede contaminar el carril de producto
(spotter/radio nunca esperan a la voz de entrada).

## 5. Catálogo (el QUÉ)

Documento de producto previo al motor: familias objetivo derivadas del
inventario CC de la auditoría G3, con por cada mensaje: texto en 4 idiomas,
interrumpe vs consulta, prioridad, TTL, señal canónica necesaria y su
disponibilidad hoy (A5). El catálogo cerrado es la spec del motor **y** la
entrada del precacheo: cambiar catálogo ⇒ regenerar audio, nunca al revés.

## 6. Qué se conserva, qué se retira

- **Se reutiliza tal cual:** `delivery` (transporte ACK/preempción, 1 import
  cambiado), `audio/queue+config+router cache-only+player`, geometría
  spotter (unificada), router de diálogo y PTT (carril experimental), puerto
  async F7. Los **textos** 4 idiomas del catálogo actual migran al resolver
  registrable nuevo.
- **Se reescribe lean:** scheduler (→ `internal/radio`, copiando su lógica
  genérica), resolver de presentación (→ registrable), semántica Spotter
  (→ módulo spotter nuevo, conservando supersession/clears con regresiones).
- **Se retira cuando el sustituto lo cubra:** `core/runtime` (1.126 líneas,
  los 21 adaptadores de monitores), `projectioninput`/paridad (587),
  `messagepolicy` viejo (1.509), `replayoracle` (565), `commands` legacy si
  el router de diálogo no lo necesita, simulator, voice-host test-only,
  `internal/tts` síntesis en runtime. Con D3, sin convivencia obligatoria.

## 7. Boundaries

- Telemetry Core no adquiere lógica de producto: umbrales tipo «fuel bajo»
  viven en las familias del motor, no en `derive/`.
- El bus no conoce familias ni telemetría: solo `RadioMessage`.
- Strategy produce al bus por el mismo contrato, sin API privada.
- Nada de STT/wake en el carril de producto; solo tras flag experimental.
- El «cómo se ve» in-game pertenece al rework del lenguaje de overlays (D9);
  aquí solo se emiten eventos consumibles por el widget.

## 8. Criterios de éxito (septiembre, beta testers)

1. Radio bus `radio.v1` mergeado a nightly y promovido a testers.
2. Spotter audible en carrera real: benchmark p95 <150 ms PASS y sesión LMU
   real validada (gate pendiente desde F7).
3. ≥3 familias en el motor nuevo (spotter + 2), creciendo por cortes.
4. Precacheo Kokoro operativo: catálogo→audio regenerable y versionado;
   escucha perceptual de Isaac aprobada (A2).
5. Wake word experimental demostrable tras flag en nightly (A4) con PTT como
   alternativa; sin promoción de voz de entrada a beta pública.
6. Widget de radio en overlay en fase beta cuando el lenguaje de overlays lo
   permita (D9); mientras, evento UI consumible.
7. El stack retirado no deja imports rotos ni tests muertos; `go test ./...`
   y gates de CI verdes en cada corte.

## 9. Fuera de alcance del corte

- Paridad CrewChief completa; conditions/lluvia (LMU no expone señal).
- STT productivo, wake word en release, Pit Manager transaccional.
- TTS dinámico en runtime; nombres de pilotos hablados.
- Migración visual de los widgets (pertenece al rework de overlays).

## 10. Fases previstas (detalle en la fase PLAN)

- **F0** — Spike extraer-vs-reescribir (en curso) + catálogo v1 + creación de
  issues GitHub.
- **F1** — Radio bus `radio.v1` + benchmark de carril rápido en Wails real.
- **F2** — Pipeline de precacheo Kokoro + escucha perceptual (gate A2).
- **F3** — Spotter unificado sobre el bus + validación LMU real.
- **F4** — Primeras familias del motor (orden según catálogo/A5) + retirada
  del stack viejo cubierto.
- **F5** — Carril experimental de voz de entrada (wake sintético + whisper +
  PTT) tras flag.
- **F6** — Widget radio beta + promoción a testers.

## 11. Política de ejecución

- Isaac aprueba spec y cada promoción; flujo rama de issue → review →
  nightly → testers.
- Orquestación: Claude planifica/orquesta/revisa; implementación en workers
  (muse-spark vía T3 Code para lo grueso; reviews gpt-5.6-sol high).
- Cada corte declara alcance/evidencia; regresiones antes de cambiar
  comportamiento; sin promoción automática.

## 12. Preguntas abiertas

- Orden exacto de las familias post-spotter (propuesta: banderas y fuel
  primero, por señal disponible y valor en carrera).
- Numeración GitHub de los cortes (Linear retirado).
- Voz/es concretas de Kokoro por locale (se decide en la escucha A2).

## 13. Siguientes pasos

1. Revisión y aprobación de Isaac de este spec.
2. Crear issues GitHub de F0..F6 y arrancar F1 (bus `internal/radio`) con
   worker.
3. Catálogo v1 en paralelo (entrada del precacheo Kokoro).
