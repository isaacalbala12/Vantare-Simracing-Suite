# 00 · Registro de decisiones (ADR-lite)

Formato: **Decisión** · Contexto · Alternativas descartadas · Consecuencias. Fecha 2026-08-16 salvo indicación.

## D-01 · Dirección visual: Command Orbit
**Decisión.** El hub adopta "Command Orbit": grafito profundo (`#08090b`), superficies translúcidas con blur, acento carmín→coral con glow calibrado, primario **blanco**, bordes degradados solo en superficies destacadas.
**Descartado.** v0.1 grafito fresado + cristal flotante; v0.2 (Sol); dirección "v5" actual del hub (uppercase + tracking amplio como firma).
**Consecuencias.** `docs/DESIGN.md` queda como sistema legado del hub; los eyebrows en mayúsculas se reservan para cabeceras de sección y tarjetas destacadas; los títulos de panel pasan a caja normal.

## D-02 · Escala tipográfica ×1.3 sobre base 12
**Decisión.** Base 16px (antes 12px). Todo el sistema de medidas se reescaló ×1.3 salvo hairlines (1px), breakpoints y `min-width` del body.
**Contexto.** A 1920×1080 el prototipo original era ilegible.
**Consecuencias.** Filas 49px, rail 81px, columna 296px, botones 39px, KPI 22px mono. Ver `02-tokens.md`.

## D-03 · Rail global + columna contextual (no duplicada)
**Decisión.** El rail (iconos) es la única navegación. La columna muestra **contenido de la sección** (widgets en Studio, filtros/seguidas en Carreras, perfiles en Launcher, estrategias en Estrategia, sesiones en Telemetría, fases en Roadmap, secciones en Ajustes) más bloques persistentes.
**Descartado.** Rail + columna con las mismas secciones (redundante); solo rail.
**Consecuencias.** La columna se pliega desde el rail o desde su cabecera; en Ajustes solo muestra sus secciones.

## D-04 · Bloques persistentes de la columna: variante B
**Decisión.** Próximas carreras · Perfil de overlay · Launcher (con ▶). Un bloque se oculta cuando la sección activa ya lo muestra.
**Descartado.** A (operativa: carreras + tarjeta overlay), C (mínima: solo contexto).

## D-05 · Estado de LMU en un único sitio
**Decisión.** El pill "LMU conectado" vive en el pie de la columna. En el hero es solo color (punto junto al saludo).
**Descartado.** Pill en topbar + dayline + signal strip (tres veces).

## D-06 · Inicio: hero en dos columnas con dial de cuenta atrás
**Decisión.** Izquierda: saludo, command surface, quick actions. Derecha: tarjeta "Próxima serie" con **dial** SVG cuyo arco/punto representan el tiempo hasta la salida (según cadencia real).
**Descartado.** Anillos orbitales decorativos; tarjeta rotada 1.4°; signal strip; suite-tiles; actividad vacía a todo el ancho.

## D-07 · Focal = perfil activo con widgets reales en miniatura
**Decisión.** La tarjeta destacada del Inicio se titula con el perfil ("Clean Overlay") y su mini-lienzo es un contenedor `container-type: inline-size` que reutiliza los widgets `.cw` reales (escalan en `cqw`).

## D-08 · Política "sin scroll de página"
**Decisión.** Cada vista está diseñada para caber a 1920×1080. Donde el contenido crece (listas, feeds, timelines) el scroll es **interno al panel**. Por debajo de ~940px de alto, Inicio se compacta; el resto de vistas puede desplazarse como respaldo.
**Consecuencias.** Vistas con `height:100%` + flex column; listas con `min-height:0; overflow:auto`.

## D-09 · Inspector del Studio: secciones apiladas y plegables
**Decisión.** Cabecera con identidad y acciones directas; Diseño / Comportamiento / Layout como `<details>` con resumen legible cerrado; Layout con X/Y/W/H.
**Descartado.** Pestañas; inspector flotante; barra de propiedades.

## D-10 · Calendario con horas calculadas desde la cadencia
**Decisión.** Las salidas se calculan en cliente desde `configs/calendar-lmu.json` (minuto ≡ offset mod intervalo; slots UTC para semanales) en la zona horaria del usuario. Cinco vistas: Próximas · Día · Semana · Mes · Timeline.

## D-11 · Estrategia: panel único de evento, no wizard
**Decisión.** Entrada directa a la última estrategia del evento; columna izquierda como selector (estrategias + otros eventos + Nueva). Panel: cabecera del evento, pestañas Resumen · Estrategias · Disponibilidad, submenú ⚙. Resumen = KPIs + línea de carrera por piloto + distribución + stints con paradas + panel Pilotos/Neumáticos.
**Descartado.** Flujo de 4 pasos; portada con menú de secciones.
**Consecuencias.** Comparación de estrategias mide **vueltas completadas** (carrera a tiempo), no tiempo total.

## D-12 · Neumáticos individuales arrastrables
**Decisión.** Inventario de neumáticos individuales (id, compuesto, condición) asignables a FL/FR/RL/RR de cada stint por drag & drop, por tocar-y-tocar y por teclado. Editar stint despliega el editor bajo la tarjeta.

