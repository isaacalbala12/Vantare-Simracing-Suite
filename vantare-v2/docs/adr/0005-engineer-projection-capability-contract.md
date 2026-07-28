# ADR 0005: contrato de capabilities y límites de Engineer

## Estado

Aceptado para implementación en ENG-02. No autoriza wiring productivo ni
promoción a `nightly`.

## Fecha

2026-07-28

## Contexto

ENG-01 demostró que Engineer todavía consume un `Frame` propio que confunde
ausencia con valores cero, no expresa freshness ni capabilities y puede arrancar
con una fuente sintética presentada como conectada. ADR 0004 exige que los
productos consuman proyecciones de Telemetry Core y no lean drivers concretos.

TC-05A se desarrolla en paralelo y es la autoridad transversal para envelopes,
versionado, ownership, fan-out y puertos de proyección. ENG-02 no puede crear un
segundo contrato competidor. Su responsabilidad es únicamente fijar la
semántica específica que Engineer necesita para decidir si una señal se puede
usar y cuándo debe cancelar trabajo pendiente.

## Decisión

### Ubicación y frontera

El contrato vive en `internal/telemetry/projection/engineer`. No conoce LMU,
Shared Memory, REST, Wails, SSE, UI, audio, storage, scheduler ni monitores.

La API que consumirá Engineer expone únicamente tipos propios del paquete:
`Manifest`, `Capability`, `Field`, `Provenance`, `Context` y `Boundary`.
`schema.Field` se usa solo como detalle interno del futuro adaptador productor;
los consumidores de producto no necesitan importar schema ni envelope.

ENG-03 adaptará el header y el payload transversal que resulte de TC-05A a este
contrato. La integración será explícita y no se copiará código de la rama
paralela.

### Capability manifest

Cada capability tiene un ID estable y uno de cuatro estados:

- `Unknown`: no existe evidencia suficiente o el ID no está declarado;
- `Supported`: la ruta canónica está demostrada;
- `Unsupported`: existe evidencia de que la fuente no ofrece la capacidad;
- `Degraded`: existe una ruta parcial que exige una decisión expresa.

El estado cero es `Unknown`. IDs vacíos, estados desconocidos o duplicados
invalidan el manifiesto. El manifiesto posee su slice y devuelve copias.

ENG-02 no versiona el manifiesto por separado. El versionado del payload y su
compatibilidad pertenecen al contrato transversal de TC-05A. Si en el futuro
aparece evidencia de que el catálogo necesita un ciclo independiente, se
decidirá con un consumidor y una migración reales.

### Campos

`Field[T]` distingue:

- `Missing`;
- `Fresh`;
- `Stale`;
- `Invalid`;
- `Unsupported`.

Un cero fresh conserva presencia. `Unsupported` no contiene valor. Un campo
fresh solo es `Usable` cuando su capability es `Supported`; `Degraded` exige
una política explícita de la regla. `Unknown` puede acompañar ausencia, pero
nunca un valor presente. La procedencia observable por Engineer se expresa con
un enum local equivalente a observed, derived y estimated.

### Snapshots, epoch e identidad

Los snapshots de producto son latest-wins. Un consumidor puede observar un
salto entre snapshots sin que exista pérdida de estado, por lo que ENG-02 no
valida ni exige secuencias contiguas. La semántica estricta de secuencia y
resync pertenece al stream de hechos transversal, no a esta vista.

`Context` conserva solo el epoch y la identidad necesarios para cancelar
decisiones. `ClassifyBoundary` aplica estas reglas:

- epoch cero o regresivo es inválido;
- dentro del mismo epoch, evento, sesión y vehículo deben permanecer estables;
- un cambio de equipo o piloto cancela trabajo pendiente aunque el epoch no
  cambie;
- cualquier epoch superior representa un snapshot completo nuevo, incluso si
  se omitieron snapshots intermedios;
- cambios de evento, sesión, vehículo, equipo o piloto se clasifican
  explícitamente;
- un epoch superior sin cambio de identidad es un reset genérico.

Todo límite salvo `Continuous` cancela decisiones, cooldowns y confirmaciones
ligadas al contexto anterior.

### Ownership y mensajes

ENG-02 garantiza ownership defensivo únicamente para su manifiesto. El
ownership del payload y del header lo garantizará TC-05A; duplicarlo aquí sería
otra copia y otra fuente de verdad.

El envelope de mensajes de radio no forma parte de esta issue. ENG-05 lo fijará
junto con policy y scheduler, cuando existan tests de TTL, revalidación, dedupe
y preempción.

## Alternativas descartadas

### Ampliar `internal/engineer/telemetry.Frame`

Mantendría una segunda fuente de verdad y obligaría a reinterpretar presencia,
calidad y tiempo en cada monitor.

### Añadir `Supported bool`

No distingue desconocido, no soportado y degradado, ni impide combinar una
capability ausente con un valor aparentemente válido.

### Crear envelope o versionado propios de Engineer

Competiría con TC-05A y duplicaría epoch, identidad, clocks, ownership y
compatibilidad.

### Validar gaps de snapshots

Confundiría snapshots latest-wins con hechos ordenados y produciría falsos
resyncs bajo carga.

### Definir todas las señales de beta

Varias señales aún no tienen semántica, unidad o fuente demostrada. ENG-03 solo
añadirá las que pueda proyectar desde contratos canónicos existentes.

## Consecuencias

- ENG-03 puede añadir payload y projector sin acoplar Engineer a schema.
- La integración con TC-05A queda deliberadamente pendiente y explícita.
- Los monitores deberán declarar su comportamiento ante cada capability y
  estado.
- El frame legacy y sus readers permanecen durante characterization.
- Mensajes, scheduler, audio, voz, Pit y UI siguen fuera de este corte.

## Validación

- table tests de cero, missing, stale, invalid y unsupported;
- rechazo de valores con capability unknown/unsupported;
- ownership defensivo del manifiesto;
- snapshots latest-wins sin falsos errores por gaps;
- epoch e identidad como límites de cancelación;
- API de consumidor sin imports de schema/envelope;
- inventario reproducible de consumidores legacy;
- suites focal/global, race aplicable y review independiente.
