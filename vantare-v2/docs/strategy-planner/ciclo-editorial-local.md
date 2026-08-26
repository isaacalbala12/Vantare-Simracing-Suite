# Runbook — ciclo editorial local de Strategy

Estado: F6-e implementado en la rama de ISA-774. Este flujo es local y se
detiene en un catálogo sin firmar. No sincroniza con un Worker real, no firma y
no publica.

## Objetivo y fronteras

El ciclo encadena la predigestión determinista, el informe allowlisted, el
análisis editorial con una suscripción de Isaac, su decisión y el builder de
catálogo. La autoridad permanece separada:

1. `vantare-curator` calcula y ordena con el motor/backtest versionado.
2. El LLM recibe solo `llm-report.md`, cura y redacta con
   `llm-editorial-prompt.txt`; no recibe herramientas ni ficheros técnicos.
3. Isaac decide qué acepta editando una copia de la plantilla cerrada.
4. `vantare-editorial approve` valida y materializa la selección técnica.
5. `vantare-catalog build` genera un catálogo sin firmar.

La sincronización remota de bundles queda pendiente del Worker autorizado. Por
ahora `-BundlesPath` debe apuntar a un directorio local ya preparado con
`test/`, `controlled-capture/` y `production-community/` cuando correspondan.

## Dry-run seguro

Desde la raíz del repositorio:

```powershell
.\scripts\Invoke-VantareEditorialCycle.ps1 `
  -DryRun `
  -WorkRoot C:\VantareEditorial `
  -RunDate 2099-01-01
```

Usa tres bundles sintéticos versionados en `scripts/testdata`; no abre red. Una
segunda ejecución con la misma fecha reemplaza los artefactos generados con los
mismos bytes. La decisión aprobada vive en un fichero separado y nunca debe
usar el nombre `decision.template.json`.

## Primer paso programado

Ejemplo diario para el usuario de Windows actual:

```powershell
$repo = 'C:\ruta\a\vantare-v2'
$bundles = 'C:\VantareEditorial\bundles-locales'
$work = 'C:\VantareEditorial\ciclos'
$arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$repo\scripts\Invoke-VantareEditorialCycle.ps1`" -BundlesPath `"$bundles`" -WorkRoot `"$work`""
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $arguments
$trigger = New-ScheduledTaskTrigger -Daily -At '03:00'
Register-ScheduledTask -TaskName 'Vantare Strategy editorial' -Action $action -Trigger $trigger -Description 'Predigestión local de Strategy; no publica'
```

La cuenta que ejecuta la tarea necesita acceso de lectura a bundles, escritura
en la carpeta de ciclos, el repositorio y `go` en `PATH`. No se configura
ningún token ni clave. Para desinstalarla:

```powershell
Unregister-ScheduledTask -TaskName 'Vantare Strategy editorial' -Confirm:$false
```

## Artefactos fechados

Cada ciclo usa `<WorkRoot>\AAAA-MM-DD\`:

- `curator-summary.json`: resumen determinista técnico; no se entrega al LLM.
- `llm-report.md`: única entrada de datos para el LLM.
- `decision.template.json`: candidatos publicables, todos desmarcados.
- `cycle.log`: pasos `START/OK/WAIT/DONE` o `STOP` con acción concreta.
- `selection.approved.json`: aparece tras validar una decisión de Isaac.
- `catalog.unsigned.json`: aparece tras el builder; aún no está firmado.

## Análisis y decisión humana

1. Entrega al LLM solo `llm-editorial-prompt.txt` y `llm-report.md`.
2. Lee su recomendación como borrador, no como autoridad.
3. Copia `decision.template.json` a una ruta estable llamada, por ejemplo,
   `decision.approved.json`.
4. Cambia a `true` únicamente `includeReferenceProfile` y los `include` de los
   rangos aprobados. La etiqueta `combinación-N` enlaza el informe sin exponer
   el identificador técnico al LLM. No edites `contractVersion`,
   `summaryDigest`, `editorialLabel`, `combinationId` ni `rank`.
5. Reejecuta el runner con la decisión y metadatos revisados:

```powershell
.\scripts\Invoke-VantareEditorialCycle.ps1 `
  -BundlesPath C:\VantareEditorial\bundles-locales `
  -WorkRoot C:\VantareEditorial\ciclos `
  -RunDate 2026-08-22 `
  -DecisionPath C:\VantareEditorial\decisiones\decision.approved.json `
  -CatalogKeyEpoch 2026-08-a `
  -CatalogVersion 4 `
  -PreviousCatalogVersion 3 `
  -PublishedAt 2026-08-22T12:00:00Z `
  -ExpiresAt 2026-09-21T12:00:00Z
```

Si el resumen cambió, falta una combinación/rango, el contenido no es
producción, no alcanza `k=3` o no es publicable, el ciclo termina con `STOP` y
no crea una selección nueva. Fechas, época y versiones no salen del reloj: son
entradas explícitas que Isaac debe revisar.

## Gates que siguen pendientes de Isaac

- Autorizar y publicar el Worker antes de cualquier sincronización remota
  (gate 1 de ADR 0009). Este runner no contiene endpoint ni credenciales.
- Revisar `catalog.unsigned.json`, ejecutar `vantare-catalog sign` en el proceso
  offline separado y custodiar la clave fuera del repo.
- Autorizar expresamente la publicación del primer catálogo (gate 2). Ni el
  runner ni `vantare-catalog` publican, crean releases o usan GitHub.

## Cierre y diagnóstico

Un ciclo local está completo solo si el log termina en `DONE` y los artefactos
esperados existen. `WAIT Isaac decision` es un final correcto del primer paso,
no una aprobación. Ante `STOP`, corrige el primer mensaje indicado y reejecuta
la misma fecha; no edites manualmente el resumen, el informe, la selección
generada ni el catálogo.
