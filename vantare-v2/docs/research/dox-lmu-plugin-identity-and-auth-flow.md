# Identidad y Flujo de Autenticación: Plugins doX/NeoRed para LMU

**Fecha:** 2026-07-02
**Propósito:** Confirmar la identidad de cada DLL (SimHub plugin vs LMU native plugin vs híbrido) y reconstruir el flujo de autenticación Nakama/Steam sin ejecutar código ni usar credenciales.
**Método:** Análisis estático de strings Unicode, metadatos de instalador NSIS, archivos de template SimHub (.djson), licencias, y paths de instalación. Sin descompilación IL, sin ejecución de DLLs, sin carga en SimHub.
**Estado:** Investigación — NO implementación.

---

## Resumen ejecutivo

| DLL | Identidad | Autor | Versión | ¿Plugin SimHub? | ¿Plugin LMU nativo? |
|-----|-----------|-------|---------|----------------|---------------------|
| `doX.LMU_SessionDataPlugin.dll` | **SimHub plugin** | William Friedl / doX | 1.9.1.0 | ✅ **Sí** — evidencia concluyente | ❌ No |
| `NeoRed.lmuDataPlugin.dll` | **SimHub plugin** | Haagel (incluido con permiso en doX) | — | ✅ **Sí** — evidencia concluyente | ❌ No |

**Ninguna de las dos DLLs es un plugin nativo de LMU/rFactor2.** Ambas son plugins .NET que se cargan dentro de SimHub y acceden a LMU a través de:
- REST API local (`localhost:6397`)
- Shared memory de rFactor2/LMU (vía `OpenFileMapping`/`MapViewOfFile` o vía `DataCorePlugin.GameRawData` de SimHub)
- Nakama remoto (solo doX, para SR/DR)

**El acceso a Nakama/Steam no usa Steamworks directamente.** doX llama a un endpoint REST de Nakama (`/v2/account/authenticate/steam`) con un token que obtiene de LMU en ejecución, probablemente del proceso del juego o de un archivo de log.

---

## 1. Clasificación por DLL

### doX.LMU_SessionDataPlugin.dll — SimHub plugin

**Evidencia concluyente:**

| Evidencia | Tipo | Detalle |
|-----------|------|---------|
| `_CreateDelegate` | String en DLL | Patrón interno de SimHub para crear delegates de propiedades |
| `SIMHUB` | String en DLL | Referencia directa |
| `plugins?.dll?net48?simhub` | String en DLL | Path de instalación esperado: `SimHub\Plugins\*.dll` |
| `Please restart SimHub for the changes to take full effect.` | String en DLL | Mensaje estándar de plugins SimHub |
| `DashTemplates` | Carpeta en installer | 17 templates `.djson` — formato nativo de SimHub DashStudio |
| `SimHubVersion: "9.11.20"` | Metadata `.djson` | Versión de SimHub objetivo en los templates |
| `ImageLibrary\doX Plugin` | Carpeta en installer | Estructura estándar de ImageLibrary de SimHub |
| `$PLUGINSDIR` | Carpeta en installer NSIS | Convención de NSIS para plugins adicionales |
| `component/ui/pluginsettingscontrol.xaml` | String en DLL | Interfaz WPF para configuración del plugin en SimHub |
| `IsOverlay: true` | Metadata `.djson` | Los templates son overlays de SimHub |
| `Author: "doX "` | Metadata `.djson` | Autor del template |

**Evidencia de que NO es plugin nativo de LMU/rFactor2:**

