# ADR 0095 — experimento de transporte incremental Overlay V2

2026-09-06, ISA-996. Autorizado por Isaac: libertad para experimentar con la
arquitectura respetando las premisas de Telemetría V2. Diseño experimental;
**implementado localmente detrás de flag OFF, no integrado**. Sustituye el bloqueo
anterior de autorización para este experimento, no los gates de promoción.

## Invariantes

Gate obligatorio de aceptación: comprobación visual previa de los seis widgets
y monitor nativo de foco/visibilidad cada100ms que cubra el intervalo completo.
Ventana oculta/minimizada/cloaked/fuera de pantalla, pérdida de foco del juego,
fallo del monitor o hueco temporal invalidan toda la corrida. CSV conserva
`overlayNativeVisible`; evidencia JSON independiente. El chequeo de montaje,
datos live y secuencia creciente sigue siendo necesario, nunca suficiente.

**Corrección de evidencia 16:56:** E19/E20 medían DOM vivo sin garantizar HUD
visible. Computer Use confirmó que el overlay sólo apareció al activar LMU.
Los números de abajo son diagnósticos NO aceptables como ahorro del HUD visible.
Se conserva el experimento OFF y se exige corregir el banco antes de repetir.

Adaptador específico de simulador → Core canónico/commit → proyección común
→ widgets puros. Ninguna regla LMU se mueve al frontend. Se mantienen datos,
calidad, cadencias, identidad, frescura, atomicidad, errores explícitos y
límites. La meta sigue siendo <2% CPU máquina con los mismos seis widgets,
sin trasladar un coste injustificado a memoria/GPU. No es una garantía.

## Decisión y microcortes

1. Medir la alternativa de dividir JSON ya serializado antes de conectarla.
   E17 es un prototipo **sólo en un archivo `_test.go`**, sin rutas productivas.
2. Preparar una representación interna por secciones desde la proyección
   tipada, antes del JSON completo. Reutilizar el scheduler existente; no crear
   otra autoridad de telemetría ni un segundo renderer. La copia/inmutabilidad
   pública y los consumidores HTTP/OBS siguen protegidos por tests de paridad.
3. Añadir codec incremental sólo al adaptador desktop, con versión explícita
   y control A/B en la misma build. Retener ruta completa como control y
   recuperación explícita, no mezclar silenciosamente contratos incompatibles.
4. Reconstruir, validar y publicar el update completo en una sola operación
   antes del store existente. No emitir una actualización React por sección.
5. Tests de regresión, review personal, build licenciada y A/B intercalado
   del árbol completo. Capturas de hasta5min por condición; perfil idéntico.
   Conservar sólo una mejora repetible sin regresiones de producto.

## Frontera de estado y fallos

- `SectionBuildMask` describe el tick, **no el ACK del consumidor**. Si se
  saltan frames por latest-wins, enviar sólo la última máscara perdería datos.
  La entrega debe contener todos los cambios frente a la base confirmada por
  ese consumidor, con identidad de sesión/época/base explícita.
- Bootstrap y nueva generación reciben frame completo. Reconectar o no tener
  una base válida exige resincronización completa; nunca inventar secciones.
- Replay de una entrega pendiente es idéntico y no adelanta la base. Una
  entrega nueva depende de su ACK. Cada ventana mantiene estado independiente.
- Fuente sin frame, cambio de sesión/época y borrados invalidan/reemplazan lo
  que corresponda explícitamente: omisión no equivale a null, array vacío ni
  eliminación. Los cambios de frescura también son contenido.
- Validar sobre, base y update reconstruido antes de confirmar o cambiar la
  base. Una sección inválida no deja aplicada media entrega. Mantener límites
  del mensaje y del frame reconstruido; un delta pequeño no permite expansión
  ilimitada. Retención acotada, sin cadena histórica de deltas.
- Eliminar toda base/entrega al cerrar su generación. Nunca reutilizar datos
  de otra ventana, sesión o consumidor retirado.

## E17: coste aislado de dividir JSON

