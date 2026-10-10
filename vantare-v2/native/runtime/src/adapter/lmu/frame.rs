//! Admisión y lectura del buffer `LMU_Data` (rF2 `InternalsPlugin`, layout 1.3).
//! Un buffer solo se admite si su build está verificada aparte: la forma del
//! buffer nunca promueve una build desconocida. Una fila corrupta rechaza todo
//! el frame; un valor atípico pero acotado deja ese campo en `None`.

use std::fmt;
use std::time::Duration;

use vantare_domain::{Damage, Pose, Quality, Weather};

pub(super) const OBJECT_OUT_SIZE: usize = 324_820;
const MAX_VEHICLES: usize = 104;
const SCORING_BASE: usize = 2_192;
const SCORING_STRIDE: usize = 584;
const TELEMETRY_BASE: usize = 128_468;
const TELEMETRY_STRIDE: usize = 1_888;

/// Builds cuyo layout se ha comprobado contra una captura real (ver los
/// fixtures de `testdata/`). Añadir una build exige añadir su fixture y una
/// fila en el test de conformidad.
const SUPPORTED_BUILDS: &[&str] = &["1.3.0.0", "1.4.0.0", "1.4.1.3", "1.4.2.0"];

/// Cota de `mMaximumLaps`: 0 es una sesión por tiempo e `i32::MAX` el marcador
/// de «sin límite»; por encima de esto no hay carrera real.
const MAX_SESSION_LAPS: u32 = 10_000;
/// Cotas del delta nativo: fuera de ±10 000 s el valor es un marcador, no un delta.
const DELTA_LIMIT_S: f64 = 10_000.0;
/// Presupuesto de alineación igual al de frescura LMU; también en la grabadora,
/// que admite frames con este módulo sin el reloj de frescura del adaptador.
const MAX_SCORING_LAG_S: f64 = 0.5;

