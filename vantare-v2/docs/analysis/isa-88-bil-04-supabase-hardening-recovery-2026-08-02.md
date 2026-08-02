# ISA-88 / BIL-04 — Supabase hardening y recuperación

Fecha: 2026-08-02

Base exacta: BIL-03 `2a6288a36e368b322e8262534988277d1e16025e`

Estado: implementación aislada; sin deploy ni mutación remota; venta pública **NO-GO**.

## Objetivo y límites

Supabase se mantiene como identidad y almacenamiento operacional. Polar sigue siendo la autoridad comercial y Vantare resuelve capabilities, dispositivo y licencia offline. Este corte endurece el acceso existente; no habilita pagos, no modifica el catálogo, no aplica migraciones remotas y no convierte Supabase en autoridad comercial.

## Auditoría read-only remota

La inspección se limitó a metadata segura del proyecto oficial. Se observaron únicamente tres Functions activas: `billing-checkout`, `billing-portal` y `billing-webhook`. No se observó `validate-license` desplegada. Las consultas de tablas y migraciones agotaron el tiempo de espera y el advisor indicó un proyecto dormido/pendiente de despertar; no se reintentó de forma agresiva. No se consultaron filas, logs, usuarios, emails, tokens, claves ni contenido comercial. No hubo mutaciones.

Conclusión: el estado remoto de backups, PITR, migraciones y grants no está probado. Debe verificarse de forma autorizada antes de producción; este corte no afirma que exista una recuperación remota operativa.

## Cambios realizados

### Intento OAuth previo al navegador

- La app crea el intento antes de solicitar a Supabase la URL y antes de abrir el navegador.
- Cada intento liga `provider + attempt_id + state`, tiene TTL real y consumo atómico de un solo uso.
- Un callback no solicitado, con proveedor/estado sustituido, reutilizado o expirado devuelve `401` antes de emitir tokens.
- Dos callbacks concurrentes con el mismo intento producen exactamente un éxito.

### Sesión protegida

- Supabase deja `persistSession` desactivado en WebView.
- Access y refresh token se guardan únicamente tras una validación backend aceptada.
- En Windows se usa Credential Manager para el usuario local; no existe fallback a texto plano.
- Al iniciar, el backend entrega la sesión protegida a la memoria de Supabase, que puede refrescarla y revalidarla.
- El bridge vive en la raíz de React: no depende de `LoginScreen` ni de que exista caché de licencia.
- Las rotaciones solo persisten después de que el backend haya validado o restaurado una sesión confiable; una sesión WebView arbitraria no puede fijarse.
- Restore elimina una credencial protegida inválida o corrupta, incluidos blobs de Windows Credential Manager nulos o vacíos, y emite un estado sanitizado; no deja un secreto irrecuperable provocando el mismo fallo en cada arranque.
- Restore, rotación y borrado están serializados. Un refresh concurrente no puede escribir una sesión después de que el logout haya terminado.
- Las claves legacy legibles de Supabase se eliminan de `localStorage` sin copiar su contenido.
- Cerrar sesión usa un request/ack tipado y correlacionado. La UI solo abandona el estado local después de confirmar el borrado protegido; después intenta el cierre remoto y presenta ambos resultados por separado.

### Licencia y dispositivo

- `claim_active_device(fingerprint)` contiene la mutación explícita de alta/last-seen.
- `read_account_entitlements()` es una lectura estable sin efectos laterales.
- El wrapper legacy permanece temporalmente por compatibilidad, pero ya es read-only.
- El cliente Go ejecuta claim y lectura como llamadas separadas y deja de enviar fingerprint al RPC de lectura.
- `device_ok` deja de afirmar una comparación que el RPC puro no podía conocer; la lectura expone el hecho `device_bound` y el wrapper con fingerprint conserva su comparación real.
- Reset usa el fingerprint explícito, cambia el binding bajo lock/rate limit y ya no ignora su argumento.
- Las siete funciones cubiertas por el esquema vigente, incluidas las tres RPC de checkout, declaran y verifican sus contratos de `SECURITY DEFINER`, `search_path` y ejecución mínima.
- Tests negativos cubren claim, lectura, wrapper, reset y las tres RPC de checkout; `anon` no puede ejecutar RPCs ni authenticated escribir tablas sensibles directamente.

