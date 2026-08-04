# Testing Center — handoff humano a Codex Cloud

Estado: TAU-07J / ISA-248 preparado localmente. No existe asignación automática,
API de OpenAI, caller remoto, secreto, deploy, merge ni promoción.

## Propósito

Convertir un dossier `testing-center.codex-dossier.v1` completo y persistido en
una tarea que Isaac puede revisar y abrir manualmente en Codex Cloud. El handoff
no concede autoridad: solo fija repositorio, SHA de origen, rama de corrección,
base de PR, paths, command IDs y criterios ya verificados.

El texto del tester aparece únicamente dentro de `untrustedEvidence`. Nunca se
interpreta como path, comando, objetivo, permiso o instrucción.

El digest detecta mutaciones, pero no autentica el origen como lo haría una
firma. El caller futuro debe cargar el dossier desde almacenamiento server-side;
nunca debe aceptar un dossier, handoff o digest aportado por el cliente. El
renderer vuelve a comprobar forma cerrada, saneado y digest antes de producir el
texto de la tarea.

## Precondiciones

1. La candidata exacta está rechazada y bloqueada.
2. Isaac ha elegido `create_correction_subissue`.
3. Existe una sub-issue Linear distinta con rama `vantareapp/isa-*`.
4. El dossier completo está congelado y su digest ha sido verificado.
5. La rama de corrección existe en GitHub exactamente en el SHA de `nightly`
   incluido en el dossier.

Si falta cualquiera, no se genera una tarea y el estado continúa
`needs_owner`.

## Flujo humano

1. La capa server-side llama a
   `buildTestingCenterCodexHumanHandoff(...)` con el dossier persistido.
2. Isaac revisa la proyección y abre Codex Cloud.
3. En la UI de Codex selecciona fuera del prompt:
   `isaacalbala12/Vantare-Simracing-Suite`, environment
   `vantare-codex-cloud` y la rama exacta de corrección.
4. La capa server-side genera y muestra el texto de
   `renderTestingCenterCodexTask(...)`; Isaac lo pega en la tarea.
5. Codex ejecuta primero el comando fijo de preflight. Si no devuelve `READY`,
   responde `NEEDS_OWNER` sin editar, commit ni PR.
6. Con `READY`, trabaja solo en los paths y command IDs fijados y abre una PR a
   `nightly` para revisión humana.
7. Codex nunca aprueba, mergea, despliega ni promueve.

## Particularidad de Codex Cloud

El checkout interno puede mostrar la rama local `work` aunque Isaac haya
seleccionado correctamente otra ref en la UI. Por eso el preflight no compara
ese nombre local: exige `HEAD` y base exactos, árbol limpio, marcadores del repo
y ancestry real.

Si el sandbox no expone `origin`, el resultado sigue siendo `READY` pero marca
`requiresHumanRepositoryConfirmation=true`. Esa confirmación procede
exclusivamente de la selección visible hecha por Isaac antes de crear la tarea.
Si existe un remote y apunta a otro repositorio, el resultado es
`NEEDS_OWNER`.

## Verificación local

```powershell
deno check --no-lock `
  supabase/functions/_shared/testing-center-codex-human-handoff.ts `
  supabase/functions/_shared/testing-center-codex-human-handoff.test.ts

deno test --no-check --no-lock `
  supabase/functions/_shared/testing-center-codex-human-handoff.test.ts

node --test `
  vantare-v2/tools/testing-center-codex-preflight.test.mjs
```

El gate manual de ISA-248 exige observar una tarea creada desde un dossier
sintético completo y una PR con head/base correctos. El paquete local y sus
tests no sustituyen esa observación.

## Stop y rollback

- Dossier incompleto, digest alterado, paths/comandos no permitidos, HEAD/base
  distintos, árbol sucio o remote incorrecto: `NEEDS_OWNER`.
- Timeout o resultado ambiguo de Codex: no retry automático.
- Rollback: revertir el commit de ISA-248. No hay estado remoto nuevo que
  limpiar porque este corte no activa ningún caller.