Windows amd64, Ryzen7 3700X, seis repeticiones de200ms por brazo y tamaño.
Fixtures existentes20/44/104 coches: no sesiones LMU ni CPU máquina.
Escenario deliberadamente favorable al delta: sólo revision/sequence cambian.
Control serializa el sobre de una respuesta completa; prototipo emite sólo
patch (sin sobre final). No representa coste end-to-end ni una sesión real.

| 44 coches | Tiempo por operación | Bytes emitidos | Asignaciones |
|---|---:|---:|---:|
| Sobre completo | 169–176µs | 24.464 | 2 |
| Dividir conservando base parseada | 217–222µs | 66 | 84 |
| Parsear base y siguiente | 433–452µs | 66 | 161 |

La primera alternativa añade CPU/asignaciones en Go incluso en este caso
favorable. No se elige como arquitectura final: siguiente microcorte evita
parsear de nuevo en origen. Esto **no demuestra** que el balance end-to-end
sea peor ni cuánto ahorrará la representación tipada; deberá medirse.
Sin benchstat instalado no se declara p-value ni significación estadística.
LMU quedó abierto e intacto durante los microbenchmarks; no es un laboratorio
sin carga externa. Las cifras son diagnóstico de operaciones, no aceptación.
Crudos `C:/tmp/isa996-e17-final-bench.log`. RED por sección sin cambios
retransmitida en `...e17-red.log`; GREEN en `...e17-green.log` y benchmark.
Test de roundtrip cubre sustitución de colección, null, eliminación y metadata;
no sustituye tests de sesión/replay/reconexión, todavía pendientes del codec real.

## Estado y rollback

### E18/E19 y siguiente E20

E18 codifica campos tipados sin parsear JSON previo. Aislado44:132,6–145,2µs,
104alloc frente a114,8–122,5µs/64alloc de marshal. E19 negocia `sections:1`
sólo cuando `VANTARE_OVERLAY_SECTIONS=1`; HTTP/OBS y clientes anteriores siguen
con frame completo. Cada entrega compara contra su base, no contra tick mask.
Base incorrecta provoca nueva generación ACK0 y bootstrap. Frame reconstruido
mantiene máximo72KiB, validación y freeze antes del store; no cadena de parches.

Primera pareja exploratoria real, misma build
`2af187d33afcbc2fd9a418732202c39d13c25127134e4117de0b2ef469398531`,
seis widgets L1, LMU live62/HUD Full/boxes;60s tras30s de calentamiento:

| Ruta | CPU máquina | Privada MiB | GPU agregada |
|---|---:|---:|---:|
| Completa | 2,70367% | 385,650 | 0,19028% |
| Incremental | 2,45388% | 408,962 | 0,18455% |

Crudos `C:/tmp/isa996-e19-full-1/` y `...e19-sections-1/`.26/27 muestras,
cierre limpio y SHA estable. Incremental5772/5773 snapshots, control0/5468.
N1: no aceptación ni objetivo<2 acreditado; memoria mayor. Go completo PASS,
frontend409 archivos/3183 tests PASS, typecheck/lint/build PASS.
E20 prueba evitar revalidar únicamente arrays ya validados/inmutables heredados
por identidad de la base privada. Toda colección recibida de nuevo se valida;
tests protegen reemplazos inválidos y atomicidad multi-evento. A/B pendiente.

E16 sigue siendo la referencia anterior. E17 no cambia producto, contrato,
cadencias, dependencias ni binario. Antes de elegir el siguiente candidato
se compararán wire, CPU de ambos extremos, RAM/GPU y paridad. No promoción,
release ni cambios de seguridad del sistema autorizados por este ADR.

Checks del microcorte: `go test ./...` PASS (`C:/tmp/isa996-e17-go-all.log`),
gofmt, digest regenerado y `git diff --check` PASS. Sin cambios frontend:
no se repiten su suite/build ni una captura LMU para un prototipo no conectado.
Base659b2c57, HEAD1c835bc0, rama `vantareapp/isa-996-cierre-rendimiento`;
sin commit/push/PR/CI nuevo ni promoción. Se conserva el trabajo local previo.
