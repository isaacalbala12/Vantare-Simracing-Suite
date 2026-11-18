//! Copia local del fixture de marcos: `#[path]` no puede cruzar crates
//! (`hub/tests/architecture.rs::native_path_attributes_never_cross_crate_boundaries`).

use std::time::Duration;
use vantare_domain::{Car, CarId, Observation, Player, Quality, SessionId, SessionKind};

pub fn observation(session: u64, car: u32, laps: u32, time_ms: u64, last: f64) -> Observation {
    let mut frame = Observation::default();
    frame.state.player = Some(Player {
        car: CarId(car),
        ..Player::default()
    });
    let telemetry = &mut frame.state.player.as_mut().unwrap().telemetry;
    telemetry.speed_mps = Quality::Reliable(50.0);
    telemetry.throttle = Quality::Reliable(0.75);
    telemetry.brake = Quality::Reliable(0.0);
    frame.origin.source_time = Some(Duration::from_millis(time_ms));
    frame.origin.received_at = Duration::from_millis(time_ms);
    frame.state.session.id = SessionId(session);
    frame.state.session.kind = Quality::Reliable(SessionKind::Race);
    frame.state.session.track_name = Quality::Reliable("Spa".into());
    frame.state.session.elapsed_s =
        Quality::Reliable(Duration::from_millis(time_ms % 2000).as_secs_f64());
    frame.state.cars = vec![Car {
        id: CarId(car),
        vehicle: format!("Car {car}"),
        laps: Quality::Reliable(laps),
        position: Quality::Reliable(2),
        last_lap_s: Quality::Reliable(last),
        best_lap_s: Quality::Reliable(last),
        last_sectors_s: vec![Quality::Reliable(last / 3.0); 3],
        lap_distance_m: Quality::Reliable(0.0),
        lap_elapsed_s: Quality::Reliable(0.0),
        ..Car::default()
    }];
    frame
}
pub fn frames() -> Vec<Observation> {
    vec![
        observation(10, 7, 0, 0, 90.0),
        observation(10, 7, 1, 1000, 91.0),
        observation(20, 9, 3, 2000, 88.0),
        observation(20, 9, 4, 3000, 89.0),
    ]
}
