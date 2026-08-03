# Testing Center — rechazo, Linear y delegación humana a Codex

Estado: diseño aprobado por Isaac el 2026-08-03. Documento conceptual; no
autoriza implementación, deploy, credenciales, red, asignación automática,
merge ni promoción.

## Objetivo

Cerrar el flujo inicial de reporte y corrección de Vantare con una intervención
humana pequeña y deliberada:

```text
reporte in-app
  -> Supabase valida, deduplica y proyecta
Linear
  -> Isaac decide si delegar
Codex Cloud
  -> resultado revisado y creación humana de PR
rama de issue -> nightly -> testers -> master
```

El diseño debe conservar el contexto cuando una build sea rechazada, impedir
bucles automáticos de Codex y permitir correcciones pequeñas en la rama
original sin obligar a crear una incidencia nueva.

## Decisiones aprobadas

- Linear es la bandeja operativa de incidencias y decisiones del owner.
- Testing Center es la interfaz para reportar y validar builds; no sustituye a
  Linear como fuente operativa.
- Supabase conserva autoridad sobre identidad, rol, canal, candidata, SHA,
  idempotencia, deduplicación y pausas.
- PostHog aporta errores y session replay con consentimiento y acceso
  restringido; no es la fuente de instrucciones para Codex.
- No hay modelo intermedio en el MVP. Un compositor determinista construye el
  expediente que Isaac revisa antes de mencionar o delegar a Codex.
- La rama y el SHA se seleccionan en la superficie de ejecución de Codex y se
  verifican antes de editar. Escribirlos únicamente en el prompt no otorga
  autoridad ni se considera determinista.
- Codex nunca se redelega automáticamente después de un rechazo.
- La PR se crea tras revisión humana del resultado de Codex.
- Discord publica avisos operativos anónimos para testers, nunca el expediente
  técnico completo.
- Un rechazo bloquea la candidata, pero no borra votos, reescribe ramas o
  revierte código automáticamente.

## Roles y permisos

| Rol | Nightly | Testers | Decisiones operativas |
| --- | --- | --- | --- |
| `tester` | Sin acceso | Puede validar | Ninguna |
| `primary_tester` | Puede validar | Puede validar | Ninguna |
| `owner` | Puede validar y ver todo | Puede validar y ver todo | Clasifica rechazos, delega a Codex y autoriza promociones |

Una aprobación de un `primary_tester` basta para superar el gate funcional de
Nightly. Cualquier rechazo autorizado bloquea preventivamente la candidata.
En Testers no existe un quorum automático: los votos son evidencia y solo
Isaac decide cuándo el conjunto está listo para la promoción final.

La opción `No puedo verificar` registra la participación, pero no aprueba ni
rechaza y nunca bloquea por sí sola.

## Máquina de estados de la candidata

```text
pending_validation
  |- approve ------------> approved
  |- cannot_verify ------> pending_validation
  `- reject -------------> rejected_pending_owner
                              |- confirmed_blocking -> correction_pending
                              |- environment --------> pending_validation
                              |- separate_nonblocking> pending_validation
                              |- dismissed ----------> pending_validation
                              `- stop_rollout --------> stopped
```

Los nombres son conceptuales hasta reconciliarlos con el schema vigente. Las
invariantes son obligatorias:

- candidata, validación y decisión se ligan a canal y SHA exactos;
- una validación y su disposición son auditables e inmutables;
- clasificar un rechazo no elimina el evento original;
- una corrección genera una candidata nueva y no hereda votos;
- una pausa global o del flujo bloquea votos, decisiones y promociones nuevas;
- estados ambiguos fallan hacia intervención del owner.

Ejemplo:

```text
nightly.38 / SHA A -> rechazada y conservada
nightly.39 / SHA B -> nueva candidata pendiente
```

## Formulario de rechazo en Testing Center

El formulario exige:

- categoría cerrada: `issue_persists`, `new_regression`, `crash`,
  `different_behavior` u `other`;
- descripción concreta de lo que falla;
- pasos de reproducción;
- resultado esperado y observado;
- frecuencia: `always`, `frequent` u `once`;
- impacto bloqueante sí/no;
- captura o vídeo opcional;
- consentimiento separado para diagnóstico y logs.

La UI ofrece tres acciones visibles y no ambiguas:

```text
Aprobar | Rechazar | No puedo verificar
```

