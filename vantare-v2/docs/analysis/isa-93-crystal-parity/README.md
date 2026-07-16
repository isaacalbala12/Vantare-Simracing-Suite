# ISA-93 — autoridad visual y paridad Crystal

Fecha de migración del harness: 2026-07-16
Rama: `vantareapp/isa-93-os-03-paridad-11-de-los-21-disenos-vantare-crystal`
Base: ISA-91 `0a797bf720c098a52e91883ed0ddddda0c9fdd15`

## Veredicto del harness

Las referencias v1 no eran válidas: los 21 PNG eran opacos y contenían el fondo de
`docs/overlay-glassmorphism-pro.html`. Además, los tres selectores Pedals incluían
etiquetas y descripciones del showcase.

El protocolo v2:

- fija layout `1920px`, DPR 1 y margen externo determinista de `128px`;
- mantiene un guard ring de `8px` que debe permanecer vacío;
- oculta todo el documento excepto la raíz visual y sus descendientes;
- captura por separado escena vacía y widget;
- usa escenas transparente, sólida `#060608` y rejilla contrastada;
- compara soporte y alfa sobre RGBA premultiplicado;
- excluye del denominador los píxeles que no cambian frente a la escena vacía;
- separa gates de geometría, máscara/alfa, sólido, rejilla, estabilidad y
  Studio/Desktop/OBS.

La revisión adversarial encontró y corrigió antes de migrar:

1. descendientes visibles dentro del baseline vacío;
2. hermanos del escenario que sobrevivían al aislamiento;
3. RGB invisible bajo alfa cero contado como diferencia;
4. widgets fluidos que crecían con el viewport usado para el margen;
5. repintado incompleto de filtros al ocultar/reactivar la raíz.

Resultado de la migración: 21/21 referencias aisladas, 63/63 escenas estables,
63/63 guard rings limpios y 21/21 PNG transparentes con `alpha < 255`.

## Gates

- Geometría: bounding box `±2px`.
- Máscara: IoU `>=97%`.
- Alfa: delta medio y ratio de mismatch `<=3%`.
- Compuesto sólido: píxeles fuera de tolerancia `<=3%`.
- Compuesto rejilla: píxeles fuera de tolerancia `<=3%`.
- Estabilidad: máscara `>=97%`, alfa y compuesto `<=3%`, escena exacta.
- Cross-surface: salida visible idéntica entre harness, Studio, Desktop y OBS.

No existe un porcentaje global que pueda diluir un fallo de alfa o backdrop.

## Inventario y evidencia before/after

La última columna es `mask IoU / alpha / solid / grid` del primer baseline v2 del
renderer. Es un baseline honesto, no un resultado verde.

