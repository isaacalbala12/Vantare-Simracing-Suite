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

- `.github/workflows/branch-channel-gates.yml` valida la ruta de promoción y
  ejecuta tests Go, frontend, build y lint en `nightly` y `testers`.
- Go y build frontend son bloqueantes. La suite frontend y el lint global se
  informan sin ocultarlos pero permanecen temporalmente como avisos: la base
  heredada contiene un test intermitente y 33 errores/2 warnings de lint ya
  inventariados. ISA-172 y ISA-170 deben cerrarlos antes de convertir ambos en
  gates obligatorios.
- Los PR a `testers` solo pueden proceder de `nightly`.
- Los PR a `master` solo pueden proceder de `testers`.
- El workflow de Discord para testers solo publica fragmentos que alcanzan
  `testers`; un commit de una rama de issue o de `nightly` no puede anunciarse
  como disponible para el grupo amplio.
- El changelog de una build de pruebas solo puede publicarse ejecutando su
  workflow desde `testers`.
- Los tags y releases públicas se verifican contra el historial de `master`.
- Las builds de canal se generan manualmente desde `nightly` o `testers` con
  `release.yml` y `create_release=false`; nunca crean una GitHub Release
  pública. Un tag solo puede crear una release si pertenece a `master`.

## Acceso a builds

| Producto o rol | Stable | Testers | Nightly |
|---|---:|---:|---:|
| Gratuito | Sí | No | No |
| Vantare Pro | Sí | No | No |
| Launch Edition | Sí | Sí | No |
| Vantare Pro Plus | Sí | Sí | Sí |

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