### Superficie desplegable

- `validate-license` se mueve a `_deprecated/validate-license` como archivo histórico no desplegable.
- Un verificador falla si aparece una Function superior distinta de las tres aprobadas. El único workflow de despliegue llama a un wrapper que ejecuta ese guard antes de invocar Supabase y usa una lista aprobada fija.
- No se borró su historia ni se desplegó ninguna Function.

### Backup y restauración

- El runner crea instalaciones clean y upgrade sobre PostgreSQL 17 desechable.
- Ejecuta 48 pruebas pgTAP con roles negativos, confirma que las lecturas no mutan timestamps y prueba carreras reales claim/claim, claim/reset y reset/reset mediante barreras.
- `pg_restore --exit-on-error` se comprueba inmediatamente; un restore fallido no puede continuar como PASS.
- Tras restaurar se repite pgTAP y se verifican RLS, grants y datos centinela.
- Dos fixtures negativas, una truncada y otra con cabecera corrupta, deben fallar con `pg_restore --exit-on-error`; cualquier éxito inesperado invalida el drill.
- Resultado local observado: restauración completa por debajo de 6 s en los drills ejecutados. No representa un RTO productivo.

## Política de recuperación propuesta

- RPO operativo: máximo 24 h mientras PITR remoto no esté contratado y verificado; objetivo de 5 min solo después de comprobar PITR real.
- RTO operativo: objetivo de 4 h, condicionado a un drill remoto autorizado y a documentación de credenciales/ownership.
- Retención: backups diarios durante 30 días; el proveedor y la política legal deben confirmarse antes de activarlo.
- Prueba: restauración trimestral en un proyecto desechable, nunca sobre producción.
- Un backup no se considera válido hasta completar una restauración y checks de permisos, funciones y datos de control.

## Evidencia

- Go: los tests de login-CSRF/session fixation/replay/concurrencia pasan y `authsession` más el conjunto de seguridad OAuth se repitieron 50 veces; paquetes focales, compilación de `cmd/vantare` y vet focal pasan. El rerun global agregado excedió el límite de 220 s sin identificar un paquete fallido y no se presenta como PASS de esta corrección; el global del commit previo sí estaba verde.
- Race focal no pudo ejecutarse porque el toolchain local de Windows no tiene CGO; no se presenta como PASS.
- Frontend: 1.624/1.624 tests globales y 64/64 focales pasan; logout local/remoto, request/ack correlacionado, timeout y estados de cuenta están cubiertos. Build y lint focal pasan.
- Lint global conserva cuatro errores preexistentes fuera del alcance en Calendar y un mock de runtime; no se ocultaron ni modificaron.
- Deno: 67/67 tests, typecheck y los verificadores PowerShell/Deno de superficie desplegable pasan.
- PostgreSQL: clean, upgrade, 48 pruebas pgTAP, carreras claim/claim, claim/reset y reset/reset, restore válido y restores truncado/corrupto fail-closed pasan en PowerShell 5.1 y 7.
- Checks globales y de carrera se registran en la entrega final de la rama.

## Riesgos y gates

- Falta aplicar y verificar la migración sobre remoto mediante un change autorizado.
- Falta inventario remoto de RLS/grants/migrations y configuración real de backups/PITR.
- Falta smoke empaquetado con OAuth real y comprobación visual del Credential Manager.
- La política de lifecycle, grants por fuente y reconciliación sigue en BIL-02/BIL-05 y posteriores.
- Nada de este corte autoriza venta pública, deploy, pagos, refunds, promoción o merge.