| Evidencia | Explicación |
|-----------|-------------|
| No hay `InternalsPlugin`, `Startup`, `UpdateTelemetry`, `UpdateScoring` | Interfaces del plugin SDK de rFactor2 |
| No hay exports nativos (DLLMain, etc.) | Los plugins nativos de rF2 son DLL en C++ con exports específicos |
| No hay dependencias de rFactor2 SDK | Sin referencias a headers/libs de rF2 |
| No está en `Bin64\Plugins\` de LMU | El installer NSIS lo coloca en `SimHub\Plugins\` |
| Es .NET (no C++ nativo) | Los plugins de rF2/LMU son nativos (C++), no .NET |
| Usa `OpenFileMapping`/`MapViewOfFile` | Accede a shared memory como **consumidor externo**, no como plugin interno |

### NeoRed.lmuDataPlugin.dll — SimHub plugin

**Evidencia concluyente:**

| Evidencia | Tipo | Detalle |
|-----------|------|---------|
| `DataCorePlugin.GameRawData.PlayerNativeTelemetry.mFrontAntiSway` | String en DLL | Acceso a telemetría nativa a través de SimHub DataCore, no directamente |
| `DataCorePlugin.GameRawData.PlayerNativeTelemetry.mRearAntiSway` | String en DLL | Mismo patrón — consume datos ya procesados por SimHub |
| `DataCorePlugin.GameRawData.PlayerNativeTelemetry.mMotorMap` | String en DLL | Mismo patrón |
| `DataCorePlugin.GameRawData.PlayerNativeTelemetry.mMigration` | String en DLL | Mismo patrón |
| `DataCorePlugin.GameRawData.PlayerNativeTelemetry.mTCCut` | String en DLL | Mismo patrón |
| `DataCorePlugin.GameRawData.PlayerNativeTelemetry.mTCSlip` | String en DLL | Mismo patrón |
| `Please restart SimHub for the changes to take full effect.` | String en DLL | Mensaje estándar de SimHub |
| `NeoRed.lmuDataPlugin.json` | String en DLL | Archivo de configuración JSON del plugin |
| `Preset`, `Preset Loaded`, `Please enter a preset name.` | Strings en DLL | Sistema de presets de SimHub |
| `[NeoRed Fusion] Initialized. Version:` | String en DLL | Nombre interno "NeoRed Fusion" |
| Incluido en `$PLUGINSDIR` del installer NSIS de doX | Path | Distribuido como plugin adicional de SimHub |

**Evidencia de que NO es plugin nativo de LMU/rFactor2:**
- Mismas razones que doX: es .NET, no tiene exports nativos, no está en `Bin64\Plugins\`
- Además, **no accede directamente a shared memory** — usa `DataCorePlugin.GameRawData` que es la capa de abstracción de SimHub sobre shared memory
- No contiene `OpenFileMapping`, `MapViewOfFile`, ni `LMU_Data`

---

## 2. Instalación y paths

### Estructura del installer NSIS (`doX-LMU-Overlays-Setup-v4.4.2.exe`)

```
doX-LMU-Overlays-Setup-v4.4.2.exe  (6,875,807 bytes)
└── extracted/
    ├── doX.LMU_SessionDataPlugin.dll          → SimHub\Plugins\
    ├── $PLUGINSDIR\
    │   ├── NeoRed.lmuDataPlugin.dll           → SimHub\Plugins\  (plugin adicional)
    │   ├── nsDialogs.dll                      → NSIS internals
    │   ├── nsExec.dll                         → NSIS internals
    │   └── System.dll                         → NSIS internals
    ├── DashTemplates\                         → SimHub\DashTemplates\
    │   ├── doX - LMU Multiclass Standings\
    │   ├── doX - LMU Relative\
    │   ├── doX - LMU Rivals\
    │   ├── doX - LMU Delta Bar\
    │   ├── doX - LMU Track Map\
    │   ├── doX - LMU Navigation\
    │   ├── doX - LMU Fuel Companion\
    │   ├── doX - LMU Lap History\
    │   ├── doX - LMU Timing and Sectors\
    │   ├── doX - LMU Damage and Tyres\
    │   ├── doX - LMU Damage Stats\
    │   ├── doX - LMU Weather Forecast\
    │   ├── doX - Pit Estimated\
    │   ├── doX - Session Infos\
    │   ├── doX - Flags\
    │   ├── doX - Inputs\
    │   ├── doX - Modern Rev Bar\
    │   ├── doX - Rejoin\
    │   └── doX - Wind\
    ├── ImageLibrary\doX Plugin\               → SimHub\ImageLibrary\
    │   ├── Badges\      (13 PNGs: sr-clean, sr-warning, sr-danger, etc.)
    │   ├── BrandLogo\   (24 PNGs: Acura, Ferrari, Porsche, etc.)
    │   ├── Country Flags\ (250+ PNGs)
    │   ├── Finish Status\ (10 PNGs: DNF, DQ, DT, SG, etc.)
    │   ├── Icons\       (5 PNGs)
    │   ├── Rank\        (24 PNGs: Bronze_0-3, Silver_1-3, Gold_1-3, Platinum_1-3, B0-3, S1-3, G1-3, P1-3)
    │   └── Tyres\       (5 PNGs: Soft, Medium, Hard, Inter, Wet)
    └── $FONTS\                                → Fonts
