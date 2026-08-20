# ISA-680 · Evidencia de version de LMU: fuentes y mensajes

Fecha: 2026-08-20. Rama `vantareapp/isa-680-lmu-fingerprint-y-fallback`.

Cierra dos observaciones abiertas de
[`lmu-1413-compat.md`](lmu-1413-compat.md): el fingerprint desconocido era
ambiguo y el fallback de disco solo cubria instalaciones de Steam.

## 1. Formas del fingerprint

Toda observacion publica exactamente una de estas tres formas.

| Situacion | Fingerprint | Compatibilidad |
| --- | --- | --- |
| Build pinneada en `supportedLMUVersions` | `LMU_Data/runtime:build=<version>;size=324820;evidence=<estructural>;telemetry=<telemetria>` | `known` |
| Sin evidencia de build utilizable | `LMU_Data/size=324820/evidence=unavailable` | `unknown` |
| Build leida pero no pinneada | `LMU_Data/size=324820/evidence=unsupported;build=<version-normalizada>` | `unknown` |

La forma conocida no cambia: sus consumidores y tests siguen igual. La
constante anterior `LMU_Data/size=324820/evidence=insufficient` desaparece; era
la que cubria los dos casos desconocidos a la vez y desvio el diagnostico de la
1.4.1.3 hacia el proceso protegido cuando la causa real era el gate de builds.

Cuenta como "sin evidencia utilizable", ademas de la ausencia total:

- evidencia en blanco;
- `FileVersion` y `ProductVersion` que normalizan a versiones distintas;
- evidencia no normalizable a `a.b.c.d`.

Cuenta como "build leida pero no pinneada" cualquier version normalizada que no
figure en `supportedLMUVersions` con fixtures pinneadas, incluida una build
diagnostica sin el par `FileVersion`/`ProductVersion` completo.

Consumidores de la forma conocida: `Observation.Fingerprint` (driver, captura
diagnostica, harness `Live` opt-in y el registro de sesiones). Ningun consumidor
parsea las formas desconocidas: son de diagnostico.

## 2. Mensajes del log del driver

Se emiten una sola vez por `Run`, mediante un `logf` inyectable (por defecto
`log.Printf`). Una build soportada no registra nada: el fingerprint de cada
observacion ya la lleva.

| Caso | Mensaje |
| --- | --- |
| Sin evidencia | `LMU driver: sin evidencia de build utilizable; fingerprint=LMU_Data/size=324820/evidence=unavailable` |
| Build no soportada | `LMU driver: build <version> leida pero no soportada (sin fixtures pinneadas); fingerprint=LMU_Data/size=324820/evidence=unsupported;build=<version>` |

Ninguna ruta de instalacion entra en el log, el estado ni el fingerprint.

## 3. Matriz de fuentes de evidencia

Orden de precedencia. La primera fuente que produzca un par
`FileVersion`/`ProductVersion` completo gana; las siguientes no se consultan.

| # | Fuente | Como se lee | Cubre | Limitacion |
| --- | --- | --- | --- | --- |
| 1 | Proceso en ejecucion | `CreateToolhelp32Snapshot` + `QueryFullProcessImageNameW` + `version.dll` | Cualquier instalacion mientras LMU corre | Desde 1.4.1.3 el proceso esta protegido: abre pero no devuelve ruta |
| 2 | Steam | Raiz por defecto `C:\Program Files (x86)\Steam` y cada `"path"` de `steamapps\libraryfolders.vdf` | Instalaciones Steam, incluidas bibliotecas secundarias | No cubre Steam movido fuera de la raiz por defecto sin `libraryfolders.vdf` legible |
| 3 | Registro de Windows | Claves de desinstalacion de `HKLM\...\Uninstall`, `HKLM\...\WOW6432Node\...\Uninstall` y `HKCU\...\Uninstall` con `DisplayName` que contiene "Le Mans Ultimate"; se usa su `InstallLocation` | Instalaciones no-Steam y Steam en rutas no estandar | Depende de que el instalador declare `InstallLocation` |
| 4 | `VANTARE_LMU_PATH` | Variable de entorno; acepta la ruta del ejecutable o la de la carpeta de instalacion | Ultimo recurso explicito del usuario | Solo actua si el usuario la declara |

Sin ninguna fuente el resultado es `ErrBuildUnavailable` y el fingerprint queda
`evidence=unavailable`.

Las fuentes 2 a 4 viven tras `diskBuildAPI`, la misma API inyectable que ya
aislaba el sistema de archivos, asi que los tests cubren cada rama sin tocar
disco, registro ni entorno reales.

## 4. Verificacion

```
go build ./...                                  # salvo build/ios, preexistente
go vet ./internal/telemetry/...                 # salvo unsafe.Pointer preexistente
go test ./internal/telemetry/... -count=1
```

Tests table-driven anadidos:

- `TestFingerprintDistinguishesTheThreeEvidenceBranches` (las tres formas);
- `TestDriverLogDistinguishesMissingEvidenceFromUnsupportedBuild`;
- `TestDiskBuildFallbackAppliesSourcePrecedence` (Steam, registro, entorno);
- `TestDiskBuildFallbackWithoutRegistryNorEnvIsUnavailable`;
- `TestExecutablePathFromAcceptsFolderOrExecutable`.

`TestResolveBuildEvidencePrefersProcessAndSkipsDisk` falla ahora tambien si el
registro o el entorno se consultan con el proceso aportando evidencia.

## 5. Pendiente

- La lectura real del registro (`uninstallInstallLocations`) no tiene test
  automatico: depende del registro de la maquina. Queda verificada por lectura
  del codigo y por los tests de la API falsa.
- Sigue abierta la observacion del frame congelado durante la transicion a menu
  descrita en `lmu-1413-compat.md`.
