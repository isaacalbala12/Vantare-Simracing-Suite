# PLAN · Quality Linux con Wails

Autoridad: VAN-733 / GitHub #1296. Diseño aprobado:
`docs/specs/2026-09-20-quality-linux-wails-analysis-design.md`.

Base: `origin/nightly@8a0620e8abe75914efed41de4117490f3e47a3b4`.

## Ejecución

- [x] Registrar tarea, issue puente, rama y diseño aprobado.
- [x] Añadir una regresión que exija la preparación GTK4/WebKitGTK 6.0 en
  `quality-check` y `quality-audit`; demostrar RED antes del cambio.
- [x] Instalar y verificar esas dependencias en ambos jobs, sin modificar
  baselines, selección de paquetes ni códigos de salida.
- [x] Añadir `milestones:quality-linux-analysis` al roadmap como `fix`,
  regenerar `roadmap.json` y actualizar el handoff vivo.
- [x] Ejecutar suites ratchet/negative, doctor, validadores de roadmap,
  `git diff --check` y revisión completa del diff.
- [ ] Publicar la rama y abrir PR draft a `nightly`; confirmar en Ubuntu que
  ambos analizadores terminan sin ERROR y que el agregado queda
  `REVIEW_REQUIRED` por cambio de política.
- [ ] No integrar sin autorización específica de Isaac. Tras una integración
  autorizada, reejecutar #1295 para demostrar el PASS ordinario.