```

### Paths de instalación (reconstruido del NSIS)

| Archivo | Destino |
|---------|---------|
| `doX.LMU_SessionDataPlugin.dll` | `%PROGRAMFILES%\SimHub\Plugins\` |
| `NeoRed.lmuDataPlugin.dll` | `%PROGRAMFILES%\SimHub\Plugins\` |
| `DashTemplates\*` | `%PROGRAMFILES%\SimHub\DashTemplates\` |
| `ImageLibrary\doX Plugin\*` | `%PROGRAMFILES%\SimHub\ImageLibrary\doX Plugin\` |

### Paths de LMU referenciados en doX DLL

| Path | Uso |
|------|-----|
| `C:\Program Files (x86)\Steam\steamapps\common\Le Mans Ultimate\UserData\Log` | Leer `trace_*.txt` para extraer event IDs |
| `UserData\Log\Results\` (inferido de `Results XML not found`) | Leer Results XML para penalizaciones |

---

## 3. Fuentes de datos

### doX.LMU_SessionDataPlugin.dll

| Fuente | Mecanismo | Endpoints/recursos | SR/DR? |
|--------|-----------|-------------------|--------|
| **REST local** | HTTP a `localhost:6397` | `/rest/watch/standings`, `/rest/watch/sessionInfo`, `/rest/multiplayer/teams`, `/rest/strategy/pitstop-estimate` | ❌ No |
| **Shared memory** | P/Invoke: `OpenFileMappingW` + `MapViewOfFile` + `CloseHandle` | `LMU_Data` (mapping local/global) | ❌ No |
| **Nakama remoto** | HTTPS a `lmu-prod.eu-central1-a.nakamacloud.io` | `/v2/account/authenticate/steam`, `/v2/rpc/event_get` | ✅ **Sí** |
| **Results XML** | Archivos locales | `UserData\Log\Results\*.xml` | ❌ No (solo incidentes) |
| **Logs LMU** | Archivos locales | `trace_*.txt` (extrae event ID con regex) | ❌ No |
| **Car data** | HTTPS a GitHub | `raw.githubusercontent.com/Lovely-Sim-Racing/lovely-car-data/...` | ❌ No |
| **Version check** | HTTPS a GitHub | `raw.githubusercontent.com/doX-03/Overlays-Version/...` | ❌ No |

### NeoRed.lmuDataPlugin.dll

| Fuente | Mecanismo | Endpoints/recursos | SR/DR? |
|--------|-----------|-------------------|--------|
| **REST local** | HTTP a `localhost:6397` | `/rest/garage/UIScreen/RepairAndRefuel`, `/rest/watch/sessionInfo`, `/rest/sessions/GetSessionsInfoForEvent`, `/rest/garage/UIScreen/CarSetupOverview`, `/rest/garage/UIScreen/SessionSetup`, `/rest/sessions/weather`, `/navigation/GetLoadingScreen` | ❌ No |
| **SimHub DataCore** | API interna de SimHub | `DataCorePlugin.GameRawData.PlayerNativeTelemetry.*` (accede a shared memory ya mapeada por SimHub) | ❌ No |
| **Car data** | HTTPS a GitHub | Mismo repositorio Lovely-Sim-Racing que doX | ❌ No |

**Diferencia clave entre doX y NeoRed en shared memory:**
- **doX** llama directamente a `OpenFileMappingW`/`MapViewOfFile` para leer `LMU_Data` — es un lector directo de shared memory.
- **NeoRed** NO llama a P/Invoke de kernel32. Accede a la telemetría a través de `DataCorePlugin.GameRawData.PlayerNativeTelemetry.*`, que es la propiedad que SimHub expone después de haber leído la shared memory por su cuenta. NeoRed es un **consumidor de la API de SimHub**, no un lector directo.

---

## 4. Flujo de autenticación Nakama/Steam

### Evidencia confirmada

| Elemento | String en DLL | Confianza |
|----------|--------------|-----------|
| URL base Nakama | `https://lmu-prod.eu-central1-a.nakamacloud.io` | ✅ **Confirmado** — hardcoded |
| Endpoint auth | `/v2/account/authenticate/steam?create=false&sync=false` | ✅ **Confirmado** — hardcoded |
| Método auth | `Basic` + `token` | ✅ **Confirmado** — headers de autenticación |
| Endpoint RPC | `/v2/rpc/event_get` | ✅ **Confirmado** — hardcoded |
| Payload RPC | `payload`, `eventId`, `page`, `take:100`, `class` | ✅ **Confirmado** — parámetros de consulta |
| Auth header | `Bearer` | ✅ **Confirmado** — para requests autenticados |
| Steam App ID | `2399420` | ✅ **Confirmado** — hardcoded (LMU App ID) |
| Log path LMU | `C:\Program Files (x86)\Steam\steamapps\common\Le Mans Ultimate\UserData\Log` | ✅ **Confirmado** — hardcoded |
| Regex event ID | `Joining race server for online event\s+([0-9a-fA-F-]{36})` | ✅ **Confirmado** — extrae UUID de trace logs |
| Clases/métodos | `AuthenticateNakama`, `FetchNakamaUserProfiles`, `ParseNakamaUserIdentity`, `RememberNakamaDriverName`, `SnapshotNakamaDriverNames` | ✅ **Confirmado** — nombres de métodos |
| Tipos Nakama | `LmuNakamaUser`, `LmuNakamaUsersResponse`, `LmuEventGetResponse`, `LmuEventDriver`, `LmuEventEntry`, `LmuEventServer`, `LmuEventSplit`, `LmuEventSplitDriver`, `LmuEventConfiguration`, `LmuEventRegistration` | ✅ **Confirmado** — tipos serializados |
| Parseo de rank | `^(Bronze|Silver|Gold|Platinum)\s*(\d+)?$` | ✅ **Confirmado** — regex de parseo |
| Campos de perfil | `profile`, `driverRank`, `safetyRank`, `nationality`, `badge`, `rank`, `tier`, `progress` | ✅ **Confirmado** — campos esperados en respuesta JSON |
| Caché de auth | `OK`, `OK cached`, `Nakama`, `Failed`, `Auth failed`, `No identity data`, `No event id`, `No names` | ✅ **Confirmado** — estados de caché |

