# ADR-0002: Stack y workflow optimizados para desarrollo con agentes

- Status: Accepted
- Date: 2026-06-19
- Deciders: Product (isaac)

## Contexto

El proyecto se desarrolla con fuerte apoyo de agentes LLM. El usuario no quiere depender de revisar codigo complejo linea por linea. Necesita controlar el proyecto mediante:

- cambios pequenos,
- tests,
- builds,
- checklists,
- prompts precisos,
- reviewers adversariales,
- documentacion viva.

## Decision

El stack principal de Vantare v2 es:

- Go para backend local, servicios, telemetria, CLI, filesystem, ventanas y logica estable.
- TypeScript/React para UI, Hub, Overlays Studio y render visual.
- SQLite/PostgreSQL solo cuando el producto lo necesite.
- Python solo para scripts, prototipos o herramientas offline.
- Rust solo para modulos aislados de rendimiento critico y con decision explicita.

El workflow principal es:

```text
orquestador -> prompt worker -> implementacion pequena -> reviewer -> correccion -> commit -> docs
```

## Por que Go

- Simple y explicito.
- Buen compilador.
- `gofmt`.
- Tests rapidos.
- Menos patrones magicos.
- Buen encaje para servicios locales y telemetria.

## Por que TypeScript

- Necesario para UI moderna.
- Buen ecosistema React/Wails.
- Permite tests de componentes.
- Los modelos LLM conocen bien el stack.

## Por que no Rust-first

Rust es potente, pero aumenta coste cognitivo y riesgo para agentes. Se reserva para modulos concretos donde el rendimiento lo justifique.

## Por que no Python-first

Python es util para scripts, pero deja demasiados errores a runtime para la base principal de producto.

## Consecuencias

- Se prioriza codigo aburrido, testeable y facil de revisar por agentes.
- Los cambios grandes deben dividirse.
- Las dependencias nuevas requieren justificacion.
- La documentacion de control es parte del producto.

## Alternativas rechazadas

| Opcion | Motivo |
|---|---|
| Rust como base | Mayor riesgo de complejidad para agentes |
| Python como base | Menos garantias estaticas para producto local |
| Microservicios | Sobreingenieria para una app local |
| Frameworks nuevos frecuentes | Aumentan superficie de bugs y revision |
