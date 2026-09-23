# Reagrupación de duplicados — VAN-753 / #1346

Tarea: [VAN-753](https://app.notion.com/p/3e4e51695c6581a8b409f12fcd1c3f39).
Proyecto Engineer/Spotter. Rama `vantareapp/isa-1346-quality-clone-regroup`,
base nightly `8b25d076ea9a6ba6be8dc3065bcde978b6d24f07`.
Isaac autoriza corregir los pendientes de la pantalla. Esta PR contiene solo
el detector, sus pruebas y documentación, separada de producto PR1340.

## Problema y diseño

El informe jscpd publica pares y puede cambiar sus fragmentos al retirar un
archivo. La retirada de la CSS antigua de Engineer provoca 42 NEW, 27 identidades
y 15 registros repetidos en diez CSS con bytes idénticos a su procedencia.
No son 42 nuevas copias físicas. No se restaura CSS muerta ni se aceptan avisos
mediante baseline, ignore o reducción de umbral.

`classify_findings` conserva identidad, multiconjunto y MOVED. La reconciliación
posterior solo admite identidades nuevas en paths que ya aparecen en el baseline.
Exige baseline igual al de la base real PR y SHA histórico válido. Compara el
blob Git de fuente regular en procedencia y base con el hash crudo del archivo
canónico en disco, rechazando symlinks y rutas ajenas a src. Los IDs heredados
omiten src; se conservan sin migrarlos y el informe muestra el path real.
Cada registro conciliado queda visible como REGROUPED con identidad, blob y SHA.
Un excedente de identidad ya conocida permanece NEW de forma conservadora.

No se exige ascendencia lineal del SHA de procedencia: el baseline se incorporó
por squash y 7cfb153e no es ancestro de nightly. Si el objeto no está disponible,
se recupera únicamente ese SHA confiable desde origin, sin actualizar HEAD,
ramas ni FETCH_HEAD; el fallo de recuperación cierra el gate. Acceso Git real
al SHA verificado desde un repositorio temporal vacío; no se presupone por API.

## Pruebas y revisión

- RED previo: fixture real jscpd de tres CSS; retirar el corto causa NEW2 y FAIL.
- GREEN: misma transición sin modificaciones de fuentes existentes pasa y
  conserva dos registros REGROUPED con prueba de origen.
- Controles negativos: tercera copia, segunda copia física mismo archivo,
  duplicación anterior a la PR sin aceptar, reversión desde una base distinta,
  identidad conocida repetida, symlink padre, symlink Git histórico,
  baseline manipulado y procedencia inexistente siguen bloqueando.
- La repetición de registros por pares conserva cada evidencia. El fixture
  de este caso inyecta un registro adicional de salida real; la reproducción
  completa de PR1340 acredita los 42 registros, incluidas 15 repeticiones.
- Un clone superficial real recupera la procedencia desde un origin local,
  conserva HEAD y pasa; recuperación GitHub del SHA comprobada aparte.
- El test de política sigue exigiendo REVIEW_REQUIRED y exit1.
- Revisión independiente GPT-6 Sol: incorporadas comparación con base real,
  modos Git regulares y guardas de path; evidencia multiset examinada.

Pruebas completas, ejecución final sobre PR1340 y CI/SHA en Notion y PR.
No modifica runtime, configuración de analizadores, umbrales, baseline ni
workflow. No requiere ejecutar Go/frontend de producto por esta PR; los
analizadores completos sí comprueban el grafo. La PR de política devuelve
REVIEW_REQUIRED por diseño; la revisión externa no falsifica ese exit como PASS.
Antes de integrar el frontend, la corrección de calidad requiere su integración
separada autorizada. No merge, promoción ni release en esta entrega.