### Hipótesis del flujo (reconstruido)

```
1. LMU se inicia → Steam genera un auth session ticket para el usuario
2. LMU se conecta a RaceControl/Nakama con ese ticket
3. LMU escribe logs en UserData\Log\trace_*.txt
4. doX lee trace_*.txt para obtener event IDs de carreras online
5. doX (o SimHub) obtiene el token Steam de LMU:
   - Hipótesis A: doX lee el token de la memoria del proceso de LMU
   - Hipótesis B: doX usa una API de SimHub que expone el Steam ID
   - Hipótesis C: doX lee el token de un archivo de configuración de LMU
   - ⚠️ **No confirmado** — no hay evidencia directa en strings
6. doX llama a POST /v2/account/authenticate/steam con:
   - Header: Authorization: Basic <base64(serverKey:token)>
   - Parámetros: create=false, sync=false
7. Nakama responde con un JWT (session token)
8. doX usa ese JWT como Bearer token para:
   - POST /v2/rpc/event_get (obtener eventos diarios)
   - Otras llamadas RPC para perfiles de usuario
9. doX parsea la respuesta JSON extrayendo:
   - profile.driverRank → "Gold 3"
   - profile.safetyRank → "Bronze 0"
   - profile.badge → "sr-clean"
   - profile.nationality → "ES"
   - rank, tier, progress
10. doX expone estos valores como propiedades de SimHub
```

### Lo que NO está confirmado

| Aspecto | Estado | Razón |
|---------|--------|-------|
| ¿Cómo obtiene doX el token Steam de LMU? | ❌ **No confirmado** | No hay strings de `SteamAPI`, `GetAuthSessionTicket`, `ReadProcessMemory`, ni `CreateToolhelp32Snapshot` en la DLL. El token podría venir de SimHub, de un archivo, o de memoria. |
| ¿Dónde se configura `NakamaServerKey`? | ❌ **No confirmado** | No aparece hardcoded en la DLL. Podría estar en settings de SimHub, en un archivo de configuración, o ser la misma para todos los usuarios. |
| ¿Frecuencia de polling a Nakama? | ❌ **No confirmado** | No hay strings de intervalos específicos para Nakama (sí hay para REST local: `StandingsRivalsUpdateIntervalMs`, `RelativeUpdateIntervalMs`, `TrackMapNavigationUpdateIntervalMs`) |
| ¿Hay rate limiting en el servidor Nakama? | ❌ **No confirmado** | No hay evidencia en strings. doX podría tener caché (`OK cached`) para mitigarlo. |
| ¿El token Nakama expira? | ❌ **No confirmado** | `OK cached` sugiere que hay caché, pero no sabemos TTL. |
| ¿Steamworks.dll está presente? | ❌ **No confirmado** | No se encontró referencia a `steam_api.dll` en los strings. doX podría no usar Steamworks directamente. |

