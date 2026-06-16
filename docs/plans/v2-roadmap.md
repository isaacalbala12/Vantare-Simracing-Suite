# Vantare Overlays v2 — Plan General

> Estado: aprobado por Isaac. Última actualización: 2026-06-15.
> Stack: Go + Wails v3 alpha + React 19 + Tailwind.
> Sim base de la alpha: Le Mans Ultimate.

## Resumen de fases

| Fase | Nombre | Objetivo | Entregable |
|---|---|---|---|
| **A** | Cierre Alpha LMU | Producto usable de extremo a extremo para Le Mans Ultimate | `v0.2.0-alpha.1` |
| **B** | Multisimulador | Soportar Assetto Corsa, refactorizar LMU a adapter, añadir iRacing | `v0.3.0-alpha.1` |
| **C** | AC como app nativa | Vantare como app nativa dentro de Assetto Corsa 1 | `v0.4.0-alpha.1` |
| **D** | Personalización avanzada | Overlay profesional para broadcast | `v0.5.0-alpha.1` |
| **E** | Cuenta y comunidad | Auth, sync, Community Layouts, calendario Discord | `v0.6.0-alpha.1` |
| **F** | AC EVO análisis | Análisis extenso y viabilidad de app nativa en Assetto Corsa EVO | Documento + prototipo si aplica |

## Estimación tentativa

| Fase | Estimación | Notas |
|---|---|---|
| A — Cierre Alpha LMU | 1–2 semanas | Base técnica ya montada. Lo más pesado es el editor visual + demo mode. |
| B — Multisimulador | 2–3 semanas | AC shared memory similar a LMU. iRacing es el más incierto. |
| C — AC app nativa | 2–4 semanas | AC1 tiene API de apps web conocida. AC EVO se trata en Fase F. |
| D — Personalización avanzada | 2–3 semanas | Muchas features pequeñas y repetitivas. El motor de reglas es lo más complejo. |
| E — Cuenta y comunidad | 3–4 semanas | Supabase setup rápido, pero sync + marketplace + Discord requieren backend real. |
| F — AC EVO análisis | 1–3 semanas | Depende de madurez de API de apps nativas. Puede quedar solo como documento. |

**Total estimado: 11–19 semanas (~3–5 meses)** sin contar buffer.

Buffer recomendado: +20% por imprevistos, bugfixing, testing y releases.

## Principios guía

1. Cerrar **un solo simulador** (LMU) antes de abrir multisimulador.
2. Cada fase debe tener un **entregable instalable** con version tag en GitHub.
3. No implementar mockups: cada feature debe funcionar con datos reales o demo mode fiable.
4. Tests Go + frontend como requisito para cerrar cada fase.
5. Firma de certificado queda **fuera del plan** hasta que el proyecto genere ingresos o usuarios.

## Dependencias externas

| Fase | Dependencia | Riesgo |
|---|---|---|
| B | Acceso a Assetto Corsa para testear shared memory | Bajo: existe instalación local |
| B | Acceso a iRacing para testear iRSDK | Medio: requiere suscripción activa |
| C | API de apps nativas de AC1 | Bajo: documentada por comunidad |
| F | API de apps nativas de AC EVO | Alto: muy reciente, poca documentación |
| E | Proyecto Supabase + credenciales | Bajo: setup de ~1 hora |

## Links

- Fase A — detalle: `./v2-phase-a-lmu-alpha.md`
- Fase B — detalle: `./v2-phase-b-multisim.md`
- Fase C — detalle: `./v2-phase-c-ac-native.md`
- Fase D — detalle: `./v2-phase-d-personalization.md`
- Fase E — detalle: `./v2-phase-e-community.md`
- Fase F — detalle: `./v2-phase-f-acevo-analysis.md`
- Features canónicas: `C:/Users/isaac/Desktop/trabajo/Proyectos/Overlays/Features por desarrollar.md`
- Roadmap original día a día: `C:/Users/isaac/Desktop/trabajo/Proyectos/Overlays/Roadmap Dia a Dia - Vantare Overlays.md`