pub(super) fn supports_build(build: &str) -> bool {
    SUPPORTED_BUILDS.contains(&build)
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(super) enum Rejection {
    ShortBuffer,
    UnsupportedBuild,
    InvalidVehicleCount,
    InvalidSessionString,
    InvalidActiveGrid,
}

impl fmt::Display for Rejection {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(match self {
            Self::ShortBuffer => "buffer LMU más corto que el layout",
            Self::UnsupportedBuild => "build de LMU sin layout verificado",
            Self::InvalidVehicleCount => "número de coches fuera de rango",
            Self::InvalidSessionString => "nombre de circuito inválido",
            Self::InvalidActiveGrid => "parrilla inconsistente",
        })
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(super) enum Kind {
    Practice,
    Qualifying,
    Race,
    Warmup,
}

#[derive(Debug, PartialEq)]
pub(super) struct Frame {
    pub track: String,
    pub kind: Option<Kind>,
    /// Reloj de sesión del simulador (`mCurrentET`).
    pub source_time: Option<Duration>,
    /// `mEndET`, en segundos de reloj de sesión.
    pub end_time_s: Option<f64>,
    /// `mMaximumLaps`; `None` en sesiones por tiempo o sin límite.
    pub maximum_laps: Option<u32>,
    /// Longitud del circuito en metros; `None` si el simulador no la da.
    pub track_length_m: Option<f64>,
    pub weather: Weather,
    pub vehicles: Vec<Vehicle>,
    pub player: Option<usize>,
}

#[derive(Debug, PartialEq)]
pub(super) struct Vehicle {
    pub slot: i32,
    pub driver: String,
    /// Etiqueta del coche; sirve para casar el número de carrera del REST.
    pub name: String,
    pub class: String,
    pub position: u32,
    pub laps: u32,
    pub in_pit: bool,
    /// Metros recorridos en la vuelta en curso; el simulador usa negativos
    /// para posiciones anteriores a la línea de meta.
    pub lap_distance_m: Option<f64>,
    /// Segundos desde el inicio de la vuelta en curso.
    pub lap_progress_s: Option<f64>,
    /// Sector en curso, desde 0.
    pub sector: Option<u8>,
    pub best_lap_s: Option<f64>,
    pub last_lap_s: Option<f64>,
    pub estimated_lap_s: Option<f64>,
    pub last_sectors_s: [Option<f64>; 3],
    /// Mejores sectores: S1 y S2 son los mejores de la sesión; S3 es el de la
    /// mejor vuelta (el SDK no publica un mejor S3 independiente). #1497.
    pub best_sectors_s: [Option<f64>; 3],
    /// Sectores completados de la vuelta en curso, en orden. #1497.
    pub current_sectors_s: Vec<f64>,
    /// La vuelta en curso cuenta para el tiempo (`mCountLapFlag == 2`). Solo
    /// el jugador y con reloj de telemetría: el sanitizador borra el byte. #1497.
    pub lap_time_counts: Option<bool>,
    pub pit_stop_stopped: Option<bool>,
    /// mInGarageStall: no equivale a mInPits ni a una parada de servicio.
    pub in_garage_stall: Option<bool>,
    pub time_behind_next_s: Option<f64>,
    pub laps_behind_next: u32,
    pub time_behind_leader_s: Option<f64>,
    pub laps_behind_leader: u32,
    pub pose: Option<Pose>,
    pub velocity_mps: Option<[f64; 2]>,
    pub pending_penalties: u32,
    /// Solo el coche del jugador.
    pub inputs: Option<Inputs>,
}

#[derive(Clone, Debug, PartialEq)]
pub(super) struct Inputs {
    pub source_time: Option<Duration>,
    pub damage: Damage,
    pub gear: Option<i8>,
    pub engine_rpm: Option<f64>,
    pub speed_mps: Option<f64>,
    pub throttle: Option<f64>,
    pub brake: Option<f64>,
    pub clutch: Option<f64>,
    pub steering: Option<f64>,
    pub fuel_level_l: Option<f64>,
    pub fuel_capacity_l: Option<f64>,
    pub delta_best_s: Option<f64>,
    pub pit_limiter_active: Option<bool>,
}

pub(super) fn admit(buffer: &[u8], verified_build: &str) -> Result<Frame, Rejection> {
    if buffer.len() < OBJECT_OUT_SIZE {
        return Err(Rejection::ShortBuffer);
    }
    if !supports_build(verified_build) {
        return Err(Rejection::UnsupportedBuild);
    }
    let count = usize::try_from(read_i32(buffer, 1_736))
        .ok()
        .filter(|count| *count <= MAX_VEHICLES)
        .ok_or(Rejection::InvalidVehicleCount)?;
    let track = c_string(&buffer[1_632..1_696]).ok_or(Rejection::InvalidSessionString)?;
    let source_seconds = read_f64(buffer, 1_700);
    let end_seconds = read_f64(buffer, 1_708);
    let maximum_laps = read_i32(buffer, 1_716);
    let track_length = read_f64(buffer, 1_720);

    let mut telemetry = Vec::with_capacity(count);
    for index in 0..count {
        let base = TELEMETRY_BASE + index * TELEMETRY_STRIDE;
        let id = read_i32(buffer, base);
        if id < 0 || telemetry.iter().any(|(seen, _)| *seen == id) {
            return Err(Rejection::InvalidActiveGrid);
        }
        telemetry.push((id, base));
    }
    let mut vehicles = Vec::with_capacity(count);
    let mut player = None;
    for index in 0..count {
        let vehicle = vehicle(buffer, SCORING_BASE + index * SCORING_STRIDE, &telemetry)?;
        if vehicles
            .iter()
            .any(|seen: &Vehicle| seen.slot == vehicle.slot)
        {
            return Err(Rejection::InvalidActiveGrid);
        }
        if vehicle.inputs.is_some() && player.replace(index).is_some() {
            return Err(Rejection::InvalidActiveGrid);
        }
        vehicles.push(vehicle);
    }
    normalize_lap_progress(&mut vehicles);
    align_scoring_poses(buffer, &mut vehicles, player, &telemetry);
    Ok(Frame {
        track: track.trim().to_owned(),
        kind: match read_i32(buffer, 1_696) {
            1..=4 => Some(Kind::Practice),
            5..=8 => Some(Kind::Qualifying),
            9 => Some(Kind::Warmup),
            10..=13 => Some(Kind::Race),
            _ => None,
        },
        source_time: Duration::try_from_secs_f64(source_seconds).ok(),
        end_time_s: (end_seconds.is_finite()
            && (!source_seconds.is_finite() || end_seconds >= source_seconds))
            .then_some(end_seconds),
        maximum_laps: u32::try_from(maximum_laps)
            .ok()
            .filter(|laps| (1..=MAX_SESSION_LAPS).contains(laps)),
        track_length_m: (track_length.is_finite() && track_length > 0.0).then_some(track_length),
        weather: if count == 0 {
            Weather::default()
        } else {
            weather(buffer)
        },
        vehicles,
        player,
    })
}

fn vehicle(buffer: &[u8], base: usize, telemetry: &[(i32, usize)]) -> Result<Vehicle, Rejection> {
    let slot = read_i32(buffer, base);
    let invalid = Rejection::InvalidActiveGrid;
    // El nombre del piloto se muestra tal cual: un byte no UTF-8 no debe
    // tumbar la parrilla entera.
    let driver = c_string_lossy(&buffer[base + 4..base + 36]).ok_or(invalid)?;
    let name = c_string(&buffer[base + 36..base + 100]).ok_or(invalid)?;
    let class = c_string(&buffer[base + 200..base + 232]).ok_or(invalid)?;
    let (_, telemetry_base) = telemetry
        .iter()
        .find(|(seen, _)| *seen == slot)
        .ok_or(invalid)?;
    let is_player = buffer[base + 196];
    let in_pit = buffer[base + 198];
    let position = buffer[base + 199];
    let time_next = read_f64(buffer, base + 232);
    let time_leader = read_f64(buffer, base + 244);
    let best = read_f64(buffer, base + 144);
    let last = read_f64(buffer, base + 168);
    let laps = u32::try_from(read_i16(buffer, base + 100));
    let laps_next = u32::try_from(read_i32(buffer, base + 240));
    let laps_leader = u32::try_from(read_i32(buffer, base + 252));
    // `mSector`: 0 = último sector, 1 = S1, 2 = S2; el modelo lo cuenta desde 0.
    let sector = match buffer[base + 102] {
        0 => Some(2),
        1 => Some(0),
        2 => Some(1),
        _ => None,
    };
    let lap_distance = read_f64(buffer, base + 104);
    let lap_progress = read_f64(buffer, base + 464);
    // mNumPitstops (+192), mNumPenalties (+194) y estimated (+472):
    // un contador negativo invalida la fila, nunca se convierte en cero.
    let counters_ok = read_i16(buffer, base + 192) >= 0 && read_i16(buffer, base + 194) >= 0;
    let finite_ok = [
        lap_distance,
        time_next,
        time_leader,
        best,
        last,
        read_f64(buffer, base + 472),
    ]
    .iter()
    .all(|value| value.is_finite());
    let (Ok(laps), Ok(laps_behind_next), Ok(laps_behind_leader)) = (laps, laps_next, laps_leader)
    else {
        return Err(invalid);
    };
    if slot < 0
        || is_player > 1
        || in_pit > 1
        || !(1..=MAX_VEHICLES).contains(&usize::from(position))
        || sector.is_none()
        || !counters_ok
        || !finite_ok
    {
        return Err(invalid);
    }
    let scoring_pose = pose(buffer, base + 264, base + 336);
    let (pose, inputs) = if is_player == 1 {
        let base = *telemetry_base;
        (
            pose(buffer, base + 160, base + 232).or(scoring_pose),
            Some(inputs(buffer, base)),
        )
    } else {
        (scoring_pose, None)
    };
    Ok(Vehicle {
        slot,
        driver,
        name,
        class,
        position: u32::from(position),
        laps,
        in_pit: in_pit == 1,
        lap_distance_m: (lap_distance >= 0.0).then_some(lap_distance),
        lap_progress_s: lap_progress.is_finite().then_some(lap_progress),
        sector,
        best_lap_s: (best > 0.0).then_some(best),
        last_lap_s: (last > 0.0).then_some(last),
        estimated_lap_s: positive(read_f64(buffer, base + 472)),
        // SDK: S2 es acumulado S1+S2, no un sector independiente.
        last_sectors_s: last_sectors(
            read_f64(buffer, base + 152),
            read_f64(buffer, base + 160),
            last,
        ),
        best_sectors_s: best_sectors(buffer, base, best),
        current_sectors_s: current_sectors(buffer, base),
        lap_time_counts: lap_time_counts(buffer[base + 506], inputs.as_ref()),
        // mPitState @457: 0=none, 1=request, 2=entering, 3=stopped, 4=exiting.
        // Legacy sanitizado borró este byte y mElapsedTime. Su cero es ausencia.
        pit_stop_stopped: match buffer[base + 457] {
            0 if inputs.as_ref().is_some_and(|i| i.source_time.is_some()) => Some(false),
            1..=4 => Some(buffer[base + 457] == 3),
            _ => None,
        },
        in_garage_stall: garage_stall(buffer[base + 507], inputs.as_ref()),
        time_behind_next_s: (time_next >= 0.0).then_some(time_next),
        laps_behind_next,
        time_behind_leader_s: (time_leader >= 0.0).then_some(time_leader),
        laps_behind_leader,
        pose,
        // Scoring aporta velocidad y orientación para TODOS los coches; usar
        // su reloj para ambos, incluso el jugador. No mezclar mLocalVel de
        // scoring con mOri de telemetría ni inferir velocidad entre fotos.
        velocity_mps: world_velocity(buffer, base + 288, base + 336),
        pending_penalties: u32::try_from(read_i16(buffer, base + 194)).map_err(|_| invalid)?,
        inputs,
    })
}

// SDK pack(4), scoring +507. Los fixtures legacy borraron este byte:
// su cero sin reloj de telemetría conservado no acredita fuera de garaje.
fn garage_stall(value: u8, inputs: Option<&Inputs>) -> Option<bool> {
    match value {
        1 => Some(true),
        0 if inputs.is_some_and(|i| i.source_time.is_some()) => Some(false),
        _ => None,
    }
}

fn positive(value: f64) -> Option<f64> {
    (value.is_finite() && value > 0.0).then_some(value)
}

fn last_sectors(s1: f64, s12: f64, lap: f64) -> [Option<f64>; 3] {
    if [s1, s12, lap].iter().all(|v| v.is_finite()) && 0.0 < s1 && s1 < s12 && s12 < lap {
        [Some(s1), Some(s12 - s1), Some(lap - s12)]
    } else {
        [None; 3]
    }
}

/// Mejores S1 y S2 de la sesión y S3 de la mejor vuelta; ausentes si no
/// cuadran (cero = sin vuelta medida). mBestSector1/2 (+128/+136) son
/// acumulados como los últimos, y mBestLapSector2 (+532, f32) también.
fn best_sectors(buffer: &[u8], base: usize, best: f64) -> [Option<f64>; 3] {
    let (s1, s12) = (read_f64(buffer, base + 128), read_f64(buffer, base + 136));
    let best_lap_s12 = f64::from(read_f32(buffer, base + 532));
    let ok = |v: f64| v.is_finite() && v > 0.0;
    [
        ok(s1).then_some(s1),
        (ok(s1) && ok(s12) && s12 > s1).then_some(s12 - s1),
        (ok(best_lap_s12) && ok(best) && best > best_lap_s12).then_some(best - best_lap_s12),
    ]
}

/// mCountLapFlag (+506): 0 = no cuenta, 1 = cuenta la vuelta pero no el
/// tiempo, 2 = cuenta vuelta y tiempo. Solo con reloj de telemetría: el
/// sanitizador borra el byte y su cero sería una vuelta inválida falsa.
fn lap_time_counts(flag: u8, inputs: Option<&Inputs>) -> Option<bool> {
    (flag <= 2 && inputs.is_some_and(|i| i.source_time.is_some())).then_some(flag == 2)
}

/// Sectores ya cerrados de la vuelta en curso: mCurSector1/2 (+176/+184),
/// acumulados en el SDK.
fn current_sectors(buffer: &[u8], base: usize) -> Vec<f64> {
    split_current(read_f64(buffer, base + 176), read_f64(buffer, base + 184))
}

fn split_current(s1: f64, s12: f64) -> Vec<f64> {
    let ok = |v: f64| v.is_finite() && v > 0.0;
    match (ok(s1), ok(s12) && s12 > s1) {
        (true, true) => vec![s1, s12 - s1],
        (true, false) => vec![s1],
        _ => Vec::new(),
    }
}

fn inputs(buffer: &[u8], base: usize) -> Inputs {
    // mElapsedTime (+12), segundos. El sanitizador lo borra: cero no prueba
    // presencia del bloque completo, ni permite certificar mWear == 0.
    let source_time = Duration::try_from_secs_f64(read_f64(buffer, base + 12))
        .ok()
        .filter(|time| !time.is_zero());
    let velocity = vector(buffer, base + 184);
    let rpm = read_f64(buffer, base + 356);
    let fuel_level = read_f64(buffer, base + 524);
    let fuel_capacity = read_f64(buffer, base + 608);
    let fuel = (fuel_level.is_finite()
        && fuel_capacity.is_finite()
        && fuel_capacity > 0.0
        && fuel_level >= 0.0
        && fuel_level <= fuel_capacity)
        .then_some((fuel_level, fuel_capacity));
    let delta = read_f64(buffer, base + 696);
    Inputs {
        source_time,
        // mSpeedLimiter @604; los fixtures legacy borraron este byte.
        // Exigir el bloque temporizado antes de interpretar incluso falso.
        pit_limiter_active: source_time
            .filter(|_| buffer[base + 656] == 1)
            .and_then(|_| match buffer[base + 604] {
                0 => Some(false),
                1 => Some(true),
                _ => None,
            }),
        damage: Damage {
            // mDentSeverity[8] (+544) es ordinal (0=ninguno,1=algo,2=más),
            // NO fracción de integridad ni componentes. No dividimos por 2/255.
            // mDetached (+542) no distingue aero/carrocería; mOverheating
            // (+541) y mWheel[].mDetached no miden integridad de suspensión.
            // La deflexión de suspensión es desplazamiento, no daño. Las tres
            // integridades quedan Unavailable, incluso con los dents en cero.
            tyre_wear: [1_000, 1_260, 1_520, 1_780].map(|at| {
                // TelemWheelV01: +848, stride 260, mWear +152, FL/FR/RL/RR.
                // Es goma RESTANTE 0..1: no invertir ni convertir a porcentaje.
                // Sin reloj telem, cero es ambiguo: capturas legacy borraron
                // tres ruedas. Solo se admite cero con el bloque temporizado.
                measured(
                    ratio(read_f64(buffer, base + at))
                        .filter(|v| *v > 0.0 || source_time.is_some()),
                )
            }),
            ..Damage::default()
        },
        gear: i8::try_from(read_i32(buffer, base + 352))
            .ok()
            .filter(|gear| (-1..=15).contains(gear)),
        engine_rpm: (rpm.is_finite() && rpm >= 0.0).then_some(rpm),
        speed_mps: velocity
            .map(|v| v.iter().map(|c| c * c).sum::<f64>().sqrt())
            .filter(|speed| speed.is_finite()),
        throttle: ratio(read_f64(buffer, base + 420)),
        brake: ratio(read_f64(buffer, base + 428)),
        clutch: ratio(read_f64(buffer, base + 444)),
        // TelemInfoV01.mUnfilteredSteering @404 (Pack=4), -1 izquierda/+1 derecha.
        // @436 es mFilteredSteering: aquí se conserva la entrada del volante.
        steering: {
            let value = read_f64(buffer, base + 404);
            (-1.0..=1.0).contains(&value).then_some(value)
        },
        fuel_level_l: fuel.map(|(level, _)| level),
        fuel_capacity_l: fuel.map(|(_, capacity)| capacity),
        delta_best_s: (delta.is_finite() && delta.abs() < DELTA_LIMIT_S).then_some(delta),
    }
}

fn measured(value: Option<f64>) -> Quality<f64> {
    value.map_or(Quality::Unavailable, Quality::Reliable)
}

fn weather(buffer: &[u8]) -> Weather {
    let air_c = read_f64(buffer, 1_860);
    let track_c = read_f64(buffer, 1_868);
    // ScoringInfoV01: mAmbientTemp/mTrackTemp son Celsius; SI = C + 273,15.
    // El par 0/0 se borró en los fixtures 1.4.x: no afirmar 273,15 K.
    // Un 0 C aislado sí es válido. Cotas físicas iguales al decoder REST Go.
    let temperatures_present = (air_c != 0.0 && (-30.0..=60.0).contains(&air_c))
        || (track_c != 0.0 && (-20.0..=80.0).contains(&track_c));
    let temperature = |c: f64, range: std::ops::RangeInclusive<f64>| {
        measured(
            (temperatures_present && c.is_finite() && range.contains(&c)).then_some(c + 273.15),
        )
    };
    // mWind @1876 es un vector de velocidad en m/s: módulo 3D, no mph/km/h.
    // El vector cero es ambiguo en el corpus sanitizado: no afirmar calma.
    let wind = vector(buffer, 1_876)
        .map(|[x, y, z]| x.hypot(y).hypot(z))
        .filter(|speed| speed.is_finite() && *speed > 0.0);
    Weather {
        air_temperature_k: temperature(air_c, -30.0..=60.0),
        track_temperature_k: temperature(track_c, -20.0..=80.0),
        wind_speed_mps: measured(wind),
        // mWind usa ejes del circuito; el SDK no fija norte geográfico ni
        // dirección meteorológica de procedencia. No inventar un atan2.
        wind_direction_rad: Quality::Unavailable,
        // mRaining @1852: fracción 0..1, señal admitida por Go y conservada
        // por FrameSanitizer actual. Cero válido; no deducirla de la humedad.
        // mDarkCloud @1844 es oscuridad de nubes: no equivale a lluvia.
        rain: measured(ratio(read_f64(buffer, 1_852))),
        // mAvgPathWetness @1964: fracción 0..1, NO humedad relativa del aire.
        // Cero también fue borrado por el sanitizador: no certificar seco.
        // mMin/MaxPathWetness @1900/1908 son extremos, no sustitutos de la media.
        track_wetness: measured(ratio(read_f64(buffer, 1_964)).filter(|v| *v > 0.0)),
        // No hay presión atmosférica en ScoringInfoV01. mWheel[].mPressure
        // son kPa del neumático, y no sirven para este campo.
        pressure_pa: Quality::Unavailable,
    }
}

fn ratio(value: f64) -> Option<f64> {
    (value.is_finite() && (0.0..=1.0).contains(&value)).then_some(value)
}

/// Lleva las poses de `scoring` al instante de la telemetría del jugador.
///
/// Las poses de los rivales solo existen en `scoring`, cuyo reloj va unos
/// 0,2 s por detrás de la telemetría; sin corregirlo, el radar mezcla relojes.
/// El desfase se estima con el jugador, que está en ambos flujos:
/// `Δt = dot(pos_tel − pos_scoring, v) / |v|²`, con `v` su velocidad en el
/// mundo. Cada rival avanza después `v_rival · Δt`; el jugador ya publica su
/// pose de telemetría.
fn align_scoring_poses(
    buffer: &[u8],
    vehicles: &mut [Vehicle],
    player: Option<usize>,
    telemetry: &[(i32, usize)],
) {
    let Some(index) = player else {
        return;
    };
    let scoring_base = SCORING_BASE + index * SCORING_STRIDE;
    let Some((_, telemetry_base)) = telemetry
        .iter()
        .find(|(slot, _)| *slot == read_i32(buffer, scoring_base))
    else {
        return;
    };
    let (Some(scoring), Some(telemetry_pose)) = (
        pose(buffer, scoring_base + 264, scoring_base + 336),
        pose(buffer, telemetry_base + 160, telemetry_base + 232),
    ) else {
        return;
    };
    let lag_s = scoring_lag_s(
        scoring,
        telemetry_pose,
        world_velocity(buffer, telemetry_base + 184, telemetry_base + 232),
    );
    if lag_s == 0.0 {
        return;
    }
    for (position, vehicle) in vehicles.iter_mut().enumerate() {
        if position == index {
            continue;
        }
        let base = SCORING_BASE + position * SCORING_STRIDE;
        let Some(velocity) = world_velocity(buffer, base + 288, base + 336) else {
            continue;
        };
        if let Some(current) = &mut vehicle.pose {
            current.x_m += velocity[0] * lag_s;
            current.y_m += velocity[1] * lag_s;
        }
    }
}

/// `Δt` entre el reloj de `scoring` y el de la telemetría, por proyección del
/// desplazamiento del jugador sobre su velocidad. Parado (< 1 m/s) no hay
/// desfase observable.
fn scoring_lag_s(scoring: Pose, telemetry: Pose, velocity: Option<[f64; 2]>) -> f64 {
    let Some([x, y]) = velocity else {
        return 0.0;
    };
    let squared = x * x + y * y;
    if squared < 1.0 {
        return 0.0;
    }
    let dx = telemetry.x_m - scoring.x_m;
    let dy = telemetry.y_m - scoring.y_m;
    let lag = (dx * x + dy * y) / squared;
    // No extrapolar más allá del presupuesto de frescura de LMU (500 ms).
    // Un salto no compatible conserva las poses scoring originales, sin clamp
    // que invente movimiento para todos los rivales.
    if lag.is_finite() && lag.abs() <= MAX_SCORING_LAG_S {
        lag
    } else {
        0.0
    }
}

/// Velocidad en el mundo, en el plano del suelo (`x`, `y = z`): las columnas
/// de `mOri` llevan los ejes locales al mundo.
fn world_velocity(buffer: &[u8], velocity_at: usize, orientation_at: usize) -> Option<[f64; 2]> {
    let local = vector(buffer, velocity_at)?;
    let ori = orientation(buffer, orientation_at)?;
    let world = |row: usize| (0..3).map(|column| ori[row][column] * local[column]).sum();
    Some([world(0), world(2)])
}

/// Un cronómetro de vuelta en 0 para todos los coches no es un cronómetro
/// parado: es que el simulador no publica `mProgressTime` (las distancias de
/// vuelta sí difieren). Se descarta para no informar 0,00 s a mitad de vuelta.
// La comparación exacta es el dato: el marcador del simulador es 0,0 literal.
#[allow(clippy::float_cmp)]
fn normalize_lap_progress(vehicles: &mut [Vehicle]) {
    if vehicles.len() < 2
        || vehicles
            .iter()
            .any(|vehicle| vehicle.lap_progress_s != Some(0.0))
    {
        return;
    }
    let mut distances = vehicles.iter().filter_map(|vehicle| vehicle.lap_distance_m);
    let differs = distances
        .next()
        .is_some_and(|first| distances.any(|distance| distance != first));
    if differs {
        for vehicle in vehicles {
            vehicle.lap_progress_s = None;
        }
    }
}

fn vector(buffer: &[u8], base: usize) -> Option<[f64; 3]> {
    let value = [
        read_f64(buffer, base),
        read_f64(buffer, base + 8),
        read_f64(buffer, base + 16),
    ];
    value.iter().all(|c| c.is_finite()).then_some(value)
}

/// Matriz de orientación válida: filas ortonormales y determinante +1.
fn orientation(buffer: &[u8], base: usize) -> Option<[[f64; 3]; 3]> {
    const TOLERANCE: f64 = 1e-3;
    let rows = [
        vector(buffer, base)?,
        vector(buffer, base + 24)?,
        vector(buffer, base + 48)?,
    ];
    let dot = |a: &[f64; 3], b: &[f64; 3]| a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    let orthonormal = (0..3).all(|i| {
        (dot(&rows[i], &rows[i]) - 1.0).abs() <= TOLERANCE
            && (i + 1..3).all(|j| dot(&rows[i], &rows[j]).abs() <= TOLERANCE)
    });
    let [a, b, c] = rows;
    let determinant = a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0])
        + a[2] * (b[0] * c[1] - b[1] * c[0]);
    (orthonormal && (determinant - 1.0).abs() <= TOLERANCE).then_some(rows)
}

