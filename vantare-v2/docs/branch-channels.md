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

### Preautorización estrecha e inerte de la rama automática (ISA-318)

La corrección automática del Testing Center usa exclusivamente la rama
`vantareapp/tc-<12 hex minúsculas>-<slug seguro>` (sufijo opcional `-revert`).
`<slug seguro>` son minúsculas, dígitos y guiones; `-revert` solo puede ser el
token final y nunca aparece en medio del slug.

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
