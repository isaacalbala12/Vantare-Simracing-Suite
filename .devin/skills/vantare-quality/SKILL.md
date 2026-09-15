---
name: vantare-quality
description: 'Workflow de calidad anti-slop para Vantare. Usar cuando se trabaje en el sistema de calidad (tools/quality/), se interpreten hallazgos de staticcheck/govet/deadcode/knip/dependency-cruiser/jscpd, o se vaya a aceptar un baseline o una excepcion.'
---

# Vantare quality: workflow para futuras tareas

Este skill describe el flujo para trabajar con el sistema de calidad anti-slop
de Vantare. El sistema vive en `tools/quality/` y usa un ratchet por identidad:
los hallazgos NUEVOS bloquean, los RESOLVED son informativos, y los baselines
solo se aceptan con `baseline --confirm` (nunca en CI).

## Flujo

1. **Entender scope y consumidores.** Lee `tools/quality/scope.json` antes de
   tocar nada. El alcance declarado es `vantare-v2` (Go + frontend). Todo lo
   demás está clasificado como fuera de alcance pero VISIBLE (no oculto).
   Identifica qué unidades y entradas (producción vs dev/test) toca tu cambio.

2. **Baseline.** Ejecuta `python3 tools/quality/vantare_quality.py check` para
   ver el estado actual contra el baseline. Si necesitas el análisis completo,
   usa `audit` (analiza sin escribir baselines; NUNCA en CI). Un baseline se
   acepta solo con `baseline --confirm` y registra el SHA base como procedencia.

3. **Cambios acotados.** Haz el cambio mínimo. No toques `tools/quality/**`,
   baselines, configs de analizadores ni ignores en el mismo PR que toca
   producto: si lo haces, `policy_changed=true` y el agregado pasa a
   `REVIEW_REQUIRED` (exit ≠ 0).

4. **Pruebas.** Si tu cambio es de tooling, añade tests en
   `tools/quality/tests/`. Los tests que no necesiten analizadores reales
   usan la función pura `classify_findings`. Ejecuta
   `python3 -B tools/quality/tests/test_ratchet.py` y
   `python3 -B tools/quality/tests/test_negative.py`.

5. **Delta de calidad.** Ejecuta `check` de nuevo. El ratchet compara
   identidades con semántica de multiconjunto: un hallazgo NUEVO bloquea
   aunque el total no suba, y una segunda aparición de la misma identidad
   en el mismo archivo también es NUEVO. MOVED (misma regla+mensaje, distinto
   path) bloquea llevando el agregado a `REVIEW_REQUIRED` (exit ≠ 0): un
   traslado legítimo no se castiga como defecto nuevo, pero tampoco pasa solo.
   Los hallazgos exceptuados (ver `exceptions.json`) se listan como excepción
   activa en cada ejecución.

6. **Revisión exigida por riesgo.** Se exige revisión externa cuando el cambio
   implica: eliminaciones amplias de código, cambios arquitectónicos, concurrencia,
   persistencia, o modificaciones de las propias reglas de calidad. El agregado
   `REVIEW_REQUIRED` sale con exit ≠ 0 para forzar esa revisión.

7. **Informe.** `python3 tools/quality/vantare_quality.py report` produce
   Markdown + JSON con el resumen de la última ejecución.

## Cuándo NO encadenar modelos

Una tarea trivial (añadir un export, corregir un hallazgo puntual, actualizar
una versión de herramienta) NO debe convertirse en una cadena costosa de varios
modelos. Ejecuta `check`, haz el cambio, verifica, reporta. Si el cambio toca
reglas, baselines o arquitectura, ahí sí exige revisión externa.

## Protecciones explícitas

El sistema NUNCA sugiere eliminar: validación de datos externos, IPC, red,
disco, autenticación, licencias, autorización, concurrencia, persistencia,
timeouts, cancelación, limpieza de recursos ni manejo de errores. Los tipos
estáticos no demuestran validez en runtime. Ver `docs/quality/anti-slop.md`
para la política completa.
