# B01 · Clave ES256 importada (VANTA-96 / #1704)

Preparado para revisión; **no importa claves, no despliega ni activa producción**.
Sustituye HS256 de B01. La app sigue usando OAuth Clerk → authorize → bearer de
datos opaco. No cambia Rust ni SQL/RLS. El gate gestionado sigue pendiente.

## Contrato y configuración

- `native-account-authorize` firma ES256 (ECDSA P-256 / SHA-256, firma JOSE de
  64 bytes), con `typ=JWT` y `kid` de la JWK configurada por el operador.
- Conserva `iss=<SUPABASE_URL>/native-data/v1`, `aud=vantare-native-data`,
  `role=authenticated`, `sub=UUID interno`, `vantare_identity_provider=clerk`,
  `clerk_issuer`, `clerk_subject`, `iat` y `exp`. Duración entre 1 y 300 segundos,
  nunca superior a la vigencia OAuth verificada. El cliente no aporta claims.
- **`NATIVE_DATA_ES256_PRIVATE_JWK`**: JSON compacto con kty EC, crv P-256,
  alg ES256, kid, x, y y d. Solo custodia de servidor/firmador.
- **`NATIVE_DATA_ES256_PUBLIC_JWK`**: JSON del mismo par sin d, con el mismo
  kid; `testing-report-submit` verifica exclusivamente esa pública, ES256 y kid.
  No consulta un jku del token ni confía en todas las claves del proyecto.
- Si hay `key_ops`, debe ser `["sign"]` en privada o `["verify"]` en pública;
  `use`, si aparece, es `sig`. Configuración ausente/incorrecta: 503, sin token
  ni diagnóstico criptográfico. Firma/claims de entrada inválidos: 401.
- **No hay fallback a `NATIVE_DATA_JWT_SECRET` ni `SUPABASE_JWT_SECRET`.**
  El HMAC de admisión IP sigue siendo un mecanismo separado; no es firma JWT.

Los secretos de Edge tienen ámbito de proyecto: una variable distinta no
garantiza aislamiento frente a otra función comprometida. Una clave importada
tiene autoridad de proyecto, no una restricción criptográfica a B01/rol
authenticated. Su privada podría emitir roles privilegiados. Mantenerla fuera de
binarios, Git, logs, chat y artefactos CI. No reutilizar claves de licencia,
Clerk ni las claves actuales de Supabase.

## Generar archivos localmente

Requiere PowerShell 7.4+ instalado, sin dependencias nuevas. Los dos directorios
de destino deben existir, ser de confianza y estar fuera de cualquier checkout.
El script rechaza rutas con symlink/reparse point, no sobrescribe archivos y
crea los archivos protegidos **antes de escribir**: ACL sin herencia solo para
el usuario actual en Windows; modo 0600 en Unix. No cifra el archivo en disco;
el operador debe usar un almacén/disco protegido y aplicar su retención segura.

```powershell
pwsh -NoProfile -File supabase/functions/scripts/new-native-data-key.ps1 `
  -PrivatePath C:/secure/native-data-private.jwk `
  -PublicPath C:/secure/native-data-public.jwk
```

No usar `Get-Content` en consola para la privada. El único mensaje del script
es el resultado; no imprime ni la privada ni la pública. Si falla, puede dejar
archivos vacíos; revisarlos en privado y elegir rutas nuevas. No incorporar un
`--force`. La prueba automatizada ejecuta el generador con claves TEST,
comprueba firma/par, permisos, separación, ausencia de privada en stdout y
rechazo de sobrescritura; después elimina solo sus archivos temporales:

```powershell
pwsh -NoProfile -File supabase/tests/test-native-data-keys.ps1
```

**La pública JWK sirve a los verificadores y al JWKS local. Para importar una
Signing Key de proyecto, el Dashboard requiere la JWK PRIVADA**, no solo la
pública. El archivo privado es el formato de importación; incluye el mismo kid
que la pública. El operador la suministra mediante un canal privado autorizado.
Supabase no permite recuperar después esa privada del proyecto.

## Importación y activación — solo tras autorización explícita de Isaac

1. Revisar el SHA exacto, seguridad, CI, ensayo local, inventario de claves
   previo y el plan de reconstrucción/reconciliación de producción. No ejecutar
   db push global para solucionar este gate. Cerrar ventas durante el ensayo
   autorizado. No usar el token de auditoría para escrituras.
2. Generar un **par nuevo productivo** por el procedimiento protegido. No usar
   los pares efímeros de los tests. Registrar solo kid/algoritmo/estados públicos.
3. En Authentication → Signing Keys, importar la JWK privada como nueva clave
   ES256 standby. No reemplazar ni revocar las claves preexistentes. Contrastar
   kid, curva y coordenadas públicas con el archivo público, sin publicar d.
4. No dar por probada la aceptación de una standby por aparecer en JWKS. La
   guía oficial de emisión propia indica rotar para activar la importada. Esa
   rotación requiere estar incluida en la autorización; afecta a la firma de
   Supabase Auth. Si se quiere conservar la activa original, prepararla otra
   vez como standby y rotar a ella, dejando la importada como previously_used
   aceptada. Verificar estados por GET tras cada transición. No revocar la
   legacy anterior durante este procedimiento.
5. Proveer las dos variables nuevas con JSON compacto, por el procedimiento
   privado del operador, sin valores en argv/logs. Desplegar authorize y el
   consumidor testing-report-submit del mismo corte. Ambos autentican dentro
   del handler (`verify_jwt=false`); eso no configura PostgREST ni Storage.
