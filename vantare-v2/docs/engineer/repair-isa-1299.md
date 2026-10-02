# Reparación inicial del ingeniero — VAN-736 / GitHub #1299

Estado: candidato reparado y revisado el 22 de septiembre de 2026; sin integrar.
Tarea: https://app.notion.com/p/3e3e51695c6581ed8370e2a4b5302ae6
Base: origin/nightly@1e9932c4d8ca3d53a58d093449cfb840f7108e8f.
Diseño general aceptado: PR #1295, SHA 1cd770e1e55427283909be64ba18787becce497b.
Este corte repara el runtime existente; no sustituye ni cierra T0–T8.

## Ciclo obligatorio, repetido por cada corte

1. **Plan y comprobación previa con CrewChief.** Fijar revisión y ajustes,
   leer condiciones de emisión/silencio/cancelación y convertirlas en casos
   observables antes de editar Vantare. Registrar las diferencias y los datos
   ausentes. Una prueba de caracterización del código antiguo no es el oráculo.
2. **Desarrollo.** Ejecutar primero regresiones rojas, hacer el cambio mínimo
   en el camino productivo y conservar controles positivos y rollback.
3. **Confirmación posterior con CrewChief.** Volver a la misma fuente y
   comparar el resultado de cada escenario, incluidas fronteras y silencios.
   Documentar diferencias pendientes; no inferir paridad total ni audio real
   de tests verdes. Actualizar evidencia, handoff y Notion.

Se compara CrewChief con **ajustes predeterminados**, decisión expresa de Isaac.
La referencia del diseño es `4c3865e09a347d4c806c0bc0cd66aae335fbc610`.
No se copian código, textos de voz ni assets de CrewChief.

## Comprobación previa y alcance

| Caso | Referencia primaria fijada | Reparación |
| --- | --- | --- |
| Timings en práctica/clasificación | Timings.cs, triggerInternal, 456–462: exige Race | Exigir tipo de carrera usable en la ruta activa. |
| Timings en boxes o pit desconocido | Timings.cs, isNotRacing, 364–371; Vantare conserva fail-closed | Silencio y ResetIntents al perder autorización, cancelando también el aviso pendiente antes de started. |
| Cancelación en el último instante antes de started | Contrato de revocación Vantare: conservar los silencios del corte hasta el inicio | Serializar el ACK final con la actualización de contexto mediante el mutex existente. Una entrega cancelada no publica aviso, avanza el cursor ni consume cooldown. |
| Formato final desconocido o perdido | Contrato Vantare fail-closed; LMU format.go invalida EndTime cuando el reloj lo supera | Exigir EndTime usable no negativo. Missing/stale/invalid cancelan el aviso; no reabrirlo tras agotarse el reloj. EndTime=0 observado conserva el caso sin tiempo fijo. |
| Timings cerca del final | Timings.cs, isNearRaceEnd, 267–289; RF2GameStateMapper.cs, 679–686 y 815–820 | Reconocer carrera cronometrada con EndTime usable positivo, incluso con MaxLaps positivo; callar con Remaining usable entre 0 incluido y 120 excluido. Sin tiempo restante fiable, fallar cerrado. |
| Parar por combustible con autonomía suficiente | Fuel.cs, 790–877: estimación entera, límites de vueltas restantes y armamento a una vuelta; 610–625: emisión posterior | Retirar la generación indiscriminada pit_now por debajo de cuatro vueltas. Conservar litros, autonomía y catálogo; la orden correcta queda pendiente hasta demostrar necesidad, armamento y punto de aviso. |
| Aviso aún válido | Los mismos caminos de referencia | Mantener pruebas positivas de carrera/fuel para evitar arreglar el fallo dejando el ingeniero siempre mudo. |

La ruta de producto es `internal/families` → `internal/radio` desde
`internal/engineer/service`; los monitores legacy no son el camino por defecto.
La cadencia completa por sectores, rivales, clasificación y frases pertenece
al T0–T8 aprobado, igual que el oráculo independiente integral.