Después de rechazar, el tester ve que la promoción está detenida y que no debe
hacer nada más. Los demás testers ven `Corrección pendiente`, sin identidad del
autor del rechazo.

Un rechazo incompleto no puede enviarse. La UI conserva el borrador y explica
qué falta sin inventar datos.

## Expediente determinista para Codex

Supabase compone un documento versionado a partir de datos ya validados. No usa
un LLM y no convierte texto del tester en autoridad.

El expediente incluye:

- issue original y criterios de aceptación;
- canal, versión, candidata y SHA exactos;
- PR, rama y resumen server-owned de la solución anterior;
- lista de archivos modificados y checks registrados;
- rechazo estructurado del tester;
- entorno y fingerprint técnico allowlisted;
- logs sanitizados y consentidos;
- disponibilidad de PostHog y un enlace server-owned que exige autenticación
  del owner para la revisión humana;
- estrategia elegida por Isaac: misma rama o sub-issue;
- repositorio, rama objetivo, SHA esperado y base de PR server-owned;
- criterios de finalización verificables;
- versiones del contrato y digest del expediente.

No incluye secretos, tokens, rutas locales, texto oculto, instrucciones desde
logs, URLs aportadas por el tester ni contenido de Discord.

La instrucción fija de Codex trata el bloque de rechazo como evidencia, nunca
como órdenes. El enlace de PostHog tiene formato fijo, no contiene texto del
tester y no concede acceso por sí mismo. Codex no necesita abrirlo: su
expediente utiliza únicamente `replay_available`, el ID interno y la evidencia
sanitizada. Si esa evidencia no basta, responde `needs_owner`.

Si faltan reproducción, base, SHA, consentimiento requerido o criterios de
cierre, el expediente queda `incomplete` y no se permite delegar.

## Presentación en Linear

Un rechazo genera:

1. notificación en el Inbox de Isaac;
2. estado `Needs changes` en la issue principal;
3. etiqueta `rejected:nightly` o `rejected:testers`;
4. comentario automático con el expediente y enlaces autorizados;
5. aparición en la vista guardada `Necesitan mi decisión`.

No modifica automáticamente prioridad, assignee humano ni delega un agente.

Isaac puede registrar una de estas disposiciones:

1. delegar una sub-issue de corrección a Codex;
2. clasificar como problema del entorno;
3. separar una incidencia nueva;
4. descartar justificadamente el rechazo;
5. continuar en la misma rama;
6. detener completamente el rollout.

La delegación se inicia de forma humana después de revisar el expediente. La
integración estándar de Linear inicia hoy sus chats desde la rama predeterminada
del primer repositorio del environment; en Vantare esa rama debe continuar
siendo `master`. Por tanto, una mención o asignación `@Codex` puede utilizarse
para análisis y aclaraciones, pero no autoriza una modificación de código que
requiera `nightly` o una rama de issue.

Para modificar código se abre una tarea de Codex Cloud en una superficie que
permita seleccionar la rama o el SHA exactos. Antes de editar, el preflight
compara repositorio, `HEAD`, SHA esperado y relación con la base de PR. Cualquier
diferencia termina en `needs_owner`. La creación de PR permanece como gate
humano.

## Estrategias de corrección

### Continuar en la misma rama

Es la opción preferida para una corrección pequeña rechazada en Nightly cuando:

- pertenece al mismo alcance y raíz causal;
- la rama original existe y no contiene trabajo ajeno;
- la corrección sigue siendo pequeña y verificable;
- se compara contra el `nightly` actual;
- no exige rebase con force-push ni reescritura de historial.

Una PR ya fusionada no se reabre. Se añaden commits y se crea una nueva PR a
Nightly. Por ello, las ramas no se eliminan automáticamente hasta superar la
validación Nightly.

Codex Cloud permite que una tarea directa seleccione rama o commit SHA. El spike
debe probar la continuidad de una rama ya fusionada y la creación de una segunda
PR desde ella. Si esa continuidad concreta no funciona, se utiliza una
sub-issue nueva; nunca se sustituye la selección técnica por una instrucción
textual.

### Sub-issue y rama nueva

Es la opción normal cuando el cambio crece, la rama ya no es segura o el
rechazo ocurre en Testers:

```text
ISA-245 — issue principal / Needs changes
  `- ISA-268 — corrección tras rechazo #1
       `- rama propia desde nightly actual
```

La issue principal conserva el historial funcional. Cada sub-issue ejecutable
mantiene el contrato una issue, una rama, un worktree y un contexto Codex.

