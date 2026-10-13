# Instrucciones de entrada para agentes

**Plane es el tablero de Isaac**: http://sapphireos.tail357eab.ts.net:8088,
workspace `vantare-simracing-suite`, proyecto `VANTA`. Todo trabajo pasa por el
orquestador y una tarea `VANTA-N`; GitHub Issues se mantiene para código, ramas
y PRs, con GitHub Project Vantare. Linear fue retirado el 2026-08-20.

Isaac mueve a «Para Claude» para el **orquestador**, que le hace las preguntas
necesarias hasta aclarar al 100 % qué entra, qué no y cómo se verifica. Después
crea o enlaza la issue GitHub y asigna al worker adecuado según el rol del modelo.
Solo entonces el worker mueve a «En curso»; ningún worker toma tareas directamente
de «Para Claude» ni crea tareas Plane por su cuenta. Si falta `VANTA-N`, avisa al
orquestador. El flujo, script y nombres obligatorios están en
[Issues](vantare-v2/AGENTS.md#issues).

1. Verificar raíz Git, rama, HEAD, worktree y `git status --short`.
2. Leer la issue, sus dependencias y el plan vigente antes de editar.
   `ISA-N` corresponde al número GitHub para issues nuevas; las migradas
   conservan título e identificadores históricos. Usar `vantareapp/isa-N-slug`.
3. Leer [las reglas activas](vantare-v2/AGENTS.md), el
   [expediente técnico](vantare-v2/docs/vantare-program/README.md), contratos
   y único handoff vivo del proyecto.
4. Actualizar y verificar la issue y el handoff tras cada cambio material:
   alcance, estado, dependencias, siguiente paso, PR, checks y SHA/canal.
   Cada issue pertenece a su proyecto (`area:*`, GitHub Project Vantare) y,
   si está comprometida para una versión, a su milestone de GitHub.

ClickUp es la única fuente del roadmap público, publicado en Supabase como documento de solo lectura según
[vantare-v2/docs/roadmap-maintenance.md](vantare-v2/docs/roadmap-maintenance.md).
No se exige el retirado `plan.md` ni su generador.

## Chats y checkouts nuevos

El desarrollo parte de `origin/nightly` actualizado. `master` es la rama
predeterminada pública y puede contener instrucciones antiguas. Antes de continuar
un checkout o chat previo, obtener `origin/nightly` y leer su `AGENTS.md` y
`vantare-v2/AGENTS.md` (`git show origin/nightly:AGENTS.md`). Crear un worktree
propio desde esa base; no sobrescribir cambios ajenos ni desarrollar en el checkout
de integración. Publicar en nightly no actualiza por sí solo master, plantillas
de GitHub ni contextos ya cargados por otros agentes.

Estas reglas también cubren documentación y tooling fuera de `vantare-v2`.
`docs/proyecto`, `docs/engineer` y snapshots antiguos son referencia histórica.
Conservar las autorizaciones específicas de cada entrega y canal.

## Sistema de calidad anti-slop

La política de calidad y el workflow de tooling están en
[docs/quality/anti-slop.md](docs/quality/anti-slop.md) y en
[.devin/skills/vantare-quality/SKILL.md](.devin/skills/vantare-quality/SKILL.md).
El script vive en `tools/quality/vantare_quality.py` (subcomandos:
bootstrap/doctor/check/audit/report/baseline). #1533 retira los analizadores
Go/React; `check` valida la retirada y las huellas conservadas. Los baselines
históricos no se recalibran; los gates de producto son los de `native/`.
