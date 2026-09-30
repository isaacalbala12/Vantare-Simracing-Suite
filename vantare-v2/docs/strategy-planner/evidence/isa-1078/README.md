# ISA-1078 — referencias exactas en proyecciones

Base d458879f; rama vantareapp/isa-1078-projection-revisions; worktree
C:/tmp/vantare-isa1078. Cinco archivos Go de contrato/productor y tests.

Extensión aditiva V2 sourceRevisions con sesión/base/revisión/snapshot.
Sin referencias se mantiene la serialización legada. Con referencias, exige
cobertura completa, unicidad, pertenencia a la sesión y digests SHA-256
minúsculos. Copia identificadores y no cambia el cálculo de familias.

RED: nuevos tests no compilan por API ausente. GREEN: tests Analysis y subpaquetes,
vet Analysis, build frontend y go test ./... pasan. Suite global: código 0,
log local C:/tmp/isa1078-go-test.log. Build conserva aviso heredado de chunks.
Pruebas específicas: parcial, vacío explícito, fuente cruzada, duplicados,
digests inválidos, alias y round-trip JSON. No es evidencia de telemetría real.

Revisión personal: diffs completos y caminos de validación; productor rechaza
una referencia de otra sesión antes de agregar, sin sustituir silenciosamente
datos. Documento Strategy conserva el struct de proyección completo.
No equivale a autorización ni prueba que los derivados usaron una revisión:
esa unión y consumidor TS son el siguiente corte antes de conectar la UI.

Docs: contrato, handoff, roadmap manual/generado y esta evidencia.
Sin dependencias nuevas, originales modificados, LMU, push, PR, CI remota,
merge, promoción o release. Validación Wails/editor y calibración pendientes.