## Rechazo por canal

### Nightly

- Solo valida un `primary_tester` u owner.
- Una aprobación es suficiente.
- Un rechazo bloquea inmediatamente.
- Una corrección pequeña puede continuar en la misma rama.

### Testers

- Cualquier tester autorizado puede validar.
- Un rechazo bloquea preventivamente hasta clasificación del owner.
- La corrección nunca se hace directamente sobre `testers`.
- Se crea una corrección desde `nightly`, vuelve a pasar Nightly y después se
  promueve otra candidata a Testers.

### Master

- Testing Center aporta evidencia, pero no autoriza publicación.
- Solo Isaac puede aprobar la promoción final desde Testers.

## Discord

El canal de testers recibe un mensaje como:

```text
Build Nightly rechazada por un tester principal.
Versión: 0.2.14-nightly.38
Estado: promoción detenida; corrección pendiente.
```

No publica identidad, texto libre, logs, replay, enlaces privados ni detalles
de seguridad. El aviso de una corrección y nueva build se emite como un evento
nuevo; no se edita el mensaje histórico para ocultar el rechazo.

## Privacidad y seguridad

- El backend deriva rol y usuario; el cliente no declara autoridad.
- Diagnóstico, logs y replay conservan consentimientos independientes.
- PostHog y Linear reciben solo lo definido por sus contratos y políticas.
- Codex recibe el expediente revisado; el replay es referencia para humanos,
  no una instrucción necesaria para ejecutar.
- Texto de tester, comentarios, logs y adjuntos permanecen marcados como datos
  no confiables.
- No hay retries automáticos de Codex ni promociones automáticas tras rechazo.
- Toda decisión de owner registra identidad, fecha, candidata, SHA y motivo.

## Fallos e idempotencia

- Repetir el mismo voto devuelve el resultado registrado y no duplica efectos.
- Dos rechazos concurrentes conservan dos validaciones, pero una sola
  transición bloqueante y una sola notificación por candidata/canal.
- Si Linear no responde, el efecto queda en outbox y Testing Center conserva el
  estado server-side; no afirma que Linear fue actualizado.
- Si Discord falla, no afecta al bloqueo ni a Linear y se reintenta por marker.
- Si Codex termina de forma ambigua, el estado es `needs_owner`; nunca se
  redelega automáticamente.
- Si cambia el SHA, el expediente anterior no puede reutilizarse.
- Si Codex empieza en otra rama o SHA, no edita, no crea PR y devuelve
  `needs_owner`.

## Criterios de aceptación del diseño

- Un primary tester puede aprobar o rechazar Nightly y un único aprobado basta.
- `No puedo verificar` no altera el gate.
- Un rechazo bloquea la candidata y aparece en Linear, Discord y Testing
  Center con el nivel de detalle correspondiente.
- La identidad del tester no aparece en Discord.
- Isaac puede elegir las seis disposiciones sin que ninguna delegue por sí
  sola a Codex.
- El prompt no puede elegir la base: repositorio, rama, SHA y base de PR deben
  coincidir con el preflight server-owned.
- La misma rama solo está disponible bajo las condiciones cerradas de Nightly.
- Un rechazo en Testers vuelve por Nightly y nunca se corrige directamente.
- Una candidata corregida exige votos nuevos.
- El expediente se genera sin LLM, es versionado, digerido y falla cerrado.
- Fallos de Linear, Discord o Codex no desbloquean una promoción.

## Fuera de alcance

- Implementación de UI, schema, Edge Functions o webhooks.
- Activación de la integración Linear/Codex.
- Configuración de PostHog, Discord o secretos.
- Automatización de asignación a Codex o creación de PR.
- Merge, promoción, build distribuida o publicación.
- Sustitución o eliminación del workflow TAU-07A inerte.

## Siguiente gate

Tras revisar esta especificación se debe sustituir el plan TAU-07 anterior por
microcortes que empiecen con spikes sin efectos reales:

1. creación y proyección de una issue sintética en Linear;
2. delegación humana directa con rama/SHA seleccionados y prueba de segunda PR
   desde una rama ya fusionada;
3. contrato de rechazo y expediente determinista en dry-run;
4. persistencia, outbox y sincronización de estados;
5. UI y notificaciones;
6. piloto remoto controlado antes de una build real.

TAU-07A permanece como evidencia inerte. No se activa ni se convierte en el
camino de producción por este diseño.