| Diseño | Selector aislado | BBox | alpha<255 | SHA v1 opaco | SHA v2 transparente | Baseline renderer |
|---|---|---:|---:|---|---|---|
| relative | `.widgets-row > .glass-card:nth-child(1)` | 357x288 | 99.66% | `7293da2f440b231b984c0b743e3809bb1614c3b91ed8a11d19a6a29c45213795` | `bd4090166a4be3368d42b4d295200ff70db5fab73c4d29ca90a793198bc23632` | 51.26% / 7.30% / 15.04% / 21.35% |
| standings | `.widgets-row > .glass-card:nth-child(2)` | 360x650 | 99.03% | `a555b96000ebe19d91f5fd00c6eccaa3ead18b1e531a8915326e7f6977a1d0a1` | `6edd5c73532904cbc8660642f3aad438949a83bd2c91079ae4d2c820e9706d61` | 100% / 1.59% / 19.47% / 14.50% |
| broadcast | `.broadcast-ticker` | 1872x71 | 98.21% | `4cb2c27c26c3369e6889ab5e96c955ad7ae5628048c79ccfd3ffaad0151e2d5e` | `84df82244e7ef6cdbba3033d4e0dc4d82b50f77d7c99d9691305a45877b47b1d` | 95.46% / 1.10% / 13.61% / 8.77% |
| fuel | `.unified-fuel-card` | 680x204 | 99.55% | `afcb872900be4a0492e72f113c867bd4af9dacb9f9d47fee40253448a74944c1` | `e33da3e0adf92a152977d32d90ed0ab6476ed2468e53513289196faade5927ee` | 100% / 0.52% / 6.90% / 6.87% |
| pedals-telemetry | `.hud-capsule-v1` | 323x86 | 98.22% | `c3a96494d5c5abf66815594efdb689e181a666118c80f47f6e63049fa539a760` | `f3360fa4c308afd835343df0addad47c0b5e90a4f45760244923a213633c7571` | 33.52% / 21.97% / 18.64% / 36.20% |
| pedals-telemetry-compact | `.cockpit-v2-low` | 248x92 | 99.04% | `6b3107f67bf28da8038d3e9f186535af7386e2f3070b4c1453d959db8bd31d16` | `bc7b0e620cf9c368844cd899f4358ff9ff3e0da5c76c3c351e80356f553cc231` | 31.66% / 17.36% / 21.39% / 32.67% |
| pedals | `.cockpit-v3-solo` | 120x167 | 98.67% | `df0e17afb95e66f846bb6fc2256786ab962f2f0d340dc2b619e4480d3a6c02c3` | `7146dc17bf2435ff7e497723633c3753eab844000867b2ce1972e14354ffe65d` | 13.42% / 29.56% / 32.59% / 39.76% |
| flags | `.flag-card:nth-child(1)` | 280x92 | 99.34% | `05b30c044a6814bf168751e55313ebec9d17ddf3692736c2d9070415b53f2848` | `9a12af5e22cce9113dee446b1a4156efef49a2fe787735f74d1e8fa2dd10c4e3` | 99.86% / 1.65% / 12.87% / 7.75% |
| delta-bar | `.delta-bar-wrapper:nth-child(1)` | 440x92 | 99.17% | `9b6794c6d0fb9a839cbeda318a1096e077ba67379e501218efdd12393ca7718f` | `e6b61b9498ed474f5b61de7e4476e936908ca30d546559be0ded7d9997137b3c` | 72.67% / 31.79% / 22.42% / 42.09% |
| delta-trace | `.dt-container` | 1000x144 | 99.57% | `4d785bb69368e8c8b3a998ab97be63bf5de766b28098f4171a35da0fa6e50cc9` | `9cb8ce3dfcf5807cf909711bb32103b2f7f3d904dab91c7a020398a7bcfa3d4d` | 77.54% / 3.42% / 8.78% / 11.54% |
| schedule | `.rs-container` | 780x583 | 99.37% | `92fc839cae00f8c5a412ee2a98ef83ec5c076ffba4a287e51d6bce25d20a7b6a` | `2a764b43185c1262a13d3656b68df2f95671d18c4f9171a00a1a195c5167642d` | 33.73% / 61.15% / 10.97% / 79.45% |
| head-to-head | `.h2h-container` | 780x151 | 97.83% | `ffb31a3a8a2d00926a57aeebc4d0c308880553de4b5a4eb23d19799a64260703` | `93dfe75f44794648aa6d3e54c60d845682b04e6e448fe7915f80fe12fef867fc` | 21.71% / 47.49% / 11.45% / 65.50% |
| input-blade | `.in10a-container` | 780x96 | 98.32% | `5da898993736dd8d1b44e71b17baa2a83d5d387297b4535203c6f5d8cb7e00be` | `437e1c3b48867d5a9d26fad4fbd04d3c6f1949f3beda4130a82a7b15b1c73bcc` | 82.10% / 5.33% / 5.58% / 20.68% |
| input-capsule | `.in10b-container` | 780x100 | 98.34% | `768d6d0c4bdbac930309edff61bc2feb34ed898ac5ebe09f35d092cf25c4f700` | `2baa8754b1483d9b61ad421c093117440631afd8655c366fdebcabb1359329e7` | 27.45% / 33.99% / 8.56% / 59.99% |
| input-dense | `.in10c-container` | 780x68 | 99.07% | `a81065520ec6b0e3639ca50ec513680ccbed046cc8048e368c70897963f82570` | `8de4629bcfb8215c5151bb26894f4f809084d7f2cae8d15990f85d280d4fe6d5` | 14.58% / 34.94% / 7.47% / 53.98% |
| multiclass | `.mc-container` | 780x210 | 98.24% | `0afbb70ecbec7fe50c39492786f49b5a563e564cf01a0b89d3675bbb1d066bfe` | `2ba471d75e8521c75ec2dbbabb0c4db0b89fcf9cabca188a793152545d9ed5e6` | 18.88% / 53.76% / 20.15% / 72.06% |
| weather | `.tw-container` | 240x420 | 99.74% | `8a8307beb731e2c0ce0da0361bc61d2d74c31fd3f43504142c146f8eb4eb9b5b` | `5f4d6496bf521325400c04f558c28ebc10bfacb2993e4a5d056c90fd5c0df82d` | 5.43% / 49.45% / 10.60% / 64.52% |
| damage-visual | `.w13-car-visual` | 150x190 | 98.07% | `19e78fd44b22e0d3fae666c3eb74319da6372c0419bb837817eba494db949acb` | `e2047858d84a60b44bf88c6ed5d69e21013194756ef4266c7be4c06696ca0a48` | 17.46% / 31.43% / 3.44% / 46.94% |
| damage-numbers | `.w14-damage-nums` | 140x148 | 99.84% | `2837032d7bb7d2f11f2fcb4b1e4c88f661ddf075efe9394bcb43f47db1aa0e68` | `533c9f3cd404149b6c1b7f7f61b4d8ffafa4875f91124510edb6e8b65324c784` | 21.31% / 27.58% / 9.02% / 47.39% |
| delta-simple | `.w15-delta-simple` | 420x69 | 99.88% | `825d9dd17ee6d72ba53483552f26c352589a8c6abd3f41823720f1043cb38d47` | `c4b54fa866024cb5c88823ce16dc82e393cded2ca72ce22f5ae4f55f85ec480c` | 86.44% / 12.61% / 4.83% / 20.90% |
| delta-advanced | `.w16-delta-adv` | 480x42 | 99.13% | `3f55bbef02ce8faf0cbe091e14b0fb23b671218b9a1a4b45dd9d98e9413039f4` | `ceaedef417d6fd7d9628bbb000a9e4d3533f2ca15a73f78cc129075d2039fc7c` | 15.35% / 21.93% / 7.93% / 38.22% |