### Análisis de seguridad

**doX NO parece usar Steamworks directamente.** No hay strings de:
- `SteamAPI_Init`, `SteamAPI_Shutdown`
- `ISteamUser`, `GetAuthSessionTicket`, `GetEncryptedAppTicket`
- `steam_api.dll`, `steamclient.dll`
- `CSteamID`, `HSteamPipe`, `HSteamUser`

Esto sugiere que doX obtiene el token/identidad de LMU por otro medio:
1. **SimHub DataCore** expone `GameRawData.Data.PlayerInfo.SteamID` — doX podría leer el SteamID desde ahí y enviarlo a Nakama con una server key fija.
2. **Archivos de LMU** — doX lee `trace_*.txt` y posiblemente otros archivos de configuración que contienen el token.
3. **Memoria de LMU** — aunque no hay evidencia de `ReadProcessMemory`, doX sí usa `OpenFileMapping`/`MapViewOfFile` para shared memory, lo que demuestra que puede acceder a memoria de LMU.

**La opción más probable es la #1** (SteamID via SimHub + server key fija o configurable), porque:
- doX ya depende de SimHub para su ciclo de vida
- SimHub expone el SteamID del jugador actual
- `NakamaServerKey` aparece como campo configurable (no hardcoded)
- El endpoint `/v2/account/authenticate/steam` con `Basic` auth sugiere que usa server key + algo del cliente

---

## 5. Propiedades SimHub expuestas

### doX.LMU_SessionDataPlugin.dll

Basado en los strings encontrados, las propiedades expuestas a SimHub incluyen:

**Datos de carrera (por fila de standings):**
`DriverName`, `CarClass`, `BrandName`, `CarNumber`, `Badge`, `Nationality`, `DriverRank`, `DriverRankProgress`, `SafetyRank`, `SafeRank`, `FinishStatus`, `PitStops`, `Penalties`, `PenaltyType`, `HasDriveThrough`, `HasStopGo`, `PitTime`, `PitTimeVisible`, `PitBoxTime`, `PitBoxTimeVisible`, `PitState`, `HasPitRequest`, `InPitBox`, `VirtualEnergy`, `TyreCompoundSet`, `BestLap`, `AverageLap`, `ClassGap`, `ClassInterval`, `BestLapDeltaToPlayer`, `LastLapDeltaToPlayer`, `InPits`, `InGarage`, `UnderYellow`, `Available`, `CurrentLap`, `LapsSinceLastPit`, `StintLap`, `ClassPositionGain`, `LapsBehindLeader`, `LapsBehindPreviousClassCar`, `SpeedKmh`, `TrackPositionPercent`, `IsOutLap`, `Fuel`, `ClassBestLap`, `LapsToPlayer`, `Gap`, `PlayerDeltaBestLap`, `PlayerDeltaLastLap`, `Sector1DeltaToPlayer`, `Sector2DeltaToPlayer`, `Sector3DeltaToPlayer`

**Datos de lap history (por fila):**
`LapHistoryRow`, `Visible`, `IsEstimate`, `LapNumber`, `LapTime`, `Invalid`, `Delta`, `DeltaToPrevious`, `FuelUsed`, `FuelRatio`, `VirtualEnergyUsed`, `EnergyUsed`, `TyreWear`, `TyreWearUsed`, `ClassPosition`, `IsPlayer`

