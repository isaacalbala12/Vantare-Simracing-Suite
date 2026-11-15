//! CPU-only fixtures: no publisher, native window or graphics device.
use vantare_domain::{CarId, Quality::Reliable, Snapshot};
pub fn snapshot() -> Snapshot {
    let mut snapshot = vantare_ipc::source::fixed();
    snapshot.state.cars.truncate(7);
    snapshot.state.player.as_mut().expect("player").car = CarId(4);
    for car in &mut snapshot.state.cars {
        car.relative_s = Reliable(4.0 - f64::from(car.id.0));
        car.number = car.id.0.to_string();
        car.class_position = Reliable(car.id.0);
        car.best_lap_s = Reliable(100.0);
        car.in_pits = Reliable(false);
    }
    snapshot
}