## A/B de `tokens.css`

Se comparó el baseline v2 con el archivo de `c9689c7` y con los cambios locales
anteriores:

- se conservan únicamente los colores globales que mejoraron de forma medible
  `relative`, `standings`, `pedals`, `flags` y `delta-bar`;
- se eliminaron los cambios duplicados de `delta-simple`, porque reglas canónicas
  posteriores ya los sobrescribían y la métrica no cambiaba;
- el fallback local de Chrome se conserva porque permite ejecutar Playwright en
  Windows sin alterar la captura.

## Baseline v2 inicial

- geometría: 14/21;
- máscara/alfa: 0/21;
- compuesto sólido + rejilla: 0/21;
- guard: 21/21;
- estabilidad: 21/21;
- cross-surface: 21/21.

Los deltas visuales son ahora accionables. No se volverán a regenerar referencias
para acercarlas al renderer.

## Microcorte — fuentes oficiales y Pedals 04

Se incorporaron como assets locales, sin CDN runtime ni dependencia npm, los
subsets latin variables mínimos de Inter 400–800, Plus Jakarta Sans 700–800 y
JetBrains Mono 500–800. Sus versiones, URLs oficiales, commits upstream,
SHA-256 y licencias OFL están fijados en
`frontend/src/assets/fonts/vantare-crystal/README.md`.

Los tres renderers de la sección 04 dejaron de renderizar etiquetas y
descripciones del showcase. Sus raíces son ahora directamente los materiales
visuales canónicos; los valores continúan llegando de ViewModels puros. La
fixture aislada usa los datos deterministas de la sección 04 sin fijarlos en
runtime.

| Diseño | Baseline v2 | Después | Gates |
|---|---|---|---|
| pedals-telemetry | 33.52% / 21.97% / 18.64% / 36.20% | 100% / 0.10% / 2.92% / 1.51% | PASS |
| pedals-telemetry-compact | 31.66% / 17.36% / 21.39% / 32.67% | 100% / 0.05% / 1.62% / 0.83% | PASS |
| pedals | 13.42% / 29.56% / 32.59% / 39.76% | 100% / 0.00% / 0.56% / 0.30% | PASS |

Formato de las métricas: `mask IoU / alpha / solid / grid`. Los tres diseños
pasan además geometría, guard, fuentes, estabilidad y salida idéntica
Studio/Desktop/OBS. No se modificaron ni regeneraron sus referencias.

