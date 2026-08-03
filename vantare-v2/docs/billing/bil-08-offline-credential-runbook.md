# BIL-08 — runbook de credenciales offline y claves Ed25519

Este runbook es operacional. No contiene claves, tokens ni valores de
producción. Ejecutarlo no autoriza un deploy.

## Propiedad de las claves

- `OFFLINE_LICENSE_ED25519_PRIVATE_KEY`: PKCS#8 Ed25519 codificada en base64url,
  secreto exclusivo del entorno de Supabase Functions.
- `OFFLINE_LICENSE_KEY_ID`: identificador público, estable y versionado de esa
  clave; no debe reutilizarse para otro par.
- `VANTARE_LICENSE_PUBLIC_KEYS`: lista de lectura
  `key-id:base64url-public-key`, embebida en la build de Windows.
- Nunca guardar la clave privada en Git, `.env.local`, logs, artefactos, CI de
  cliente, variables `VITE_*`, documentación o Linear.

La generación y custodia deben realizarse desde un entorno administrativo
controlado. Registrar únicamente key-id, fingerprint público, fecha, responsable
y estado; no copiar el material privado en el ticket.

## Alta inicial

1. Generar un par Ed25519 y exportar la privada como PKCS#8 y la pública como 32
   bytes raw, ambas codificadas en base64url sin padding.
2. Elegir un key-id nuevo y no ambiguo, por ejemplo una versión con fecha.
3. Configurar la privada y el key-id como secretos del entorno de la función.
4. Configurar en GitHub únicamente el registro de claves públicas.
5. Verificar que el build falla si el registro público está vacío.
6. Ejecutar checks locales y sandbox antes de autorizar deploy.
7. Desplegar solo mediante `deploy-approved-functions.ps1`; el guard debe
   impedir funciones inesperadas.

## Rotación sin incidente

1. Generar el nuevo par y key-id.
2. Publicar primero una build que confíe simultáneamente en la clave anterior y
   la nueva.
3. Esperar a que la build compatible alcance el canal operativo aprobado.
4. Cambiar después el emisor para firmar con la clave nueva.
5. Confirmar en sandbox que una credencial nueva usa el key-id nuevo y que una
   credencial anterior sigue siendo verificable.
6. Conservar la clave pública anterior mientras existan credenciales válidas
   emitidas con ella. Para Launch perpetuo, su retención puede ser indefinida.
7. Retirar y destruir la clave privada anterior cuando ya no firme; conservar
   solo su pública en clientes que necesiten verificar histórico.

No rotar emisor antes de distribuir la pública: dejaría sin licencia a clientes
correctos. No reutilizar key-id ni cambiar el material asociado a uno existente.

## Incidente de clave privada

1. Detener la emisión de credenciales afectadas.
2. Registrar el incidente sin publicar material secreto.
3. Crear nuevo par/key-id y distribuir su pública antes de reanudar emisión.
4. Forzar validación online para suscripciones y reemitir credenciales.
5. Evaluar por separado Launch perpetuo: un cliente permanentemente offline con
   una clave pública antigua no puede recibir revocaciones. No declarar una
   revocación completa que técnicamente no pueda demostrarse.
6. Mantener Billing NO-GO hasta completar investigación, rotación, pruebas y
   decisión comercial.

## Estado de reloj protegido

Target Windows: `Vantare/LicenseClock`.

- Si falta por primera vez, la siguiente credencial válida crea el estado.
- Si está corrupto o Credential Manager no está disponible, el cliente falla
  cerrado y no concede acceso offline.
- Soporte debe pedir una conexión online y confirmar identidad/dispositivo antes
  de retirar manualmente el target corrupto. Después, una validación online
  recrea el high-watermark.
- Nunca restablecer el reloj para hacer aceptar una credencial antigua o evitar
  una expiración.

## Migración legacy

La caché antigua no se convierte. Flujo esperado:

1. Detectar `state`, `entitlements`, `expires_at` o `updated_at`.
2. Mostrar estado no validado, sin premium offline.
3. Solicitar login/conexión.
4. Obtener una credencial v1 firmada.
5. Reemplazar atómicamente el archivo con el envelope.

Rollback: volver al commit anterior no es una restauración comercial segura. No
reintroducir confianza en los campos legacy. Mantener Billing desactivado hasta
que el emisor y el cliente vuelvan a estar alineados.

## Smoke sandbox requerido

- Login correcto y emisión para cuenta/dispositivo activos.
- Rechazo de otro dispositivo; reset explícito y nueva emisión.
- Pro expira exactamente en `paid_through`.
- Pro Plus conserva Pro/Testers/Nightly con límites independientes.
- Launch v1 conserva su alcance perpetuo y Testers, nunca Nightly por sí sola.
- Revocación online reemplaza la caché anterior.
- 400/401/403 no caen a caché; red/5xx pueden usar envelope válido.
- Edición, campos extra, firma/key-id erróneos y copia fallan cerrados.
- Migración legacy y estado de reloj corrupto no conceden acceso.

Guardar en Linear solo resultados sanitizados, SHA, entorno y conteos. Nunca
incluir JWT, fingerprint completo, clave privada, credenciales o PII.