/// Del mundo de rF2 (izquierdo, +y arriba) al plano del suelo del dominio:
/// `x = x`, `y = z`; ese giro no refleja el mapa. La proa del coche es `-z`
/// local (+z apunta a la trasera) y las columnas de `mOri` llevan los ejes
/// locales al mundo.
fn pose(buffer: &[u8], position: usize, orientation_at: usize) -> Option<Pose> {
    let [x, _, z] = vector(buffer, position)?;
    let ori = orientation(buffer, orientation_at)?;
    Some(Pose {
        x_m: x,
        y_m: z,
        yaw_rad: (-ori[2][2]).atan2(-ori[0][2]),
    })
}

fn c_string(bytes: &[u8]) -> Option<String> {
    let end = bytes.iter().position(|byte| *byte == 0)?;
    std::str::from_utf8(&bytes[..end])
        .ok()
        .filter(|text| text.chars().all(|ch| ch >= '\u{20}'))
        // Los controles ya se rechazan arriba; el saneado quita ademas las
        // marcas bidireccionales y de anchura cero, que si pasan ese filtro.
        .map(vantare_domain::text::sanitize_display)
}

fn c_string_lossy(bytes: &[u8]) -> Option<String> {
    let end = bytes.iter().position(|byte| *byte == 0)?;
    Some(vantare_domain::text::sanitize_display(
        &String::from_utf8_lossy(&bytes[..end]),
    ))
}

