# ISA-819 — Recuperación del store autorizado, corte 1

Base: `f29fe3d6` (documentación de #1030 sobre producto `nightly@d6d0992f`).
Rama: `vantareapp/isa-819-authorized-store-recovery`. Isaac autorizó continuar
los microplanes el 2026-09-08. No integra cambios en Nightly.

## Comportamiento

El store guarda `authorized-sessions.json.bak`: primera generación al crear,
generación anterior en actualizaciones posteriores. Al abrir, prima un primary
válido. Si falta o es inválido, valida completamente el backup con el mismo
decoder estricto y validación de autorización que usa el primary. Si puede
recuperar, conserva los bytes dañados en un `.corrupt-*` único antes de restaurar.
No consulta DuckDB ni reconstruye autorización mediante descubrimiento.

`RecoveredFromBackup()` comunica recuperación; `ErrCorruptAuthorizedSessionStore`
distingue datos irrecuperables de una biblioteca nueva (solo ambos ausentes).
La recuperación puede retroceder una generación: no promete conservar la última
adición si esa generación se perdió. El siguiente corte debe hacerlo visible.

Una escritura rechaza primary corrupto antes de reemplazar el backup. Si falla
la primera sustitución después de escribir el backup, devuelve
`ErrAuthorizedSessionCommitUncertain` y bloquea nuevas adiciones hasta reabrir.
No afirma que esa operación fallida no haya persistido. No cambia schema v1 ni
autoriza un modelo que el decoder anterior rechazara.

## Verificación

- RED antes del fix: truncado e inválido fallaban al abrir; primary ausente
  devolvía lista vacía. Tres casos de `TestAuthorizedSessionStoreRecoversBackup`.
- GREEN: `go test ./internal/telemetryanalysis -count=1`, PASS (0.354 s Go).
- Cobertura adicional: ambos archivos inválidos/ausentes, cuarentena exacta,
  recuperación de generación anterior, conservación de backup ante escritura
  sobre corrupción y fallo inyectado antes de cada sustitución. Se comprueba
  reapertura tras escritura incierta y bloqueo de nuevas adiciones.
- `pnpm --dir frontend build`: PASS; solo para generar los assets que Go embebe.
  Dependencias existentes restauradas offline con lockfile congelado; sin cambios
  de manifiesto/lockfile. Advertencia existente de chunks >500 kB.
- `go test ./...`: PASS, exit 0; log local `C:/tmp/isa819-go-test.log`.
- `gofmt` y `git diff --check`: PASS. Sin cambios frontend; no se ejecutaron
  tests/lint frontend ni Wails/LMU, ajenos al comportamiento de este corte.

Los fallos de I/O son inyecciones de test, no cortes físicos de alimentación.
Se conserva el mecanismo de temporales sincronizados y `os.Rename` del store;
no se afirma durabilidad ante toda avería de disco ni coordinación multiproceso.
No se tocó ningún catálogo real de Isaac ni se arrancó/cerró LMU.

## Pendiente y revisión manual

#819 sigue abierta: falta recuperación de cold-start y transportar corrupción/
recuperación al estado visible de Strategy. El composition root aún puede degradar
un fallo irrecuperable a catálogo vacío; este corte no resuelve ese extremo.

Verificación segura: ejecutar los tests anteriores en esta rama. Crean sus
catálogos exclusivamente en `t.TempDir`; no corromper archivos de la instalación.
La aceptación visual Wails corresponde al segundo corte, aún no implementado.
