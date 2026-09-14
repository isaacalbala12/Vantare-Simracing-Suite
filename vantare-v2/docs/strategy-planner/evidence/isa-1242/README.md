# ISA-1242 — ventanas obligatorias de pit

## Resultado

Reglas permite preparar una ventana completa, añadirla, editar sus extremos y
retirarla. La única autoridad sigue siendo `draft.rules.requiredWindows`;
quitar la última elimina ese campo y conserva el resto de reglas.

No se infieren ventanas desde una carrera temporal, no se fusionan solapes y no
se ha añadido otro editor de reglas ni lógica a SolverV2.

## Evidencia

- RED: la pantalla no exponía ningún control de ventanas.
- GREEN focal: cinco archivos de test, 78 pruebas.
- Dos ventanas 10–20 y 30–40 conservan orden en parser, guardado/reapertura y
  adapter de cálculo.
- El validador compartido rechaza 20–10, 0–10 y 10,5–20.
- Frontend completo: 448 archivos y 3814 pruebas; typecheck, lint, auditoría
  i18n y build pasan. El build conserva sólo el aviso heredado de chunks grandes.
- Los 21 tests del contrato de roadmap pasan; digest estable y diff-check limpio.
- Astra detectó y se corrigió que un vacío transitorio borraba la ventana; la
  revisión final queda sin P0–P2 y confirma que no hace falta más abstracción.

## Límites

Compuestos obligatorios, reglas por clima y disponibilidad de pilotos quedan en
cortes separados. No se abrió app/Wails/LMU ni se tocaron DuckDB.
