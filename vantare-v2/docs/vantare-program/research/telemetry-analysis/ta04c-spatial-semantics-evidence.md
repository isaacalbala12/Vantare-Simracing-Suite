# TA-04C — evidencia oficial de semántica espacial

Estado: revisión documental cerrada el 2026-08-12. Resultado: **datum GPS
`NO-GO`** y **fórmula de anchura `NO-GO`**. No se abrió telemetría LMU ni se
produjo evidencia visual.

## Método y custodia

Se revisaron fuentes primarias públicas de LMU y Studio 397. El archivo oficial
Example Plugin v8 se descargó de forma temporal para leer su header, no se
incorporó al repo y no se atribuye ningún hash no publicado. No se leyó una
grabación, WAL, ruta personal, coordenada, muestra, metadata ni secreto. La
evidencia local de TA-04A se usó solo como antecedente agregado ya versionado.

## Matriz de evidencia

| Fuente oficial | Qué demuestra | Qué no demuestra |
|---|---|---|
| [LMU — Telemetry Recording](https://guide.lemansultimate.com/hc/en-gb/articles/14524956311695-Telemetry-Recording) | La configuración publicada enumera `GPS Latitude`, `GPS Longitude`, `Path Lateral` y `Track Edge`, todos a 10 Hz. | No declara datum, CRS, elipsoide, transformación, unidad/convención lateral, origen, signo, lado ni fórmula de anchura. |
| [Studio 397 — Modding Resources](https://www.studio-397.com/modding-resources/) y [Example Plugin v8](https://www.studio-397.com/wp-content/uploads/2023/03/rF2_Example_Plugin.7z) | La página oficial distribuye el ejemplo rFactor 2. En `InternalsPlugin.hpp`, `mPathLateral` se describe como posición lateral respecto a un centro «muy aproximado» y `mTrackEdge` como el borde, respecto a ese centro, del mismo lado de pista que el vehículo. | El comentario no declara unidad ni convención de signo explícitas, no ofrece el borde opuesto ni una fórmula de anchura, y no establece equivalencia contractual con los canales DuckDB de LMU. |
| [Studio 397 — GDB](https://docs.studio-397.com/pages/viewpage.action?pageId=37945739) | En el archivo de circuito, `Latitude` se expresa en grados desde el ecuador, positiva al norte, y `Longitude` en grados desde GMT, positiva al este. | No declara datum/elipsoide ni transformación y no vincula esos campos GDB con `GPS Latitude`/`GPS Longitude` de telemetría LMU. |
| [TA-04A — evidencia agregada local](ta04a-spatial-evidence.md) | Hay cobertura, alineación por índice, rangos geográficos plausibles y cierres inferidos; también cobertura y rangos de los canales laterales. | No identifica datum, transformación, origen, signo, lado, unidad ni relación con ambos bordes. TA-04C no abrió datos adicionales. |

## Decisión GPS: `NO-GO`

La guía LMU publica nombres y frecuencias, pero ninguna semántica geodésica. El
GDB documenta orientación y unidad de campos de configuración de pista; no
prueba que la telemetría DuckDB use esos campos, ni especifica datum/elipsoide o
transformación. Los cierres plausibles obtenidos en TA-04A dependen de una
proyección diagnóstica elegida por Vantare y no pueden identificar por sí solos
el CRS de origen.

Por tanto no existe base autoritativa para declarar GPS sintético, WGS84 u otro
datum, ni para transformar los canales a metros. La capability de geometría
permanece `unknown`; mapa y captura TA-04B siguen bloqueados.

## Decisión de anchura: `NO-GO`

El header rFactor 2 permite formular una hipótesis limitada: si los campos LMU
fueran contractualmente equivalentes, compartieran origen, signo y unidad, y
`Track Edge` expresara la coordenada del borde relevante para cada muestra,
`abs(Track Edge - Path Lateral)` podría representar distancia del vehículo a
ese borde. Ninguno de esos supuestos está demostrado para LMU y esa distancia
unilateral no es anchura total.

`2 * abs(Track Edge)` tampoco es una fórmula demostrada. Duplica la distancia
del centro aproximado al borde del lado del vehículo y presupone, sin fuente,
un borde opuesto simétrico. El header no proporciona ambos bordes ni garantiza
que el «centro» aproximado sea el centro geométrico de la pista.

En consecuencia, no se calcula anchura por tramo o global. La capability de
anchura permanece `incompatible` hasta disponer de origen, signo, lado, unidad,
relación/fórmula y ambos bordes documentados para una versión de LMU.

## Evidencia que desbloquearía cada gate

- **GPS:** documento o SDK oficial LMU versionado, o aclaración oficial de
  Studio 397 vinculada explícitamente a LMU/DuckDB, con CRS, datum/elipsoide y
  transformación de ambos canales.
- **Anchura:** fuente equivalente con origen, signo, lado y unidad de ambos
  canales, relación/fórmula explícita y mecanismo para obtener borde izquierdo
  y derecho por tramo.

Una fuente rFactor 2 sin contrato de equivalencia LMU, una coincidencia de
nombres, más datos agregados o una proyección que «parece cerrar» no satisfacen
ningún gate.

## STOP y siguiente paso

**STOP visual confirmado:** no TA-04B, UI, mapa, capturas ni Claude. La siguiente
acción es crear o recuperar primero la issue TA-04C y vincular esta rama y
commit; después se crea TA-04D como backlog dependiente según
`ta04c-spatial-semantics-plan.md` para solicitar autoridad oficial. Hasta
entonces se conserva la degradación honesta y no se implementa fallback.
