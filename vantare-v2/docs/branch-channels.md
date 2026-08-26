# Canales de ramas y promociones

## Contrato canónico

```text
rama de issue
    ↓ aprobación inicial de Isaac
nightly
    ↓ feedback y correcciones de Pro Plus
testers
    ↓ validación amplia y aprobación final de Isaac
master
```

`master` continúa siendo la rama pública y la rama predeterminada de GitHub.
Una rama de issue nunca se integra directamente en `testers` o `master`.

## Checkouts de trabajo

- El checkout principal para abrir la aplicacion y validar el conjunto debe
  seguir `nightly` y estar limpio.
- Las features, bugs, investigaciones con docs y refactors se ejecutan en
  ramas/worktrees de issue; no se desarrollan directamente sobre `nightly`.
- Un checkout historico sucio en `refactor` o `develop` se preserva. No se
  cambia de rama, limpia, resetea ni reutiliza hasta inventariar su trabajo.
- La rama local puede quedar atrasada: antes de afirmar que algo esta en
  Nightly se verifica `origin/nightly`, su SHA, PR/CI y, si aplica, la
  pre-release remota.

## Responsabilidad de cada rama

| Rama | Contenido | Audiencia | Puede publicar una release estable |
|---|---|---|---|
| Rama de issue | Un corte aislado, probado y revisado | Desarrollo | No |
| `nightly` | Implementaciones aceptadas inicialmente | Pro Plus | No |
| `testers` | Conjunto corregido y candidato a lanzamiento | Pro Plus y Launch Edition | No |
| `master` | Última versión pública aprobada | Todos los usuarios | Sí, mediante tag |

La promoción a `nightly` requiere la aprobación inicial explícita de Isaac. El
paso de `nightly` a `testers` requiere haber registrado y resuelto el feedback
aplicable. Solo Isaac puede autorizar `testers` a `master`.

## Automatización

### Contrato de roadmap

- Las ramas `vantareapp/isa-N-*` y los hotfix ISA validan la issue N y su
  decision `roadmap:required`/`roadmap:not-required` antes del merge.
- `bot/roadmap-digest` es una excepcion exacta hacia `nightly`: solo puede
  cambiar `vantare-v2/docs/roadmap/roadmap.json`, derivado del plan y del
  estado base confiable. No puede modificar `plan.md`, no se autoanuncia como
  entrega y no tiene auto-merge.
- En `merge_group` se revalida la coherencia del arbol sintetico; no se intenta
  recuperar una rama ISA que el evento no expone.
- La ruta usa `pull_request`, `push` y `merge_group` con permisos de lectura.
  Nunca ejecuta el candidato con `pull_request_target` ni concede autoridad a
  texto libre de la issue.

La proteccion efectiva requiere que el check `Validate promotion path` siga
siendo obligatorio y que los cambios en `.github/`, `AGENTS.md` y
`docs/roadmap/` requieran Code Owner review. La existencia de `CODEOWNERS` no
demuestra por si sola que la configuracion remota ya lo exija.

ISA-860 versiona el gate inicialmente como auditoria. Activarlo como bloqueo
requiere migrar las PR vivas y separar la identidad que abre PR de la que hace
Code Owner review; con una unica cuenta se produciria un deadlock. La
activacion es una issue posterior y no se resuelve con una excepcion permanente
para ramas o numeros antiguos.

### Preautorización estrecha e inerte de la rama automática (ISA-318)

La corrección automática del Testing Center usa exclusivamente la rama
`vantareapp/tc-<12 hex minúsculas>-<slug seguro>` (sufijo opcional `-revert`).
`<slug seguro>` son segmentos de minúsculas y dígitos separados por un único
guion, sin guion inicial, final ni doble; `revert` solo puede ser el token final
y nunca aparece en medio del slug.

- La preautorización alcanza únicamente PR de esa rama a `nightly`.
- La rama automática nunca se dirige a `testers` ni `master`, y nunca hace push
  directo.