**Configuración de UI:**
`StandingsShowDeltaLapCount`, `RivalsShowDeltaLapCount`, `StandingsRivalsUpdateIntervalMs`, `RelativeUpdateIntervalMs`, `TrackMapNavigationUpdateIntervalMs`, `TrackMapDotSize`, `TrackMapTrackLineThickness`, `TrackMapTrackOutlineThickness`, `TrackMapTrackLineColor`, `TrackMapTrackOutlineColor`, `TrackMapStartLineThickness`, `TrackMapStartLineWidth`, `TrackMapStartLineColor`, `NavigationOpponentSizeTitle`, `NavigationTrackLineThickness`, `NavigationTrackOutlineThickness`, `NavigationTrackLineColor`, `NavigationTrackOutlineColor`, `NavigationStartLineThickness`, `NavigationStartLineWidth`, `NavigationStartLineColor`, `BadgeVisibilitySettingsInitialized`, `CountryFlagVisibilitySettingsInitialized`

**Datos de sesión:**
`GameRawData.Data.mGamePhase` (Race/Practice/Qualify/Warmup)

**Clases de coches:**
`HYPER`, `LMP2`, `LMP3`, `GT3`, `GTE`, `LMGT3`, `HYPERCAR`

### NeoRed.lmuDataPlugin.dll

Basado en los strings, expone propiedades organizadas en secciones:

**Secciones:** `Energy`, `Extended`, `GameInfos`, `Pit`, `PitMenu`, `TeamInfos`, `VehicleInfos`, `TrackInfos`, `Tyres`, `VehicleCond`, `Weather`, `Session`, `TrackData`, `PitStopEst`, `RacePlayer`

**Datos de vehículo:** `Name`, `Class`, `Number`, `Id`, `Engine`, `LiveryName`, `Manufacturer`

**Datos de equipo:** `Driver`, `TeamName`, `TeamHeadquarters`, `TeamFounded`

**Datos de neumáticos:** `FL/FR/RL/RR_TyreCompound_Name`, `FL/FR/RL/RR_TyrePressure_kPa/Bar/Psi`, `OptimalCompoundTemp_Soft/Medium/Hard/Wet`, `Tyre.FL/FR/RL/RR_Tyre_NewPressure_kPa/Bar/Psi/kPa_Text`, `Tyre.FL/FR/RL/RR_TyreChange_Name/Type`

**Datos de condición:** `FL/FR/RL/RR_BrakeCondition`, `FL/FR/RL/RR_SuspensionDamage`, `VehicleDamage_(Aero)`, `BrakesReplace`, `BrakesReplace_Text`, `BrakesFrontDuct`, `BrakesRearDuct`

**Datos de clima:** `Current.AmbientTemp`, `CloudCoverage_%`, `Humidity_%`, `LightLevel_%`, `Raining_%`, `RainIntensity_%`, `RainChance_%`, `Track.Temp`, `Track.Wetness_%`, `Wetness_Text`, `Weather.CurrentSessionLengthMinutes`, `Weather.CurrentNodeDurationMinutes`, `Weather.CurrentNodeName`, `CURRENTNODE_*`, `TimeUntil_NODE_25/50/75/FINISH`

**Datos de pits:** `pitMenu`, `tireInventory`, `maxAvailableTires`, `newTires`, `pitStopLength`, `timeInSeconds`, `racePosition`, `gapToFirstInClassLaps/Time`, `gapToLastInClassLaps/Time`, `placeInClass`, `placeOverall`

**Datos de pista:** `GrandPrixName`, `Location`, `OpeningYear`, `Length`, `Name`, `Id`, `Layout`

**Datos de sesión:** `topic`, `LiveStandings`, `body`, `player`, `finishStatus`, `penalties`, `DT`, `SG`, `TIME`, `PRACTICE`, `QUALIFY`, `trackInfo`, `StartTime`, `Duration`

---

## 6. Qué podemos replicar de forma limpia

