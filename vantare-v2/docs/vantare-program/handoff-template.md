# Plantilla de handoff vivo

Leer [notion-transition.md](notion-transition.md). En PREPARACIÓN el handoff
vivo permanece en Git; después del corte tendrá un único sucesor operativo en
Notion y este documento versionado será un snapshot enlazado, no otra copia editable.


Cada proyecto mantiene un único documento con:

1. resultado del proyecto;
2. autoridad, estado PREPARACIÓN/ACTIVO, URL de tarea y lectura obligatoria;
3. estado real, rama/base/SHA e integración;
4. decisiones cerradas;
5. arquitectura, ownership y dependencias prohibidas;
6. evidencia: tests, builds, capturas, runtime y rendimiento;
7. riesgos/deuda P0–P3;
8. tareas terminadas, activa y pendientes; separar UUID/ID Notion, número GitHub
   e ID histórico Linear sin renumerarlos;
9. siguiente acción exacta con alcance y checks;
10. fecha, issue y agente de la última actualización.