## Microcorte — Fuel 03 y Flags 05

Fuel se alineó con los tres bloques reales de `.unified-fuel-card` y con una
lista de historial aislada. Se neutralizaron `min-height:auto` y selectores
heredados que hacían crecer los ítems grid; el renderer sigue mostrando datos
honestos y no inventa capacidad de depósito cuando no existe en telemetría.

Flags elimina del renderer Crystal el resumen de sectores externo a
`.flag-card`; ese contenido sigue perteneciendo al contrato funcional y a
otros sistemas, pero no forma parte del diseño visual de la sección 05.

| Diseño | Baseline v2 | Después | Gates |
|---|---|---|---|
| fuel | 100% / 0.52% / 6.90% / 6.87% | 100% / 0.20% / 2.61% / 1.73% | PASS |
| flags | 99.86% / 1.65% / 12.87% / 7.75% | 100% / 0.00% / 0.00% / 0.00% | PASS |

Ambos pasan geometría, guard, fuentes, estabilidad y Studio/Desktop/OBS. Las
referencias canónicas permanecen intactas.

## Microcorte — Delta 15 y 16

Delta Simple conserva la sombra externa del badge fuera del bounding box de
contenido y replica la semántica efectiva del HTML, donde las variables glass
de la sección 15 no están definidas. Delta Advanced elimina por la misma razón
el fondo/borde aproximado de la raíz y aplica los colores de valor S/T de la
autoridad. Los valores siguen procediendo de sus ViewModels.

| Diseño | Baseline v2 | Después | Gates |
|---|---|---|---|
| delta-simple | 86.44% / 12.61% / 4.83% / 20.90% | 100% / 0.00% / 0.00% / 0.00% | PASS |
| delta-advanced | 15.35% / 21.93% / 7.93% / 38.22% | 100% / 0.82% / 2.67% / 1.97% | PASS |

Geometría, guard, fuentes, estabilidad y cross-surface pasan en ambos. No se
regeneraron referencias.

## Microcorte — Damage 13 y 14

Ambas raíces eliminan el material aproximado que no existe en la autoridad
efectiva de las secciones 13/14. Damage Visual conserva su chasis y daño cero
real. Damage Numbers usa una fixture sin payload de daño para representar el
`n/a` canónico como estado `missing`, sin inventar valores en runtime.

| Diseño | Baseline v2 | Después | Gates |
|---|---|---|---|
| damage-visual | 17.46% / 31.43% / 3.44% / 46.94% | 100% / 0.00% / 0.00% / 0.00% | PASS |
| damage-numbers | 21.31% / 27.58% / 9.02% / 47.39% | 100% / 0.00% / 0.00% / 0.00% | PASS |

Los dos pasan todos los gates y mantienen intactas sus referencias.

## Microcorte — Input Telemetry 10A/10B/10C

El harness ahora siembra el historial derivado determinista que consume el
ViewModel real; no existe una segunda ruta de render ni datos fijados dentro del
renderer. Las tres variantes mantienen el mismo tipo funcional
`input-telemetry` y solo cambian composición mediante su diseño oficial.

10A restaura blur, sombras externas/inset, rejilla y materiales literales. 10B
y 10C respetan la semántica efectiva del HTML: sus variables glass no están
definidas, por lo que la raíz permanece transparente y el backdrop se valida
sobre los fondos de control. 10C usa además la jerarquía horizontal real del
gearbox y el trazo SVG canónico de 2.5 px.

Los valores usados son deterministas y equivalentes a la muestra de autoridad
para impedir que texto circunstancial contamine la métrica; el renderer sigue
recibiendo exclusivamente el ViewModel y no fija valores de telemetría.

| Diseño | Baseline v2 | Después | Gates |
|---|---|---|---|
| input-blade | 82.10% / 5.33% / 5.58% / 20.68% | 100% / 0.02% / 0.53% / 0.35% | PASS |
| input-capsule | 27.45% / 33.99% / 8.56% / 59.99% | 100% / 0.30% / 1.00% / 0.59% | PASS |
| input-dense | 14.58% / 34.94% / 7.47% / 53.98% | 100% / 0.00% / 0.01% / 0.00% | PASS |

Los tres pasan geometría, guard, fuentes, estabilidad y salida idéntica
Studio/Desktop/OBS. Las referencias canónicas permanecen intactas. Estado
acumulado: 12/21 diseños verdes.