fn read_i16(bytes: &[u8], at: usize) -> i16 {
    i16::from_le_bytes(fixed(bytes, at))
}

fn read_i32(bytes: &[u8], at: usize) -> i32 {
    i32::from_le_bytes(fixed(bytes, at))
}

fn read_f64(bytes: &[u8], at: usize) -> f64 {
    f64::from_le_bytes(fixed(bytes, at))
}

fn read_f32(bytes: &[u8], at: usize) -> f32 {
    f32::from_le_bytes(fixed(bytes, at))
}

/// Los offsets salen de constantes del layout y el buffer mide al menos
/// `OBJECT_OUT_SIZE`: un fallo aquí es un bug, no un dato malo.
fn fixed<const N: usize>(bytes: &[u8], at: usize) -> [u8; N] {
    bytes[at..at + N].try_into().expect("layout admitido")
}

#[cfg(test)]
mod tests {
    use super::*;

    const REAL_44: &[u8] = include_bytes!("../../../../../testdata/lmu-fixture.bin");
    const REAL_MENU: &[u8] = include_bytes!("../../../../../testdata/lmu-menu-fixture.bin");
    const TRACK_1400: &[u8] = include_bytes!("../../../../../testdata/lmu-1.4-track-fixture.bin");
    const MENU_1400: &[u8] = include_bytes!("../../../../../testdata/lmu-1.4-menu-fixture.bin");
    const TRACK_1413: &[u8] =
        include_bytes!("../../../../../testdata/lmu-1.4.1.3-track-fixture.bin");
    const MENU_1413: &[u8] = include_bytes!("../../../../../testdata/lmu-1.4.1.3-menu-fixture.bin");
    const TRACK_1420: &[u8] =
        include_bytes!("../../../../../testdata/lmu-1.4.2.0-track-fixture.bin");
    const MENU_1420: &[u8] = include_bytes!("../../../../../testdata/lmu-1.4.2.0-menu-fixture.bin");
    const PLAYER_BASE: usize = TELEMETRY_BASE + 43 * TELEMETRY_STRIDE;