La retirada de la orden automática Fuel es una reparación conservadora, no
paridad Fuel completa. CrewChief usa vueltas restantes del líder y estima las
de una sesión cronometrada. Además, arma la orden a una vuelta de combustible
y la pronuncia cerca de boxes según sector/tipo de pista; no equivale a avisar
inmediatamente por debajo de cuatro vueltas. Vantare no demuestra aún ese
conjunto. La ausencia de EndTime no se transforma en «carrera por vueltas»:
el driver LMU invalida EndTime=0 cuando el reloj de sesión ya es positivo.
Por tanto, esas sesiones sin final usable también quedan en silencio en este
corte. Recuperar cobertura de carreras por vueltas con su silencio final
correcto exige demostrar las señales en T0; es una limitación visible, no un
PASS de paridad.

## Referencia reproducible

Fuentes primarias leídas desde objetos Git del SHA fijado:

| Fuente CrewChief | Blob Git |
| --- | --- |
| [Timings.cs](https://gitlab.com/mr_belowski/CrewChiefV4/-/blob/4c3865e09a347d4c806c0bc0cd66aae335fbc610/CrewChiefV4/Events/Timings.cs) | `caf01d9ad60e967ff514dee717a3a118bcf5df44` |
| [Fuel.cs](https://gitlab.com/mr_belowski/CrewChiefV4/-/blob/4c3865e09a347d4c806c0bc0cd66aae335fbc610/CrewChiefV4/Events/Fuel.cs) | `d1f4b0a8feda0531c0e6f013bd5fb9f9ac4a4bcc` |
| [RF2GameStateMapper.cs](https://gitlab.com/mr_belowski/CrewChiefV4/-/blob/4c3865e09a347d4c806c0bc0cd66aae335fbc610/CrewChiefV4/RF2/RF2GameStateMapper.cs) | `c0acc5c9878b52ea202e95361a64faae2658eeda` |
| [Settings.settings](https://gitlab.com/mr_belowski/CrewChiefV4/-/blob/4c3865e09a347d4c806c0bc0cd66aae335fbc610/CrewChiefV4/Properties/Settings.settings) | `13b19f78217111a8d2bbf4d7bbfbd340b68dc530` |

Defaults relevantes: avisos Fuel/Gap activos; frecuencias delante/detrás/
detrás en pista 7/4/5; aleatoriedad 5; just-the-facts desactivado; aviso de
vueltas de combustible en carrera cronometrada desactivado. Este corte no
iguala aún todas esas opciones ni modifica los 60 s de cooldown del gap actual.

## Archivos y validación

Archivos productivos: `internal/families/engine.go`, `fuel.go`, `timings.go` y
`internal/engineer/service/delivery_runtime.go`. Pruebas de familias, servicio
y replay; este plan, handoff, fragmento de cambios y una entrada del roadmap.
Sin nuevos proveedores, dependencias, flags ni rediseño del bus.

Antes: casos rojos con valores y fuente. Después: controles y fronteras,
cancelación antes de started, Go global, race focal, vet, calidad y checks de
roadmap. La prueba física Windows/LMU y la latencia audible siguen pendientes.

Roadmap: únicamente `milestones:engineer-radio-spotter`, regenerado desde la
base confiable. PR draft a nightly; terminar el corte no lo promociona.

## Confirmación posterior y evidencia

Se volvió a leer Timings/Fuel del mismo SHA CrewChief tras el cambio. Los
silencios de carrera, boxes y frontera de 120 s coinciden con las condiciones
acotadas de la tabla; las señales ausentes se cierran de forma conservadora.
La retirada de `pit_now` elimina una orden no respaldada, pero no implementa
el armamento y la emisión de la orden correcta de CrewChief.

Revisión productiva de entrega: `50026e4f1280399dc926176744bc4db06acebd44`,
equivalente a los tres commits del worker hasta `1eba2f0c`. La revisión
independiente reprodujo una carrera en el ACK final del candidato anterior;
el mismo probe pasó después con `-race`, además de la regresión versionada.
Veredicto acotado: sin P1/P2 abiertos en esta reparación. Se mantienen los
controles de aviso válido, cooldown consumido solo al empezar y aviso ya
iniciado que no se interrumpe al perder el contexto Timings.

| Comprobación | Resultado y límite |
| --- | --- |
| Regresiones Fuel/contexto/EndTime/ACK | Rojo antes de cada reparación y verde después; pruebas versionadas en familias y servicio. |
| Suite focal ampliada | 40 paquetes PASS: families, engineer, radio y projection/engineer. |
| Concurrencia y revisión estática | Race de families, service, replayoracle y radio PASS; vet focal, gofmt y diffcheck PASS. |
| Auditoría original VAN-735, repetida sin cambiar el probe | Se resuelven 6 de sus 9 diferencias; sus 2 controles positivos siguen pasando. La ejecución completa del probe sigue roja por las otras 3, explícitamente fuera de este corte. |
| Goldens de radio | Se retiran únicamente expectativas derivadas del pit_now injustificado; se conserva presión/prioridad con el aviso informativo de autonomía. |
| Calidad local | PASS, cero hallazgos nuevos y política sin cambios. Node 22.23.2, Go 1.25.0 y assets frontend compilados. |
| Frontend build | PASS; necesario para los assets embebidos de Go. No hay cambios frontend. |
| Go global en macOS | 119 paquetes PASS tanto en la base como en el candidato; ambos fallan en los mismos cuatro paquetes descritos debajo. No se declara PASS global. |

Reproducción de los gates desde `vantare-v2`:

```sh
go test ./internal/families ./internal/engineer/... ./internal/radio/... ./internal/telemetry/projection/engineer/...
go test -race ./internal/families ./internal/engineer/service ./internal/engineer/replayoracle ./internal/radio
go vet ./internal/families ./internal/engineer/service ./internal/engineer/replayoracle ./internal/radio
TMPDIR=/private/tmp go test -timeout 90s ./...
```

El global se comparó contra `1e9932c4` con el mismo host macOS, Go, assets y
TMPDIR real: `cmd/vantare` usa símbolos Windows no disponibles; Launcher falla
en dos casos y agota 90 s en `TestRunChainCancellable`; Server falla en la
validación de ruta absoluta Windows; Recording SQLite falla en detección de
proceso activo y permisos privados. No aparecen nuevos paquetes fallidos.
Los registros locales son `/tmp/vantare-1299-go-baseline-real-tmp.txt` y
`/tmp/vantare-1299-go-final.txt`.

El CI ordinario tiene además una incidencia independiente:
[VAN-737](https://app.notion.com/p/3e3e51695c6581bc88fbda9b7d057975). El test
negativo de calidad presume que cualquier PR modifica la política y rechaza
un aggregate PASS legítimo, reproducido en la PR documental #1295. No se
modifica ni relaja la política dentro de esta reparación. El estado final de
CI y el SHA de entrega se registran en la PR y en VAN-736.

La auditoría conserva tres diferencias: muestreo Timings por frames dentro
del mismo sector; aceptación de solape Spotter con rival parado; demora de
clear Spotter (1550 ms observados frente a 1250 ms de referencia con pasos
de 50 ms). El audio Windows y la sesión física LMU no se han verificado.

## Verificación manual al integrar el candidato autorizado

1. En una carrera cronometrada con gaps y estado de boxes fiables, comprobar
   que se admiten avisos antes del final y se silencian con menos de 120 s.
2. Repetir en práctica, clasificación y boxes: no deben salir avisos Timings.
   Si falta evidencia usable de final, también permanece en silencio.
3. Con un aviso pendiente, entrar en boxes antes de que empiece; no debe
   publicarse ni bloquear por cooldown el siguiente aviso válido. Un aviso
   que ya haya empezado conserva su ciclo normal.
4. Con menos de cuatro vueltas de autonomía, comprobar que no ordena parar
   y que siguen disponibles los avisos informativos de combustible.

## Continuación

Cerrar y revisar esta reparación; después T0a, T0b y T1–T8 en sus cortes propios.
Audio Windows y discrepancias Spotter tienen evidencia en VAN-735 y necesitan
reparaciones separadas. La PR #1295 permanece exclusivamente documental.
