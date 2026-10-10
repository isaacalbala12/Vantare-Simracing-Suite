# #1565 · preparación para GitHub Free privado

Decisión de Isaac: GitHub Free, runners propios Linux/Windows y destino público
de descargas; acepta perder branch protection. Esta rama prepara el corte, no
lo integra ni publica. La visibilidad la cambia Isaac. No se recrea plan.md.

## Hitos y aprobaciones

1. Runners: scripts, etiquetas, limpieza y pausa en
   [tools/ci-runners](../../tools/ci-runners/README.md). Plan aprobado:
   Windows 192.168.1.57:C:/VantareCI/runner y Linux candidato WSL2 en ese PC,
   cuentas vantare-ci no privilegiadas. Instalacion autorizada solo cuando Isaac diga PC listo.
   Falta Windows reinstalado y smoke WSL2 tras reboot; PC de juego excluido. No registrar
   ni iniciar mientras el repo sea público. Al privatizar los gates quedan
   pendientes hasta que los runners estén registrados; no compran nube por fallback.
2. Descargas: `isaacalbala12/Vantare-Downloads` creado con autorizacion, publico,
   solo README, cero releases. Firma/publicacion productiva prohibidas hasta version integrada/verificada.
   [Contrato y transición](../native/packaging/README.md#1565--transición-del-feed-antes-de-privatizar).
   El corte exige Setup sobre instalación previa para renovar beta.ps1 raíz;
   ZIP solo no basta. Confirmar datos, origen y rollback con QA antes del corte.
3. Storage: retención de preview Discord a un día y preflight conservador a
   450 MiB; inventario/exportador no borra. Con autorizacion se retiraron SOLO
   siete IDs, 185.633.459 bytes; quedan 13 artifacts/423,82 MiB. Las veinte
   copias CRC/SHA256 y auditoria viven en C:/tmp/1565-impl/artifact-export y artifact-deletions.json.
   Borrar cualquier artifact requiere lista y confirmación, con exportación
   CRC/SHA256 cotejada. No se promete cuota de cuenta compartida solo con esta foto.
4. Checks y canal: seguir ejecutando gates aun sin enforcement de plataforma.
   La aceptación de perder branch protection no autoriza promoción automática
   de esta entrega a nightly/testers/master. Deployment privado Free queda
   inerte porque perdería environment approvals; mantener procedimiento manual.

## Dependencias públicas: resolución o pendiente explícito

| Dependencia | Estado de esta entrega |
|---|---|
| Feed/ZIP/EXE | Origen y comando de publicación preparados; destino creado; construir, firmar, publicar y migrar usuarios pendientes de integracion/aprobacion/evidencia |
| Bootstrap antiguo | Ruta manual por Setup documentada. No actualización automática de bootstrap ni adopción de usuarios acreditada |
| Legado Go/Electron | No reintroducir código retirado; inventariar usuarios restantes y distribuir transición manual antes de privatizar |
| Discord development | Tracker privado no se consulta ni se exporta al digest público; publica estado honesto sin novedades. Preview editorial sigue usando fragments revisados |
| Master histórico release/Discord | Los workflows default master no se cambian desde esta rama de nightly; incluir sus links de descargas en la promoción aprobada antes de corte |
| Web independiente | Repo web ya privado; no se edita aquí. Validación pública ES/EN de URLs de descarga tras publicar destino queda pendiente; no se presume prueba de producción |
| Roadmap #1535 | Lectura actual de Supabase independiente; no usar Project público como proxy de issues privadas. Activación/lectura de producción pendiente del expediente #1535 |
| Docs/enlaces a issues/blob/actions | Referencias técnicas internas preservadas; miembros autenticados pueden leer. Ayuda pública debe publicar contenido curado en web, no exposición del código |
| GitGuardian | Confirmar instalación y cobertura del repo privado/Starter antes de corte. No instalar ni activar App sin revisar acceso |
| Testing Center/T3/gh | Transportes autenticados continúan en GitHub; verificar permisos de App tras corte. Workflows inertes se mantienen inertes |
| Releases existentes y forks | Releases actuales se conservan; no borrar histórico ni prometer revocar copias/forks ya públicos |

El objetivo 0 € es plataforma: los runners consumen electricidad y mantenimiento.
Nueva hipótesis de un PC siempre encendido: extra 60 W ×158,01 h ×0,20 €/kWh
≈1,90 €/mes; WSL2 +5 W solo durante 48,54 h Linux ≈0,05 € más, sin medición.
Jobs alojados pequeños/de secretos deben quedar dentro
de 2.000 minutos Free compartidos y presupuesto de exceso cero; el plan no
autoriza gastar ni mover secretos a un runner de PR.

## Checklist de aceptación antes de que Isaac privatice

- [x] Aprobado plan de runners y creado repo publico, solo README, cero releases.
- [ ] Isaac dice PC listo antes de instalar; no usar PC de juego.
- [ ] Runner instalado en VM/cuenta segura, smoke real Linux/Windows y pausa.
- [ ] Destino anónimo, bytes/firma/hash correctos y Setup de transición probado.
- [x] Veinte exportaciones preservadas y saldo 423,82 MiB tras borrado autorizado.
- [ ] Presupuesto cero/cuota de cuenta comprobados por Isaac.
- [ ] GitGuardian, App, web, Discord y roadmap verificados según sus permisos.
- [ ] Decisión manual de despliegue sin environment approvals privados Free.
- [ ] Promoción de cambios por canal aprobada y clientes antiguos migrados.

No marcar estos puntos por haber escrito scripts o pasado pruebas simuladas.
