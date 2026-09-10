# Hub · exploración de distribuciones (Inicio) — ISA-1115

Mockups estáticos para decidir la distribución del Inicio de Command Orbit.
Sin JS ni recursos de red: abrir cada `.html` directamente en el navegador
(doble clic, `file://`). Las fuentes (`Inter-Variable.woff2`, `CascadiaCode.ttf`)
y los tokens salen de `vantare-v2/frontend/src/...` por ruta relativa; si el
archivo se saca del repo, cae a `system-ui` sin romperse.

Los datos de ejemplo son los del calendario real (`configs/calendar-lmu.json`):
LMGT3 Fixed · Sebring, LMP3 Fixed · Fuji, ELMS Super 60 · Spa, WEC Weekly ·
Portimao, etc.

## Archivos

| Archivo | Qué muestra |
| --- | --- |
| `hub-orbit-home-v1.html` | Distribución aprobada: héroe = próxima carrera, strip de próximas, perfil activo y **columna contextual a la derecha** en su estado por defecto (perfiles + próximas). |
| `hub-orbit-home-v1-contextual.html` | Misma página con una carrera del strip **seleccionada** (ELMS Super 60 · Spa): la columna derecha cambia a detalle — mapa lineal, tabla de la sesión, salidas del día, condiciones y acciones. |
| `hub-orbit-home-v2.html` | Variante alternativa: **sin columna lateral**; el contexto es un panel integrado en la rejilla del workspace. |
| `hub-orbit-home-v1.1.html` / `-contextual` | v1 afinada: misma distribución aprobada, mayor fidelidad a tokens y detalle de carrera por defecto en la columna. |
| `hub-orbit-home-v1.2.html` / `-contextual` | v1.1 con energía de "cabina de ingeniero": countdown en celda T-MINUS inclinada (112 px, horas atenuadas), trazado protagonista con marca S/F carmín + punto de parrilla, kerbs diagonales, semáforo de salida, meta tipo timing tower y reloj local en topbar. Todo encapsulado bajo `orbit-shell--v12` / `--v12`, sin tocar v1/v1.1/v2. |
| `hub-orbit-home.css` | Hoja compartida: tokens `orbit.tokens.css` + piezas de `orbit-shell/kit/home` + arte lineal de trazados. |

## Qué cambia entre variantes

| | v1 (aprobada) | v2 (contexto integrado) |
| --- | --- | --- |
| Shell | rail \| workspace \| **columna derecha 296 px** | rail \| workspace (2 zonas) |
| Héroe | Featured grande (238 px): copia + countdown 46 px + acciones; arte lineal del trazado a la derecha | Featured en **banda** (~150 px): copia a la izquierda, countdown + acciones a la derecha |
| Próximas carreras | Strip horizontal de 5 cards (hora, serie, tier, mini-trazado) | **Lista densa** de 7 filas dentro de superficie (hora, tier, serie, duración, trazado) |
| Contexto de selección | Columna lateral persistente: por defecto bloques Perfil/Próximas; con selección, detalle de carrera | **Panel integrado** en la rejilla, junto a la lista que lo origina; por defecto resume la próxima salida |
| Perfil activo | Fila completa: copia + acciones + esquema del lienzo 16:9 | Card compacta: copia + mini-esquema a la derecha |

## Qué problema resuelve cada una

- **v1** maximiza el foco en la próxima carrera (countdown protagonista) y da al
  contexto un hogar estable y siempre visible: seleccionar en el strip llena la
  columna sin mover el contenido. La columna a la derecha mantiene libre el
  eje izquierdo rail→contenido.
- **v2** gana ~300 px de ancho para el contenido y simplifica la shell a dos
  zonas: menos cromo permanente, más aire para la lista y para cualquier vista
  futura. El detalle queda más cerca del elemento que lo produce (proximidad).

## Qué sacrifica cada una

- **v1** gasta 296 px permanentes de ancho aunque el contexto no aporte (estado
  por defecto pasa a ser "bloques de relleno ambiental"), y duplica la lista
  de próximas (strip + columna).
- **v2** pierde el héroe como pieza de mando (la banda es menos enfática),
  el contexto deja de ser transversal a las vistas (cada página tendría que
  reinventar su panel) y el detalle compite por altura dentro del workspace
  en vez de tener carril propio.

## Recomendación

**v1** como base: la columna contextual es ya un patrón de la shell (hoy vive a
la izquierda) y pasarla a la derecha conserva ese contrato sin romper nada; el
héroe grande justifica el Inicio como "centro operativo". De v2 rescataría la
lista densa como alternativa al strip si el número de series crece — se puede
evaluar en la misma distribución v1.

## Dirección aprobada — v1.12 ("Linear × racing")

Aprobada por Isaac. Lenguaje: superficies de vidrio fino (hairline + luz superior + sombras largas),
tipografía única (Inter; cifras tabulares; Cascadia solo para contenido genuinamente técnico),
rojo racing profundo (#e8452f/#d23228) reservado a estados inminentes/selección/S-F.
Detalles: saludo personal sobre el héroe, cuenta atrás compacta (≈46px), módulo "SALIDA · hora",
selector de simulador con tile de logo, chip de canal+build, strip seleccionable que alimenta
la columna contextual, mini-mapas de trazado reales con marca S/F.

Referencia de piel para implementación: `hub-orbit-home-v1.12.html` + `…-contextual.html`
(los cambios de estilo finales están en el `<style>` inline de cada archivo, secciones v1.8–v1.12).
