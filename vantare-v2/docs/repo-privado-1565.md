# #1565 · repo privado con GitHub Free

Decisión de Isaac (2026-10-10): GitHub Free privado, runners propios en
192.168.1.57 (#1583) y repo público solo de descargas. Acepta perder branch
protection: se mergea directo y se revierte si algo falla. La visibilidad la
cambia Isaac; ningún script la cambia.

Decisión del orquestador (2026-10-13): feed **en seco** a
`isaacalbala12/Vantare-Downloads`, sin feed doble ni renovación automática del
bootstrap (~3 instalaciones). La 0.0.976 se publica solo en Downloads, con una
única firma, y cada instalación pasa a ella reinstalando con Setup. Contrato y
QA aislada: [packaging/README.md](../native/packaging/README.md#1565--feed-en-vantare-downloads-cambio-en-seco).

## Dependencias de que el repo sea público

| Dependencia | Estado |
|---|---|
| Feed, ZIP y Setup nativos | `beta.ps1` lee `Vantare-Downloads`; la transición exige reinstalar con Setup 0.0.976 (QA PASS). |
| Releases antiguas (`v0.1.0.7-*`, `native-beta-v0.0.975`) | Se conservan; dejan de descargarse al privatizar. |
| App Go/Wails retirada (`master`, feed `Vantare-Overlays`) | Sin actualización tras privatizar; aviso manual de instalar el Setup nativo. |
| Web (`vantare-simracing-suite-web`) | No enlaza descargas de GitHub; cuando lo haga, a `Vantare-Downloads`. |
| Roadmap | Hub y digest de Discord leen la publicación de Supabase (#1535); no dependen del repo. |
| Discord legacy en `master` | Los cuatro workflows están deshabilitados. |
| Latido Supabase | Enlaza runs de Actions; tras el corte solo los abre Isaac. |
| Testing Center / Functions | Llaman a la API con token: verificar permisos sobre el repo privado tras el corte. |
| GitGuardian | Corre como check en los PR (GitHub App). Isaac confirma en su dashboard que la App sigue cubriendo el repo privado. |
| Badges / enlaces en la app | No hay. |

## CI en Free privado

- Branch protection (`develop`, `master`, `nightly`, `testers`) queda
  configurada pero **no se aplica**; no hay rulesets. Los gates siguen
  ejecutándose, pero no bloquean.
- Los environments `supabase-*` se ignoran (secretos y aprobaciones):
  `deploy-supabase-functions.yml` queda inerte en privado; ver despliegue
  manual. Los secretos no se mueven.
- 2.000 min/mes (Windows ×2): el uso medido ronda o supera el límite. Los
  gates usan runners `self-hosted` con etiqueta `vantare-1565` cuando el repo
  es privado ([tools/ci-runners](../../tools/ci-runners/README.md)); hasta
  registrarlos (#1583), quedan en cola.
- Artifacts: 500 MB. Previews de Discord con retención de un día y
  presupuesto previo de 450 MiB sin borrado automático. Saldo tras el borrado
  autorizado: 13 artifacts, 423,82 MiB.

## Runbook de Isaac: 0.0.976 en Vantare-Downloads

Desde `vantare-v2/`, con nightly integrado y el árbol limpio; USB conectado
solo durante el paso 1.

1. **Construir y firmar (una sesión USB):**
   ```powershell
   powershell -NoProfile -File native/packaging/publish-beta.ps1 -Version 0.0.976 `
     -OutputDirectory C:/tmp/release-0.0.976 -ConfigFile <config-produccion> `
     -SigningKeyFile <ruta-en-USB> -Notes '<notas revisadas>'
   ```
   Retirar el USB. El script verifica el sobre con el verificador del paquete
   e imprime el `gh release create … --repo isaacalbala12/Vantare-Downloads`.
2. **Comprobar antes de publicar:** los `.sha256` coinciden con
   `Get-FileHash`; `vantare-native-beta.json` apunta a
   `https://github.com/isaacalbala12/Vantare-Downloads/releases/download/native-beta-v0.0.976/vantare-native-amd64-package.zip`.
3. **Publicar solo en Downloads:** ejecutar el `gh release create` impreso
   (prerelease, cinco assets). No publicar nada en el repo de código.
   Comprobar en una sesión sin login que se descarga el Setup.
4. **Reinstalar (Isaac):** cerrar Vantare, ejecutar `VantareSetup.exe`
   0.0.976 sobre la instalación existente y abrir Vantare. Ajustes →
   Actualizaciones debe mostrar 0.0.976 y «Estás al día». Si Setup pide
   «abre Vantare y ciérralo», hacerlo y repetir. Perfiles y ajustes se
   conservan (QA aislada PASS).
5. **Avisar al tester:**
   > Hay una nueva versión de Vantare (0.0.976). Esta vez no llega sola: cierra
   > Vantare, descarga el instalador desde
   > https://github.com/isaacalbala12/Vantare-Downloads/releases/tag/native-beta-v0.0.976
   > y ejecútalo. Tus perfiles y ajustes se conservan. A partir de ahí las
   > actualizaciones vuelven a llegar solas.
6. **Antes de privatizar:** Isaac y el tester en 0.0.976; GitGuardian
   confirmado; runners listos para registrar (#1583). Después: cambiar la
   visibilidad, registrar los runners y verificar el Testing Center.

## Despliegue manual de Supabase Functions tras privatizar

Con el CLI de Supabase 2.105.0 y la sesión propia de Isaac
(`supabase login`), desde la raíz del repo:

```powershell
# superficie commercial
./supabase/functions/scripts/deploy-approved-functions.ps1 -ProjectRef <project-ref>
# superficie native-license
./supabase/functions/scripts/deploy-approved-functions.ps1 -ProjectRef <project-ref> -Functions native-license
```

Es el mismo wrapper que usaba el workflow; la aprobación del environment pasa
a ser la decisión explícita de Isaac antes de ejecutarlo.

## Checklist antes de que Isaac privatice

- [x] Repo `Vantare-Downloads` público, solo README.
- [x] Feed en seco y tests de origen; QA aislada de reinstalación PASS.
- [ ] 0.0.976 firmada y publicada solo en Downloads (Isaac).
- [ ] Isaac y el tester reinstalados con Setup 0.0.976.
- [ ] GitGuardian confirmado y runners preparados (#1583).
- [ ] Usuarios de la app Go avisados.
