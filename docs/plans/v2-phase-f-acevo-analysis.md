# Fase F — Assetto Corsa EVO: análisis de app nativa

> Objetivo: análisis extenso y viabilidad de Vantare como app nativa en Assetto Corsa EVO.
> Entregable: documento de viabilidad + prototipo si la API lo permite.
> Estado: planificado a alto nivel.

## Contexto

Assetto Corsa EVO es muy reciente y el soporte para mods/apps nativas aún está madurando. No se asume que haya una API estable al inicio de esta fase.

## Implementaciones

| # | Implementación | Estado |
|---|---|---|
| 1 | Revisión de documentación oficial de AC EVO sobre mods/apps | `pending` |
| 2 | Investigación en comunidad (forums, Discord, GitHub) de ejemplos de apps nativas | `pending` |
| 3 | Análisis de arquitectura: ¿sigue el modelo de AC1? ¿nuevo sistema? ¿UDP/MQTT? | `pending` |
| 4 | Prototipo mínimo si hay API usable | `pending` |
| 5 | Documento `docs/ACEVO-NATIVE-APP-FEASIBILITY.md` | `pending` |
| 6 | Decisión: implementar, esperar, o descartar para esta fase | `pending` |

## Preguntas a responder

- ¿AC EVO expone una API de apps web como AC1?
- ¿Permite cargar HTML/CSS/JS custom dentro del juego?
- ¿Qué canales de comunicación ofrece para telemetría? (shared memory, UDP, files, websocket)
- ¿Hay ejemplos funcionales de apps nativas de terceros?
- ¿Qué limitaciones de seguridad/performance existen?

## Posibles resultados

1. **API usable**: se crea un prototipo funcional y se integra como release paralela.
2. **API inmadura o inexistente**: se deja solo el documento de análisis y se pospone la implementación a una fase futura.
3. **Modelo muy distinto**: se reevalúa si Vantare dentro de AC EVO tiene sentido o es mejor mantener overlay externo.

## Criterios de cierre

- [ ] Documento de viabilidad completo.
- [ ] Prototipo funcional si aplica.
- [ ] Decisión documentada sobre siguiente paso.
- [ ] CHANGELOG actualizado con hallazgos.
