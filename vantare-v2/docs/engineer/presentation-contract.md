# Contrato canónico de presentación Engineer v1

## Propósito

`internal/engineer/presentation` transforma una `messagepolicy.Decision` ya
aprobada en la única representación que pueden consumir notificaciones,
subtítulos y audio futuro. No consulta telemetría, no decide mensajes, no hace
I/O y no sintetiza audio.

El orden productivo es invariable:

1. policy admite y selecciona una decisión;
2. presentation valida versión, intent, familia, prioridad, TTL, locale y
   parámetros;
3. si la presentación falla, la entrega termina sin ACK `started`, sin
   notificación y sin audio;
4. si pasa, visual y voz reciben la misma presentación inmutable;
5. Wails y SSE publican el mismo `EngineerNotification`.

## Contrato v1

Cada presentación contiene:

- versión `1`;
- intent canónico;
- locale exacto (`es`, `en`, `it`, `pt-BR`);
- familia, prioridad y TTL de la decisión admitida;
- rol y canal (`spotter` o `engineer`);
- severidad (`info`, `warning` o `critical`);
- texto visual y texto preparado para voz.

El locale productivo por defecto es español. Solo puede configurarse antes de
`EngineerService.Start`; un locale desconocido impide arrancar el servicio.
Cambiar idioma nunca cambia intent, prioridad, familia, tiempos, policy ni
evidencia.

## Catálogo cerrado

Los cuatro idiomas contienen exactamente los mismos 20 intents aprobados por
ENG-05:

| Familia | Intents |
| --- | --- |
| Spotter | `car_left`, `car_right`, `still_there`, `clear_left`, `clear_right`, `all_clear`, `three_wide` |
| Fuel | `half_tank`, `one_litre`, `two_litres`, `laps_four`, `laps_three`, `laps_two`, `laps_one`, `pit_now` |
| Penalties | `count_increased` |
| Laps | `completed` |
| Timings | `gap_report` |
| Pit stops | `entry`, `exit` |

Los nombres completos siguen siendo los definidos por `messagepolicy`; esta
tabla solo omite el prefijo de familia para facilitar la lectura. La sanción es
deliberadamente neutral: comunica que existe una penalización pendiente, sin
inventar drive-through, stop-and-go ni otra clase.

## Límites y fallo cerrado

- intent y locale: máximo 128 bytes, no vacíos y sin NUL;
- payload: máximo 8 pares y 512 bytes totales;
- clave o valor de payload: máximo 128 bytes, no vacío y sin NUL;
- texto de catálogo: máximo 256 bytes, no vacío y sin NUL;
- claves de payload permitidas por intent; cualquier otra se rechaza;
- ningún intent o locale desconocido usa la clave raw como fallback;
- el catálogo se valida completo al construir el resolver.

La presentación no expone subject, identidad, telemetría, rutas, dispositivos
ni IDs de terceros. Los parámetros se validan, pero este corte no introduce
pluralización ni plantillas especulativas.

## Audio y compatibilidad

ENG-07 sigue siendo cache-only. El lookup canónico usa `VoiceText` para que el
futuro TTS nunca pronuncie un intent interno. Mientras se migra la caché, existe
un fallback de lectura al archivo histórico nombrado por intent; no sintetiza,
descarga ni convierte contenido. El traductor español antiguo queda reservado
al harness legacy y no participa en producto.

## Verificación

- tabla 20 intents × 4 locales;
- paridad exacta de catálogo y metadatos;
- penalty neutral y roles/canales correctos;
- unknown/NUL/límites fail-closed;
- fallo antes de `started`;
- paridad byte a byte Wails/SSE;
- lifecycle y preempción ENG-06 repetidos;
- fuzz, benchmark, vet y gates Engineer/Server/Telemetry/global.

## Rollback

Revertir el commit de ENG-07 restaura el traductor y lookup anteriores. No hay
migración de datos, dependencia nueva ni cambio en Telemetry Core. No debe
eliminarse la caché legacy hasta que un corte TTS posterior migre sus assets.