## Checkpoint parcial — familias text-dense 01/02/08/09/11/12

Se corrigieron antes de seguir afinando píxel:

- Broadcast usa diez slots deterministas, color de marca desde scoring, total de
  vueltas, jerarquía `driver-top-row` y weather con anchura estable.
- Relative/Standings comparten ya la marca SVG canónica; Standings alinea
  header, tabla, filas, neumáticos, highlight y footer con la sección 01.
- Head to Head expone los dos vecinos del jugador en el ViewModel puro y
  Crystal renderiza las tres filas de la composición oficial.
- Multiclass usa cuatro filas en la fixture canónica y corrige columnas,
  padding del jugador y abreviación de clase.
- Schedule, Head to Head, Multiclass y Weather eliminan el glass opaco
  aproximado de la raíz: las variables de material de la autoridad no están
  definidas y el backdrop se valida sobre escenas controladas.

Las mejoras son medibles, pero este checkpoint no cierra diseños:

| Diseño | Antes | Checkpoint | Estado |
|---|---|---|---|
| broadcast | 95.46% / 1.09% / 13.70% / 8.83% | 100% / 0.15% / 5.55% / 3.23% | RED |
| standings | 100% / 1.60% / 19.97% / 14.85% | 100% / 0.39% / 8.13% / 6.00% | RED |
| head-to-head | 21.71% / 47.49% / 11.37% / 65.23% | 80.20% / 14.46% / 22.18% / 9.18% | RED |
| multiclass | 18.88% / 53.77% / 20.59% / 72.00% | 17.12% / 13.03% / 17.14% / 9.23% | RED |
| schedule | 33.73% / 61.16% / 11.21% / 79.45% | 45.15% / 12.90% / 24.27% / 8.71% | RED |
| weather | 5.43% / 49.45% / 10.27% / 64.66% | 41.21% / 28.79% / 54.65% / 4.63% | RED |

El gate actual todavía cuenta diferencias de glifos y valores en widgets con
mucho texto, aunque el contrato de ISA-93 exige no igualar palabras ni
telemetría circunstancial. El siguiente microcorte debe separar esa señal de
contenido de los contratos verificables de tipografía, geometría y material;
no se marcará verde ningún diseño ni se tocarán referencias para ocultarla.

## Microcorte — protocolo de texto neutral y cierre 01/02

El protocolo de comparación v3 conserva los PNG canónicos v2 sin
regenerarlos. Para cada captura obtiene rectángulos ajustados de nodos de texto
en autoridad y renderer y los excluye únicamente de los gates píxel de
mask/alpha/composite. Fondo, bordes, sombras y material alrededor siguen
contando.

La exclusión no elimina el contrato tipográfico: un gate separado compara por
área las familias, tamaños `±1px`, pesos, line-height, letter-spacing y
writing-mode de los nodos visibles. Las regresiones prueban que cambiar solo
palabras no altera material, mientras un cambio de font-size sí falla.

| Diseño | Métrica material v3 | Tipografía | Gates |
|---|---|---|---|
| standings | 100% / 0.02% / 1.10% / 0.68% | 100% / 100% coverage | PASS |
| broadcast | 100% / 0.03% / 0.94% / 0.50% | 100% / 100% coverage | PASS |

Formato: `mask IoU / alpha / solid / grid`; coverage tipográfica:
`authority / renderer`. Ambos mantienen guard, fuentes, estabilidad y
Studio/Desktop/OBS verdes. Estado acumulado: 14/21. Las referencias siguen
intactas.

El mismo gate deja correctamente rojos los siete pendientes: Relative,
Delta Bar, Delta Trace, Schedule, Head to Head, Multiclass y Weather conservan
deltas reales de máscara/material o cobertura tipográfica; no existe un pase
por exclusión de texto.

## Microcorte — cierre Head to Head 09

La comparación de cajas DOM contra `.h2h-container` confirmó la estructura
real: filas de 47/51 px, placas de posición de 32.8125x22 px y sectores de
23.609375x26 px. El renderer replica esas cajas, elimina el borde inferior que
la autoridad excluye en la última fila y conserva la raíz transparente con
backdrop sobre las escenas de control.

