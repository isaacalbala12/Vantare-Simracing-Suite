# Plantilla de handoff vivo

Leer [execution-policy.md](execution-policy.md). GitHub Issues y Project Vantare
contienen alcance, estado y diario. El handoff conserva el estado técnico actual,
decisiones y evidencia enlazada, sin definir otra cola de ejecución.

No añadir entradas fechadas ni secciones por worker/ronda: sustituir el apartado
afectado tras cada cambio material y escribir el diario en la issue. Objetivo
≤150 líneas por handoff; 10 apartados. Antes de recortar, contrastar con la issue
abierta del área y dejar permalink al SHA anterior para todo contexto histórico.
Los workers de otras ramas deben actualizar estos apartados, sin anexar diarios.

1. Resultado del proyecto.
2. Autoridad GitHub Issues: URL/ID, proyecto y lectura/escritura verificadas.
3. Estado real, rama/base/SHA, integración y canal.
4. Decisiones cerradas.
5. Arquitectura, ownership y dependencias prohibidas.
6. Evidencia: tests, builds, capturas, runtime/rendimiento y límites.
7. Riesgos y deuda P0–P3; no elevar severidad sin evidencia.
8. Issues terminadas, activa y pendientes; conservar números GitHub e IDs históricos.
9. Siguiente acción exacta, contrastada con la issue abierta, alcance y checks.
10. Fecha, tarea GitHub y agente de la última actualización.
