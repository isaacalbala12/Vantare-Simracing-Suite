# Diseño de Vantare: Hub y overlays

Esta es la entrada técnica de diseño. La [marca](BRAND.md) mantiene identidad y voz; el [contrato de producto](vantare-program/product-contract.md) decide alcance. No deducir funciones implementadas de un HTML o una captura.

## Hub: Command Orbit

Usar el [paquete Orbit v0.3](design/orbit-v03/README.md), sus [contratos de componentes](design/orbit-v03/12-contratos-componentes.md) y [checklist visual](design/orbit-v03/11-qa-checklist.md). La dirección Orbit sustituye el shell v5.

Fuentes productivas:

- [theme.rs](../native/ui/src/theme.rs): temas compartidos de UI.
- [hub/orbit](../native/hub/src/orbit/): tokens y componentes del Hub GPUI.
- [vantare.json](../native/ui/styles/vantare.json): estilo del kit Vantare.
- [handoff Hub/Studio](vantare-program/handoffs/overlays-launcher-hub.md): decisiones y evidencia; GitHub Issues contiene la siguiente tarea.

Los HTML y tokens de `docs/design/` son referencias de diseño. Para cambiar lo que muestra la app, editar la fuente productiva correspondiente y verificarla; no asumir sincronización automática entre ambas copias.


## Wordmark oficial C2 · Compacta (#1504)

Isaac eligió C2 el 2026-10-08. El nombre usa los trazos SVG aprobados de
[native/assets/brand/wordmark](../native/assets/brand/wordmark/README.md), sin fuentes de texto.
La Λ es el símbolo aislado para la barra contraída y espacios pequeños.
Hay versiones color, blanco y negro; los lockups combinan Λ y nombre,
con color para fondo claro/oscuro y versiones a una tinta.

Conservar proporciones, geometría y espaciado. Altura mínima del wordmark:
16 px en pantalla o 4 mm impreso; recomendada en el Hub: 24 px (182,85 px de ancho).
Símbolo aislado: mínimo 16 px. Zona de respeto: media altura del wordmark
alrededor; en lockups, media altura de la Λ. Usar blanco sobre oscuro y negro
o casi negro sobre claro. Sustituye el logo con Rajdhani, sin alterar las
familias tipográficas de la interfaz.

El Hub nativo embebe el SVG directamente desde `native/assets/brand/wordmark` en
`shell/assets.rs`; `orbit/kit.rs` lo tiñe con `skin.text1` según el tema,
también en DeepSeek. No duplicar el SVG fuera de su fuente canónica ni componerlo con texto.
La barra abierta de 272 px usa 24 px de alto, con BETA debajo para conservar
el espacio del botón de contraer y la zona de respeto horizontal. La contraída
solo muestra la Λ. Ctrl+B conserva su comportamiento.

## Overlays: autoría directa

Usar [UI/README.md](../native/ui/README.md), «Portar un widget» y «Workshop», y [ADR 0101](adr/0101-widgets-looks-common-state.md). El registro UI y los módulos de widget son la fuente productiva para Desktop, Studio y Workshop.

Los pintores reciben Board/ViewModels y presentación; no leen persistencia, permisos, transporte ni posición. Editar Rust y el estilo del kit; HTML es referencia visual. Mantener ausencia y calidad de datos distinguibles.

## Verificación

Los gates y comandos están en [native/README.md](../native/README.md) y [UI/README.md](../native/ui/README.md). Para UI, capturar e inspeccionar la superficie productiva y comparar RGBA según el protocolo del widget. Una captura del prototipo no demuestra paridad ni interacción del runtime.

## Referencia histórica

