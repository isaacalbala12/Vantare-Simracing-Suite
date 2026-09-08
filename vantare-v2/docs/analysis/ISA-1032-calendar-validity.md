# ISA-1032 — salidas dentro de la vigencia publicada

C3 del plan aprobado #1027. Base nightly d6d0992f; rama
vantareapp/isa-1032-calendar-validity. Dependencia obligatoria #1029 / PR #1031:
este frontend consume sus metadatos, por lo que no se integra primero.

El store conserva schedule; el adaptador valida inicio/fin una vez al construir
las series. El motor existente limita próximas salidas y detalle sin un motor
alternativo. Inicio filtra también previews. Mes no muestra patrones en días
sin ocurrencias dentro de vigencia. Los eventos independientes no se eliminan.

Seis regresiones inicialmente RED y después GREEN usando el seed Go real en su
periodo histórico controlado. Comprueban retención de metadatos, vigencia ausente,
caducidad, previews, cinco vistas y detalle. Se añaden límites exactos y fin inválido.
Fixtures visuales existentes declaran su ventana congelada de julio; no son
evidencia de horario real actual ni se usan para medir rendimiento.

112 pruebas focales PASS; typecheck, lint y build PASS (aviso heredado de chunk).
Suite completa: 3243 PASS y 2 FAIL por timeout 20000 ms en PedalsRedline.layout,
superficie excluida con antecedente #1025. No se modifican ni repiten esos tests:
la suite completa NO está verde. Go completo y roadmap 23+21 PASS.
Review inicial: un P2, Mes contaba 12 slots en un día con solo 3 dentro de vigencia.
Reproducido RED y corregido GREEN contando ocurrencias acotadas; revisión final
fc12ceee ACCEPT sin nuevos P1/P2 para C3. Build final PASS. No se han
ejecutado pruebas Wails ni A/B. C4 debe hacer explícitos los estados de carga/error;
F4/F5/F6 (DST, límite semanal y especiales) permanecen en sus cortes. No se afirma
que todo Calendario esté corregido. HUD/Studio y datos del usuario intactos.

Verificar: `pnpm --dir frontend test src/calendar/calendar-validity.test.ts`.
En Wails, combinar candidatos aceptados en una build aislada, comprobar horario
vigente/caducado y las cinco vistas antes de cualquier integración autorizada.
Rollback: revert del corte frontend; el backend conserva metadatos aditivos.
Commit/PR/CI y gates finales se registran en #1032. Sin merge o release.
