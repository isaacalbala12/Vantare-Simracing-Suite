# T2 — Muestreo por pista y rival

[VAN-748](https://app.notion.com/p/3e3e51695c6581569e14cee997a5f181) / #1326.
Base nightly `e6d7d2b5`; dependencia explícita T1 `69e729de` / PR1324,
sin integrar. CrewChief `4c3865e09a347d4c806c0bc0cd66aae335fbc610`, defaults.
Diseño y A1–A9 ya aprobados. Isaac aplaza pruebas reales y pide desarrollo.

## Contraste previo y alcance

GPT-6 Sol verifica Timings.cs:582–641,1423–1447 y TrackData.cs:1351–1417.
Una oportunidad por tick cruzado aunque atraviese varios puntos; gapPoints
prevalece sobre sectores. Dos sectores genera mitad redondeada al par y L−50;
otras pistas >3300 m generan 780 m mientras candidato<L−780 y añaden L−50.
Hardparts declarados desplazan el candidato al extremo inclusivo y cambian el
origen del siguiente intervalo. No aprender hardparts ni inventar catálogo live.

Tres ventanas independientes: carrera delante/detrás y pista detrás automática.
La admisión compara segundos absolutos exactos con la última muestra del mismo
rival. A2 limpia al cambiar rival antes de deduplicar. A1 ofrece la muestra
actual admitida en las tres ventanas; la clasificación pertenece a T3.

## Frontera y pruebas previstas

ObservationV1 + TrackEvidence T1 + perfil inmutable + Relations T1 → Sampler
opt-in, sin I/O ni audio. API pública para pruebas de cruce y ventanas.

1. RED/GREEN de perfiles: 3300/3301, dos sectores, redondeo al par, hardparts y
   geometría inválida. Esperados literales desde fuente/TIM-SAMPLE.
2. RED/GREEN de primera observación, cruce exacto/múltiple, repetición, meta,
   retroceso, salto de vuelta, intervalo largo, sector fallback y precedencia.
3. RED/GREEN de historial por rival/relación, duplicados, calidad desconocida,
   contexto/tiempo/geometría y copias independientes de la salida.
4. Contraste posterior Sol, revisión Go Luna, checks y PR draft a nightly.

Adaptaciones conservadoras declaradas: ventana de cuatro muestras (máximo
consumido por T3, fuente almacena más), perfil inválido rechaza en vez de ordenar
puntos ambiguos, intervalo >2 s o movimiento discontinuo pierde la referencia,
cambio de vuelta relativa del rival reinicia historia. No son defaults CC ni
paridad LMU demostrada. Sólo sector observado 1..N; transición ambigua reinicia.
Oportunidad geométrica y gap admitido son distintos: T1 puede dejar gap unknown.
No adelantar cadencia, clasificación ni integración audible T3/T4.

## Contraste posterior y contrato de uso

Fuente fija, comparación estática y replay sintético Go; no se ejecutó CrewChief
ni un simulador. Sol revisó la semántica; Luna revisó la API y Go. Sin P1/P2
restantes en el corte revisado. Se añadieron pruebas públicas de reacquisición
y cambio/ausencia en ambos historiales traseros. La objeción de reconstruir el
cruce 4900→30 se descartó al comprobar la fuente: requiere distancia creciente,
así que tampoco reconstruye el punto L−50 omitido durante ese salto de meta.

- `SamplingProfileSpec` recibe nombre/layout/versión, longitud, sectores y
  hardparts explícitos. Nil hardparts conserva setGapPoints; una lista no nil
  invoca la semántica de adjustGapPoints sobre pistas >3300 m, incluso vacía.
  No existe productor de catálogo certificado; el número de sectores sigue
  siendo evidencia declarada por el caller, no inferida ni autenticada por T1.
- `Sampler.Observe` consume ObservationV1 y Relations de T1 del mismo contexto
  y SourceTime, más TrackEvidence ligado a esa observación y perfil coincidente.
  Es secuencial, sin concurrencia interna, goroutines, I/O ni registro global.
- Primer snapshot/boundary/perfil nuevo sólo fija referencia. GapPoints ignora
  sector; fallback exige sector observado y transición consecutiva coherente
  con vuelta. No se fabrica un IsNewSector cuando el dato falta.
- Intervalo >2 s, vuelta incompatible, retroceso o avance >=media vuelta borra
  ventanas y usa la posición actual válida como nueva referencia. Dato inválido
  pierde también esa referencia. Contexto/tiempo antiguo se rechaza sin bajar
  la marca de tiempo; un snapshot posterior válido recupera desde baseline.
- Antes de cada oportunidad se descarta historial de rival ausente, unknown,
  gap no finito, frontera desajustada, ID no único o cambio de vueltas relativas.
  Cambiar rival con gap igual admite una muestra nueva al siguiente cruce; un
  gap duplicado del mismo rival conserva la oportunidad y no añade muestra.
- La ventana contiene las cuatro últimas magnitudes admitidas, newest-first,
  con contexto, ID, vueltas y hora de observación. Devuelve copias independientes.
  A1 expone la actual también detrás; no afirma haber implementado T3. A2 no
  mezcla identidad. Zero conocido se conserva; no implica mensaje audible.

## Cobertura y validación

TIM-SAMPLE-001–012 tiene equivalentes públicos literales en perfiles/cruces.
Se cubren además umbral estricto, redondeo par, ajuste vacío en dos sectores,
perfil inválido, saltos, duplicados, tres ventanas, límite de cuatro muestras,
calidad/contexto/geometry, recuperación, copias y proyector real → T1 → T2.
No se inyectan mapas privados ni se generan expected desde el producto.

RED de API ausente para perfiles y muestreo, seguido de implementación GREEN.
Race/vet de timings + proyector PASS, 44 pruebas de roadmap PASS y ratchet
anti-slop PASS sin política/baseline modificados. El resultado global macOS y
CI del commit publicado se registran en VAN-748/PR; no se confunden con pruebas
LMU reales. Sin cambios de frontend; las pruebas/build del pipeline CI cubren
la convivencia del conjunto. Windows/LMU/audio manual permanecen NOT_RUN por
indicación de Isaac. T3 es la siguiente unidad de desarrollo.

Resultado global con TMPDIR=/private/tmp y timeout de 60 s: 119 paquetes pasan;
fallan cmd/vantare (símbolos exclusivos de Windows), launcher (ejecución Windows
no disponible/timeouts), server (ruta absoluta Windows) y recording/sqlite
(permisos/rutas macOS). Son los mismos cuatro paquetes observados en T1.
El primer intento con TMPDIR del host también falló en diagnostics por la ruta
/var → /private/var; ambos tests pasan al usar /private/tmp. Se interrumpió el
launcher bloqueado de ese primer intento conservando stack; no es un PASS.
