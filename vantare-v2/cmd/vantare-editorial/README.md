# vantare-editorial

Convierte `vantare.curator.summary.v2` en los dos artefactos locales de revisión
de ISA-774 y valida la decisión humana. No calcula ni modifica rankings, no
firma, no publica y no usa red.

## Informe allowlisted

```powershell
go run ./cmd/vantare-editorial report `
  --summary C:\curation\curator-summary.json `
  --out C:\curation\llm-report.md
```

El Markdown incluye solo producción que cumple `k>=3`, etiquetas editoriales
locales (`Combinación 1`), muestra/calidad, métricas agregadas y el ranking ya
calculado por el curador. Omite identificadores de combinación, digests de
clusters, hashes del motor, referencias a ficheros, rechazos detallados,
identidades administrativas, entornos de test y texto libre de terceros. Los
mismos bytes de resumen producen los mismos bytes de informe.

## Decisión de Isaac

```powershell
go run ./cmd/vantare-editorial decision-template `
  --summary C:\curation\curator-summary.json `
  --out C:\curation\decision.template.json
```

La plantilla nace cerrada: todos los campos `include` son `false`. Isaac copia
el fichero, conserva `summaryDigest` y marca únicamente el perfil y los rangos
de estrategia que aprueba. El LLM nunca recibe este JSON técnico.

```powershell
go run ./cmd/vantare-editorial approve `
  --summary C:\curation\curator-summary.json `
  --decision C:\curation\decision.approved.json `
  --out C:\curation\selection.approved.json
```

`approve` falla si el resumen cambió, la combinación o rango no existe, el
contenido no es de `production-community`, no cumple `k>=3`, no es publicable o
la decisión queda vacía. La salida es exactamente
`vantare.catalog.selection.v1`, consumible por `vantare-catalog build`; los
digests técnicos se resuelven después de la decisión y no se editan a mano.
