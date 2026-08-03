# Contrato de producto propuesto — Telemetría

Estado: contrato propuesto para review técnico. Puede guiar microcortes
autónomos en ramas de issue cuando sus dependencias estén cerradas; no autoriza
promoción a `nightly`. Nombre visible: **Telemetría**. Pregunta guía:
**«¿cómo puedo ser más rápido?»**.

## Resultado de usuario

Después de una sesión, el conductor puede abrir una galería local, elegir una vuelta propia y una referencia comparable y ver, en menos de un minuto, tres oportunidades priorizadas. Cada oportunidad indica intervalo de distancia, delta, canales, evidencia, versión de regla y confianza. Después puede validar la lectura en un workspace avanzado sin perder el contexto.

## Entrada, ownership y privacidad

- La galería muestra archivos LMU descubiertos, grabaciones Vantare de otros simuladores e importaciones. Descubrir/indexar no mueve el original; **Copiar a biblioteca** es una acción opcional y reversible.
- La sesión indexada conserva `sourceKind`, ruta redacted/ID local, hash, tamaño/mtime, parser/version, sim, track, vehículo, fechas, calidad y consentimiento. Una importación fallida es visible con causa, sin modificar el original.
- Los datos se quedan locales por defecto. Exportar CSV o paquete Vantare abre una revisión del contenido exacto; compartir requiere acción explícita. Notas/correcciones son overlay local, nunca sobrescriben raw.
- La demo gratis usa datos sanitizados. El acceso a archivos propios de Pro se decide por entitlement local y explica el bloqueo sin fingir análisis.

## Flujo principal

1. **Galería:** buscar, filtrar y previsualizar sesiones por sim, pista, vehículo, fecha, origen y estado de importación.
2. **Resumen:** seleccionar vuelta propia + referencia; mostrar elegibilidad, mejor vuelta, consistencia, teórica etiquetada y tres pérdidas priorizadas.
3. **Workspace:** profundizar con dos vueltas primarias, hasta cuatro trazas, mapa, cursor, gráfico, tabla, canal y tarjetas de curva sincronizados por distancia.
4. **Aprendizaje:** guardar una nota o corrección no destructiva, exportar y marcar una acción concreta a comprobar en la siguiente tanda.

## Reglas funcionales

| Área | Contrato |
|---|---|
| Comparación | Requiere sim, track y vehículo compatibles y calidad suficiente. Alinea por distancia cuando el contrato de distancia existe; de lo contrario explica el estado y no muestra delta espacial falso. Dos vueltas son primarias; cuatro trazas máximas visuales. |
| Canales | El selector incluye todos los canales disponibles, categorías, buscador, favoritos, unidades/provenance/quality y presets/workspaces. Derivados oficiales versionados; no hay editor de fórmulas v1. |
| Mapa/trazada | Muestra línea y cursor solo con posición/geometría validada. Curvas detectadas se etiquetan con fuente/confianza; nombre no verificado usa “Zona N”. |
| Tabla | Filas por zona/curva y columnas configurables: delta, velocidad, freno, gas, dirección, marcha, referencia, calidad y nota. No convierte missing/stale/invalid en cero. |
| Tarjetas | Cada tarjeta cubre una curva/zona y separa observación, regla, acción, limitación y confianza. Ejemplo: “frenas 9 m antes que la referencia en 128–176 m; señal brake fresca; prueba retrasar progresivamente el punto, no más presión”. |
| Vuelta teórica | Suma mejores intervalos únicamente bajo algoritmo/version y elegibilidad declarados; queda etiquetada como estimación, no tiempo alcanzable garantizado. |
| Setup | Puede mostrar diferencias y marcar confusor; no atribuye causalidad entre setup y ganancia/perdida. |
| Recomendación | Motor determinista es autoridad y debe exponer inputs/regla/versión. Un LLM futuro puede traducir o responder preguntas sobre ese paquete, no crear hechos, puntuaciones ni acciones sin evidencia. |

## Estados honestos

`Sin fuente`, `Indexando`, `Importada`, `Importación incompatible`, `Datos incompletos`, `Comparación no compatible`, `Distancia pendiente`, `Sin referencia comparable`, `Demo`, `Pro requerido`, `Exportación preparada`, `Error recuperable`. Ningún estado usa series sintéticas, mapa de ejemplo ni falsa comparación.

## Fuera de alcance inicial

No hay lectura live propia, coaching en carrera, editor de fórmulas, inferencia causal de setup, sincronización cloud, comunidad automática, publicación de sesiones, AI como autoridad, ni borrado de originales. La reproducción/vídeo sincronizado se estudia después de un contrato de derechos, performance y almacenamiento.