## D-13 · Telemetría MVP tipo "mapa → trazas → insights"
**Decisión.** Estructura del módulo: KPIs, mapa coloreado por tiempo ganado/perdido, trazas sincronizadas con scrubber, insights por curva explicables. Datos sintéticos etiquetados hasta conectar DuckDB (ADR 0005).

## D-14 · Ajustes con Atajos como sección propia
**Decisión.** Cuenta · Aplicación · Actualizaciones · Atajos · Diagnóstico. Atajos con keycaps físicos por grupo (Overlay, Launcher y carrera, Studio, Global). Densidad se configura en Ajustes › Aplicación (no en el topbar).

## D-15 · Iconografía por sprite y logos incrustados
**Decisión.** Un `<symbol>` por icono de navegación (`i-*`), stroke 1.75 en el rail. Marca Vantare y avatar como PNG data-URI (11 KB + 4 KB). En producción: assets locales, nunca CDN.

## D-16 · Micro-motion sobrio
**Decisión.** Entradas de 260–340 ms con `cubic-bezier(.2,.8,.2,1)`, cascadas de 30–40 ms, transiciones de posición 350 ms; todo bajo `prefers-reduced-motion`.

## D-17 · Porte 01-shell: la shell real es `V52Shell`, no `AppShell`
**Decisión.** El briefing 01 nombra `AppShell.tsx` como la shell a sustituir, pero en el código `AppShell.tsx` es solo el router de nivel superior (overlay · callback OAuth · hub · composite). La shell del hub es `hub/components/V52Shell.tsx`, montada por `HubShell` dentro de `HubApp`. El porte introduce `hub/components/orbit/OrbitShell.tsx` con la **misma firma de props** que `V52Shell` y `HubShell` elige entre las dos según el flag. `AppShell.tsx` no se toca.
**Consecuencias.** Cualquier briefing posterior que hable de "AppShell" debe leerse como `V52Shell`/`OrbitShell`.

## D-18 · Claves de persistencia: manda `vantare.v03orbit.*`
**Decisión.** El briefing 01 pide `vantare.orbit.{view,sidebar,rightDock,density}`; `13-modelo-y-algoritmos.md § 13.7` y el código ya existente (`lib/density.ts`, harness de fundamentos) usan `vantare.v03orbit.*`. Se conserva `vantare.v03orbit.*` para no romper la densidad ya persistida. El **flag** sí usa la clave que pidió el briefing: `vantare.orbit.enabled`.

## D-19 · El gating del rail sale del `access-policy` real, no de la matriz del prototipo
**Decisión.** `ACCESS`/`REQUIRED_PLAN` del prototipo describen un modelo de planes que el hub ya implementa en `lib/access-policy.ts` (con roles operativos, licencia bloqueada y estado sin configurar). El rail y la paleta consultan `canSeeSection`/`getFeatureGate`; de la matriz del prototipo solo se conserva el **plan requerido** que se muestra en el tooltip y en el motivo de la paleta.
**Consecuencia.** Un tester ve Estrategia desbloqueada aunque su plan sea Free: es el comportamiento actual del producto y prevalece sobre el prototipo.

## D-20 · "Próximas carreras" con motor real y dataset provisional
**Decisión.** `nextStarts`/`upcoming` se portan como dominio puro con pruebas (`hub/orbit/next-starts.ts`). El hub todavía no expone un fixture de series al frontend, así que la columna se alimenta de `hub/orbit/provisional-series.ts`, marcado explícitamente como provisional. Al llegar el fixture real se borra ese módulo; el motor no cambia.

## D-21 · Tooltip de rail con `data-tip`, nunca `title`
**Decisión.** El tooltip del rail se pinta con `::after` sobre `data-tip`, visible con hover **y** con `:focus-visible`. Los tests del rail comprueban que ningún botón lleva `title` nativo.

## D-22b · Marca real en la losa, avatar con inicial
**Decisión.** La losa del rail usa el PNG real de la marca Vantare, extraído del prototipo a `frontend/src/assets/orbit/vantare-mark.png` (26×26 dentro de la losa de 49 px). El avatar del rail sigue con la inicial de la cuenta: el prototipo embebe un avatar de prueba que no representa a ningún usuario, así que no se porta hasta que exista fuente real de imagen de cuenta.

## D-23 · Encender Orbit no cambia la preferencia de tema
**Decisión.** `applyOrbitThemeWhileMounted` aplica `vantare-orbit` al documento mientras la shell está montada y devuelve la restauración del tema guardado; **nunca** llama a `persistThemeId`. Un feature flag no puede dejar al usuario con un tema que no eligió cuando se apaga.
**Prueba.** `hub/orbit/orbit-theme.test.ts`.

## D-22 · El harness visual de la shell monta un workspace neutro
**Decisión.** `scripts/orbit-shell-visual.mjs` sirve `orbit-shell-harness.html`, que monta la `OrbitShell` real con un workspace vacío: las páginas de producto dependen del runtime de Wails y no arrancan en un navegador limpio. El harness verifica el contrato de la shell (rail 81 px, columna 296 px, topbar 70 px, sin scroll de página, pie visible, sin `title` en el rail) a 1920×1080 y 1920×900, e ignora los rechazos de `@wailsio/runtime`, que son ruido esperado fuera de la app de escritorio.