El inventario anterior mezclaba tokens, componentes retirados, tres sistemas antiguos y pendientes de normalización. Se conserva [completo por SHA](https://github.com/isaacalbala12/Vantare-Simracing-Suite/blob/60b47b7c7e7550faf0c532fdf3dbc6f32cfd516c/vantare-v2/docs/DESIGN.md). Sus rutas y recuentos no son instrucciones para reconstruir código eliminado.

## Marca aprobada · #1504

Decisión de Isaac de 2026-10-08, aplicada a los activos Windows de esta rama. Los cambios de tokens del Hub, web y widgets se ejecutan en sus cortes propios; esta tabla no demuestra que todas esas superficies ya estén migradas.

| Uso | Color / escala | Regla |
|---|---|---|
| Marca, relleno, icono plano | **#D80000** | Rojo oficial único, tono central del logo |
| Texto, enlace e icono activo sobre oscuro | **#FF6B6B** | No usar #D80000 como texto sobre oscuro |
| Botón principal | **#DC0A0A → #C40000** | Texto blanco; comprobar ambos extremos |
| Fondo rojo profundo | **#8A0000** | Solo fondo, nunca texto |
| Error | **#F25A5A** | Semántica distinta de marca |
| Logo grande | **#F85151 → #D80000 → #B30000** | Mantener degradado existente a ≥48 px |

### Contrastes

Ratios calculados con luminancia relativa sRGB WCAG, redondeados a dos decimales. Texto normal: ≥4,5:1; gráficos: ≥3:1. Se conservan los pares aprobados de la propuesta; el cálculo exacto corrige sus aproximaciones (pie l1: 6,06, no 5,59).

| Superficie | Primer plano / fondo | Ratio | Uso |
|---|---|---:|---|
| Botón, extremo claro | #FFFFFF / #DC0A0A | 5,13:1 | Texto AA |
| Botón, extremo oscuro | #FFFFFF / #C40000 | 6,27:1 | Texto AA |
| Pie en l1 | #AA8F94 / #241116 | 6,06:1 | Texto AA |
| Pie en l3 | #B99FA4 / #3B1E25 | 6,12:1 | Texto AA |
| Rojo en l1 | #FF6B6B / #241116 | 6,49:1 | Texto AA |
| Web, texto atenuado | #9D9D9D / #0A0A0A | 7,30:1 | Blanco 60 % compuesto; texto AA |
| Web, botón | #FFFFFF / #D80000 | 5,36:1 | Texto AA |
| Harness, acento | #FFFFFF / #345AC2 | 6,20:1 | Texto AA |
| Icono, barra clara | #D80000 / #F3F3F3 | 4,83:1 | Gráfico |
| Icono, barra oscura | #D80000 / #202020 | 3,04:1 | Gráfico, no texto normal |

Los ratios del icono se refieren al relleno sólido; los píxeles antialias mezclan colores. No atribuir esos ratios a todo el degradado grande.

### Icono y regeneración

- ViewBox 64. Símbolo normal: `M9 51 32 10l23 41H42L32 32 22 51Z`. Los SVG usan su forma absoluta equivalente.
- Logo siempre con fondo (#1559): el ICO y los activos MSIX con placa llevan la placa oscura en todos los tamaños. A ≤32 px (y StoreLogo 50 / Square44 44): símbolo plano #D80000 sobre la placa (degradado 26 → 10). A 16 y 24 px: patas gruesas `M6 54 32 8l26 46H39L32 40 25 54Z`, con el hueco abierto. A ≥48 px: degradado actual de `native/assets/appicon.png`. El tamaño base MSIX 44 px usa plano; no representa el targetsize-48.
- Versiones a una tinta blanca y negra, normal y pequeña, en `native/assets/brand/`; elegir la que contraste con el fondo. Avatar circular oscuro con símbolo rojo, sin wordmark.
- MSIX incluye los tres activos del manifiesto (StoreLogo 50, Square44 44 y Square150 150) y targetsize 16/24/32/48/256. `altform-unplated` quita la placa; `altform-lightunplated` usa negro para fondo claro. Los ≥48 unplated conservan el degradado aprobado sin placa.
- El Hub consume el símbolo normal en `native/hub/assets/pit/mark.svg` (26 px en sidebar); GPUI aplica el color del tema. La migración de ese token pertenece al corte de UI. `i-vantare.svg` se usa a 48 px y no se cambia aquí.
- Ejecutar `python scripts/generate-brand-icons.py --sheet C:/tmp/ui-r10/iconos-1504.png`. Rasterización Pillow a 8× y reducción Lanczos, coordenadas centradas en píxel; ICO con siete frames independientes. No requiere dependencias nuevas.
- Comprobar `python scripts/generate-brand-icons.py --check` y `python scripts/test-brand-icons.py`; abrir la hoja PNG y revisar tamaños pequeños a escala real y sobre ambas barras. El build MSIX copia los PNG versionados sin redimensionarlos.

El naranja #FF6B35, «AI Engineer», «100 % FPS» y las referencias italianas del [BRAND histórico](BRAND.md) quedan archivados, sin borrarlos. No son guía de diseño/copy vigente. La decisión no modifica el contrato de idiomas; el wordmark C2 se documenta arriba.

[Diseño anterior completo](https://github.com/isaacalbala12/Vantare-Simracing-Suite/blob/ca17545f607b85f5d47dc9d060721b69e6a6a158/vantare-v2/docs/DESIGN.md): fuentes del legado y evidencia histórica.