6. Configurar la fila exacta Production de `private.clerk_issuers` y su
   native_data_issuer solo como parte del plan SQL revisado. Habilitarla para
   las cuentas de ensayo autorizadas. Clerk TPA de la web es un mecanismo
   independiente; no vuelve aceptable el OAuth nativo ni sustituye esta firma.
7. Probar authorize real → RPC/RLS → lectura/escritura propia y aislamiento A/B;
   fotos/evidencias a través de la API Storage real y report-submit a través de
   Edge. Probar firma/kid/alg inválidos, issuer/audiencia/procedencia/UUID
   incorrectos, tiempos, registry apagado y token previo al tombstone. Una
   lectura 200 con cero filas puede ser una denegación RLS correcta. No cambiar
   los claims ni relajar SQL para superar un error de gateway/audiencia.
8. Registrar resultados sanitizados, SHA, hora y estados públicos. No declarar
   B01 gestionado PASS hasta completar esos recorridos. Una clave puede ser
   aceptada por el verificador y la cuenta estar correctamente denegada por RLS.

Fuentes: [JWT Signing Keys](https://supabase.com/docs/guides/auth/signing-keys),
[JWT propios](https://supabase.com/docs/guides/auth/jwts#using-custom-or-third-party-jwts),
[Storage y RLS](https://supabase.com/docs/guides/storage/security/access-control).
Los verificadores externos pueden tener caché JWKS; no confundir su ventana de
propagación con el estado observado en los productos gestionados.

## Reversión

Si el ensayo falla: detener emisión y distribución de tokens nuevos, deshabilitar
el registro B01 según el plan aprobado y conservar evidencia sin tokens. Restaurar
la firma activa original de Supabase Auth si se cambió. Retirar la confianza de
**la nueva clave importada** mediante revocación autorizada; no borrar las claves
anteriores. Comprobar rechazo posterior en REST/Storage y en el verificador Edge.
Detener el emisor también: Edge fija una pública y no conoce por sí solo una
revocación del Dashboard. Sus handlers deben deshabilitarse o retirar/cambiar
la pública de configuración. No basta con apagar el registry para una privada
comprometida capaz de emitir roles privilegiados.

No volver a HS256 ni restaurar el antiguo secreto para esconder el fallo.
Para revertir el código a una versión anterior, mantener el bridge deshabilitado
hasta que exista un firmador y consumidores compatibles aprobados. No hay SQL
nuevo que deshacer en esta entrega. No borrar datos operativos ni metadatos
Storage a mano; limpiar exclusivamente fixtures autorizadas mediante sus APIs.

Para una rotación futura: preparar el nuevo par/importación y un corte coordinado
emisor/verificador; este verificador fija **una** pública. Parar emisión antigua,
esperar como máximo la ventana B01 de 300 s y desplegar/configurar el nuevo par
en ventana controlada. No prometer transición sin interrupción con una sola
pública. Conservar la posibilidad de restaurar el par anterior salvo compromiso;
revocar confianza vieja solo con prueba y autorización. Borrar una Signing Key
es irreversible y no forma parte de la reversión ordinaria.

## Pruebas locales

```powershell
deno test --config supabase/functions/deno.json --allow-env --allow-read `
  supabase/functions/native-account-authorize supabase/functions/testing-report-submit
```

El arnés `supabase/tests/run-commercial-local.py` usa PostgreSQL desechable y
PostgREST loopback, sin DSN, con JWKS de pública ES256 efímera; la privada vive
solo en el proceso Deno. El bearer sale del handler real. Las mutaciones firmadas
prueban RLS y claims, mientras kid/alg/firma prueban la capa criptográfica.
La fixture de servicio también es ES256 y pasa al proceso de licencia por stdin.
HS256 queda solo para controles históricos `--baseline/--before-b01` explícitos.

En Unix, con PostgreSQL/pgTAP, PostgREST y Deno instalados:

```sh
python3 supabase/tests/run-commercial-local.py --b01 --pg-bin /ruta/pg/bin \
  --postgrest-bin /ruta/postgrest --deno-bin /ruta/deno --output /tmp/b01-es256-results
```

El test opcional `postgrest.integration.test.ts` requiere un stack propio y
`LOCAL_POSTGREST_URL` loopback más `LOCAL_POSTGREST_PRIVATE_JWK_FILE` de TEST
producida por el generador. Configurar la pública correspondiente en el JWKS
del PostgREST desechable y sembrar sus fixtures antes de ejecutarlo. La suite
normal informa ese test como omitido. Ninguna prueba local acredita Supabase
gestionado, Clerk real ni las políticas/bytes del Storage desplegado.

`--b01` selecciona solo el recorrido JWT/RLS/Pilot/licencia/tombstone tras todas
las migraciones. No sustituye las suites SQL generales ni la matriz de carreras
de escritura; el comando sin esa opcion mantiene su comportamiento completo.
La matriz comercial general tiene seguimiento separado en #1702.

El script CLI de licencia se comprueba con las bibliotecas estandar de Deno
(`--no-config`, sin desactivar type-check): importa codigo que usa DOM iterable.
La configuracion de los handlers sigue aplicandose a sus pruebas. La suite Deno
global sobre el checkout base ya presenta errores de tipos ajenos a este corte;
no se corrigen ni se presentan como PASS aqui.
