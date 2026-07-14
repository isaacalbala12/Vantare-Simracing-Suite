# Versioning And Release Gates

Documento de versionado y gates de lanzamiento.

## Formato

Vantare usa versionado `X.X.X.X` para tags de GitHub.

Formato:

```text
major.phase.feature.patch
```

Ejemplo:

```text
0.4.2.0
```

Significado:

- `major`: `0` mientras el producto no es release estable; `1` para release.
- `phase`: bloque grande de roadmap.
- `feature`: corte funcional dentro de la fase.
- `patch`: fix/hotfix/build sin cambiar alcance funcional.

Tags recomendados:

```text
v0.3.1.0
v0.3.1.1
v0.4.0.0
v1.0.0.0
```

## Version actual

`v0.3.10.0` marca el cierre del lote beta privada inicial B1-B6:

- Vantare Suite integra el modulo `Ingeniero` como seccion interna y widget de notificaciones.
- Documentacion base para testers privados, known issues, feedback y OBS local.
- Hotkeys basicas endurecidas en Windows con stubs multiplataforma.
- URL de OBS en Ajustes corregida para apuntar a perfiles reales.
- Delta best live implementado usando `DeltaBest` nativo de LMU cuando esta disponible.
- `DeltaWidget` muestra `Target` y `Lap` desde telemetria real/mock en lugar de textos fijos.
- Version runtime/build actualizada.

Versiones previas relevantes:

`v0.3.9.2` marca el cierre de mock/live/demo UX y automatizacion Discord:

- Inventario mock/live/demo documentado.
- Indicador global de fuente de telemetria con accesibilidad basica.
- Selector mock de `Standings` verificado como preview-only.
- Changelog publico y GitHub Action para publicar tags `v*` en Discord.
- Version runtime/build actualizada.

`v0.3.9.1` marca el cierre del lote de producto usable posterior a PREVIEW2:

- `LayoutStudio` drag/resize/save estabilizado.
- `Relative` y `Standings` redimensionan proporcionalmente en `LayoutStudio`, runtime desktop y OBS.
- Los frames visuales se normalizan desde el primer render para perfiles legacy deformados, sin mutar ni guardar automaticamente.
- Recomendados de Vantare pueden guardarse como copia propia editable.
- `SaveProfileAsOwnCopy` genera IDs unicos, convierte a schema v2 y no muta el perfil de entrada.
- Version runtime/build actualizada.
- Validacion manual aprobada por el usuario.

`v0.3.9.0` marca el cierre del rework visual acotado de `WidgetStudio` y PREVIEW2:

- UI2 visual rework de `WidgetStudio`.
- PREVIEW2 intrinsic width para `Relative` y `Standings` en la preview aislada.
- Version runtime/build actualizada.
- Validacion manual aprobada por el usuario.

`v0.3.6.1` marca el cierre del primer corte configurable de `Standings`:

- S4.5 mock scenarios `Práctica` / `Qualy` / `Carrera` en preview.
- S4.6 guardado explicito en `WidgetStudio` sin autosave.
- S5 UI de `Standings` en `WidgetStudio`.
- S6 verificacion completa y documentacion.

## Regla de cierre por version

Toda version funcional confirmada debe quedar trazada con:

1. entrada publica en `docs/changelog.md`;
2. commit Git con scope claro;
3. push de la rama activa;
4. tag Git `vX.X.X.X` pusheado al remoto.

Si la version confirma una build/runtime usable, tambien se actualiza la version visible de la app (`cmd/vantare/main.go` y `build/config.yml`).

Las tareas puramente documentales, analisis, planes y reviews no crean version/tag por si solas. Se commitean con scope documental y se agrupan bajo la siguiente version funcional cuando corresponda.

Al pushear un tag `v*`, `.github/workflows/discord-release.yml` comprueba que el commit pertenece a `master`, lee la entrada de `docs/changelog.md` para ese tag y la publica usando exclusivamente `DISCORD_RELEASE_WEBHOOK_URL`.

## Checkpoints confirmados

