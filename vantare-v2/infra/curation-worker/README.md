# Curation Worker

Worker privado de ingesta de `CurationBundle v1` para ADR 0009. Este
subproyecto no forma parte del build de la aplicación ni añade dependencias a
`go.mod` o al frontend.

## Fronteras de seguridad

- `POST /v1/bundles` exige token de build, `uploadSecret`, `deleteSecret` e IP
  de Cloudflare. El token de build solo admite la petición: la identidad queda
  ligada a pruebas de posesión de los dos secretos independientes.
- Los secretos, IP y `uploadId` se guardan únicamente como HMAC-SHA-256 con
  separación de dominio y un pepper de servidor. El payload no se registra.
- El Worker limita bytes comprimidos (64 KiB), bytes descomprimidos (256 KiB),
  profundidad, cardinalidad y cada campo. Lee ambos streams con límite y
  rechaza antes de reservar cuota o escribir R2.
- Un Durable Object único por entorno serializa identidad, replay, cuota por
  credencial/IP/global y límite por combinación. Todo fallo de estado o falta
  de IP falla cerrado. El digest excluye `bundleId` y normaliza el orden de
  stints/estrategias; regzipear o reordenar JSON no evita el replay.
- `POST /v1/tombstones` requiere `deleteSecret`, revoca la credencial y escribe
  `vantare.curation.tombstone.v1` con las claves de todos sus bundles. Es el
  contrato que el pull del curador debe consumir para borrar corpus, índices y
  derivados en el siguiente ciclo (SLA máximo: 7 días); el Worker no afirma
  que ese ciclo local ya se haya ejecutado.
- `POST /v1/credentials/rotate` exige ambos secretos vigentes y token de build;
  `GET /v1/quota?uploadId=...` exige el `uploadSecret`. Ninguno revela hashes.
- Los logs contienen solo evento, entorno y referencias truncadas a 12 hex.
  R2 no tiene endpoint de lectura/listado público y `workers_dev` está apagado.

Los objetos llevan procedencia inmutable y `expiresAt` a 180 días. El cron
diario elimina expirados. Como defensa operativa adicional, el despliegue debe
configurar también una regla lifecycle R2 de 180 días y verificarla en cada
entorno.

## Paridad con Go

[`src/contract.ts`](src/contract.ts) es el espejo manual cerrado de
`internal/strategy/curation/bundle.go`: mismos nombres, tipos, opcionales,
regex, rangos, cardinalidades, orden de pit laps, allowlist y denylist. No se
acepta `additionalProperties` en ningún nivel, claves duplicadas, coerción,
no-finitos, strings de control/surrogates anómalos ni JSON adicional.

Cuando cambie el contrato Go, el mismo cambio debe actualizar `contract.ts` y
los casos de `test/contract.test.ts`; ambos reviews deben comparar campo a
campo antes de cambiar `CONTRACT_VERSION`. No se despliega una versión con
paridad pendiente.

## Dependencias

Todas son de desarrollo y están fijadas en `package-lock.json`:

- `wrangler`: configuración, tipos y futuro despliegue oficial de Workers.
- `@cloudflare/vitest-plugin` + `vitest`: framework estándar que ejecuta tests
  dentro de `workerd` con R2 y Durable Objects locales.
- `typescript` y `@types/node`: typecheck estricto del Worker y del runner.

No hay dependencia runtime de terceros. `npm audit --audit-level=high` forma
parte de `npm run check`.

## Desarrollo local

```powershell
cd infra/curation-worker
npm ci
npm run check
```

La suite cubre replay semántico, contribuyentes distintos, schema inválido y
campos/claves desconocidos, límites comprimido/descomprimido, cuotas IP y
global con identidades nuevas, IP ausente, posesión ajena de subida/borrado,
tombstone y forma almacenada sin secretos.

## Runbook de despliegue (gate explícito de Isaac)

Este runbook es solo preparatorio. **No se ha ejecutado para ISA-759.** No usar
ningún comando de este apartado hasta que Isaac registre el gate 1 en #759.

1. Verificar `npm ci && npm run check` desde un checkout limpio del commit
   aceptado. Revisar que no haya `.env`, tokens ni valores reales en el diff.
2. Crear por consola/API autorizada tres buckets R2 privados e independientes:
   `vantare-curation-test`, `vantare-curation-controlled-capture` y
   `vantare-curation-production-community`. En cada uno, aplicar lifecycle de
   180 días a `bundles/`; no aplicar expiración a tombstones pendientes.

   ```powershell
   npx wrangler r2 bucket lifecycle add vantare-curation-test curation-bundles-180d bundles/ --expire-days 180
   npx wrangler r2 bucket lifecycle add vantare-curation-controlled-capture curation-bundles-180d bundles/ --expire-days 180
   npx wrangler r2 bucket lifecycle add vantare-curation-production-community curation-bundles-180d bundles/ --expire-days 180
   npx wrangler r2 bucket lifecycle list vantare-curation-test
   ```

   Repetir el `list` para los otros dos buckets y guardar evidencia sanitizada.
3. Confirmar que cada `wrangler --env` crea su propio Worker y namespace de
   Durable Object. No reutilizar credenciales, buckets, routes ni namespaces
   entre `test`, `controlled-capture` y `production-community`.
4. Cargar con `wrangler secret put` dos secretos distintos por entorno:
   `BUILD_ADMISSION_TOKEN` (32–256 caracteres allowlisted) y `HASH_PEPPER`
   (aleatorio, 32+ caracteres). Nunca pasarlos por argumentos, logs o repo.

   ```powershell
   npx wrangler secret put BUILD_ADMISSION_TOKEN --env test
   npx wrangler secret put HASH_PEPPER --env test
   ```

   Repetir de forma interactiva para cada entorno, sin reutilizar valores.
5. Revisar las cuotas de `wrangler.jsonc` contra el presupuesto aprobado. Los
   límites globales de objetos y bytes diarios/mensuales son gates de coste;
   cualquier variable ausente o inválida deja el servicio en 503.
6. Solo tras el gate, ejecutar en orden `test`, `controlled-capture` y por
   último `production-community`:

   ```powershell
   npx wrangler deploy --env test
   npx wrangler deploy --env controlled-capture
   npx wrangler deploy --env production-community
   ```

7. En cada entorno hacer smoke con credenciales desechables propias: subida,
   replay, consulta de cuota y tombstone; comprobar R2 privado, metadata de
   procedencia/expiración y logs sin payload/secretos. Borrar esas credenciales
   y objetos de smoke siguiendo el tombstone, sin mezclarlos con producción.
8. Registrar en #759 SHA, entorno, bindings, lifecycle, resultado de smoke y
   rollback. Ante anomalía: retirar route/Worker del entorno afectado, conservar
   evidencia sanitizada y no promover al siguiente.

Publicar el Worker, crear recursos, cargar secretos o tocar una cuenta de
Cloudflare sigue fuera del alcance de esta entrega.
