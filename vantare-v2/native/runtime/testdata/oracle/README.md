# Oráculo Go de Standings — ISA-1425

Go congelado: `3ced668f22aa79819aefae059d28b15d52452274`.

Manifest SHA-256: `b53373be4ebe61ded864c63f860998e5f40dff9340e81dee68c02cf58cd0f6b9`.

Reproduce 12 fixtures y 3839 eventos reales (3600 SHM + 239 REST).
60 muestras: primer SHM en o después de cada segundo 0..59, sin saltar eventos intermedios.

| Golden | SHA-256 |
|---|---|
| `lmu-1.4-garage-fixture.json` | `f70ee238cc645db74454daa6304451813e2e1dec5c4241751b4e52ba1d505257` |
| `lmu-1.4-menu-fixture.json` | `9d946de1f00ddc82a0b10aa70f7487a500152ef8a45eafaa7e66491e43817612` |
| `lmu-1.4-outlap-fixture.json` | `17cb7b366973d008012ebaf4fdf5274beae876375aee01e4edab5f62eb01a4c2` |
| `lmu-1.4-pit-fixture.json` | `4941dd5cae992fdcccdf128a0f78459dd30c7bc641e9d99740d685b4f6bc40af` |
| `lmu-1.4-pre-pit-track-fixture.json` | `9a61e276b0d15c326e0db0c01e360969cc85ee551829067ab61b25c863f3db29` |
| `lmu-1.4-track-fixture.json` | `dae0d4f5c294b60798ef5efca7ecdf9eadbb157726939cef5131af0b518354b6` |
| `lmu-1.4.1.3-menu-fixture.json` | `9d946de1f00ddc82a0b10aa70f7487a500152ef8a45eafaa7e66491e43817612` |
| `lmu-1.4.1.3-track-fixture.json` | `2ea78ed9fe160eab6c09c4d359dafcca1f659b4641ec6798dd03498aa5c21460` |
| `lmu-1.4.2.0-menu-fixture.json` | `9d946de1f00ddc82a0b10aa70f7487a500152ef8a45eafaa7e66491e43817612` |
| `lmu-1.4.2.0-track-fixture.json` | `c880e50b904aa702704889dd9f712f9467384ceef9e6c85bfcf5cf18a6e5f6cf` |
| `lmu-fixture.json` | `5a9bcf34a661a01d4756675f3dc3b881c1d5027089e8e2c9d0162c3607267c6a` |
| `lmu-menu-fixture.json` | `9d946de1f00ddc82a0b10aa70f7487a500152ef8a45eafaa7e66491e43817612` |
| `lmu47-00s.json` | `e9be850ab7f36355af2bdc92e13817e980cbc98d30308884523e6fd5d43d55dd` |
| `lmu47-01s.json` | `8e31dbaebc3915464aa91608d105c61997c1ae46321563a486a7db131ea51756` |
| `lmu47-02s.json` | `8e31dbaebc3915464aa91608d105c61997c1ae46321563a486a7db131ea51756` |
| `lmu47-03s.json` | `8e31dbaebc3915464aa91608d105c61997c1ae46321563a486a7db131ea51756` |
| `lmu47-04s.json` | `8e31dbaebc3915464aa91608d105c61997c1ae46321563a486a7db131ea51756` |
| `lmu47-05s.json` | `8e31dbaebc3915464aa91608d105c61997c1ae46321563a486a7db131ea51756` |
| `lmu47-06s.json` | `8e31dbaebc3915464aa91608d105c61997c1ae46321563a486a7db131ea51756` |
| `lmu47-07s.json` | `8e31dbaebc3915464aa91608d105c61997c1ae46321563a486a7db131ea51756` |
| `lmu47-08s.json` | `8e31dbaebc3915464aa91608d105c61997c1ae46321563a486a7db131ea51756` |
| `lmu47-09s.json` | `8e31dbaebc3915464aa91608d105c61997c1ae46321563a486a7db131ea51756` |
| `lmu47-10s.json` | `8e31dbaebc3915464aa91608d105c61997c1ae46321563a486a7db131ea51756` |
| `lmu47-11s.json` | `8e31dbaebc3915464aa91608d105c61997c1ae46321563a486a7db131ea51756` |
| `lmu47-12s.json` | `8e31dbaebc3915464aa91608d105c61997c1ae46321563a486a7db131ea51756` |
| `lmu47-13s.json` | `8e31dbaebc3915464aa91608d105c61997c1ae46321563a486a7db131ea51756` |
| `lmu47-14s.json` | `8e31dbaebc3915464aa91608d105c61997c1ae46321563a486a7db131ea51756` |
| `lmu47-15s.json` | `8e31dbaebc3915464aa91608d105c61997c1ae46321563a486a7db131ea51756` |
| `lmu47-16s.json` | `8e31dbaebc3915464aa91608d105c61997c1ae46321563a486a7db131ea51756` |
| `lmu47-17s.json` | `8e31dbaebc3915464aa91608d105c61997c1ae46321563a486a7db131ea51756` |
| `lmu47-18s.json` | `8e31dbaebc3915464aa91608d105c61997c1ae46321563a486a7db131ea51756` |
| `lmu47-19s.json` | `8e31dbaebc3915464aa91608d105c61997c1ae46321563a486a7db131ea51756` |
| `lmu47-20s.json` | `8e31dbaebc3915464aa91608d105c61997c1ae46321563a486a7db131ea51756` |
| `lmu47-21s.json` | `8e31dbaebc3915464aa91608d105c61997c1ae46321563a486a7db131ea51756` |
| `lmu47-22s.json` | `8e31dbaebc3915464aa91608d105c61997c1ae46321563a486a7db131ea51756` |
| `lmu47-23s.json` | `8e31dbaebc3915464aa91608d105c61997c1ae46321563a486a7db131ea51756` |
| `lmu47-24s.json` | `8e31dbaebc3915464aa91608d105c61997c1ae46321563a486a7db131ea51756` |
| `lmu47-25s.json` | `8e31dbaebc3915464aa91608d105c61997c1ae46321563a486a7db131ea51756` |
| `lmu47-26s.json` | `8e31dbaebc3915464aa91608d105c61997c1ae46321563a486a7db131ea51756` |
| `lmu47-27s.json` | `8e31dbaebc3915464aa91608d105c61997c1ae46321563a486a7db131ea51756` |
| `lmu47-28s.json` | `8e31dbaebc3915464aa91608d105c61997c1ae46321563a486a7db131ea51756` |
| `lmu47-29s.json` | `8e31dbaebc3915464aa91608d105c61997c1ae46321563a486a7db131ea51756` |
| `lmu47-30s.json` | `8e31dbaebc3915464aa91608d105c61997c1ae46321563a486a7db131ea51756` |
| `lmu47-31s.json` | `8e31dbaebc3915464aa91608d105c61997c1ae46321563a486a7db131ea51756` |
| `lmu47-32s.json` | `8e31dbaebc3915464aa91608d105c61997c1ae46321563a486a7db131ea51756` |
| `lmu47-33s.json` | `8e31dbaebc3915464aa91608d105c61997c1ae46321563a486a7db131ea51756` |
| `lmu47-34s.json` | `8e31dbaebc3915464aa91608d105c61997c1ae46321563a486a7db131ea51756` |
| `lmu47-35s.json` | `8e31dbaebc3915464aa91608d105c61997c1ae46321563a486a7db131ea51756` |
| `lmu47-36s.json` | `8e31dbaebc3915464aa91608d105c61997c1ae46321563a486a7db131ea51756` |
| `lmu47-37s.json` | `8e31dbaebc3915464aa91608d105c61997c1ae46321563a486a7db131ea51756` |
| `lmu47-38s.json` | `8e31dbaebc3915464aa91608d105c61997c1ae46321563a486a7db131ea51756` |
| `lmu47-39s.json` | `8e31dbaebc3915464aa91608d105c61997c1ae46321563a486a7db131ea51756` |
| `lmu47-40s.json` | `8e31dbaebc3915464aa91608d105c61997c1ae46321563a486a7db131ea51756` |
| `lmu47-41s.json` | `8e31dbaebc3915464aa91608d105c61997c1ae46321563a486a7db131ea51756` |
| `lmu47-42s.json` | `8e31dbaebc3915464aa91608d105c61997c1ae46321563a486a7db131ea51756` |
| `lmu47-43s.json` | `8e31dbaebc3915464aa91608d105c61997c1ae46321563a486a7db131ea51756` |
| `lmu47-44s.json` | `8e31dbaebc3915464aa91608d105c61997c1ae46321563a486a7db131ea51756` |
| `lmu47-45s.json` | `8e31dbaebc3915464aa91608d105c61997c1ae46321563a486a7db131ea51756` |
| `lmu47-46s.json` | `8e31dbaebc3915464aa91608d105c61997c1ae46321563a486a7db131ea51756` |
| `lmu47-47s.json` | `8e31dbaebc3915464aa91608d105c61997c1ae46321563a486a7db131ea51756` |
| `lmu47-48s.json` | `8e31dbaebc3915464aa91608d105c61997c1ae46321563a486a7db131ea51756` |
| `lmu47-49s.json` | `8e31dbaebc3915464aa91608d105c61997c1ae46321563a486a7db131ea51756` |
| `lmu47-50s.json` | `8e31dbaebc3915464aa91608d105c61997c1ae46321563a486a7db131ea51756` |
| `lmu47-51s.json` | `8e31dbaebc3915464aa91608d105c61997c1ae46321563a486a7db131ea51756` |
| `lmu47-52s.json` | `8e31dbaebc3915464aa91608d105c61997c1ae46321563a486a7db131ea51756` |
| `lmu47-53s.json` | `8e31dbaebc3915464aa91608d105c61997c1ae46321563a486a7db131ea51756` |
| `lmu47-54s.json` | `8e31dbaebc3915464aa91608d105c61997c1ae46321563a486a7db131ea51756` |
| `lmu47-55s.json` | `8e31dbaebc3915464aa91608d105c61997c1ae46321563a486a7db131ea51756` |
| `lmu47-56s.json` | `8e31dbaebc3915464aa91608d105c61997c1ae46321563a486a7db131ea51756` |
| `lmu47-57s.json` | `8e31dbaebc3915464aa91608d105c61997c1ae46321563a486a7db131ea51756` |
| `lmu47-58s.json` | `8e31dbaebc3915464aa91608d105c61997c1ae46321563a486a7db131ea51756` |
| `lmu47-59s.json` | `8e31dbaebc3915464aa91608d105c61997c1ae46321563a486a7db131ea51756` |

