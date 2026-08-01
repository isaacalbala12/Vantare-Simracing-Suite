# Mapa de sustitución PB -> STR

**Fecha:** 2026-08-01
**Regla:** las issues PB se conservan en Linear con título, descripción,
milestone y comentarios históricos. Se marcan `Canceled` por sustitución y se
enlazan a su destino; no se consideran trabajo perdido.

## Motivo del cambio

PB describía Product B como un producto separado y asignaba a Strategy tareas
que ahora pertenecen a Telemetry Analysis. STR describe el producto único y
respeta los contratos de Telemetry Core/Analysis.

## Mapa completo

| PB | Acción | STR canónico | Nota pública de sustitución |
| --- | --- | --- | --- |
| ISA-42 / PB-01A | Supersede | STR-01 | Baseline y simulación absorbidos por rescate selectivo |
| ISA-43 / PB-01B | Supersede | STR-01 | No habrá integración completa del branch Product A |
| ISA-44 / PB-01C | Supersede | STR-02 | Fronteras sustituidas por ADR 0006 |
| ISA-45 / PB-02A | Move ownership | TEL + STR-10 | Parser/esquema pertenece a Analysis |
| ISA-46 / PB-02B | Move ownership | TEL + STR-10 | Discovery pertenece a Analysis |
| ISA-47 / PB-02C | Move ownership | TEL + STR-10 | DuckDB pertenece a Analysis |
| ISA-48 / PB-02D | Move ownership | TEL + STR-10 | Dataset histórico pertenece a Analysis |
| ISA-49 / PB-03A | Move ownership | TEL + STR-10 | Corrección de sesión pertenece a Analysis |
| ISA-50 / PB-03B | Split | TEL + STR-11 | Analysis calcula métricas; Strategy crea input de plan |
| ISA-51 / PB-03C | Supersede | STR-03, STR-15 | Biblioteca Strategy conserva solo planes/revisiones |
| ISA-52 / PB-03D | Supersede | STR-03, STR-04 | Dirty/concurrencia del documento Strategy |
| ISA-53 / PB-04A | Supersede | STR-07 | Nuevo harness autocontenido y visual contract |
| ISA-54 / PB-04B | Supersede | STR-03, STR-07 | Galería privada y navegación unificadas |
| ISA-55 / PB-04C | Move ownership | TEL + STR-10 | Strategy selecciona una proyección, no importa LMU |
| ISA-56 / PB-04D | Supersede | STR-07, STR-09 | Editor manual unificado |
| ISA-57 / PB-04E | Supersede | STR-07 | Shell de tres columnas conservado |
| ISA-58 / PB-05A | Supersede | STR-04 | Store versionado, comandos y undo/redo |
| ISA-59 / PB-05B | Split | STR-05, STR-08 | Cálculo físico y UI de stints separados |
| ISA-60 / PB-05C | Supersede | STR-06 | Inventario físico con procedencia |
| ISA-61 / PB-05D | Supersede | STR-08 | DnD explícito y accesible |
| ISA-62 / PB-05E | Supersede | STR-09 | Fuel-save con Fuel/VE separados |
| ISA-63 / PB-06A | Supersede | STR-12 | Auditoría incorporada al solver v2 |
| ISA-64 / PB-06B | Supersede | STR-13 | Variantes con rango y riesgo |
| ISA-65 / PB-06C | Supersede | STR-13 | Comparador unificado |
| ISA-66 / PB-06D | Supersede | STR-21 | Gate integral final |
| ISA-67 / PB-06E | Supersede | STR-22 | Cutover posterior a consumidores cero |

## Orden STR

1. STR-01 / ISA-136 — Rescate selectivo Product A.
2. STR-02 / ISA-137 — Contrato, unidades y estados.
3. STR-03 / ISA-138 — Persistencia y galería privada.
4. STR-04 / ISA-139 — Servicio/store/dirty/undo.
5. STR-05 / ISA-140 — Carrera, recursos y pit.
6. STR-06 / ISA-141 — Inventario físico de neumáticos.
7. STR-07 / ISA-142 — Shell visual y navegación.
8. STR-08 / ISA-143 — Stints y DnD.
9. STR-09 / ISA-144 — Entrada manual y fuel-save.
10. STR-10 / ISA-145 — Adapter de Analysis.
11. STR-11 / ISA-146 — Derivados y confianza.
12. STR-12 / ISA-147 — Solver determinista v2.
13. STR-13 / ISA-148 — Variantes y comparación.
14. STR-14 / ISA-149 — Escenarios dinámicos.
15. STR-15 / ISA-150 — Galerías y paquetes.
16. STR-16 / ISA-151 — Activación y lifecycle.
17. STR-17 / ISA-152 — Ejecución live.
18. STR-18 / ISA-153 — Replanificación y aceptación.
19. STR-19 / ISA-154 — Engineer/Pit Manager.
20. STR-20 / ISA-155 — Overlays/widgets.
21. STR-21 / ISA-156 — Gate integral.
22. STR-22 / ISA-157 — Cutover.

## Regla de Linear

La descripción de cada issue PB permanece intacta. Se añade un comentario con:

- motivo de sustitución;
- corte(s) STR de destino;
- enlace a este documento;
- aclaración de que no se ejecutará PB.

Solo después se cambia su estado a `Canceled`. Los milestones PB permanecen
como archivo histórico.