    /// Cada build fijada admite sus fixtures reales y solo su versión exacta.
    #[test]
    fn every_supported_build_admits_its_real_frames_and_only_its_exact_version() {
        for (build, track, menu, cars) in [
            ("1.3.0.0", REAL_44, REAL_MENU, 44),
            ("1.4.0.0", TRACK_1400, MENU_1400, 0),
            ("1.4.1.3", TRACK_1413, MENU_1413, 18),
            ("1.4.2.0", TRACK_1420, MENU_1420, 43),
        ] {
            assert!(supports_build(build));
            let grid = admit(track, build).unwrap();
            assert!(grid.player.is_some(), "{build}");
            // 0: el fixture 1.4.0.0 no fija el número de coches.
            assert!(cars == 0 && !grid.vehicles.is_empty() || grid.vehicles.len() == cars);
            let menu = admit(menu, build).unwrap();
            assert!(menu.vehicles.is_empty() && menu.player.is_none(), "{build}");
        }
        for build in ["1.4.0.1", "1.4.1.0", "1.4.1.2", "1.4.2.1", "", "2.0.0.0"] {
            assert_eq!(admit(TRACK_1420, build), Err(Rejection::UnsupportedBuild));
        }
    }

    #[test]
    fn the_real_44_car_frame_reads_session_grid_and_player() {
        let frame = admit(REAL_44, "1.3.0.0").unwrap();
        assert_eq!(frame.track, "Circuit de Barcelona");
        assert_eq!(frame.kind, Some(Kind::Practice));
        assert_eq!(frame.source_time, Some(Duration::from_secs_f64(112.6)));
        assert_eq!(frame.end_time_s, Some(3605.0));
        assert_eq!(frame.player, Some(43));
        let mut positions: Vec<u32> = frame.vehicles.iter().map(|v| v.position).collect();
        positions.sort_unstable();
        assert_eq!(positions, (1..=44).collect::<Vec<_>>());
        let player = &frame.vehicles[43];
        assert_eq!((player.laps, player.in_pit), (0, false));
        assert_eq!((player.best_lap_s, player.last_lap_s), (None, None));
        assert!(player.pose.is_some());
        let inputs = player.inputs.as_ref().unwrap();
        assert_eq!(inputs.gear, Some(1));
        assert!((inputs.speed_mps.unwrap() - 15.592_212_870_045_874).abs() < 1e-9);
        assert!((inputs.engine_rpm.unwrap() - 3_395.991_911_935_684).abs() < 1e-6);
        assert_eq!(
            frame.vehicles.iter().filter(|v| v.inputs.is_some()).count(),
            1
        );
        // Del sidecar del fixture: primer coche en boxes, sin vuelta rápida.
        let first = &frame.vehicles[0];
        assert_eq!(
            (first.position, first.in_pit, first.best_lap_s),
            (23, true, None)
        );
        assert_eq!(first.class, "LMP2_ELMS");
        assert!((first.time_behind_leader_s.unwrap() - 82.575_340_27).abs() < 1e-6);
    }