| Función | Fuente | ¿Replicable? | Notas |
|---------|--------|-------------|-------|
| Standings en vivo | REST local | ✅ Sí — ya implementado | Mismos endpoints |
| Session info | REST local | ✅ Sí — ya implementado | Mismos endpoints |
| Multiplayer teams | REST local | ✅ Sí — ya implementado | Mismos endpoints |
| Pitstop estimate | REST local | ✅ Sí | Endpoint no consumido aún |
| Clima multi-nodo | REST local | ✅ Sí | Endpoints `/rest/sessions/weather` |
| Garage/Repair | REST local | ✅ Sí | Endpoint `/rest/garage/UIScreen/RepairAndRefuel` |
| Car setup | REST local | ✅ Sí | Endpoint `/rest/garage/UIScreen/CarSetupOverview` |
| Datos de pista | REST local | ✅ Sí | Endpoint `/navigation/GetLoadingScreen` |
| Telemetría (RPM, frenos, daños) | Shared memory | ✅ Sí — ya implementado | Lector directo de `LMU_Data` |
| Incidentes/penalizaciones | Results XML | ✅ Sí | Parser de XML |
| Car data (brand, livery) | GitHub Lovely-Sim-Racing | ✅ Sí | Datos abiertos, repositorio público |
| Badges cualitativos | REST local | ✅ Sí — ya identificado | Campo `badge` en multiplayer/teams |
| SR/DR oficial | Nakama remoto | ❌ **No** | Requiere auth Steam, viola EULA, frágil |
| Rank images (Bronze/Silver/Gold/Platinum) | ImageLibrary | ✅ Sí (assets propios) | Podemos crear nuestros propios assets |
| Mapas de pista | REST local + assets | ✅ Sí | `api-trackmap-v2` + preview PNG |

---

## 7. Qué NO debemos replicar todavía

| Función | Motivo |
|---------|--------|
| **Conexión Nakama para SR/DR** | Requiere token Steam de LMU, protocolo no documentado, viola EULA, frágil, rate limiting |
| **Lectura de trace logs de LMU** | doX lo hace para extraer event IDs de Nakama. Sin Nakama, no tiene propósito. |
| **Auto-actualización via GitHub raw** | Vantare ya tiene su propio mecanismo de actualización |
| **Dependencia de SimHub DataCore** | Vantare no usa SimHub — toda la lógica debe ser independiente |
| **Formato de propiedades SimHub** | Vantare usa SSE/WebSocket, no propiedades de SimHub |

---

## 8. Preguntas abiertas

1. **¿Cómo obtiene exactamente doX el token Steam?** — No hay evidencia de `ReadProcessMemory`, `SteamAPI`, ni archivos de token. La hipótesis más probable es que SimHub expone el SteamID y doX lo combina con una server key. Pero no está confirmado.
2. **¿Dónde se configura `NakamaServerKey`?** — No aparece hardcoded. Podría estar en settings de SimHub, en un archivo JSON, o ser obtenida de LMU.
3. **¿El endpoint Nakama cambia entre versiones de LMU?** — La URL `lmu-prod.eu-central1-a.nakamacloud.io` sugiere un entorno de producción fijo, pero el path `/v2/` podría cambiar.
4. **¿Hay otras DLLs de doX no analizadas?** — El instalador solo contiene estas dos DLLs .NET. No hay DLLs nativas adicionales.

---

## Autorevisión

- ✅ **¿Confirmaste si son plugins SimHub o LMU?** Sí — ambas son SimHub plugins. Evidencia: `_CreateDelegate`, `DataCorePlugin.GameRawData`, `DashTemplates/*.djson`, `SimHubVersion: "9.11.20"`, mensajes de reinicio de SimHub.
- ✅ **¿Qué evidencia exacta lo demuestra?** Documentada en sección 1 con tabla por DLL.
- ✅ **¿Encontraste referencias a SimHub assemblies/interfaces?** Sí — `_CreateDelegate` (doX), `DataCorePlugin.GameRawData.PlayerNativeTelemetry.*` (NeoRed), `Please restart SimHub` (ambas).
- ✅ **¿Encontraste referencias a LMU/rFactor plugin SDK real?** No — no hay `InternalsPlugin`, `Startup`, `UpdateTelemetry`, ni exports nativos. Esto confirma que no son plugins nativos.
- ✅ **¿Separaste REST/shared memory/Nakama?** Sí — tabla en sección 3 con mecanismo y endpoints.
- ✅ **¿Separaste evidencia confirmada de hipótesis?** Sí — sección 4 con tabla de "no confirmado" explícita.
- ✅ **¿No ejecutaste DLLs?** Sí — solo extracción de strings y análisis de metadatos.
- ✅ **¿No usaste credenciales ni tokens?** Sí — no se usó ninguna credencial real.
- ✅ **¿No copiaste código propietario?** Sí — solo strings, metadata, y paths. Sin código IL descompilado.
- ✅ **¿Solo creaste el documento research?** Sí — `docs/research/dox-lmu-plugin-identity-and-auth-flow.md`.
- ✅ **¿Qué pregunta queda abierta?** Cómo obtiene doX el token Steam exactamente (3 hipótesis, ninguna confirmada).
