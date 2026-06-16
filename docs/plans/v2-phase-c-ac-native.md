# Fase C — Assetto Corsa como app nativa

> Objetivo: que Vantare funcione como app nativa dentro de Assetto Corsa 1.
> Entregable: `v0.4.0-alpha.1`
> Estado: planificado a alto nivel.

## Contexto

Assetto Corsa 1 permite apps personalizadas que se renderizan dentro del juego mediante un Chromium embebido. Las apps suelen vivir en `apps/python/NombreApp/` con un `manifest.json` y un `index.html`.

## Implementaciones

| # | Implementación | Estado |
|---|---|---|
| 1 | Investigación técnica de AC apps | `pending` |
| 2 | Prototipo de app AC mínima | `pending` |
| 3 | Adaptar frontend para renderizar en contenedor AC | `pending` |
| 4 | Comunicación AC app ↔ backend local | `pending` |
| 5 | Empaquetar app AC e instalarla | `pending` |
| 6 | Documentación `docs/AC-NATIVE-APP.md` | `pending` |
| 7 | Tests y smoke test en AC | `pending` |
| 8 | Release v0.4.0-alpha.1 | `pending` |

## Preguntas abiertas

- ¿Se entrega como app separada descargable o integrada en el instalador principal?
- ¿El backend Vantare debe seguir corriendo como proceso aparte o se comunica todo por HTTP local?
- ¿Qué widgets deben estar disponibles en modo app nativa?

## Criterios de cierre

- [ ] Vantare se renderiza dentro de AC1.
- [ ] Recibe telemetría de AC1.
- [ ] Funciona al menos el widget de standings y relative.
- [ ] Documentación de instalación para usuarios.
- [ ] CHANGELOG actualizado.
- [ ] Tag `v0.4.0-alpha.1` y release.
