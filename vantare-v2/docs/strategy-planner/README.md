# Strategy Planner — índice documental

Este índice enruta documentación; no contiene estado operativo ni elige el
siguiente trabajo.

## Entrada

1. Abre la issue de Linear asignada y verifica alcance, rama, base y destino.
2. Lee el
   [handoff de Strategy Planner](../vantare-program/handoffs/strategy-planner.md)
   solo como continuidad técnica y evidencia.
3. Lee el
   [ADR de dominio y ownership](../adr/0006-strategy-planner-unified-domain-and-ownership.md).
4. Ejecuta únicamente el plan que enlace la issue de Linear.

## Contratos estables

- [`str-02-contract.md`](str-02-contract.md): unidades y estados canónicos.
- [`projection-ownership.md`](projection-ownership.md): ownership de
  proyecciones y límites entre módulos.
- [`str-03-repository.md`](str-03-repository.md): persistencia local.
- [`str-04-application-service.md`](str-04-application-service.md): comandos,
  dirty state y undo/redo.

Los documentos `str-00` a `str-09`, matrices y evidencias conservan contexto
de sus cortes. No autorizan por sí solos una rama, un plan ni una transición.
