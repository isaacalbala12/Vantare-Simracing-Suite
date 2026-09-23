# ISA-1347 — autoridad meteorológica

La observación de Isaac es correcta: `/rest/watch/sessionInfo` ofrece meteorología. El problema no es inexistencia general de una fuente, sino campos todavía sin conectar y unidades pendientes de demostrar. Revisión independiente GPT-6 del 23/09/2026.

| Dato | Fuente admitida | Conversión | Evidencia y límite |
| --- | --- | --- | --- |
| Aire/pista | REST `ambientTemp` / `trackTemp` | Celsius, contrato previo ISA-1106 | Conserva TTL y calidad independientes. |
| Humedad de pista | REST `averagePathWetness` | Fracción ×100 | [Schema de LMUSessionTracker](https://github.com/mbeader/LMUSessionTracker/blob/master/Common/Json/Schema/schema-SessionInfo.json) declara 0–1. No es humedad del aire ni probabilidad de lluvia. |
| Lluvia | SHM `ScoringInfo.mRaining` | Severidad 0–1 ×100 | [Header fijado](https://github.com/TheIronWolfModding/rF2SharedMemoryMapPlugin/blob/48aa12dbb68849923870acd8e68044c46c3d83eb/Include/InternalsPlugin.hpp#L423), corroborado por [transcripción SDK LMU](https://github.com/s-victor/pyLMUSharedMemory/blob/master/lmu_data.py). `pack4`, long32, pointer8: offset relativo220, absoluto1852. Fixture LMU1.3 SHA `959c51421529c6157371678d8db9bcbbdc8ab3780bd5557828f2bc0d2225e5ff` contiene cero. Pruebas sintéticas no-cero prueban lectura, rango y recorrido, no una captura de lluvia física. |
| Viento | No admitido aún en km/h | Ninguna | REST `windSpeed` es objeto `velocity,x,y,z` según [modelo](https://github.com/mbeader/LMUSessionTracker/blob/master/Common/LMU/Velocity.cs). No documenta unidad; los headers nativos dicen “wind speed” sin unidad. No se aplica ×3,6 por analogía. |
| Dirección/presión | Sin autoridad demostrada | Ninguna | No deducir puntos cardinales desde ejes de circuito ni presión desde otros campos. |

`raining` REST se documenta como número no negativo, sin máximo ni unidad: no se usa como porcentaje. Las [capturas documentadas por race-engineer](https://github.com/Alexander-Gro/race-engineer/blob/main/docs/03-LMU-INTEGRATION.md) confirman presencia de los campos, no sus unidades. `/rest/sessions/weather` es configuración/previsión; no se publica como observación actual.

La lluvia nativa sigue la frescura SHM; la humedad REST sigue su TTL de 2s y el corte de sesión. Sin coches activos no se publica lluvia desde bytes del menú. El sanitizador conserva ahora el campo admitido sin recuperar los bytes privados excluidos. Las capturas sanitizadas antiguas no contienen evidencia meteorológica no-cero.

**Verificación física pendiente:** capturar sesión activa con viento y lluvia no-cero, correlacionar REST/SHM e interfaz de LMU, anotar versión y unidades. Hasta entonces viento es ausente, nunca cero ficticio. Esta limitación impide afirmar que todos los datos opcionales estén certificados para publicación.

Bandera: el parser REST preexistente acepta códigos numéricos candidatos 2–5, pero el modelo REST público declara `yellowFlagState` como cadena (`NONE` observado). No se certifica amarillo REST sin una captura positiva correlacionada. Esta entrega no inventa equivalencias entre enumeraciones.