- La ruta automática permanece **inerte**: la CLI no acepta JSON arbitrario y
  rechaza toda rama `tc-*` sin atestación confiable. ISA-322 debe verificar
  criptográficamente su procedencia antes de pasar los claims cerrados al
  validador semántico; ningún marcador incluido en el payload concede confianza.
- Cualquier efecto se revoca con el kill switch antes de cada paso, no después.
- Excluidas de la preautorización: workflows, schema, auth, billing, secretos,
  dependencias, datos, release y cualquier gasto.
- El bootstrap de workflows permanece humano e inerte hasta `master`; no
  configura credenciales, dispatch ni ruleset.
- No se habilita ninguna ruleset ni auto-merge sin autorización expresa de
  Isaac.

La fuente ejecutable de la atestación cerrada es
`.github/scripts/validate_branch_channels.py::validate_tc_attestation`. Exige:

- repositorio y rama exactos; `base_sha`/`head_sha` bien formados y coherentes
  con la review y los checks; digest y `job_key` SHA-256 canónicos cuyo prefijo
  de 12 hex coincide con la rama;
- policy `testing-center.autofix-policy.v2` elegible, riesgo `low`, entre cero y
  cinco archivos productivos y TDD probado;
- review Opus `approve` sobre el mismo `head_sha`, con P0/P1/P2 enteros en cero;
- exactamente `Validate promotion path` y `Validate Vantare blocking gates`,
  ambos `success`, emitidos por `github-actions` sobre ese mismo `head_sha`.

Antes de retirar la inercia, ISA-322 debe verificar criptográficamente la
procedencia y, en el instante de encolar o integrar, comparar `head_sha` con el
head vivo de la PR, `base_sha` con el tip vivo de `nightly` y recomputar el
digest desde el árbol verificado. También debe implementar el kill switch antes
de cada efecto, hacer bloqueantes lint/visuales cuando apliquen y demostrar que
todas las exclusiones anteriores se aplican en el gate. Una firma válida pero
obsoleta o reusada falla cerrada.

ISA-322 define ese cierre sin activarlo. Su entrypoint inerte encadena la futura
ejecución de `gh attestation verify` (repositorio, workflow firmante, commit
fuente en `master`, issuer GitHub y runner hospedado) con el validador semántico
v2 y la comparación de `head_sha`, tip de `nightly` y digest recomputado contra
hechos vivos. La policy exige los dos checks exactos, conversaciones resueltas,
cuatro kill switches cerrados, reserva `nightly_release` confirmada y ausencia
de otro closeout. `prepare_release` solo prepara la petición determinista al RPC
Supabase ya existente y las rutas de metadata `TC-<12 HEX>`; no ejecuta la
reserva. El bootstrap conserva `if: false`, permisos `contents: read`, termina
en fallo y no contiene comandos de merge, tag ni release. Conectar credenciales,
ejecutar la reserva, crear el ruleset y activar la cola siguen requiriendo la
fase de activación y autorización expresa de Isaac.

El lint de archivos cambiados y el visual de Testing Center son bloqueantes
solo en el PR automático `tc-*`, calculados contra el primer padre real del
merge sintético. El evento `merge_group` no expone la rama fuente original:
revalida Go, frontend y Windows/Wails, mientras la futura activación deberá
exigir los checks exactos ya emitidos sobre el `head_sha` atestado antes de
encolar. El lint global de los canales humanos continúa advisory por su deuda
inventariada.

- `.github/workflows/branch-channel-gates.yml` valida la ruta de promoción y
  ejecuta tests Go, frontend, build y lint en `nightly` y `testers`.
- Go, build frontend y todos los tests frontend no inventariados son
  bloqueantes. Solo se aíslan en pasos advisory los archivos exactos de
  ISA-172 (`useCanvasInteraction`), ISA-173 (runner del manifiesto Crystal) e
  ISA-174 (`CalendarMonthView`), además del test Windows de ISA-118. El lint
  global también permanece advisory por los 33 errores/2 warnings registrados
  en ISA-170. Cada excepción se ejecuta y muestra por separado; una regresión
  en cualquier otro test bloquea la promoción.