Los sectores del jugador proceden únicamente del ViewModel. La fixture
determinista aporta cuatro comparaciones para el harness; live conserva el
array vacío cuando telemetría no las suministra. Las filas no activas usan
Inter 12/400 como la autoridad, mientras placas, sectores, gaps y vueltas
mantienen JetBrains Mono y los pesos canónicos.

| Diseño | Antes v3 | Después | Tipografía | Gates |
|---|---|---|---|---|
| head-to-head | 83.95% / 3.44% / 3.77% / 1.49% | 99.50% / 1.39% / 1.94% / 1.54% | 100% / 100% coverage | PASS |

Formato: `mask IoU / alpha / solid / grid`. Geometry, guard, fuentes,
estabilidad y Studio/Desktop/OBS también pasan. Referencias canónicas intactas;
estado acumulado: 15/21 diseños verdes.

El barrido 21/21 con protocolo v3 detectó además que las tres etiquetas de
estadística de Fuel heredaban la familia mono. Se fijaron a Inter 9/700 como
la autoridad y Fuel revalidó todos los gates con
`100% / 0.08% / 0.82% / 0.54%`.

## Microcorte — cierre Race Schedule 08

Schedule replica la jerarquía interna completa de `.rs-container`: header de
55 px, subbar de 45 px, lista de 483 px y filas 121/121/121/120. Los cuatro
filtros, seis slots de metadata por fila, materiales de clase/estado, glow
live y gradiente especial permanecen dentro de la raíz aislada.

Los eventos siguen procediendo del adapter y ViewModel read-only. Los slots
sin metadatos reales muestran `—`; el renderer no copia fechas, countdowns ni
valores de la muestra HTML y no expone el ISO crudo. Los anchos de slot forman
parte de la composición visual y son independientes del texto circunstancial.

| Diseño | Antes v3 | Después | Tipografía | Gates |
|---|---|---|---|---|
| schedule | 45.96% / 3.96% / 7.41% / 1.25% | 99.24% / 0.35% / 1.18% / 0.34% | 100% / 100% coverage | PASS |

Formato: `mask IoU / alpha / solid / grid`. Geometry, guard, fuentes,
estabilidad y Studio/Desktop/OBS también pasan. Referencias intactas; estado
acumulado: 16/21 diseños verdes.

## Microcorte — contenido gráfico dinámico v4 y cierre Delta Trace 07

El protocolo v4 amplía la neutralidad de contenido a curvas y mapas
telemetría-dependientes sin excluir rectángulos completos. Autoridad y renderer
generan una máscara PNG que contiene únicamente los píxeles renderizados de
las capas dinámicas; se excluye la unión exacta de esos píxeles. Una regresión
demuestra que mover una línea dinámica no altera el material, pero cambiar un
rectángulo fijo situado dentro de su bounding box sí falla.

La exclusión no omite el estilo: `trace-fill`, `trace-line`, `marker-line` y
`marker-dot` tienen un gate separado para fill/gradient, stroke, stroke-width,
opacity y filter. Rejilla, rectángulos de fondo, centro, sectores, bordes,
glass, blur y geometría siguen contando en los PNG. El manifest añade solo
selectores/roles; los PNG y hashes canónicos no se regeneran.

Delta Trace estira top/bottom a los 998 px internos de la autoridad, restaura
glass blur 24 px, sombra/inset, paneles, 14 sectores de 14 px, guías del
gráfico y bloque TURN vertical de 36 px. Curva, turn, sectores y mapa continúan
procediendo del ViewModel o muestran `—`; no se copian valores de la muestra.

| Diseño | Antes v3 | Después v4 | Tipografía/dinámico | Gates |
|---|---|---|---|---|
| delta-trace | 76.38% / 3.50% / 6.20% / 10.05% | 100% / 0.05% / 2.67% / 1.53% | 100% / PASS | PASS |

Formato: `mask IoU / alpha / solid / grid`. Geometry, guard, fuentes,
estabilidad y Studio/Desktop/OBS también pasan. Estado acumulado: 17/21;
referencias PNG intactas.

## Microcorte — cierre Multiclass 11

El ViewModel selecciona ahora una ventana par de cuatro filas con el jugador
en la segunda posición: un rival delante y dos detrás, como la composición
canónica. Las filas usan alturas 52/52/52/51 px y gaps de 1 px; los divisores
de clase permanecen anclados a cada frontera y la última fila no añade borde.

