# Testing Center — diagnóstico local v1

Estado: TAU-03 / ISA-215 implementado en rama de issue, sin wiring productivo,
red, persistencia ni UI nueva.

## Propósito y frontera

`internal/testingcenter/diagnostic` prepara un paquete efímero para un futuro
reporte del Testing Center. Complementa el diagnóstico general de ISA-104; no
lo sustituye ni vuelve a recopilar perfiles, ajustes, telemetría o archivos.

El corte acepta únicamente metadata técnica cerrada y hasta 100 entradas de
log. No lee el sistema de archivos, no sube datos y no conserva el paquete. El
formulario, el consentimiento y el transporte pertenecen a TAU-04.

## Contrato permitido

- versión `testing-center.diagnostic.v1`;
- fecha UTC proporcionada por el backend;
- versión de app limitada;
- canal `nightly` o `testers`;
- OS y arquitectura cerrados;
- módulo de una enumeración cerrada;
- código de error y código de log como tokens técnicos limitados;
- log con offset relativo, origen, nivel y detalle sanitizado.

Un módulo, código, OS o arquitectura desconocidos pasan a `unknown`. Un origen,
nivel, offset o canal inválidos no pueden cruzar como texto: el log se omite o
la preparación falla cerrada según sea un dato descriptivo o de autoridad.

## Límites

| Límite | Valor |
| --- | ---: |
| Payload final | 64 KiB |
| Logs crudos inspeccionados | 1.000 |
| Logs incluidos | 100 |
| Entrada cruda por log antes de redacción | 4 KiB |
| Mensaje sanitizado por log | 512 B |
| Offset relativo máximo | 24 h |

El documento incluye contadores de logs recibidos, incluidos y omitidos, así
como valores redactados y mensajes truncados. Si el JSON final excede el
límite, se retiran logs desde el final y el descarte queda contabilizado.

## Redacción

Antes de serializar se eliminan credenciales/cookies, campos habituales de
secretos e identidad, Bearer tokens, URLs, rutas Windows/UNC/POSIX conocidas,
emails, JWT y tokens largos. Las rutas con espacios consumen el resto de su
línea para no dejar fragmentos del nombre local.

El texto libre no puede prometer anonimización semántica perfecta: una frase
que mencione un nombre sin email, ruta o clave reconocible podría sobrevivir.
Por ello TAU-04 debe mantener logs desactivados por defecto, exigir opt-in
separado y mostrar el payload completo antes de enviarlo. No se permite envío
automático del texto sin esa revisión.

## Preview, transporte y borrado

`Draft.Preview()` y `Draft.TransportPayload()` proceden de la misma secuencia de
bytes. El preview expone tamaño y SHA-256 de esos bytes. `Discard()` sobrescribe
y elimina la copia propiedad del draft; después, preview y transporte devuelven
`ErrDiscarded`.

El descarte no puede revocar copias que un consumidor ya hubiera pedido. TAU-04
debe destruir también su estado React y no persistir el draft automáticamente.

## Evidencia

- tests de allowlist, autoridad, determinismo, límites y descarte;
- fixture adversarial con Bearer, JSON secrets, URL/query, email, JWT,
  rutas Windows/UNC/POSIX y nombres con espacios;
- preview y transporte comparados byte a byte, con SHA-256 recalculado;
- repetición focal `-count=20`;
- detector de carreras `-race -count=10`;
- fuzzing del sanitizador y fronteras UTF-8;
- `go vet` focal.

## Verificación manual futura

TAU-04 deberá mostrar el JSON exacto, permitir activar logs por separado,
descartar el draft y demostrar que la petición de red usa el mismo SHA-256 y los
mismos bytes. Hasta entonces este paquete no tiene efectos visibles ni remotos.