- Los PR a `testers` solo pueden proceder de `nightly`.
- Los PR a `master` solo pueden proceder de `testers`.
- En los gates de canal de CI, las ramas Linear `isa-*` y `hotfix-isa-*` usan
  segmentos separados por guiones; un guion bajo solo es válido entre dos
  tokens alfanuméricos dentro del mismo segmento (por ejemplo, `merge_group`).
- La única excepción es un hotfix crítico aprobado expresamente por Isaac:
  parte de `master`, utiliza una rama
  `vantareapp/hotfix-isa-<número>-<descripción>`, conserva PR y todos los gates
  estrictos, y vuelve después a `nightly` mediante una rama de issue normal.
  Nunca se reutiliza un tag publicado.
- Discord solo anuncia una Nightly o Testers después de crear y verificar su
  GitHub pre-release con los seis artefactos oficiales. Una rama de issue no
  puede anunciarse.
- Los tags y releases públicas se verifican contra el historial de `master`.
- Las builds de canal se generan manualmente desde `nightly` o `testers` con
  `release.yml`. `publish_channel=none` crea solo un artefacto interno;
  `nightly` o `testers` crea una GitHub pre-release cuyo tag debe coincidir con
  la rama (`vX.Y.Z-nightly.N` o `vX.Y.Z-testers.N`). Un tag estable solo puede
  crear una release si pertenece a `master`.
- Las builds internas aíslan como avisos únicamente las deudas inventariadas
  en ISA-118, ISA-170, ISA-172, ISA-173 e ISA-174. Todo lo demás sigue
  bloqueando. Una release pública ejecuta siempre la suite Go, frontend y lint
  completas como gates estrictos, sin excepciones de canal.

## Acceso a builds

| Producto o rol | Stable | Testers | Nightly |
|---|---:|---:|---:|
| Gratuito | Sí | No | No |
| Vantare Pro | Sí | No | No |
| Launch Edition | Sí | Sí | No |
| Vantare Pro Plus | Sí | Sí | Sí |

Los accesos operativos son independientes del catálogo comercial y nunca
cambian el plan mostrado al usuario:

| Rol operativo | Stable | Testers | Nightly | Vigencia offline máxima |
|---|---:|---:|---:|---:|
| Tester | Sí | Sí | No | 14 días |
| Tester Nightly | Sí | Sí | Sí | 72 horas |
| Owner | Sí | Sí | Sí | 30 días |

`Owner` es permanente hasta revocación en el servidor, pero su credencial local
se renueva como máximo cada 30 días. Las builds prerelease deben identificarse
explícitamente como `testers` o `nightly` en su tag o nombre. Una prerelease sin
canal reconocible se rechaza de forma segura.

La rama no es por sí sola un mecanismo de autorización. El actualizador debe
validar el entitlement firmado antes de mostrar o descargar una build. Hasta
que Billing entregue los planes finales, las builds no estables se distribuyen
solo de forma controlada y no se habilita un selector de canal eludible desde
la interfaz. Ese contrato se implementará en ISA-169.

## Estado transitorio de `develop`

`develop` queda congelada en `f492007ced82766873890990ddebf73e87486dec`
como referencia histórica mientras existan PRs, worktrees o documentación que
la utilicen. No recibe nuevas promociones y no forma parte del flujo canónico.
Se eliminará únicamente mediante otra issue, después de demostrar cero
consumidores y conservar una etiqueta o rama de archivo.

## Rollback

Crear una rama no modifica sus commits de origen. Ante un problema:

1. detener promociones;
2. conservar la ref fallida para diagnóstico;
3. revertir el commit de integración mediante un PR a la misma rama;
4. ejecutar de nuevo los gates;
5. promover solo el estado corregido.

Nunca se reescribe el historial compartido, se hace force-push o se mueve
`master` para efectuar un rollback.
