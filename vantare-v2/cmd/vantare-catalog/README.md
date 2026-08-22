# vantare-catalog

Compone un `Catalog v1` desde el resumen determinista del curador y una
selección aprobada. El build y la firma son dos invocaciones separadas. La
herramienta no usa red y **no publica**: subir el primer catálogo a GitHub es
un gate posterior y exclusivo de Isaac (ADR 0009 §14).

Se eligió un comando separado de `vantare-curator` para que el proceso que
predigiere bundles nunca reciba una ruta de clave. `vantare-catalog sign` es el
único paso que lee el fichero de clave y debe ejecutarse offline después de
revisar el JSON sin firmar.

## 1. Selección aprobada

La selección es cerrada y versionada:

```json
{
  "contractVersion": "vantare.catalog.selection.v1",
  "items": [
    {
      "environment": "production-community",
      "combinationId": "spa-lmgt3",
      "includeReferenceProfile": true,
      "strategyClusterDigests": ["digest-aprobado"]
    }
  ]
}
```

El builder falla si un elemento procede de `test` o `controlled-capture`, si
la combinación o el cluster no alcanza el `k` declarado por el resumen (nunca
menor que 3), o si el perfil carece de muestra/calidad consistente. Los arrays
se ordenan antes de codificar; resumen, selección y metadatos iguales producen
exactamente los mismos bytes.

## 2. Build sin firma

Las fechas y versiones son entradas revisables, no el reloj de la máquina. La
versión debe ser mayor que `--previous-version` dentro de la época:

```powershell
go run ./cmd/vantare-catalog build `
  --summary C:\curation\resumen.json `
  --selection C:\curation\seleccion-aprobada.json `
  --out C:\curation\catalogo-sin-firmar.json `
  --key-epoch 2026-08-a `
  --version 4 --previous-version 3 `
  --published-at 2026-08-22T12:00:00Z `
  --expires-at 2026-09-21T12:00:00Z
```

La salida contiene el envelope exacto de ADR 0009 §12 y el payload, pero no
contiene `signature` ni `keyId`. Ese es el artefacto que Isaac revisa.

## 3. Firma offline separada

```powershell
go run ./cmd/vantare-catalog sign `
  --in C:\curation\catalogo-sin-firmar.json `
  --out C:\curation\catalogo-firmado.json `
  --private-key-file D:\offline\catalog-seed.hex `
  --key-id catalog-2026-08-a
```

El fichero contiene exactamente el seed Ed25519 de 32 bytes codificado en hex.
La herramienta no muestra ni copia la clave. Antes de escribir, recalcula
`payloadDigest`, reutiliza `catalog.SignEnvelope` y ejecuta
`catalog.VerifySignedCatalog` contra la clave pública derivada.

La clave de `internal/strategy/catalog/testdata` está marcada como **TEST** y
solo sirve para tests/fixtures. Ninguna clave real pertenece al repo, CI o
Worker. La custodia, ACL, backup, rotación y revocación siguen el runbook del
ADR 0009 §14.

## Lo que esta herramienta no hace

- no consulta storage ni GitHub;
- no decide qué contenido se aprueba;
- no publica, crea releases ni mueve ramas;
- no sustituye el gate explícito de Isaac para el primer catálogo.
