# ISA-1042 — reloj de carrera y plan conjunto

Autorización: saneamiento completo aprobado por Isaac; ejecución personal.
Base `b7991919`, rama `vantareapp/isa-1042-timed-race-horizon`, worktree
`C:/tmp/vantare-isa1042`.

1. RED: inicio de vueltas después del vencimiento, frontera exacta, vuelta
   en curso, paradas y recursos conjuntos.
2. Reusar CalculateRace para estimar el horizonte y reevaluar cada reparto
   completo con el adapter/replay de #1041. No recortar un plan ya calculado.
3. Exponer en replay el inicio real de la última vuelta, con los mismos costes
   de conducción; aceptar complete_current_lap solo si comienza antes del
   vencimiento y termina en él o después. Tolerancia numérica temporal explícita.
4. Acotar iteración y detectar ciclos: devolver causa tipada sin publicar una
   recomendación incoherente. No reclamar optimalidad global.
5. Go completo, golden compartido/frontend, revisión personal, evidencia,
   handoff, roadmap y commit aislado. No modificar LMU ni DuckDB originales.

Archivos: orbit_calculation.go, helper/test del horizonte, replay_v2.go/tests,
tipos y golden si cambia el contrato; documentación viva.