## Comparación nativa y diferencias (2026-09-29)

Base nativa: `f0254e1f354970c06130775c92edc0a4e21cd9e6`.
Referencia Go: `3ced668f22aa79819aefae059d28b15d52452274`.
72 entradas, 2.967 filas de coches y 3.839 observaciones por adaptador LMU +
`Core`. La comparación incluye identidad normalizada, número, piloto, clase,
posición global y de clase, vueltas, última/mejor vuelta, gaps al líder/al de
delante, boxes, tipo de sesión, tiempo restante y pista.

| Diferencia | Casos | Explicación / tratamiento |
|---|---:|---|
| Menús: Go rechaza por identidad inválida; nativo publica sesión sin coches | 4 entradas, 8 diferencias | No hay proyección Go. Se conserva el rechazo y el estado nativo exacto; excepción de semántica documentada. |
| Intervalo de P2: Go ausente; Core `Estimated(Time(0))` | 60 entradas, 120 diferencias (valor + calidad) | P1 y P2 tienen gap al líder cero y posiciones consecutivas; Core resta 0−0. Se admite la derivación explícita, sin llamarla observada. |
| Tiempo restante: Go `invalid`, nativo `Unavailable` | 60 entradas, 60 diferencias de calidad | `mEndET` < `mCurrentET`; ambos carecen de valor utilizable. Rust no tiene variante `Invalid`. |
| P9–P12, fixture 1.4.1.3: una vuelta perdida se convierte en segundos | **4 diferencias, bloqueo** | El adaptador entrega `Reliable(Laps(1))`, pero `core/derive.rs::gaps` lo trata como ausencia de tiempo y lo sobrescribe con `Estimated(Time)`. **No se admite como excepción.** |

