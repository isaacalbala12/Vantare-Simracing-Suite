# ISA-1067 — base de correcciones desde Analysis (C1b)

Base `7f04dd93`; rama `vantareapp/isa-1067-correction-source`. Continuación de la implementación autorizada por Isaac, sin subagentes.

## Comportamiento

`AnalyzeLapValidity` marca la sesión y versión real al producir el resultado. Las dos propiedades nuevas son aditivas y no modifican segmentación, etiquetas ni umbrales. Los resultados antiguos conservan campos vacíos al leerlos: nunca se les atribuye la versión de hoy.

`CorrectionSourceFromModel` exige el artefacto autorizado, parser/procedencia coincidentes, schema histórico compatible y análisis de la misma sesión/versión. Valida los componentes temporales con sus validadores existentes y genera el digest de la segmentación observada, sin crearla ni alterar su reloj. La base incluye el hash y tamaño del manifest autorizado.

No es autorización de I/O futuro ni garantía de que un original siga en disco: el consumidor deberá volver a verificarlo al operar. No hay endpoint frontend, custodia, snapshots persistidos ni selección por familia conectada. Un cache antiguo necesita reanálisis para convertirse en base de corrección; sigue siendo consultable por sus consumidores actuales.

## Verificación

- RED: tests no compilaban antes de la nueva función/marcas de productor.
- Suite Analysis PASS; dos tests nuevos con ocho subcasos de rechazo.
- Fixture sanitizada existente S266 prueba origen del productor y roundtrip JSON estable; no es una carrera nueva ni prueba física Wails.
- Segmentación distinta cambia el digest. Token ausente, parser/schema/versión/sesión incorrectos y límite inválido se rechazan.
- gofmt aplicado. `go test -p 2 ./...`: PASS, exit 0. Log privado `C:/tmp/isa1067-go-full.log`.
- Assets frontend reutilizados del build PASS de #1066; árboles Git frontend idénticos `b0ca05dd8ef086ddaed7e98bea5a59800692e2ec`, copiados solo al dist ignorado del worktree para el embed Go. No nuevo build/frontend tests por cero cambios frontend.
- Revisión personal: identidad generada por Go, fuente autorizada reutilizada, marca legacy ausente preservada, sin inferir relojes ni implementar nuevos filtros.

Archivos: correction_source.go y correction_source_test.go creados; lapvalidity.go añade metadatos del productor. Evidencia/handoffs/contrato/roadmap/digest actualizados. Sin dependencias, cambios de archivos originales, push, PR, CI remota, merge o promoción.

Siguiente: snapshots de correcciones, conflictos/solapes y custodia reversible antes de la conexión al editor. Los gates de calibración #1030 y aceptación Wails permanecen pendientes.