| Version | Tipo | Alcance |
|---|---|---|
| `v0.3.6.1` | Runtime/build | Cierre de Standings configurable S4.5-S6 |
| `v0.3.9.0` | Runtime/build | UI2 WidgetStudio visual rework + PREVIEW2 intrinsic width |
| `v0.3.9.1` | Runtime/build | LayoutStudio resize proporcional + recomendados editables |
| `v0.3.9.2` | Runtime/build | Mock/live/demo UX + Discord release automation |
| `v0.3.10.0` | Runtime/build | Beta privada B1-B6: Ingeniero foundation, tester docs, OBS URL, hotkeys y Delta live |

## Rango de versiones

| Rango | Nombre | Estado |
|---|---|---|
| `0.1.X.X` | Pre-alpha/foundation | desarrollo interno |
| `0.2.X.X` | Alpha privada producto usable | testers cercanos |
| `0.3.X.X` | Alpha privada UI/widgets core | testers cercanos |
| `0.4.X.X` | Beta privada testers I | testers externos controlados |
| `0.5.X.X` | Beta privada testers II | cierre core LMU |
| `0.6.X.X` | Beta publica de pago I | acceso/pago |
| `0.7.X.X` | Beta publica de pago II | polish/layouts |
| `0.8.X.X` | Beta publica de pago III | data blocks/OBS avanzado |
| `0.9.X.X` | Release candidate | hardening |
| `1.0.0.0` | Release estable | publico estable |

## Gate 0.2.X.X

Puede publicarse internamente si:

- app arranca;
- overlay desktop funciona;
- perfiles guardan y cargan;
- `LayoutStudio` mueve/redimensiona;
- recomendado -> copia editable funciona o tiene plan inmediato;
- mock/live/demo no confunde;
- `WidgetStudio` y `LayoutStudio` mantienen responsabilidades separadas.

## Gate 0.3.X.X

Puede publicarse como alpha privada completa si:

- `Relative` configurable esta cerrado;
- `Standings` configurable esta cerrado excepto multiclase;
- rework UI acotado de `WidgetStudio` esta aplicado;
- no hay regresiones criticas de preview aislada;
- tester cercano puede completar un flujo real sin asistencia tecnica fuerte.

## Gate 0.4.X.X

Puede publicarse a beta testers si:

- hay build compartible;
- hay instrucciones;
- OBS setup local esta claro;
- hotkeys basicas estan implementadas o pospuestas explicitamente;
- delta best live esta implementado o pospuesto explicitamente por bug conocido;
- feedback/bugs tienen canal definido.

## Gate 0.5.X.X

Puede cerrar beta privada si:

- `Pedals` beta v1 esta cerrado;
- recomendados beta estan pulidos;
- smoke test completo pasa;
- no hay P0/P1 abiertos;
- P2 abiertos estan documentados y aceptados.

## Gate 0.6.X.X

Puede abrir beta publica de pago si:

- Stripe o checkout externo esta decidido e integrado de forma suficiente;
- acceso/licencia para beta esta decidido;
- soporte y refund/feedback tienen proceso;
- version y changelog son visibles;
- producto no depende de asistencia manual para arrancar.

## Gate 0.7.X.X

Puede avanzar si:

- layouts por sesion manuales son estables o pospuestos explicitamente;
- themes/densidad/opacidad no rompen overlays existentes;
- recomendados funcionan con cambios de layout.

## Gate 0.8.X.X

Puede avanzar si:

- data blocks incluidos usan datos fiables;
- metricas experimentales no aparecen como stable;
- OBS avanzado/LAN no rompe OBS local.

## Gate 0.9.X.X

Puede declararse release candidate si:

- performance validada;
- instalacion/update clara;
- regresiones visuales principales cubiertas;
- docs usuario listas;
- no hay P0/P1;
- P2 conocidos tienen decision.

## Gate 1.0.0.0

Puede publicarse release estable si:

- la promesa LMU-first se cumple;
- pago/acceso funciona;
- soporte basico esta preparado;
- usuarios no necesitan leer docs tecnicos para usar el producto;
- la app puede sostener reputacion publica.