    /// Del sidecar del fixture: +x local a la izquierda, +z a la trasera y las
    /// columnas de `mOri` llevan los ejes locales al mundo; el orden de coches
    /// en pista confirma la proa (ver REVIEW.md). Para el jugador, -col2 =
    /// (-0.867, _, -0.497) en (x, z) y su derecha -col0 = (-0.498, _, 0.867).
    #[test]
    fn the_players_heading_and_right_match_the_domain_ground_plane() {
        let pose = admit(REAL_44, "1.3.0.0").unwrap().vehicles[43]
            .pose
            .unwrap();
        assert!((pose.x_m + 487.81).abs() < 0.01 && (pose.y_m + 482.82).abs() < 0.01);
        let (sin, cos) = pose.yaw_rad.sin_cos();
        assert!((cos + 0.867).abs() < 0.01 && (sin + 0.497).abs() < 0.01);
        // La derecha del dominio es (sin, -cos).
        assert!((sin + 0.497).abs() < 0.01 && (-cos - 0.867).abs() < 0.01);
    }

    #[test]
    fn atypical_session_scalars_drop_the_field_without_rejecting_the_grid() {
        let mut frame = REAL_44.to_vec();
        frame[1_700..1_708].copy_from_slice(&(-1.0_f64).to_le_bytes());
        frame[1_696..1_700].copy_from_slice(&99_i32.to_le_bytes());
        let grid = admit(&frame, "1.3.0.0").unwrap();
        assert_eq!(grid.vehicles.len(), 44);
        assert_eq!((grid.source_time, grid.kind), (None, None));
        frame[1_708..1_716].copy_from_slice(&f64::NAN.to_le_bytes());
        assert_eq!(admit(&frame, "1.3.0.0").unwrap().end_time_s, None);
        // Fin de sesión anterior al reloj actual: no es un instante válido.
        let mut frame = REAL_44.to_vec();
        frame[1_708..1_716].copy_from_slice(&50.0_f64.to_le_bytes());
        assert_eq!(admit(&frame, "1.3.0.0").unwrap().end_time_s, None);
    }

    #[test]
    fn invalid_player_inputs_are_dropped_one_by_one() {
        let mut frame = REAL_44.to_vec();
        frame[PLAYER_BASE + 356..PLAYER_BASE + 364].copy_from_slice(&f64::NAN.to_le_bytes());
        frame[PLAYER_BASE + 420..PLAYER_BASE + 428].copy_from_slice(&1.5_f64.to_le_bytes());
        frame[PLAYER_BASE + 352..PLAYER_BASE + 356].copy_from_slice(&99_i32.to_le_bytes());
        let grid = admit(&frame, "1.3.0.0").unwrap();
        let inputs = grid.vehicles[43].inputs.as_ref().unwrap();
        assert_eq!(
            (inputs.engine_rpm, inputs.throttle, inputs.gear),
            (None, None, None)
        );
        assert!(inputs.brake.is_some() && inputs.speed_mps.is_some());
        assert!(grid.vehicles[0].inputs.is_none());
    }

    /// El jugador está en los dos flujos con relojes distintos: en el fixture,
    /// `scoring` va 0,18 s (2,4 m a 15,6 m/s) por detrás de la telemetría. La
    /// proyección del desplazamiento sobre su velocidad estima el desfase y el
    /// rival extrapolado queda pegado al reloj de la telemetría.
    #[test]
    fn the_scoring_clock_lag_is_estimated_with_the_player_and_applied_to_rivals() {
        let frame = admit(REAL_44, "1.3.0.0").unwrap();
        let scoring_base = SCORING_BASE + 43 * SCORING_STRIDE;
        let telemetry_base = TELEMETRY_BASE + 43 * TELEMETRY_STRIDE;
        let scoring = pose(REAL_44, scoring_base + 264, scoring_base + 336).unwrap();
        let telemetry = pose(REAL_44, telemetry_base + 160, telemetry_base + 232).unwrap();
        let velocity = world_velocity(REAL_44, telemetry_base + 184, telemetry_base + 232).unwrap();
        let lag = scoring_lag_s(scoring, telemetry, Some(velocity));
        assert!((lag - 0.181_292_787).abs() < 1e-6, "Δt {lag}");
        let error = ((scoring.x_m + velocity[0] * lag - telemetry.x_m).powi(2)
            + (scoring.y_m + velocity[1] * lag - telemetry.y_m).powi(2))
        .sqrt();
        assert!(
            error < 0.5,
            "el jugador queda a {error} m de su pose rápido"
        );

        // El rival 0 se publica extrapolado con su propia velocidad y conserva
        // su orientación.
        let rival = pose(REAL_44, SCORING_BASE + 264, SCORING_BASE + 336).unwrap();
        let rival_velocity =
            world_velocity(REAL_44, SCORING_BASE + 288, SCORING_BASE + 336).unwrap();
        let published = frame.vehicles[0].pose.unwrap();
        assert!((published.x_m - (rival.x_m + rival_velocity[0] * lag)).abs() < 1e-9);
        assert!((published.y_m - (rival.y_m + rival_velocity[1] * lag)).abs() < 1e-9);
        assert!((published.yaw_rad - rival.yaw_rad).abs() < f64::EPSILON);
        // El jugador no se extrapola: ya publica su pose de telemetría.
        assert_eq!(frame.vehicles[43].pose.unwrap(), telemetry);
    }

