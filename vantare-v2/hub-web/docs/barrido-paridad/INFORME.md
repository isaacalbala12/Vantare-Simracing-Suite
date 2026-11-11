# Barrido de paridad del Hub — informe parcial

Base congelada de UI: nightly `9401501ea38f2e8fe65584511f27844c7efd157a`.
Candidato de QA aislado; sin cambios del paquete distribuido, instalador o supervisor.
Capturas de una en una, con el cerrojo global; 1440×900, Vantare, escala 100 %.

Estado: inventario y construcción del candidato. No hay porcentajes medidos todavía.
Las puertas no tienen barra lateral: sus dos estados de barra se identifican como no aplicables.
Studio se excluye por encargo. El buzón de Launcher se añade cuando esté integrado.

| Pantalla | Responsable | Oscuro contraída | Oscuro expandida | Claro contraída | Claro expandida |
|---|---|---:|---:|---:|---:|
| Inicio · inicio-base | B | Pendiente | Pendiente | Pendiente | Pendiente |
| Inicio · inicio-vacio | B | Pendiente | Pendiente | Pendiente | Pendiente |
| Inicio · inicio-cargando | B | Pendiente | Pendiente | Pendiente | Pendiente |
| Inicio · inicio-error | B | Pendiente | Pendiente | Pendiente | Pendiente |
| Launcher · launcher-base | C | Pendiente | Pendiente | Pendiente | Pendiente |
| Launcher · launcher-nuevo-perfil | C | Pendiente | Pendiente | Pendiente | Pendiente |
| Launcher · launcher-aplicaciones | C | Pendiente | Pendiente | Pendiente | Pendiente |
| Roadmap · roadmap-base | B | Pendiente | Pendiente | Pendiente | Pendiente |
| Testing Center · testing-center-resumen | D | Pendiente | Pendiente | Pendiente | Pendiente |
| Testing Center · testing-center-cuestionarios | D | Pendiente | Pendiente | Pendiente | Pendiente |
| Testing Center · testing-center-comunidad | D | Pendiente | Pendiente | Pendiente | Pendiente |
| Testing Center · testing-center-triage | D | Pendiente | Pendiente | Pendiente | Pendiente |
| Testing Center · testing-center-diagnostico | D | Pendiente | Pendiente | Pendiente | Pendiente |
| Testing Center · testing-center-informe | D | Pendiente | Pendiente | Pendiente | Pendiente |
| Calendario · calendario-r6-proximas | D | Pendiente | Pendiente | Pendiente | Pendiente |
| Calendario · calendario-r6-mias | D | Pendiente | Pendiente | Pendiente | Pendiente |
| Calendario · calendario-r6-semana | D | Pendiente | Pendiente | Pendiente | Pendiente |
| Calendario · calendario-mes | D | Pendiente | Pendiente | Pendiente | Pendiente |
| Calendario · calendario-eventos-contraida | D | Pendiente | Pendiente | Pendiente | Pendiente |
| Ajustes · ajustes-aplicacion | A | Pendiente | Pendiente | Pendiente | Pendiente |
| Ajustes · ajustes-apariencia | A | Pendiente | Pendiente | Pendiente | Pendiente |
| Ajustes · ajustes-rendimiento | A | Pendiente | Pendiente | Pendiente | Pendiente |
| Ajustes · ajustes-atajos | A | Pendiente | Pendiente | Pendiente | Pendiente |
| Ajustes · ajustes-actualizaciones | A | Pendiente | Pendiente | Pendiente | Pendiente |
| Ajustes · ajustes-privacidad | A | Pendiente | Pendiente | Pendiente | Pendiente |
| Ajustes · ajustes-diagnostico | A | Pendiente | Pendiente | Pendiente | Pendiente |
| Ajustes · ajustes-cuenta | A | Pendiente | Pendiente | Pendiente | Pendiente |
| Cuenta · cuenta-base | A | Pendiente | Pendiente | Pendiente | Pendiente |
| Notificaciones · notificaciones-completa | B | Pendiente | Pendiente | Pendiente | Pendiente |
| Próximamente · strategy-proximamente | B | Pendiente | Pendiente | Pendiente | Pendiente |
| Próximamente · engineer-base | B | Pendiente | Pendiente | Pendiente | Pendiente |
| Puertas · privacidad-pendiente | A | Pendiente | Pendiente | Pendiente | Pendiente |
| Puertas · privacidad-uso | A | Pendiente | Pendiente | Pendiente | Pendiente |
| Puertas · acceso-base | A | Pendiente | Pendiente | Pendiente | Pendiente |
| Puertas · email-formulario | A | Pendiente | Pendiente | Pendiente | Pendiente |
| Puertas · email-codigo | A | Pendiente | Pendiente | Pendiente | Pendiente |
| Puertas · email-crear-contrasena | A | Pendiente | Pendiente | Pendiente | Pendiente |
| Puertas · email-consentimiento | A | Pendiente | Pendiente | Pendiente | Pendiente |
| Puertas · email-autorizando | A | Pendiente | Pendiente | Pendiente | Pendiente |
| Puertas · email-reiniciado | A | Pendiente | Pendiente | Pendiente | Pendiente |
| Puertas · email-ocupado | A | Pendiente | Pendiente | Pendiente | Pendiente |
| Puertas · email-espera | A | Pendiente | Pendiente | Pendiente | Pendiente |

## Diferencias visibles

Pendiente de captura y revisión humana. Se separarán marco compartido y pantallas de B/C/D; no se arreglarán pantallas ajenas.

## Límites de la referencia

No se inventarán métricas con referencias ausentes, vacías, de distinto acceso o datos incompatibles. Se conservan PNG, recibos y logs originales.

## Medición posterior

Cinco repeticiones A/B alternadas, Inicio y Ajustes, visible/interactiva, memoria privada/working set total, CPU y tamaño. Servidor compartido y ruidoso. Sin compilaciones propias simultáneas.
