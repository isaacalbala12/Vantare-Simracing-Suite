# Roadmap manual del Hub (#1470)

Isaac edita `roadmap.json`. Se incorpora al compilar el Hub; reiniciar una build
antigua no cambia sus datos. La fuente no requiere servicios ni red; la pantalla
está disponible para todos los usuarios del Hub, sin rol tester ni módulo
comprado adicional. Conserva el login y la política de acceso existentes.
`schema.json` ayuda a editarlo; el contrato tipado y validación autoritativa
están en `src/roadmap.rs`, con tests de datos válidos e inválidos.

Se conservan `schemaVersion: 1`, `items`, `id`, `section` y las traducciones
`title/body` (`es/en/pt/it`) del documento del servicio. Esta extensión editorial
local añade `updatedAt` (fecha ISO), `currentPhase` (ID), `phases` y `areas`.
No se envía al servicio: su publicación guardada sigue accesible en la pantalla.

- Fase: `id`, `title`, `body`, `progress` (entero 0–100).
- Área: `id`, `title`, `progress` (entero 0–100).
- Hito: campos compartidos, `area` (ID existente), `progress` (0–100 o null),
  `date` (YYYY-MM-DD o null); `section`: now / next / later / done.
- Los hitos `done` requieren fecha; entregas se ordenan por fecha descendente.
- IDs únicos por colección. Máximo 8 fases, 12 áreas, 100 hitos y 128 KiB.
  Texto obligatorio, máximo 800 bytes. Campos desconocidos se rechazan.

Los porcentajes iniciales son seguimiento **editorial del bloque de rediseño**,
no métricas de rendimiento ni madurez de todo el producto. Los valores iniciales
son provisionales, indicados por el orquestador para comunicación pública:
fase actual 75 %, Hub 80 %, Overlays/Launcher 75 % y Módulos 25 %.
Isaac los ajusta al editar el documento, junto con las entregas.
Los cimientos iniciales corresponden a la entrega local `46244ea2`, sin promoción.
La fecha de beta es un objetivo, no una publicación confirmada.
ClickUp queda para una decisión posterior, sin cliente ni dependencia añadidos.

Validación: `native/gates.ps1 -Gate test` mediante la cola de compilación.
No editar `docs/roadmap/roadmap.json`: el digest es otro artefacto generado.
Esta base no contiene `docs/roadmap/plan.md`; su actualización se coordina con
el orquestador antes de integrar esta entrega.
