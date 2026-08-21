# Rework del Ingeniero — Radio bus + motor de familias sobre el canónico

Fecha: 2026-08-21. Estado: dirección aprobada por Isaac (sesión de ideación).
Base: `origin/nightly@7735f098` con la telemetría Go-first ya integrada.

## Problema

¿Cómo convertimos el Ingeniero en algo **mejorable, expandible y fácilmente
mantenible** — informado por el feature set de CrewChief — sin arrastrar el
stack ENG actual, donde añadir una familia cuesta un paquete Go + contrato de
paridad + review (21 monitores escritos, solo 6 vivos, visual-only)?

## Dirección recomendada

Cuatro piezas, de fuera hacia dentro. Simpleza antes que complejidad.

1. **Catálogo CrewChief-informed (el QUÉ, primero).** Documento de producto
   derivado del inventario CC (`docs/engineer/audits/g3-parity-audit.md`):
   familias objetivo, textos propios en 4 idiomas (clean-room), interrumpe vs
   consulta, prioridad, y si la señal LMU existe ya en el canónico. El catálogo
   cerrado es la spec del motor **y** la entrada del precacheo de voz.
2. **Radio bus (plataforma).** Contrato pequeño versionado
   `RadioMessage{fuente, intent, prioridad, TTL, locale, payload}` →
   scheduler con preempción Spotter → salida dual (audio precacheado + evento
   UI/widget). Se **extrae** de lo ya revisado (`internal/engineer/delivery`,
   `presentation`, scheduler de `messagepolicy`), sin el ceremonial de paridad.
   Engineer es el primer productor; Strategy será el segundo sin tocar el bus.
3. **Motor de familias.** Interfaz única mínima:
   `evaluar(snapshot canónico, estado pequeño) → mensajes`, familias
   registradas en tabla con cooldown/prioridad como datos. Familias simples
   ≈50 líneas. Spotter sigue siendo módulo especial de geometría y se
   **unifica** la doble geometría actual (`internal/engineer/spotter` +
   `builder_spotter` v2) en una sola autoridad.
4. **Voz.** Precacheo batch en build-time con **TTS local: Kokoro** (decisión
   Isaac 2026-08-21: no se paga nube, al menos de momento). Catálogo × 4
   locales × números → caché cache-only ya productiva. El audio generado se
   archiva como **asset versionado** y el pipeline queda pineado
   (modelo/voces) para regeneración idéntica. Los NO-GO de ENG-09 no aplican
   al batch (eran de runtime dinámico empaquetado). Para la voz dinámica
   futura (p. ej. nombres de pilotos), la vía de trabajo es **espeak-ng como
   proceso separado** (postura de mera agregación GPL, pendiente de
   validación legal antes de release). Gate que queda: escucha perceptual de
   Isaac en es/en/it/pt-BR con números correctos. Clips de spotter en WAV/PCM
   (sin decode en carril crítico). OneCore Windows como suelo de emergencia.

**Pipeline (una sola telemetría, cero dobles lecturas):**

```
LMU (driver único) → TelemetryEngine.Apply (canónico)
  → builders Overlay v2 → widgets Studio (incl. widget radio, beta)
  → puerto async Engineer (F7) → motor de familias → radio bus → audio + UI
```

Coste marginal estimado: evaluación de familias <100 µs/frame; bus→audio
~65 µs (benchmark ENG-06); Ingeniero completo ~1-2 % de un core. Entrada de
voz experimental aparte: wake ~1 % core en proceso hijo, STT ~0,6 s/frase
fuera del hot path.

## Asunciones a validar

- [ ] `delivery`/`presentation` se extraen limpios sin arrastrar
      `messagepolicy` entero — spike de lectura antes de decidir extraer vs
      reescribir.
- [ ] Kokoro local pasa la escucha perceptual de Isaac en es/en/it/pt-BR con
      números correctos; el audio se archiva como asset versionado y el
      pipeline queda pineado para regenerar idéntico.
- [ ] El carril rápido del spotter cabe en p95 <150 ms decisión→audio en el
      binario Wails real sin romper el aislamiento de consumidores — benchmark
      al principio, no al final.
- [ ] La tabla de familias no degenera en 21 paquetes otra vez — regla dura:
      familia que necesita más de ~1 archivo, o es spotter o está mal diseñada.
- [ ] Wake word experimental con detector Apache 2.0 entrenado con voz
      sintética funciona tras flag sin tocar el gate humano de release.

## Alcance septiembre (beta para testers)

- Radio bus mergeado a nightly/testers.
- Spotter audible en carrera (benchmark p95 pasado, sesión LMU real validada).
- Un puñado de familias migradas al motor nuevo (crecimiento gradual; es
  aceptable decir temporalmente menos que las 6 actuales).
- Precacheo Kokoro funcionando (catálogo cerrado → audio regenerable).
- Widgets del Ingeniero en overlays en fase beta (cuando el rework del
  lenguaje de overlays lo permita).
- Wake word **experimental tras flag** en nightly: mic en proceso hijo,
  memoria-only, wake sintético + whisper condicionado. PTT (ENG-14) como
  plan B. La activación en beta pública sigue bloqueada por FAR/FRR humano.

## No haremos (y por qué)

- **STT productivo / wake word en release** — gate humano ENG-13 sigue NO-GO;
  en nightly solo carril experimental tras flag.
- **TTS dinámico en runtime** — el catálogo cerrado + precacheo lo hace
  innecesario; era la fuente de los NO-GO de latencia/licencia.
- **Paridad CrewChief completa en septiembre** — la expansión de familias es
  un tren de cortes pequeños posterior, ordenado por el catálogo.
- **Conservar el stack ENG viejo por compatibilidad** — permiso de ruptura
  concedido si el diseño nuevo es claramente mejor; lo no usado se retira
  (queda en git).
- **El "cómo se ve" in-game ahora** — pausado hasta que avance el rework del
  lenguaje de overlays; el bus emite eventos y el widget llega en beta.

## Gates por cerrar

| Gate | Tipo | Bloquea |
|---|---|---|
| Escucha perceptual Kokoro local (Isaac) | humano | precacheo de voz |
| Enfoque wake word (motor/licencia/entrenamiento sintético) | técnico | wake experimental en nightly |
| FAR/FRR wake word humano (ENG-13) | humano | wake en beta pública |
| Benchmark spotter p95 <150 ms en Wails real | técnico | spotter audible |
| Sesión LMU real del Engineer post-rework telemetría (pendiente desde F7) | validación | declarar pipeline fiable |
| Gate mismatches v2 de widgets (5×20 min) | validación | widgets Ingeniero beta |
| CI protegido + aprobación Isaac por corte | proceso | promoción testers |

## Preguntas abiertas

- Orden exacto de las primeras familias en el motor nuevo (banderas primero,
  por señal disponible y coste bajo, salvo decisión en el spec).
- Dónde vive la frontera producto/Core para umbrales tipo "fuel bajo"
  (regla del motor, no derivación del Core — a confirmar en el spec SDD).
- Numeración GitHub de los cortes (Linear retirado; ENG-16..29 sin issues).

## Siguiente paso

Spec SDD del rework (contratos del bus, interfaz de familia, carril rápido
spotter, pipeline de precacheo, carril experimental de voz) + creación de
issues GitHub + primeros cortes para workers.