    #[test]
    fn teleport_disagreement_does_not_extrapolate_rival_poses() {
        let mut bytes = REAL_44.to_vec();
        let scoring_base = SCORING_BASE + 43 * SCORING_STRIDE;
        let telemetry_base = TELEMETRY_BASE + 43 * TELEMETRY_STRIDE;
        let scoring = pose(&bytes, scoring_base + 264, scoring_base + 336).unwrap();
        let velocity = world_velocity(&bytes, telemetry_base + 184, telemetry_base + 232).unwrap();
        for (offset, value) in [
            (160, scoring.x_m + velocity[0] * 60.0),
            (176, scoring.y_m + velocity[1] * 60.0),
        ] {
            bytes[telemetry_base + offset..telemetry_base + offset + 8]
                .copy_from_slice(&value.to_le_bytes());
        }
        let frame = admit(&bytes, "1.3.0.0").unwrap();
        let raw = pose(&bytes, SCORING_BASE + 264, SCORING_BASE + 336).unwrap();
        assert_eq!(
            frame.vehicles[0].pose.unwrap(),
            raw,
            "no desplazar rivales por teletransporte del jugador"
        );
    }

    #[test]
    fn best_and_current_sectors_come_from_the_cumulative_sdk_fields() {
        let mut bytes = REAL_44.to_vec();
        let base = SCORING_BASE;
        let mut put = |at: usize, value: f64| {
            bytes[base + at..base + at + 8].copy_from_slice(&value.to_le_bytes());
        };
        put(128, 69.1);
        put(136, 141.7);
        put(144, 207.9);
        put(176, 68.98);
        bytes[base + 532..base + 536].copy_from_slice(&141.6_f32.to_le_bytes());
        let vehicle = &admit(&bytes, "1.3.0.0").unwrap().vehicles[0];
        let [s1, s2, s3] = vehicle.best_sectors_s.map(Option::unwrap);
        assert!((s1 - 69.1).abs() < 1e-9 && (s2 - 72.6).abs() < 1e-9);
        assert!(
            (s3 - (207.9 - f64::from(141.6_f32))).abs() < 1e-9,
            "S3 de la mejor vuelta"
        );
        assert_eq!(vehicle.current_sectors_s, vec![68.98]);
        // Sin reloj de telemetría (rival) no se lee mCountLapFlag.
        assert_eq!(vehicle.lap_time_counts, None);
        // La captura real aún no tiene vueltas: todo ausente, como antes.
        let untouched = &admit(REAL_44, "1.3.0.0").unwrap().vehicles[0];
        assert_eq!(untouched.best_sectors_s, [None; 3]);
        assert!(untouched.current_sectors_s.is_empty());
        assert_eq!(split_current(68.98, 141.0), vec![68.98, 141.0 - 68.98]);
        assert_eq!(split_current(-1.0, -1.0), Vec::<f64>::new());
    }

    #[test]
    fn a_standing_player_has_no_observable_clock_lag() {
        let still = Pose {
            x_m: 0.0,
            y_m: 0.0,
            yaw_rad: 0.0,
        };
        let moved = Pose {
            x_m: 3.0,
            y_m: 0.0,
            yaw_rad: 0.0,
        };
        assert!(scoring_lag_s(still, moved, Some([0.5, -0.5])).abs() < f64::EPSILON);
        assert!(scoring_lag_s(still, moved, None).abs() < f64::EPSILON);
        assert!(scoring_lag_s(still, moved, Some([2.0, 0.0])).abs() < f64::EPSILON);
        let within_budget = Pose { x_m: 0.3, ..moved };
        assert!((scoring_lag_s(still, within_budget, Some([2.0, 0.0])) - 0.15).abs() < 1e-9);
    }

    #[test]
    fn sector_distance_progress_and_session_limits_carry_their_native_evidence() {
        let frame = admit(REAL_44, "1.3.0.0").unwrap();
        // `mSector` 1 = S1 → índice 0; el cronómetro de vuelta todo a cero es un
        // marcador sin dato (las distancias sí difieren) y `mMaximumLaps` 0 es
        // una sesión por tiempo.
        assert!(
            frame
                .vehicles
                .iter()
                .all(|vehicle| vehicle.sector.is_some())
        );
        assert_eq!(frame.vehicles[43].sector, Some(0));
        assert!(
            frame
                .vehicles
                .iter()
                .all(|vehicle| vehicle.lap_distance_m.is_some())
        );
        assert!(
            frame
                .vehicles
                .iter()
                .all(|vehicle| vehicle.lap_progress_s.is_none())
        );
        assert_eq!(frame.maximum_laps, None);
        assert!((frame.track_length_m.unwrap() - 4_655.109_863_281_25).abs() < 1e-9);

        let mutate = |edit: &dyn Fn(&mut Vec<u8>)| {
            let mut frame = REAL_44.to_vec();
            edit(&mut frame);
            admit(&frame, "1.3.0.0").unwrap()
        };
        // 0 = último sector, 2 = S2.
        assert_eq!(
            mutate(&|f| f[SCORING_BASE + 102] = 0).vehicles[0].sector,
            Some(2)
        );
        assert_eq!(
            mutate(&|f| f[SCORING_BASE + 102] = 2).vehicles[0].sector,
            Some(1)
        );
        // Un cronómetro real sí viaja; una distancia negativa no es distancia.
        let edited = mutate(&|f| {
            f[SCORING_BASE + 104..SCORING_BASE + 112].copy_from_slice(&(-1.0_f64).to_le_bytes());
            f[SCORING_BASE + 464..SCORING_BASE + 472].copy_from_slice(&12.5_f64.to_le_bytes());
        });
        assert_eq!(edited.vehicles[0].lap_distance_m, None);
        assert_eq!(edited.vehicles[0].lap_progress_s, Some(12.5));
        // 0 = por tiempo, negativo = inválido, `i32::MAX` = sin límite.
        for (laps, expected) in [(0_i32, None), (-1, None), (i32::MAX, None), (30, Some(30))] {
            let edited = mutate(&|f| f[1_716..1_720].copy_from_slice(&laps.to_le_bytes()));
            assert_eq!(edited.maximum_laps, expected, "mMaximumLaps {laps}");
        }
        for (length, expected) in [(0.0_f64, None), (-1.0, None), (f64::NAN, None)] {
            let edited = mutate(&|f| f[1_720..1_728].copy_from_slice(&length.to_le_bytes()));
            assert_eq!(edited.track_length_m, expected, "mTrackLength {length}");
        }
    }

