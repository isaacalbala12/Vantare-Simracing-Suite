# ISA-1095 — combinación desde archivo seleccionado

Base f661d82638591bf547df835ab71458d3bbc76401; rama
vantareapp/isa-1095-recorded-source-combination; SDD T08, #1094/#1088.

## T08a — identidad en preparación Analysis

PrepareCorrections devuelve la CombinationIdentity del clasificador Go existente
sobre input.Session ya leído bajo autorización/lock. No nuevo lector, nueva
consulta ni importación de todo el directorio. Si no identifica, conserva la
preparación y devuelve combinationUnavailableReason=metadata_unavailable.
La identidad no certifica calidad, cobertura ni estrategia calculable.

RED: respuesta sin identidad ni motivo. GREEN: identidad igual al clasificador
canónico con metadata completa, ausencia explícita sin bloquear correcciones;
también pasan pruebas previas de permisos y revisiones. Fixture de lector
controlado, no banco DuckDB real. Logs C:/tmp/isa1095-t08a-{red,green}.log.
Build frontend y vet focal PASS; Go global/vet general en curso. Dos paths Go.
Sigue contrato TS y apertura explícita sin combinación preseleccionada.

T05 #1094 tiene componentes/borrador/persistencia/owner, todavía sin reemplazar
la ruta anterior. Bootstrap y navegación deben conectarse antes de afirmar A4
productivo completo. Sin push/PR/merge/promoción ni intervención en LMU.
