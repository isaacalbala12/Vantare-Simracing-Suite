# ISA-894 · R4 OBS V2-only

## Objetivo

Retirar del runtime productivo OBS la creación y ejecución del adapter SSE
Overlay Projection V1 y del comparador shadow V1/V2. OBS debe seguir
consumiendo OverlayFrame V2 por el SSE canónico existente, sin introducir
otra fuente, store o coordinador.

Base congelada: `f755a527a5380c86e1dde2e825b3615bc257fa21` (R3).

## Alcance cerrado

- `frontend/src/overlay/ObsOverlayApp.tsx`
- `frontend/src/overlay/ObsOverlayApp.test.tsx`

Se permite añadir evidencia y actualizar el handoff/roadmap al cerrar el
corte. No se modifican en R4 el backend, las rutas SSE, el productor, los
tipos compartidos, fixtures, adapters legacy todavía referenciados por otros
consumidores, Desktop, Studio ni el renderer de widgets.

## Contrato que debe preservarse

1. OBS mantiene un único store y binding OverlayFrame V2.
2. El store V2 se resetea antes de abrir el SSE.
3. El SSE `/telemetry/overlay-v2/projection` sigue procesando frames válidos y
   publicando `invalid-frame` ante entradas inválidas.
4. Engineer continúa usando `/engineer/stream` y su store independiente.
5. Perfil, calendario, Race Schedule, flags y diagnósticos V2 se conservan.
6. React StrictMode no deja EventSources huérfanos y el teardown cierra los dos
   streams propios.
7. OBS no abre `/telemetry/overlay/projection`, no crea shadow y no publica un
   resumen shadow en sus diagnósticos.

## TDD obligatorio

### RED

Actualizar primero el test focal para exigir el lifecycle OBS V2-only:

- exactamente dos EventSources activos por montaje: V2 y Engineer;
- ausencia explícita de la ruta V1;
- un frame V2 golden sigue renderizando y contabilizando el diagnóstico;
- el desmontaje cierra ambos streams;
- no se crea ni expone estado shadow.

El test debe fallar contra la implementación R3 por la tercera conexión V1 o
la creación del shadow antes de tocar producción. Registrar comando y causa
literal.

### GREEN

- Eliminar de `ObsOverlayApp` los imports, creación, start/stop y callbacks del
  adapter V1.
- Eliminar la creación, ingestión, diagnóstico y dispose del shadow.
- Mantener sin cambios funcionales V2, Engineer, perfil, calendario,
  Race Schedule, flags y cleanup.
- Eliminar del test únicamente mocks y expectativas que ya no representan una
  dependencia productiva.

## Gates

- test focal RED registrado y luego GREEN;
- tests focales OBS/V2 relacionados;
- `pnpm --dir frontend typecheck`;
- `pnpm --dir frontend build`;
- lint de los archivos tocados;
- `git diff --check`;
- búsqueda que pruebe que `ObsOverlayApp` ya no importa, construye, arranca ni
  diagnostica V1/shadow;
- revisión fresca de cumplimiento y después revisión fresca de calidad.

## Cierre

Documentar evidencia, actualizar el handoff vivo y el hito de telemetría del
roadmap sin declarar retirada total de V1. Crear PR draft apilada sobre R3. No
mergear ni promover a `nightly` sin autorización explícita de Isaac.