    #[test]
    fn a_broken_telemetry_pose_falls_back_to_scoring_and_a_bad_rotation_drops_the_pose() {
        let mut frame = REAL_44.to_vec();
        let scoring = admit(&frame, "1.3.0.0").unwrap().vehicles[43].pose;
        frame[PLAYER_BASE + 160..PLAYER_BASE + 168].copy_from_slice(&f64::NAN.to_le_bytes());
        let changed = admit(&frame, "1.3.0.0").unwrap();
        // Cae a la pose de `scoring` (2,4 m atrás: se refresca menos que la telemetría).
        let fallback = changed.vehicles[43].pose.unwrap();
        assert_ne!(Some(fallback), scoring);
        assert!((fallback.x_m + 485.36).abs() < 0.01 && (fallback.y_m + 481.41).abs() < 0.01);
        assert!(
            changed.vehicles[43]
                .inputs
                .as_ref()
                .unwrap()
                .speed_mps
                .is_some()
        );
        // Un rival con orientación no ortonormal se queda sin pose.
        let base = SCORING_BASE + 5 * SCORING_STRIDE + 336;
        frame[base..base + 8].copy_from_slice(&2.0_f64.to_le_bytes());
        assert_eq!(admit(&frame, "1.3.0.0").unwrap().vehicles[5].pose, None);
    }

    #[test]
    fn a_non_utf8_driver_name_is_kept_but_a_non_utf8_car_name_rejects_the_frame() {
        let mut frame = REAL_44.to_vec();
        frame[SCORING_BASE + 4..SCORING_BASE + 8].copy_from_slice(&[b'J', 0xE9, b'a', 0]);
        let grid = admit(&frame, "1.3.0.0").unwrap();
        assert_eq!(grid.vehicles[0].driver, "J\u{fffd}a");
        frame[SCORING_BASE + 36] = 0xE9;
        assert_eq!(admit(&frame, "1.3.0.0"), Err(Rejection::InvalidActiveGrid));
    }

    #[test]
    fn truncation_and_inconsistent_grids_are_rejected_before_publishing() {
        assert_eq!(
            admit(&REAL_44[..OBJECT_OUT_SIZE - 1], "1.3.0.0"),
            Err(Rejection::ShortBuffer)
        );
        let mutate = |edit: &dyn Fn(&mut Vec<u8>)| {
            let mut frame = REAL_44.to_vec();
            edit(&mut frame);
            admit(&frame, "1.3.0.0")
        };
        assert_eq!(
            mutate(&|f| f[1_736..1_740].copy_from_slice(&105_i32.to_le_bytes())),
            Err(Rejection::InvalidVehicleCount)
        );
        assert_eq!(
            mutate(&|f| f[1_736..1_740].copy_from_slice(&(-1_i32).to_le_bytes())),
            Err(Rejection::InvalidVehicleCount)
        );
        // Dos filas de telemetría con la misma identidad.
        assert_eq!(
            mutate(&|f| f.copy_within(
                TELEMETRY_BASE..TELEMETRY_BASE + 4,
                TELEMETRY_BASE + TELEMETRY_STRIDE
            )),
            Err(Rejection::InvalidActiveGrid)
        );
        assert_eq!(
            mutate(&|f| f[1_632..1_696].fill(b'A')),
            Err(Rejection::InvalidSessionString)
        );
        // Dos jugadores.
        assert_eq!(
            mutate(&|f| f[SCORING_BASE + 196] = 1),
            Err(Rejection::InvalidActiveGrid)
        );
        for (offset, bytes) in [
            (144, f64::NAN.to_le_bytes().to_vec()),
            (199, vec![0]),
            (199, vec![105]),
            (102, vec![3]),
            (100, (-1_i16).to_le_bytes().to_vec()),
            (192, (-1_i16).to_le_bytes().to_vec()),
            (240, (-1_i32).to_le_bytes().to_vec()),
            (198, vec![2]),
        ] {
            assert_eq!(
                mutate(&|f| f[SCORING_BASE + offset..][..bytes.len()].copy_from_slice(&bytes)),
                Err(Rejection::InvalidActiveGrid),
                "offset {offset}"
            );
        }
    }

    /// El parser indexa un buffer de tamano fijo con offsets constantes y con
    /// `count`, que sale de la propia memoria compartida. Un fallo de cota aqui
    /// no es un dato raro: es un panico en el proceso del nucleo, y lo alcanza
    /// quien pueda escribir esa memoria.
    ///
    /// Se mutan bytes de fixtures reales de forma determinista y se truncan por
    /// todos sus prefijos: el truncamiento es el camino clasico de fallo de
    /// cota. Ninguna entrada hostil debe hacer panico.
    #[test]
    fn mutated_and_truncated_real_frames_never_panic() {
        let mut state = 0x2545_F491_4F6C_DD1D_u64;
        let mut next = || {
            state ^= state << 13;
            state ^= state >> 7;
            state ^= state << 17;
            state
        };
        for (build, fixture) in [("1.3.0.0", REAL_44), ("1.4.2.0", TRACK_1420)] {
            // Truncamientos: densos al principio, muestreados despues.
            for keep in (0..fixture.len().min(4096)).chain((4096..fixture.len()).step_by(1013)) {
                let _ = admit(&fixture[..keep], build);
            }
            // Mutaciones: valores imposibles en campos de control y de indice.
            // El parser es barato, asi que se le da volumen: 20.000 entradas
            // hostiles por fixture cuestan decimas de segundo.
            for _ in 0..20_000 {
                let mut bytes = fixture.to_vec();
                for _ in 0..=(next() % 8) {
                    let at = usize::try_from(next()).unwrap_or(0) % bytes.len();
                    bytes[at] = (next() & 0xff) as u8;
                }
                let _ = admit(&bytes, build);
            }
        }
    }
}
