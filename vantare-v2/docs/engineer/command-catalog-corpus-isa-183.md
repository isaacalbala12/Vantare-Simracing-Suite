# ISA-183 / ENG-12 — catálogo de comandos y protocolo de corpus

Fecha: 2026-08-02. Contrato: `engineer.commands.v1`. Estado de voz:
**NO-GO**.

## Resultado

Este corte define qué puede solicitar un piloto a Engineer Beta y cómo deberá
medirse posteriormente con personas reales. No activa voz ni acciones:

- `internal/engineer/commands` es un catálogo propio, cerrado y versionado;
- cada intent declara tipo, precondiciones, respuesta, slots y confirmación;
- español, inglés, italiano y portugués brasileño tienen la misma superficie;
- el harness solo convierte texto explícito en un resultado de contrato;
- STT, PTT, micrófono, wake word, audio y Pit Manager productivo no participan;
- toda acción mutable queda marcada `requires_confirmation=true`;
- la evidencia sintética conserva `command_readiness=NO-GO`.

El catálogo previo aceptaba 14 prefijos ingleses centrados en boxes. No tenía
versión, slots, locales, precondiciones ni frontera query/action. Además,
`fuel to the end` se aceptaba como `fuel` por prefix matching. No había ningún
consumidor productivo fuera del paquete; ISA-183 reemplaza ese contrato antes
de que ENG-14/15 lo conecten.

## Clean-room

CrewChief y DRE solo se utilizan como inventario funcional: consultas de
estado, rivales, carrera y boxes. Las IDs, frases, traducciones, slots,
respuestas y estructura son propias de Vantare. No se han copiado gramáticas,
frases, código, audio, UI, nombres internos ni assets.

Fuentes internas de alcance:

- `docs/engineer/audits/g3-parity-audit.md`;
- `docs/vantare-program/handoffs/engineer-spotter.md`;
- `docs/engineer/engineer-beta-roadmap.md`;
- decisiones ENG-F12, ENG-F51 y ENG-37 del contrato de producto.

## Catálogo v1

### Consultas

| Intent | Slot | Precondición | Respuesta |
|---|---|---|---|
| `query.fuel` | — | `capability.fuel` | combustible restante |
| `query.virtual_energy` | — | `capability.virtual_energy` | energía virtual restante |
| `query.position` | — | `capability.position` | posición/clase demostrable |
| `query.lap` | — | `capability.lap` | vuelta actual |
| `query.gap` | `target: enum` | `capability.gaps` | gap a delante/detrás/líder de clase |
| `query.tyres` | — | `capability.tyres` | estado disponible de neumáticos |
| `query.damage` | — | `capability.damage` | daño demostrado |
| `query.race_time` | — | `capability.race_time` | tiempo restante |
| `query.rival.by_number` | `car_number: integer[0,999]` | `capability.grid_identity` | rival por dorsal |
| `query.rival.by_name` | `driver_name: text, sensitive` | `capability.grid_identity` | rival por nombre |
| `query.strategy` | — | `capability.strategy` | plan aceptado |
| `query.pit_status` | — | `capability.pit_status` | parada preparada |
| `query.car_status` | — | `capability.car_status` | resumen del coche |
| `query.penalties` | — | `capability.penalties` | sanción genérica demostrable |

Una capability ausente, `missing`, `stale`, `invalid` o `unsupported` impide
responder. El catálogo no autoriza inventar un valor ni decide cómo se obtiene.

### Acciones

| Intent | Slot | Precondición | Confirmación |
|---|---|---|---|
| `action.pit.request` | — | `capability.pit_actions` | obligatoria |
| `action.pit.abort` | — | `capability.pit_actions` | obligatoria |
| `action.pit.set_fuel` | `amount: decimal[0,200] litre` | `capability.pit_fuel` | obligatoria |
| `action.pit.change_tyres` | `compound: soft/medium/hard/wet` | `capability.pit_tyres` | obligatoria |
| `action.strategy.accept` | — | `capability.strategy_proposal` | obligatoria |
| `action.strategy.reject` | — | `capability.strategy_proposal` | obligatoria |

