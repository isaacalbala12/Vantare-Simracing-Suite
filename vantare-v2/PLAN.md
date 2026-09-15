# PLAN — segunda ronda de optimización dirigida por hechos

Base: `ae11bef79471e04aaa8f11422e0c91d834b4277b`  
Tarea: [VAN-727](https://app.notion.com/p/3dce51695c65814e97def0b85ba62a48)

1. Crear tres worktrees desde la base: Studio, overlays frontend y Go.
2. Encargar a workers Luna F01–F02, F03–F04–F08 y F05–F06–F07,
   respectivamente, sin benchmarks pesados concurrentes.
3. Revisar como coordinador consumidores, pruebas, diffs y harnesses.
4. Ejecutar benchmarks base/candidato de forma secuencial y decidir cada F01–F08.
5. Integrar sólo commits justificados, uno a uno, y repetir la medida combinada.
6. Ejecutar tests focales, suites, tipos, lint y build aplicables.
7. Hacer revisión adversarial independiente, documentar resultados y actualizar
   el handoff y VAN-727 a `En revisión`.

No se hará push, PR, merge, promoción, release ni cambio en CI, reglas globales,
baselines globales, skills o el worktree anti-slop.