Total: **192 diferencias**, de las que **188 están justificadas** y **4 hacen
fallar el gate de paridad**. No se corrigió el núcleo porque está fuera de las
rutas asignadas. La solución debe preservar un gap nativo actual de tipo
`Laps` al derivar tiempos; corresponde al worker del núcleo y a la revisión
del orquestador. No ampliar la lista de excepciones para hacer verde el test.

Cada excepción tiene ruta de golden/coche/campo, valor Go, valor nativo y
explicación en `exceptions.json`. El test exige coincidencia exacta y falla
si una excepción cambia o deja de aplicarse. SHA-256 de las excepciones:
`dbf34205236ee51a039846b4c4212affc3171205cbaf1ea7af2dcc67d5eaf665`.

Los cuatro defectos quedan reproducidos con sus valores en
`native-defects.json` (SHA-256
`53574208e30f1f1b9c8025990c509e089b0c2c2aa7a34f42adf8ecc301252c31`).
Ese archivo es evidencia del fallo observado en la base; **no es una lista
permitida ni una expectativa de conservar el defecto**.

### Reproducción

Desde `vantare-v2/`, generar a un directorio nuevo:

```powershell
go run ./tools/native-oracle -out tools/native-oracle/reproduccion
```

Desde `vantare-v2/native/`:

```powershell
cargo test -p vantare-runtime --test lmu_oracle -j 4 -- --nocapture
cargo fmt --check
cargo clippy --workspace --all-targets -j 4 -- -D warnings
cargo test --workspace -j 4
```

