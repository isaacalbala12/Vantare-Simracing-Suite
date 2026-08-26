# TA-04C — autoridad de semántica espacial LMU

Estado: investigación documental cerrada localmente; `NO-GO` para datum GPS y
`NO-GO` para fórmula de anchura. Issue de Linear pendiente por la excepción
temporal autorizada. No autoriza implementación ni superficie visual.

## Objetivo

Determinar si documentación oficial y versionable demuestra dos contratos
independientes para los canales históricos de Le Mans Ultimate (LMU):

1. el datum/CRS y la transformación de `GPS Latitude`/`GPS Longitude`;
2. el origen, signo, lado, unidad y fórmula que relacionan `Path Lateral` y
   `Track Edge` con ambos bordes y la anchura total de pista.

TA-04C reevalúa únicamente autoridad semántica. No abre grabaciones, no añade
datos a TA-04A y no convierte plausibilidad numérica en contrato.

## Base, alcance y límites

- Rama local: `work/ta04c-spatial-semantics`, base `52bbb09`.
- Excepción vigente: documentación sin Linear ahora; registrar la issue al
  final antes de cualquier push, PR o integración.
- Permitido: fuentes oficiales públicas, evidencia documental sanitizada y
  actualización de los documentos canónicos.
- Prohibido: código, tests de producto, dependencias, lectura de `.duckdb`,
  captura técnica, UI, mapa, coordenadas renderizadas y fórmulas aproximadas.

**STOP visual:** no iniciar TA-04B ni pedir UI, mapa, capturas o trabajo a
Claude. Este corte termina al registrar la decisión documental.

## Fuentes aceptadas y criterio de autoridad

Se aceptan únicamente fuentes primarias oficiales que identifiquen de manera
versionable el contrato de LMU. Se consultan:

- [LMU — Telemetry Recording](https://guide.lemansultimate.com/hc/en-gb/articles/14524956311695-Telemetry-Recording);
- [Studio 397 — Modding Resources](https://www.studio-397.com/modding-resources/)
  y su [Example Plugin v8](https://www.studio-397.com/wp-content/uploads/2023/03/rF2_Example_Plugin.7z);
- [Studio 397 — Game Database File (GDB)](https://docs.studio-397.com/pages/viewpage.action?pageId=37945739).

Una fuente rFactor 2 puede aportar una hipótesis de investigación, pero no se
considera automáticamente contrato de los canales DuckDB de LMU. Una
coincidencia de nombres tampoco demuestra equivalencia de versión, unidad,
signo o transformación.

## Gates y resultado

| Gate | Requisito de `GO` | Resultado TA-04C |
|---|---|---|
| Datum GPS | Documento o SDK oficial LMU versionado que declare CRS/datum o elipsoide y transformación de los canales históricos. | `NO-GO`: ninguna fuente consultada lo declara. |
| Anchura | Documento o SDK oficial LMU versionado que declare origen, signo, lado, unidad, relación entre ambos canales, fórmula y disponibilidad de ambos bordes. | `NO-GO`: ninguna fuente consultada lo declara. |

Las decisiones completas y su trazabilidad están en
`ta04c-spatial-semantics-evidence.md`.

## Consecuencias

- `GPS Latitude`/`GPS Longitude` pueden conservarse como señales nativas con
  semántica espacial no demostrada; no habilitan proyección o mapa.
- `2 * abs(Track Edge)` no es una anchura total demostrada: presupone simetría
  del borde opuesto y una semántica de coordenadas que no están documentadas.
- `abs(Track Edge - Path Lateral)` es, como máximo, una hipótesis rFactor 2 de
  distancia del vehículo al borde relevante bajo equivalencia, origen, signo,
  lado y unidad comunes; esos supuestos no están demostrados para LMU y la
  expresión tampoco entrega ambos bordes ni la anchura total.
- La evidencia agregada TA-04A no abre datos nuevos ni resuelve semántica:
  cobertura, rangos y cierres plausibles no identifican un datum ni una
  fórmula.

## Issue futura documentada

Crear en Linear, al terminar la excepción temporal, una issue titulada
**«TA-04D — contrato oficial LMU para datum y bordes de pista»**, dependiente de
TA-04C y bloqueante de TA-04B. Debe limitarse a conseguir las pruebas
correspondientes:

1. documentación o SDK **oficial LMU y versionado** que declare para GPS el
   CRS, datum/elipsoide y transformación de `GPS Latitude`/`GPS Longitude`; o
2. aclaración oficial de Studio 397 que vincule explícitamente una versión de
   LMU/DuckDB con esos campos y declare lo anterior; y
3. para anchura, documentación o aclaración equivalente que declare origen,
   signo, lado, unidad y relación/fórmula de `Path Lateral`/`Track Edge`, además
   de cómo se obtienen **los dos bordes** por tramo.

La issue se cierra `GO` solo si la fuente satisface todos los campos del gate
correspondiente. Una respuesta parcial conserva ese gate en `NO-GO`; los dos
gates se deciden por separado. Si no aparece autoridad, se registra la consulta
y se mantiene la degradación `unknown`/`incompatible` sin fallback.

## Verificación y cierre

1. Comprobar que cada afirmación externa apunta a una URL oficial.
2. Buscar cualquier afirmación de GPS sintético, datum o fórmula de anchura y
   confirmar que queda marcada como legacy, hipótesis o no demostrada.
3. Ejecutar búsquedas de coherencia y `git diff --check`.
4. Revisar el diff completo y dejar un commit documental local.

No corresponden tests Go/frontend: no cambia código ni comportamiento de
producto. No hay verificación visual porque está expresamente fuera de alcance.
