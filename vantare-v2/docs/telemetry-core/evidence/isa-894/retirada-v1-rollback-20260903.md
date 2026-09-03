# ISA-894 · R0 — artefacto y compatibilidad de rollback

Fecha: 2026-09-03. Referencia: [maestro vigente](../../../superpowers/specs/2026-09-03-telemetria-v2-plan-maestro.md).
**Resultado: copia verificada y compatibilidad estática delimitada; restauración funcional NO ejecutada.**

## Manifiesto privado, sin distribución

| Campo | Valor comprobado |
| --- | --- |
| Commit de código | `4864b5c6cd5bd8bc0f9b7279ac6f9a83e438253c`, objeto Git existente |
| Origen | `C:\tmp\vantare-redline-integration\vantare-v2\vantare-v2\bin\vantare-redline-rfix4-4864b5c6.exe` |
| Copia nueva | `C:\tmp\vantare-v1-rollback-4864b5c6-20260903\vantare-redline-rfix4-4864b5c6.exe` |
| Tamaño | 30.851.584 bytes |
| SHA256 de ambos | `cb69a4d56ca7cb59078cb7bd7e223b33c34aa927ec808c2e49154386b878faba` |
| Operación | Crear directorio inexistente, copiar sin sobreescribir, comprobar hash antes/después |
| No realizado | Ejecutar/instalar/subir exe, extraer configuración, copiar datos privados o secretos |

La copia conserva configuración embebida: queda fuera de Git y no debe adjuntarse
a una issue/PR. El hash prueba identidad de bytes, no funcionamiento. La evidencia
S3 previa sigue siendo histórica y acotada; R0 no la repite ni la amplía.

## Compatibilidad comprobada en código

`git diff 4864b5c6cd5bd8bc0f9b7279ac6f9a83e438253c 8e8ec17b2d2b660d717316c10925a6b93d073d1c --name-only`
devuelve sólo catorce documentos/roadmap. **El código de la referencia y la base R0
es idéntico**, incluidos stores, migraciones y resolución de rutas. Además,
`git show 4864b5c6:.../pkg/config/profile_v4.go` confirma `ProfileSchemaVersionV4 = 4`.
No se sostiene la hipótesis inicial del lector de que 4864 sólo entienda perfiles V3.
Tampoco existe un downgrade nuevo de settings entre esas dos bases.

Rutas relativas de código bajo `vantare-v2/`, líneas de `8e8ec17b`:

| Store / resolución | Lectura y escrituras relevantes | Decisión para retirada |
| --- | --- | --- |
| `cmd/vantare/main.go:134-182`, `configsDir()` | Prioridad: `configs` junto al exe; `configs` o `vantare-v2/configs` del CWD; después UserConfigDir/Vantare/configs. La última crea carpeta/ejemplos ausentes. | KEEP. Mover el exe puede cambiar el store efectivo; copiarlo NO conserva automáticamente la ruta original. |
| `internal/app/settings_service.go:491,747-907` | Schema 6; migración normal en memoria. Recovery `.failed` reciente puede persistirse en principal; sidecar viejo/inválido se elimina. Main corrupto intenta `.bak`, después defaults. | KEEP. No describir arranque como read-only ni recovery como backup suficiente. |
| `settings_service.go:908-1030`; `main.go:1000,2719`; `hub_service.go` | Guardado de settings/onboarding/política/perfil activo; temporal, `.bak` y `.failed`. | KEEP. R1 no cambia schema, serialización ni rutas; impedir cambios oportunistas de persistencia. |
| `pkg/config/profile_v3_store.go:55-115`, `profile_v4_migrate.go:15-30` | Carga V4 admite documentos 0–4 y normaliza en memoria; SaveV4 persiste V4 con copias previas y control de revisión. Un lector V3 puro no admite 4, pero no es la referencia 4864. | KEEP. No bajar a V3 ni perder política/perfil activo; no usar la retirada de V1 para migrar perfiles. |
| `internal/app/studio_profile_delta.go:91`, `studio_profile_runtime.go`, `hub_service.go` | Edición/política/selección/hotkeys pueden guardar; un mutex de proceso no protege dos exes sobre los mismos datos. | KEEP. Sólo una build activa sobre ese store. |
| `internal/updater/settings.go:52-86`; `main.go:2054` | Load de JSON inválido puede renombrar a `.corrupt`; instalación es acción distinta. | KEEP. No cambiar canal ni invocar updater como parte del rollback. |
| `internal/app/widget_design_service.go:91-152` | Diseños/legacy presets se cargan; Save persiste atómicamente. | KEEP; no tocar diseños del usuario. |
| `internal/app/calendar_service.go`, `main.go:2293,2324` | Calendar/inbox son fuentes auxiliares, con escrituras al importar/reemplazar. | KEEP. No copiar/importar para R0; writer auxiliar no auditado exhaustivamente. |
| `main.go:187-274,2377-2389` | Sesiones, logs y Strategy tienen raíces distintas según instalado/portable. TTS usa UserCacheDir. | KEEP. Excluir del supuesto de que basta copiar `configs`. |
| `main.go:103-110,1774,1823-1941`; `authsession/store.go`, `protectedstore/store_windows.go` | Cache de licencia y Credential Manager/DPAPI; pueden quedar compartidos fuera de una carpeta portable. | EXCLUIR secretos/auth/licencia de cualquier copia de datos propuesta. Compatibilidad auth/instalador no certificada por R0. |

## Procedimiento futuro y límites

1. Antes de probar un candidato nuevo, contrastar su diff con 4864 en stores,
   schemas, rutas y arranque. R1 sólo puede tocar pull/wiring/tests, no esos stores.
2. Resolver **por código y metadatos**, sin imprimir contenido, qué `cfgDir` usará
   cada exe y con qué CWD. No lanzar la copia desde un CWD arbitrario: podría
   seleccionar otra carpeta o sembrar ejemplos.
3. Si se necesita duplicar/restaurar datos privados, pedir autorización separada
   con lista exacta de archivos y excluir auth/licencia/secretos. R0 no autoriza
   ni ejecuta un backup global de AppData o un downgrade.
4. Cerrar normalmente el candidato; no tener ambas builds escribiendo el mismo
   store. Elegir la build preservada con ruta de configuración ya comprobada.
   No instalar, actualizar canal, ni aceptar conversiones de datos como atajo.
5. Isaac realizará la prueba física imprescindible (máximo cinco minutos por
   comprobación), si procede: confirmar perfil/política y presentación tras
   arranque/cierre normal. Registrar resultado real; no se exige conducir LMU.

**Stop:** nueva migración irreversible, ruta ambigua, recovery/corrupción o
necesidad de restaurar datos privados impiden prometer rollback seguro. Requieren
resolver ese riesgo, no reiniciar automáticamente los soaks históricos.

Revisor lector Muse: `ses_f97d0a6f5ffe8clDFCBlgrBxqZ`, snapshot `8e8ec17b`, sin
ediciones ni pruebas. Main contrastó diff de commits, schema V4, `configsDir` y
recovery settings. Se descartaron del informe la hipótesis pre-V4, fijar canal
`stable` y copiar AppData indiscriminadamente: no son necesarias ni autorizadas.