`cargo fmt` no admite `-j`; clippy y test se limitan a cuatro jobs.
El test informa cuatro diferencias no autorizadas hasta corregir el núcleo.
Para recoger un informe completo de diagnóstico, puede fijarse
`NATIVE_ORACLE_DIFF_OUT` a una ruta local de salida; el test sigue fallando y
no cambia goldens ni excepciones. Sin esa variable no escribe artefactos.

Tolerancia absoluta: **1 ms** para última/mejor vuelta, tiempo restante y gaps
en tiempo; justificada por el contrato en milisegundos y la conversión del
reloj Go a nanosegundos. Identidades, strings, posiciones, vueltas, boxes,
calidad y gaps por vueltas se comparan exactamente. No hay tolerancia relativa
ni sustitución de ausencia por cero. El test verifica hashes antes de leer
valores, falla si falta corpus/golden y exige una revisión por cada evento,
por lo que un replay truncado no puede pasar en vacío.

### Límites

Los ID Go `lmu-slot-…-generation-…` y los `CarId` nativos usan espacios de
identidad distintos. El golden conserva los ID originales y el test compara
el ordinal estable de primera aparición; no usa posición ni número como ID.
`Estimated` se compara como fresco, según la distinción entre frescura Go y
autoridad Rust. Los gaps con vueltas perdidas se comparan como vueltas, el
tipo compartido más informativo; no se comparan segundos subordinados a ese
contador. La fase 1 requiere además capturas propias del revisor para live,
menú/boxes, cambios de sesión, REST caído y cierre; este replay no las sustituye.
El corpus temporal documenta coches parados en boxes con reloj de sesión en
avance: no demuestra una carrera activa con cambios de orden.

Notion no disponible; se usó GitHub #1425 por instrucción expresa del encargo.
No se ha actualizado ni declarado completo el seguimiento Notion. Sin push,
PR, merge, promoción o release. No hay dependencias nuevas ni cambios fuera
de `tools/native-oracle/`, este directorio y `runtime/tests/lmu_oracle.rs`.

### Gates ejecutados

| Comando | Resultado |
|---|---|
| `cargo fmt --check` | Correcto, sin salida. `fmt` no admite `-j`. |
| `cargo clippy --workspace --all-targets -j 4 -- -D warnings` | Correcto, cero avisos. |
| `cargo test --workspace -j 4` | **Exit 101**: oráculo `4 passed; 1 failed`; cuatro diferencias no autorizadas y cero excepciones obsoletas. |
| `go test -p 4 ./tools/native-oracle` | Correcto, dos tests de la herramienta. |
| `go vet ./tools/native-oracle` | Correcto, sin salida. |
| Generación Go y repetición a directorio nuevo | Correcto: los 72 goldens y el manifiesto son idénticos byte a byte. |
| `git diff --cached --check` | Correcto. |
| `go test -p 4 ./...` | **Exit 1**: falta `frontend/dist`; también falló `TestCoordinatorWithSQLiteDrainsAndReleasesAllHandles` al completar el WAL (`context deadline exceeded`). Su repetición aislada con `-parallel=1 -count=1` pasó. No se construyó frontend fuera del alcance. |

La primera ejecución completa de Rust se detuvo antes del oráculo por dos
fallos `index out of bounds` de `lifecycle.rs:352/379`. Ambos escenarios
pasaron al repetirlos aislados, y los siete escenarios pasaron en la última
ejecución completa. No se tocó ese test ni se declara resuelta su
inestabilidad. La última ejecución completa pasó domain, arquitectura, IPC,
runtime, bins, core E2E, lifecycle y las ocho pruebas de conformidad LMU antes
del fallo del oráculo. Las pruebas posteriores de UI/doc no se ejecutaron
porque Cargo se detuvo. Las dos pruebas live existentes siguen ignoradas por
requerir LMU en marcha; no son evidencia física.

La prueba de orden de miembros JSON protege la unificación de features:
GPUI activa `serde_json/preserve_order` en el workspace, pero ordenar las
claves de un objeto no puede cambiar la paridad. Este defecto del comparador
se reprodujo en el gate completo y se corrigió antes de esta entrega.

**Estado de entrega:** oráculo y test de regresión preparados para revisión;
aceptación de paridad bloqueada por el defecto de `Core`. Un commit local de
estos artefactos no equivale a gate verde ni a integración. Siguiente acción:
el orquestador revisa el diff y encarga preservar `Reliable(Laps)` en
`core/derive.rs`, después reproduce los gates sin alterar estos goldens.
