# ADR 0102 — Modelo de acceso nativo

Fecha: 2026-10-31. Issue: [#1827](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1827), Plane VANTA-126.
Diseño: [Recorrido de licencias](../vantare-program/license-access-model-design.md), §4.1–4.8.

## Estado

**Aceptado por el orquestador**, con autoridad delegada por Isaac, el 2026-10-31
(cinco decisiones registradas en #1827). El paso 0 añade caracterización y
documentación. La aceptación de este modelo no afirma su implementación,
integración ni publicación; cada paso posterior necesita issue y PR propios.

## Contexto

ADR [0099](0099-arquitectura-rust-nativa.md) mantiene Rust + GPUI y un núcleo
neutral. La firma, el reloj anti-retroceso, la lápida durable y el catálogo
central son válidos. La clasificación de errores, la sesión y las copias de
credenciales reparten una misma decisión entre varios procesos. Consolidamos
sus dueños sin cambiar criptografía ni el formato de binding/authority.

## Decisión

| Hecho o decisión | Dueño único |
| --- | --- |
| Derechos comerciales y plazo, incluida recuperación | Servidor: `normalizeGrants` sobre `billing_effective_access_grants`; Polar alimenta la autoridad comercial |
| Estado de suscripción | `deriveSubscriptionTransition`, reutilizado por webhook y reconciliación |
| Emisión nativa | `native-license`; retirada condicionada de la puerta legacy |
| Aceptación, firma, binding, reloj, lápida, gracia y catálogo local | Núcleo `rights::Owner` y `Authority` |
| Estado publicado de acceso | `Policy.state`, consumido por supervisor, Hub y overlays |
| Sesión de cuenta | Servicios `Account`, publicada como `Session` explícita |
| Clasificación de fallos | Una función pura `outcome(Error) -> Outcome` en servicios |
| Cadencia de renovación y último resultado persistente en memoria | Supervisor `Renewal` |
| Presentación | Hub/overlays leen la política y el resultado; no deducen autoridad |

Solo Logout, cambio de identidad y DeviceReset revocan derechos locales.
La revocación requiere ACK durable del núcleo antes de anunciar éxito.
Las renovaciones manuales y automáticas conservan lo firmado ante errores;
un refresh rechazado requiere login, sin borrar la licencia.

La recuperación por pago fallido se firma como validez temporal `paid_through`
del derecho hasta `recovery_until`, sin alterar el plazo comercial ni reiniciar
las 72 h. Es compatible con clientes v1 instalados. El test actual que excluye
recovery de la firma cambia expresamente en el paso 1 (#1814).

Se elimina la copia `license-candidate`, su marcador y `TransferRights` en el
paso 8. Servicios entrega la respuesta HTTP nueva al núcleo y se olvida.
Si se pierde el ACK, la siguiente renovación solicita otra emisión idempotente.
Binding, authority y su guardia siguen bajo el único escritor del núcleo;
datos sobrantes de candidate no conceden acceso. Se comprueba rollback de generación.

`Policy.state` es el contrato de estado; reemplaza inferencias desde booleanos
y textos. Se separan vencimiento firmado y gracia. Los protocolos se versionan
con el conjunto instalado; ninguna mezcla de binarios obtiene compatibilidad
silenciosa. No se baja una lápida sana ni se amplían plazos al reanclar reloj.

### Cinco decisiones de #1827

1. Una renovación manual no revoca; solo los tres actos explícitos anteriores.
2. `license-credential` se retira solo si el inventario de metadatos de invocación
   confirma cero uso durante 30 días. Con uso, recibe la barrera de
   `native-license`. Desplegar requiere autorización de Isaac.
3. Licencias sin plazo firmado (Founders/Gratis/Owner): comprobación al arrancar
   y cada 24 h, sin revocación por transporte. Esto no elimina el lease firmado
   de Owner cuando existe; se conserva su vencimiento.
4. Una pausa en la misma sesión del simulador conserva la gracia de una hora.
   Se implementa en el **paso 6b — la pausa conserva la gracia**, entre el 6 y
   el 7: `Paused` conserva la gracia igual que `Stale`, solo en la sesión live
   ya observada. Es el cambio de comportamiento justificado por esta decisión.
   Owner conserva el margen y Host la hora de entrada: pausar o reanudar no
   crea una hora nueva. Salir/cambiar de sesión o Logout descarta la gracia;
   la credencial y el plazo absoluto siguen caducando durante la pausa.
   La caracterización del paso 0 fijaba su pérdida; el paso 6b cambia únicamente
   esa fila, marcada de antemano por el orquestador.
5. Credencial v2 no planificada: se retira en el paso 11 salvo objeción de Isaac.

## Consecuencias y verificación

El paso 0 fija nightly, incluidos comportamientos que cambiarán a propósito.
Las matrices de núcleo, servicios y normalización tienen una fila por caso;
los pasos 4, 6 y 7 deben conservar sus decisiones de acceso. Los pasos 1, 5,
6b, 8 y 10 justifican las diferencias en su propia entrega. El paso 2 conserva su
arreglo de estados separado. Ningún paso de implementación mezcla cliente y servidor.

Las fronteras delicadas son tolerancia ±300 s, latest_issued, reloj corregido,
lápida futura y almacenamiento dañado (#1784/#1807/#1822). Se prueban con relojes
inyectados, firmas de prueba y directorios aislados; no se modifica el reloj
del equipo ni datos reales. La matriz complementa las regresiones existentes.
Servidor se valida con Deno en CI. Los gates nativos se ejecutan por la cola.

La semántica nueva de renovación puede conservar acceso offline hasta el plazo
firmado aun tras un bloqueo remoto. Es el contrato offline y debe explicarse
en soporte. Recuperación firmada concede como máximo la ventana contractual.
El supervisor mantiene backoff y límites de peticiones al retirar candidate.
La ejecución y evidencia de cada corte se registran en el
[handoff comercial](../vantare-program/handoffs/platform-commercial.md).

### Paso 2 — cuarentena por suscripción (revisión del orquestador, 31-oct-2026)

Un estado de snapshot desconocido no concede ni revoca: se salta esa suscripción,
conservando sus grants, recovery y versión, y se diagnostica
`unsupported_subscription_status` con el identificador del recurso, sin datos de
cuenta ni payload. Las otras suscripciones del mismo cliente siguen renovándose.
Se mantienen las barreras globales existentes, incluido `unknown_product`.
Customer State usa la misma clasificación de snapshot que el webhook:
`uncanceled` es un nombre de evento y `cancelled` un alias histórico puro;
ninguno se acepta como estado de snapshot.

La matriz `lifecycle-matrix.v1.json` distingue `expectedTransition` (función pura
histórica) de `expectedSnapshot` (efectos de ingestión). En el paso 2 la fila
unknown pasa de la revocación hipotética del fallback a cuarentena con acceso y
recovery conservados. La fila uncancel se envía sin traducir su estado: como
snapshot se cuarentena; el webhook específico sigue admitido. El test del worker
recorre las diez filas sin reescribir estados ni resultados; comprueba la acción
exacta `open`/`close`/`none` cuando se aplica un lifecycle, y ninguna escritura
en cuarentena o réplica. No cambia el fallback puro ni la forma de la licencia.
