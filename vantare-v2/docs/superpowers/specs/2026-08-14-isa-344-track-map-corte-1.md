# Spec: ISA-344 / TM-01 — Track Map, corte 1

Estado: aprobado para implementación autónoma por Isaac (2026-08-14).
Rama: `vantareapp/isa-344-tm-01-track-map` · Base: `origin/nightly` @ `7e4afe8`.

## Supuestos declarados

Se implementa bajo estos supuestos. Cualquiera de ellos que sea falso cambia el alcance.

1. El pack de geometría es un **asset estático de build**, no telemetría. Por eso vive
   en el frontend y no necesita Go, transporte ni persistencia.
2. Un design system puede cubrir **parcialmente** el catálogo de widgets.
   `vantare-endurance` registra hoy 4 de 19 tipos, luego entregar `track-map`
   sólo en Endurance es legítimo y no rompe ningún contrato.
3. `session.trackName` ya llega al frontend en `TelemetrySnapshot` y es la única
   entrada necesaria para seleccionar geometría en este corte.
4. Este corte **no dibuja vehículos**. Las poses por frame dependen de una medición
   de ancho de banda todavía no realizada.
5. El repositorio no contiene geometría real de ningún circuito, y este corte no
   la inventa.

## Objetivo

Dibujar la silueta del circuito activo dentro de un widget propio en
`vantare-endurance`, o declarar honestamente que no hay mapa disponible.

Usuario: piloto de LMU que compone su overlay en Overlay Studio.

Éxito: el widget se puede añadir, se ve correctamente en Studio con telemetría
simulada, y en una sesión real sin geometría conocida no miente.

## Tech stack

React 18 + TypeScript estricto, Vitest + Testing Library. Sin dependencias nuevas.

## Comandos

```
Test:  pnpm --dir frontend test
Focal: pnpm --dir frontend test -- track-map track-geometry vantare-endurance
Lint:  pnpm --dir frontend lint
Build: pnpm --dir frontend build
```

## Estructura

```
frontend/src/overlay/track-geometry/          → pack, selector y ajuste world→viewBox
frontend/src/overlay/widget-types/track-map/  → definition, content, view-model
frontend/src/overlay/design-systems/vantare-endurance/track-map/
                                              → renderizador y settings
```

## Estilo de código

Código formateado y legible. Varios `*-definition.ts` del repo están minificados en
una sola línea; eso es deuda, no convención, y no se replica. La referencia de estilo
es `vantare-endurance/delta/delta-endurance-settings.ts`.

El sistema Endurance usa `templateId` con degradación observable:

```ts
export function parseTrackMapEnduranceSettings(input: unknown): TrackMapEnduranceSettings {
  const source = isPlainObject(input) ? input : {};
  if (source.templateId === undefined) {
    return { templateId: "track-map-outline" };
  }
  if (isTemplateId(source.templateId)) {
    return { templateId: source.templateId };
  }
  return { templateId: "track-map-outline", templateDiagnostic: "unknown-template" };
}
```

Los renderizadores reciben ViewModels puros (ADR 0003): nada de persistencia,
transporte ni posición dentro del componente.

## Contrato de geometría

```ts
export type TrackGeometry = {
  id: string;              // estable, en kebab-case
  label: string;
  synthetic: boolean;      // true = no procede de una captura real
  aliases: readonly string[];
  points: readonly TrackPoint[];  // plano X/Z en metros mundo
};
```

La resolución es **fail-closed**: se normaliza `trackName` (minúsculas, sin
diacríticos, sin puntuación, espacios colapsados) y se busca coincidencia exacta
contra id o alias. Cero coincidencias o más de una devuelven `undefined`. No hay
coincidencia parcial, ni por prefijo, ni por distancia de edición: elegir "el más
parecido" es exactamente el fallo que este diseño existe para impedir.

El ajuste `world → viewBox` preserva la relación de aspecto con un único factor de
escala, y se aplicará por igual al trazado y a los futuros marcadores, de modo que
no puedan divergir.

## Estrategia de pruebas

Vitest, tests junto al código. TDD por microcortes: test primero en la lógica pura
(selector y ajuste), render después.

Cubre obligatoriamente:

- nombre desconocido, vacío, sólo espacios y ambiguo → sin geometría;
- alias equivalentes por mayúsculas, acentos y puntuación → misma geometría;
- ajuste determinista y con aspecto preservado;
- `parseContent` con `null`, array, string y objeto corrupto;
- render en estado disponible y en estado no disponible;
- contrato `vantare-endurance` actualizado a cinco widgets.

## Límites

- **Siempre:** fail-closed ante ambigüedad; marcar la geometría sintética como tal;
  ejecutar test, lint y build antes de cerrar.
- **Preguntar antes:** publicar cualquier cosa en el contrato Overlay; añadir
  dependencias; tocar Go; renderizar en otros design systems.
- **Nunca:** inventar geometría de un circuito real; elegir el trazado más parecido;
  mezclar este cambio con el trabajo ajeno sin commitear del checkout principal;
  promocionar a `nightly`.

## Criterios de éxito

1. `trackName` desconocido, vacío o ambiguo produce estado "no disponible".
2. Los alias resuelven de forma explícita y probada.
3. El ajuste preserva aspecto y es determinista.
4. El widget se registra, instancia y sobrevive a contenido corrupto.
5. El contrato Endurance refleja cinco widgets y pasa.
6. Test, lint y build en verde.
7. Cero archivos Go modificados.

## Preguntas abiertas

1. **Geometría real bloqueada.** No existe captura con vuelta completa de posiciones
   mundo en el repo: las fixtures `testdata/*.bin` son fotogramas únicos y
   `derive/testdata/lmu-1.4-self-delta-trace-v1.jsonl` sólo lleva `lap_distance_m`
   y `speed_mps`. Los circuitos reales requieren una captura que debe producir Isaac.
2. **Puerta de ancho de banda.** Antes de publicar poses por frame hay que medir la
   fixture de 44 coches contra el contrato candidato. Medición previa verificada:
   2.480 B/vehículo, 44 coches ≈ 109 KB por frame, 43 % del tope de 256 KiB, a 60 Hz
   y siempre en modo full.
3. **Gate de feature.** `track-map` entra como `overlays.advanced` por coherencia con
   el resto de widgets no básicos. Revisable cuando exista decisión comercial.