Los colores de clase proceden de scoring y no se fuerzan a las clases de la
muestra HTML. Sus píxeles se declaran dinámicos en el manifest, mientras el
número activo rojo, fondo del jugador, borde izquierdo, geometría 65x23,
radios, spacing y tipografía siguen dentro de los gates fijos.

| Diseño | Antes v4 | Después | Tipografía/dinámico | Gates |
|---|---|---|---|---|
| multiclass | 8.71% / 9.03% / 6.80% / 3.49% | 100% / 0.00% / 0.00% / 0.00% | 100% / PASS | PASS |

Formato: `mask IoU / alpha / solid / grid`. Geometry, guard, fuentes,
estabilidad y Studio/Desktop/OBS también pasan. Estado acumulado: 18/21;
referencias PNG intactas.

## Microcorte — cierre Track Weather 12

La raíz aislada conserva el material de la autoridad: fondo y borde exteriores
transparentes, `backdrop-filter: blur(20px)` y únicamente los cuatro paneles
internos como contenido. Se eliminó la distribución `flex: 1`, que alteraba
las proporciones, y se fijó la composición intrínseca canónica
107/91/107/115 px.

Los valores y descripciones ambientales siguen procediendo del ViewModel. Sus
píxeles, junto con el fill vivo de wetness, se excluyen con máscaras exactas;
labels, badges TEMP/RAIN/WIND, barra base, separadores, tipografía, spacing,
colores y opacidades permanecen puntuados.

| Diseño | Antes v4 | Después | Tipografía/dinámico | Gates |
|---|---|---|---|---|
| weather | 33.29% / 14.19% / 32.57% / 0.45% | 100% / 0.00% / 0.00% / 0.00% | 100% / PASS | PASS |

Formato: `mask IoU / alpha / solid / grid`. Geometry, guard, fuentes,
estabilidad y Studio/Desktop/OBS también pasan. Estado acumulado: 19/21;
referencias PNG intactas.

## Microcorte — cierre Relative 01

La superficie glass se aplica ahora a la raíz visual pura de Relative, como en
la autoridad, en lugar de a un frame interno cuya sombra quedaba recortada.
El material conserva `rgba(18,18,22,.82)`, borde 9%, radio 16 px, blur 24 px,
sombra exterior e inset.

La composición queda en 40/24/196/26 px para header, cabecera de tabla, siete
filas y footer. Se restauran gradiente del header, pill rojo con estado,
jerarquía 11/10 px y highlight del jugador. Los colores de clase siguen
derivándose de la telemetría y solo sus píxeles se neutralizan; la geometría y
el resto del material permanecen puntuados.

| Diseño | Antes v4 | Después | Tipografía/dinámico | Gates |
|---|---|---|---|---|
| relative | 41.96% / 8.02% / 6.25% / 17.50% | 100% / 0.01% / 0.44% / 0.27% | 100% / PASS | PASS |

Formato: `mask IoU / alpha / solid / grid`. Geometry, guard, fuentes,
estabilidad y Studio/Desktop/OBS también pasan. Estado acumulado: 20/21;
referencias PNG intactas.

## Microcorte — cierre Delta Bar 06

Delta Bar vuelve a ser una composición transparente de 440x92 px, sin card
exterior: pill superior de 275.140625x30, track 440x22 y pill inferior 87x28,
separados por gaps de 6 px. Los tres materiales conservan blur 24 px, bordes,
sombras y glows de la autoridad.

La variante Bar formatea el delta en centésimas, sin alterar el ViewModel ni
Delta Simple. La longitud del fill sigue siendo telemetría live y se excluye
por máscara de píxel; su gradiente, dirección, radios y glow se fijan al
contrato Crystal. El harness captura `.vc-delta-bar`, su raíz visual real, en
lugar del frame externo.

| Diseño | Antes v4 | Después | Tipografía/dinámico | Gates |
|---|---|---|---|---|
| delta-bar | 37.77% / 21.17% / 12.38% / 32.15% | 100% / 0.00% / 0.00% / 0.00% | 100% / PASS | PASS |

Formato: `mask IoU / alpha / solid / grid`. Geometry, guard, fuentes,
estabilidad y Studio/Desktop/OBS también pasan. Estado acumulado: 21/21;
referencias PNG intactas.
