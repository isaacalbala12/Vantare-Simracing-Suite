# T0b — Comprobación del corpus, 22 de septiembre de 2026

[VAN-745](https://app.notion.com/p/3e3e51695c65815a882dceaf13cde9e6) / #1316.
Base `e41f703c3a015321024766cc5da55d9a6def1bcb`; rama
`vantareapp/isa-1316-timings-fixtures`. SHA candidato y CI final en Notion/PR.

## Resultado y revisión

141 escenarios cubren las 15 reglas y A1–A9. 36 defaults fijados íntegramente,
23 archivos fuente y 120 anclas SHA-256 comprobadas contra los bytes de
`git show 4c3865e09a347d4c806c0bc0cd66aae335fbc610:<path>`.
El ledger externo se fija por commit/hash; no se ejecuta código CrewChief ni
se usa el monitor Vantare para producir expected.

GPT-6 Sol hizo revisión de señales/fuente y posterior comprobación de las
correcciones: precondiciones de selección/rivales/consultas, It2 según versión,
contenedor sin gap en líder por vuelta y ajustes de vueltas ±1. GPT-6 Luna
revisó el validador: se cerró el hueco que permitía sustituir un ajuste por
otro conservando el conteo, fijando todo el mapa y añadiendo dos negativos.
Ambas reviews cierran favorables en su alcance, sin contradicciones materiales
restantes; ninguna demuestra paridad ejecutada.

## Checks locales

| Check | Resultado |
|---|---|
| `go test ./internal/engineer/replayoracle -run Timings -count=1` | PASS; 141 casos y 23 comprobaciones negativas |
| `go test -race -count=1 ./internal/engineer/replayoracle` | PASS; paquete completo, incluidos goldens anteriores |
| `go vet ./internal/engineer/replayoracle` | PASS |
| 21 tests contrato roadmap + 23 digest | PASS, 44 total |
| Calidad contra base e41f703c | PASS agregado; NEW=0, MOVED=0, sin cambio de política/baselines |
| Hashes fuente/anclas, links nuevos, formato y diff-check | PASS |
| `go test -count=1 -timeout 90s ./...` en macOS | FAIL en cuatro paquetes de plataforma ya documentados en la base |
| `go vet ./...` en macOS | FAIL por `launcher.HotkeyManager` Windows en cmd/vantare |

El global falla en `cmd/vantare` (símbolos Windows), `internal/app/launcher`
(dos tests y timeout), `internal/server` (ruta Windows) y
`internal/telemetry/recording/sqlite` (crash/permisos). Coinciden con el
[contraste candidato/base previo](../../isa-1310-engineer-joint-validation.md).
T0b no modifica esos módulos. No se declara PASS global macOS. La primera
invocación local se interrumpió tras un error de preparación del embed frontend
y espera de Launcher; se preparó el dist existente de la misma base y se
repitió el global completo con el límite de 90 s ya usado por la validación
de composición. La tabla corresponde a esa repetición, no a la interrumpida.

Calidad conserva deuda estática previa; PASS agregado no significa cero
hallazgos totales. No se ejecuta build frontend local porque no cambia frontend;
el dist reutilizado sólo satisface el embed para Go. CI Windows verificará el
candidato publicado. No se alteran dependencias, excepciones ni política.

Los logs locales y sus hashes están en el expediente de trabajo
`docs/audits/engineer-2026-09-22/t0b-1316/`, fuera del repositorio de producto.
La [matriz](data-matrix.md) y el [contrato del corpus](../../../../internal/engineer/replayoracle/testdata/timings/README.md)
contienen los límites de entrada y el procedimiento reproducible.

## Gates que siguen abiertos

Ejecución CrewChief, replay de comportamiento del producto, voz online,
fallback offline, acústica/primer sonido y sesión LMU: todos `NOT_RUN`.
VAN-744 y VAN-741 siguen pendientes aparte. El corte no cambia el comportamiento
del ingeniero; prepara la referencia independiente para T1. No hay promoción
de canal ni aprobación implícita de una futura integración.