ISA-183 solo reconoce la intención. ENG-15 deberá abrir el diálogo; ENG-25/26
serán los únicos que podrán ejecutar, después de repetir la interpretación,
recibir confirmación y verificar el resultado. Una transcripción nunca llama
directamente a un puerto mutable.

## Locales, wake words y frases

Locales exactos: `es`, `en`, `it`, `pt-BR`. Cada intent tiene al menos una
frase propia en cada locale. El schema rechaza locales incompletos, IDs
duplicadas, placeholders desconocidos y frases que normalicen al mismo texto.

Wake words reservadas, todavía no operativas:

| Locale | Wake word |
|---|---|
| `es` | `Ingeniero` |
| `en` | `Engineer` |
| `it` | `Ingegnere` |
| `pt-BR` | `Engenheiro` |

`confirm/cancel` son términos de diálogo separados. Detectarlos no ejecuta una
acción; ENG-15 debe poseer una propuesta pendiente válida y acotada.

## Slots y fallo cerrado

- Las plantillas se comparan completas, nunca por prefijo.
- Un placeholder aparece exactamente una vez y debe corresponder a un slot.
- `integer` y `decimal` aplican rango antes de devolver un valor.
- El separador decimal local se normaliza internamente; la unidad forma parte
  de la frase y se conserva como unidad canónica, no como texto libre.
- `enum` traduce un alias local a un valor canónico cerrado.
- `text` admite como máximo 64 bytes y se marca sensible cuando puede contener
  un nombre.
- Input: máximo 512 bytes, UTF-8 válido, no vacío y sin caracteres de control.
- Unknown, ambiguous, locale inválido, número inválido o unidad incorrecta
  terminan sin intent ejecutable.

## Harness text-only

`NewTextHarness(DefaultCatalogV1())` valida y toma una copia privada del
catálogo. `Match(locale, text)` devuelve únicamente:

- intent canónico;
- `query` o `action`;
- slots canónicos en memoria;
- si requiere confirmación.

No abre archivos, dispositivos, red, procesos o micrófono. No infiere audio y
no es el router productivo de ENG-15. Sus fixtures prueban:

- las frases de los 20 intents en los cuatro locales;
- números enteros y decimales, coma/punto y unidades, rechazando signos,
  exponentes y separadores ajenos al locale;
- enums locales y nombres sensibles;
- unknown, ambigüedad, prefix regression y límites;
- separación de diálogo y acción.

`NewSanitizedResult` elimina transcripción y valores de slots. Solo acepta una
referencia opaca UUID v4 que no se deriva de texto o PII; intents y slots se
validan contra el catálogo cerrado. Publica únicamente locale, intent
esperado/real, outcome y nombres de slots canónicos. Siempre marca `synthetic=true` y
`command_readiness=NO-GO`. No es evidencia humana.

## Protocolo humano para ISA-184 / ENG-13

### Consentimiento y custodia

1. El participante recibe propósito, uso local, retención y derecho de borrado.
2. La captura exige consentimiento explícito y un alias no identificable.
3. `tools/engineer-voice-bench/consented_corpus.py` guarda WAV/manifest en una
   raíz seleccionada fuera de cualquier worktree Git.
4. No se guardan nombre real, cuenta, Steam ID, dispositivo, ruta original ni
   audio en Linear, Git, PR, logs o evidencia pública.
5. La retención predeterminada sigue siendo 24 horas; conservar una muestra
   exige acción explícita. Preview, delete y cleanup deben funcionar.
6. El participante puede retirar su corpus antes de publicar agregados.

### Matriz mínima propuesta

Estos mínimos se fijan antes de mirar resultados y pueden endurecerse en
ENG-13; no son un GO anticipado:

