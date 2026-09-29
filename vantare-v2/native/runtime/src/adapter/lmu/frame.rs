//! Admisión y lectura del buffer `LMU_Data` (rF2 `InternalsPlugin`, layout 1.3).
//! Un buffer solo se admite si su build está verificada aparte: la forma del
//! buffer nunca promueve una build desconocida. Una fila corrupta rechaza todo
//! el frame; un valor atípico pero acotado deja ese campo en `None`.

use std::fmt;
use std::time::Duration;

use vantare_domain::Pose;

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

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(super) enum Phase {
    Preparing,
    Running,
    Interrupted,
    Finished,
}

#[derive(Debug, PartialEq)]
pub(super) struct Frame {
    pub track: String,
    pub kind: Option<Kind>,
    pub phase: Option<Phase>,
    /// Reloj de sesión del simulador (`mCurrentET`).
    pub source_time: Option<Duration>,
    /// `mEndET`, en segundos de reloj de sesión.
    pub end_time_s: Option<f64>,
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
    pub best_lap_s: Option<f64>,
    pub last_lap_s: Option<f64>,
    pub time_behind_next_s: Option<f64>,
    pub laps_behind_next: u32,
    pub time_behind_leader_s: Option<f64>,
    pub laps_behind_leader: u32,
    pub pose: Option<Pose>,
    /// Solo el coche del jugador.
    pub inputs: Option<Inputs>,
}

#[derive(Debug, PartialEq)]
pub(super) struct Inputs {
    pub gear: Option<i8>,
    pub engine_rpm: Option<f64>,
    pub speed_mps: Option<f64>,
    pub throttle: Option<f64>,
    pub brake: Option<f64>,
    pub clutch: Option<f64>,
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
    Ok(Frame {
        track: track.trim().to_owned(),
        kind: match read_i32(buffer, 1_696) {
            1..=4 => Some(Kind::Practice),
            5..=8 => Some(Kind::Qualifying),
            9 => Some(Kind::Warmup),
            10..=13 => Some(Kind::Race),
            _ => None,
        },
        phase: match buffer[1_740] {
            0..=4 => Some(Phase::Preparing),
            5 => Some(Phase::Running),
            6 | 7 | 9 => Some(Phase::Interrupted),
            8 => Some(Phase::Finished),
            _ => None,
        },
        source_time: Duration::try_from_secs_f64(source_seconds).ok(),
        end_time_s: (end_seconds.is_finite()
            && (!source_seconds.is_finite() || end_seconds >= source_seconds))
            .then_some(end_seconds),
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
    // Sector (base+102), distancia de vuelta (base+104), vueltas de boxes y
    // sanciones (base+192/194) y `estimated` (base+472) no viajan en el modelo
    // de la fase 0, pero un valor imposible sigue invalidando la fila.
    let sector_ok = buffer[base + 102] <= 2;
    let counters_ok = read_i16(buffer, base + 192) >= 0 && read_i16(buffer, base + 194) >= 0;
    let finite_ok = [
        read_f64(buffer, base + 104),
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
        || !sector_ok
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
        best_lap_s: (best > 0.0).then_some(best),
        last_lap_s: (last > 0.0).then_some(last),
        time_behind_next_s: (time_next >= 0.0).then_some(time_next),
        laps_behind_next,
        time_behind_leader_s: (time_leader >= 0.0).then_some(time_leader),
        laps_behind_leader,
        pose,
        inputs,
    })
}

fn inputs(buffer: &[u8], base: usize) -> Inputs {
    let velocity = vector(buffer, base + 184);
    let rpm = read_f64(buffer, base + 356);
    Inputs {
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
    }
}

fn ratio(value: f64) -> Option<f64> {
    (value.is_finite() && (0.0..=1.0).contains(&value)).then_some(value)
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
        .map(str::to_owned)
}

fn c_string_lossy(bytes: &[u8]) -> Option<String> {
    let end = bytes.iter().position(|byte| *byte == 0)?;
    Some(String::from_utf8_lossy(&bytes[..end]).into_owned())
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
        assert_eq!(frame.phase, Some(Phase::Running));
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
        frame[1_740] = 200;
        let grid = admit(&frame, "1.3.0.0").unwrap();
        assert_eq!(grid.vehicles.len(), 44);
        assert_eq!(
            (grid.source_time, grid.kind, grid.phase),
            (None, None, None)
        );
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
}
