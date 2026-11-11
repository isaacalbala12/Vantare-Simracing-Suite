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
| Testing Center · testing-center-comunidad | D | 3,72 % | Sin referencia expandida | 5,13 % | Sin referencia expandida |
| Testing Center · testing-center-triage | D | 3,32 % | Sin referencia expandida | 5,28 % | Sin referencia expandida |
| Testing Center · testing-center-diagnostico | D | 1,93 % | Sin referencia expandida | 1,71 % | Sin referencia expandida |
| Testing Center · testing-center-informe | D | Pendiente / no comparable | Sin referencia expandida | Pendiente / no comparable | Sin referencia expandida |
| Calendario · calendario-r6-proximas | D | 10,91 % | 10,76 % | 10,07 % | 9,86 % |
| Calendario · calendario-r6-mias | D | 8,54 % | 9,15 % | 8,02 % | 8,43 % |
| Calendario · calendario-r6-semana | D | 8,21 % | 8,51 % | 8,27 % | 8,30 % |
| Calendario · calendario-mes | D | Pendiente / no comparable | Sin referencia expandida | Pendiente / no comparable | Sin referencia expandida |
| Calendario · calendario-eventos-contraida | D | 8,27 % | Sin referencia expandida | 7,33 % | Sin referencia expandida |
| Ajustes · ajustes-aplicacion | A | 4,98 % | Sin referencia expandida | 4,41 % | Sin referencia expandida |
| Ajustes · ajustes-apariencia | A | 3,49 % | Sin referencia expandida | 3,72 % | Sin referencia expandida |
| Ajustes · ajustes-rendimiento | A | 1,85 % | Sin referencia expandida | 1,54 % | Sin referencia expandida |
| Ajustes · ajustes-atajos | A | 3,99 % | Sin referencia expandida | 3,48 % | Sin referencia expandida |
| Ajustes · ajustes-actualizaciones | A | 2,23 % | Sin referencia expandida | 2,96 % | Sin referencia expandida |
| Ajustes · ajustes-privacidad | A | 3,50 % | Sin referencia expandida | 2,62 % | Sin referencia expandida |
| Ajustes · ajustes-diagnostico | A | 2,98 % | Sin referencia expandida | 4,50 % | Sin referencia expandida |
| Ajustes · ajustes-cuenta | A | 3,51 % | Sin referencia expandida | 3,31 % | Sin referencia expandida |
| Cuenta · cuenta-base | A | 3,39 % | Sin referencia expandida | 3,31 % | Sin referencia expandida |
| Notificaciones · notificaciones-completa | B | Pendiente / no comparable | Sin referencia expandida | Pendiente / no comparable | Sin referencia expandida |
| Próximamente · strategy-proximamente | B | Pendiente / no comparable | Sin referencia expandida | Pendiente / no comparable | Sin referencia expandida |
| Próximamente · engineer-base | B | Pendiente / no comparable | Sin referencia expandida | Pendiente / no comparable | Sin referencia expandida |
| Puertas · privacidad-pendiente | A | 1,26 % † | 1,26 % † | 1,08 % † | 1,08 % † |
| Puertas · privacidad-uso | A | 2,37 % † | 2,37 % † | 1,80 % † | 1,80 % † |
| Puertas · acceso-base | A | 0,75 % † | 0,75 % † | 0,66 % † | 0,66 % † |
| Puertas · email-formulario | A | 0,81 % † | 0,81 % † | 0,77 % † | 0,77 % † |
| Puertas · email-codigo | A | 1,60 % † | 1,60 % † | 1,54 % † | 1,54 % † |
| Puertas · email-crear-contrasena | A | 0,92 % † | 0,92 % † | 0,90 % † | 0,90 % † |
| Puertas · email-consentimiento | A | 0,81 % † | 0,81 % † | 0,72 % † | 0,72 % † |
| Puertas · email-autorizando | A | 0,60 % † | 0,60 % † | 0,44 % † | 0,44 % † |
| Puertas · email-reiniciado | A | 0,93 % † | 0,93 % † | 0,87 % † | 0,87 % † |
| Puertas · email-ocupado | A | 0,75 % † | 0,75 % † | 0,72 % † | 0,72 % † |
| Puertas · email-espera | A | 0,83 % † | 0,83 % † | 0,69 % † | 0,69 % † |

## Diferencias visibles

Revisión visual y recortes pendientes. Los fallos de captura y referencias ausentes se conservan en results.json; no se interpretan como diferencias del producto. Studio excluido por encargo. Buzón de Launcher pendiente de integración.
