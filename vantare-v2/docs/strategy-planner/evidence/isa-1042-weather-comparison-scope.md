# ISA-1042 — comparador de clima a distancia fija

Base `686b1c23`, rama `vantareapp/isa-1042-weather-comparison-scope`.
Ejecución personal; continuación del límite registrado en `isa-1042-timed-horizon.md`.

## Corrección

El comparador calculaba de nuevo vueltas desde duración con pérdida de boxes cero.
RED: 10 minutos, 60 s/vuelta, tanque 6 L y parada de 90 s; plan principal evaluado
9 vueltas, comparador 10. Ahora recibe las 9 vueltas del plan activo y todos los
escenarios recorren esa distancia. Se elimina el cálculo temporal duplicado.

Resultado tipado: `comparisonBasis=fixed_distance`, `comparisonLaps`. El cliente
exige base reconocida y vueltas enteras positivas; prueba rechazo de base ausente,
desconocida, cero y fracción. El panel muestra distancia y alcance ES/EN/PT/IT.
Su prueba pasó de RED (aviso ausente) a GREEN; el recorrido de guardado/cálculo
existente y parser también pasan.

## Límite explícito

Se compara coste sobre una misma distancia. No se implementa aquí horizonte
por escenario, optimización temporal robusta ni recálculo live. El comparador
no modifica el plan principal. La predicción de llegada en carreras por tiempo
con escenarios de clima sigue pendiente y se muestra en la interfaz.

## Revisión y checks

Correctitud: vueltas proceden de la autoridad ya evaluada; no segundo estimador
con boxes cero. Simplicidad: se elimina aritmética duplicada y se añaden dos
campos de alcance. Arquitectura/seguridad: sin nuevo solver, schema persistido,
fuentes o dependencias. Coste: no se repite optimización temporal por escenario.

Regresión Go y frontend focal PASS. Build, tipos, lint y Go completo PASS.
Frontend completo: 416 archivos / 3256 tests PASS (275.55 s, exit 0), con
ruido AbortError de Happy DOM en teardown. Digest/diff check PASS. Logs locales
`C:/tmp/vantare-isa1042-weather-*-final.log` y logs de build/typecheck/lint. Verificación manual: calcular con escenarios y comprobar
el aviso de distancia fija junto con su número de vueltas. No prueba Wails
física ni calidad empírica de predicción. Originales y LMU intactos.
Sin push, PR, CI remota, merge, promoción o release.
