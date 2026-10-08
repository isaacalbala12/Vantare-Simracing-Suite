# ISA-819 — reconciliación tras recuperación

Corte personal desde `bb266977`, rama `vantareapp/isa-819-catalog-reconciliation`.

## Comportamiento y reproducción

Los archivos de progreso y catálogo conservan backups independientes. Restaurar
uno podía anunciar sesiones que ya no estaban disponibles o volver a importar
sesiones presentes. Las regresiones reproducen ambos desfases sin tocar fuentes.
El catálogo autorizado es la autoridad: una pérdida se convierte en fallo
`catalog_entry_missing`, con reintento explícito; las sesiones conservadas se
omiten al importar. Una consulta no concede consentimiento y el rechazo permanece.

Los totales cuentan la unión de locators procesados y descubrimiento actual.
La prueba de una sesión retenida fuera de la carpeta y dos candidatas falló
primero por finalización prematura y después por discrepancia entre Status y
Progress; ambos caminos usan ahora el mismo cálculo.

## Revisión personal

- Correctitud: pérdidas, progreso atrasado, fallo de catálogo, rechazo,
  consentimiento y contadores entre tandas cubiertos.
- Simplicidad: helper local y mapas de identidad; reutiliza store y persistencia.
- Arquitectura: sin esquema, dependencia o protocolo nuevos.
- Seguridad: locator tomado de procedencia validada por el store; discovery no
  autoriza una sesión. Error al leer catálogo no se interpreta como catálogo vacío.
- Rendimiento: lectura del catálogo por operación; ninguna lectura de DuckDB
  adicional al reconciliar. No se añade caché que pueda quedar obsoleta.

## Verificación

- Regresiones RED/GREEN; `go test ./internal/strategy/coldstart -count=1`: PASS.
- `pnpm --dir frontend build`: PASS; aviso existente de tamaño de chunks.
- `go test ./...`: PASS, exit 0; log local `C:/tmp/vantare-isa819-reconcile-go-final.log`.
- No cambios TypeScript; no se repite la suite frontend.
- Wails visual y corrupción de un perfil real: no ejecutados; usar perfil de
  prueba separado. Reproducir tests de reconciliación sin abrir LMU.

Sin cambios de originales, LMU, push, PR, CI remota, merge, promoción o release.
Los límites #821/#445 y el gate empírico #1030 siguen pendientes.
