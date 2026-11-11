# Barrido de paridad del Hub — informe parcial

UI congelada: nightly `9401501ea38f2e8fe65584511f27844c7efd157a`. Candidato QA aislado construido una vez; no sustituye al Hub distribuido. Capturas HWND reales, 1440×900, Vantare, 100 %, seriadas mediante cerrojo global.

Porcentaje perceptual: pixelmatch 8.0.0, umbral 0,1, antialias incluido, imagen completa sin máscaras ni alineación. Se verifica el recibo de la referencia antes de comparar. No equivale a una valoración humana. † Puerta sin barra: ambos estados usan la misma captura real, no son dos disposiciones diferentes.

| Pantalla | Responsable | Oscuro contraída | Oscuro expandida | Claro contraída | Claro expandida |
|---|---|---:|---:|---:|---:|
| Inicio · inicio-base | B | 6,49 % | Sin referencia expandida | 6,74 % | Sin referencia expandida |
| Inicio · inicio-vacio | B | 3,64 % | Sin referencia expandida | 3,70 % | Sin referencia expandida |
| Inicio · inicio-cargando | B | 1,26 % | Sin referencia expandida | 2,36 % | Sin referencia expandida |
| Inicio · inicio-error | B | 4,88 % | Sin referencia expandida | 5,60 % | Sin referencia expandida |
| Launcher · launcher-base | C | 7,30 % | Sin referencia expandida | 15,03 % | Sin referencia expandida |
| Launcher · launcher-nuevo-perfil | C | 2,81 % | Sin referencia expandida | 6,17 % | Sin referencia expandida |
| Launcher · launcher-aplicaciones | C | 4,96 % | Sin referencia expandida | 4,56 % | Sin referencia expandida |
| Roadmap · roadmap-base | B | 2,22 % | Sin referencia expandida | 4,98 % | Sin referencia expandida |
| Testing Center · testing-center-resumen | D | 3,25 % | Sin referencia expandida | 5,65 % | Sin referencia expandida |
| Testing Center · testing-center-cuestionarios | D | 4,58 % | Sin referencia expandida | 7,90 % | Sin referencia expandida |
| Testing Center · testing-center-comunidad | D | 3,72 % | Sin referencia expandida | Pendiente / no comparable | Sin referencia expandida |
| Testing Center · testing-center-triage | D | Pendiente / no comparable | Sin referencia expandida | Pendiente / no comparable | Sin referencia expandida |
| Testing Center · testing-center-diagnostico | D | Pendiente / no comparable | Sin referencia expandida | Pendiente / no comparable | Sin referencia expandida |
| Testing Center · testing-center-informe | D | Pendiente / no comparable | Sin referencia expandida | Pendiente / no comparable | Sin referencia expandida |
| Calendario · calendario-r6-proximas | D | Pendiente / no comparable | Pendiente / no comparable | Pendiente / no comparable | Pendiente / no comparable |
| Calendario · calendario-r6-mias | D | Pendiente / no comparable | Pendiente / no comparable | Pendiente / no comparable | Pendiente / no comparable |
| Calendario · calendario-r6-semana | D | Pendiente / no comparable | Pendiente / no comparable | Pendiente / no comparable | Pendiente / no comparable |
| Calendario · calendario-mes | D | Pendiente / no comparable | Sin referencia expandida | Pendiente / no comparable | Sin referencia expandida |
| Calendario · calendario-eventos-contraida | D | Pendiente / no comparable | Sin referencia expandida | Pendiente / no comparable | Sin referencia expandida |
| Ajustes · ajustes-aplicacion | A | 4,98 % | Sin referencia expandida | 4,41 % | Sin referencia expandida |
| Ajustes · ajustes-apariencia | A | Pendiente / no comparable | Sin referencia expandida | Pendiente / no comparable | Sin referencia expandida |
| Ajustes · ajustes-rendimiento | A | Pendiente / no comparable | Sin referencia expandida | Pendiente / no comparable | Sin referencia expandida |
| Ajustes · ajustes-atajos | A | Pendiente / no comparable | Sin referencia expandida | Pendiente / no comparable | Sin referencia expandida |
| Ajustes · ajustes-actualizaciones | A | Pendiente / no comparable | Sin referencia expandida | Pendiente / no comparable | Sin referencia expandida |
| Ajustes · ajustes-privacidad | A | Pendiente / no comparable | Sin referencia expandida | Pendiente / no comparable | Sin referencia expandida |
| Ajustes · ajustes-diagnostico | A | Pendiente / no comparable | Sin referencia expandida | Pendiente / no comparable | Sin referencia expandida |
| Ajustes · ajustes-cuenta | A | Pendiente / no comparable | Sin referencia expandida | Pendiente / no comparable | Sin referencia expandida |
| Cuenta · cuenta-base | A | Pendiente / no comparable | Sin referencia expandida | Pendiente / no comparable | Sin referencia expandida |
| Notificaciones · notificaciones-completa | B | Pendiente / no comparable | Sin referencia expandida | Pendiente / no comparable | Sin referencia expandida |
| Próximamente · strategy-proximamente | B | Pendiente / no comparable | Sin referencia expandida | Pendiente / no comparable | Sin referencia expandida |
| Próximamente · engineer-base | B | Pendiente / no comparable | Sin referencia expandida | Pendiente / no comparable | Sin referencia expandida |
| Puertas · privacidad-pendiente | A | Pendiente / no comparable | Pendiente / no comparable | Pendiente / no comparable | Pendiente / no comparable |
| Puertas · privacidad-uso | A | Pendiente / no comparable | Pendiente / no comparable | Pendiente / no comparable | Pendiente / no comparable |
| Puertas · acceso-base | A | Pendiente / no comparable | Pendiente / no comparable | Pendiente / no comparable | Pendiente / no comparable |
| Puertas · email-formulario | A | Pendiente / no comparable | Pendiente / no comparable | Pendiente / no comparable | Pendiente / no comparable |
| Puertas · email-codigo | A | Pendiente / no comparable | Pendiente / no comparable | Pendiente / no comparable | Pendiente / no comparable |
| Puertas · email-crear-contrasena | A | Pendiente / no comparable | Pendiente / no comparable | Pendiente / no comparable | Pendiente / no comparable |
| Puertas · email-consentimiento | A | Pendiente / no comparable | Pendiente / no comparable | Pendiente / no comparable | Pendiente / no comparable |
| Puertas · email-autorizando | A | Pendiente / no comparable | Pendiente / no comparable | Pendiente / no comparable | Pendiente / no comparable |
| Puertas · email-reiniciado | A | Pendiente / no comparable | Pendiente / no comparable | Pendiente / no comparable | Pendiente / no comparable |
| Puertas · email-ocupado | A | Pendiente / no comparable | Pendiente / no comparable | Pendiente / no comparable | Pendiente / no comparable |
| Puertas · email-espera | A | Pendiente / no comparable | Pendiente / no comparable | Pendiente / no comparable | Pendiente / no comparable |

## Diferencias visibles

Revisión visual y recortes pendientes. Los fallos de captura y referencias ausentes se conservan en results.json; no se interpretan como diferencias del producto. Studio excluido por encargo. Buzón de Launcher pendiente de integración.