- al menos 12 participantes distintos por locale;
- mínimo 3 tipos de micrófono por locale;
- cada intent y variante con cobertura de varios participantes;
- `quiet`, audio real de LMU y habla/comunicación de fondo legítima;
- PTT positivo, PTT negativo, near-miss y habla fuera de catálogo;
- números dentro/fuera de rango, decimales y unidades equivocadas;
- nombres, dorsales y acentos variados sin publicar identidad;
- wake positiva, frase parecida, conversación larga y ocho horas agregadas de
  audio negativo por locale para estimar false accepts;
- split por participante: una misma voz nunca aparece en calibración y test.

Las categorías de diversidad no deben recopilar datos personales innecesarios.
Se registra cobertura técnica —voz, acento declarado opcional, micrófono y
condición— solo de manera agregada.

### Métricas separadas

| Métrica | Denominador | Resultado propuesto |
|---|---|---|
| Intent accuracy | positivos con intent | intent exacto correcto |
| Slot exact match | positivos con slots | todos los slots exactos |
| Action false accept | negativos/near-miss de acciones | acción aceptada incorrectamente |
| Command FRR | positivos | unknown/invalid/intent incorrecto |
| Wake FAR | horas negativas | activaciones falsas por hora |
| Wake FRR | wake positivas | wake no detectada |
| Latencia | comandos positivos | p50/p95 end-to-end por condición |

Resultados se publican por locale, intent y condición, además del agregado.
Una media buena no puede ocultar una celda peligrosa. Acciones y wake word
necesitan su propio gate; WER/CER genérico no los sustituye.

### Umbrales de evaluación propuestos

- intent accuracy: `>=97%` agregado y `>=95%` por locale/condición;
- slot exact match: `>=98%`, con cero números fuera de rango aceptados;
- action false accept: `0` en el corpus cerrado;
- command FRR: `<=5%` por locale/condición;
- wake FAR: `<=1` activación falsa por 8 horas y locale;
- wake FRR: `<=5%` por locale/condición;
- cualquier celda sin muestra suficiente: `INCONCLUSIVE`, no GO.

ENG-13 debe revisar si la muestra sostiene estadísticamente estos umbrales.
No se reducen después de ver resultados. FLEURS, audio sintético o las pruebas
de este corte no cuentan como participantes.

## Resultado sanitizado

La evidencia versionable puede contener únicamente agregados y casos
sanitizados con esta forma:

```json
{
  "schema_version": "engineer.commands.v1",
  "case_ref": "a01816de-6c66-4723-a99d-8d402b1b15cc",
  "locale": "es",
  "expected_intent": "query.fuel",
  "actual_intent": "query.fuel",
  "outcome": "matched",
  "slot_names": [],
  "synthetic": true,
  "command_readiness": "NO-GO"
}
```

La evidencia humana agregada de ENG-13 debe marcarse de forma distinta y solo
después de confirmar consentimiento, split y ausencia de PII. Raw transcript,
alias, nombre, audio, path, dispositivo y valores sensibles permanecen fuera.

## Gates que permanecen abiertos

- Whisper `base`: candidato condicionado, no release.
- Intent/slot accuracy humano: no medido.
- FAR/FRR de comandos: no medido.
- Wake word: no medido y NO-GO.
- PTT/micrófono: no implementado.
- TTS/Kokoro: sin cambios; dinámico continúa NO-GO.
- Pit Manager/Strategy: sin ejecución productiva.

ENG-13/20/21 quedan bloqueados por evidencia humana. ENG-14/15/16/17/18/19 y
ENG-22 pueden continuar conforme al DAG; este gate no detiene la ruta autónoma.

## Verificación

```powershell
go test ./internal/engineer/commands
go test ./internal/engineer/commands -count=20
go test ./internal/engineer/...
go test ./...
```

No existe validación manual de voz en ISA-183. Revisar el catálogo y ejecutar
el harness demuestra el contrato textual, no que una persona o STT lo entienda.
