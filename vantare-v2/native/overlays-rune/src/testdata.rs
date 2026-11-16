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

/// Falla si alguna capa pintada sale de la ventana del widget (0..ancho × 0..alto).
/// Se toma `&mut` para servir tanto si `elements()` pide `&self` como `&mut self`.
pub fn assert_inside_window<T>(runtime: &mut rune::Runtime<T>, size: (f32, f32)) {
    let (width, height) = size;
    for element in runtime.elements() {
        let [x, y, w, h] = element.rect;
        if w <= 0.0 || h <= 0.0 {
            continue;
        }
        assert!(
            x >= -0.5 && y >= -0.5 && x + w <= width + 0.5 && y + h <= height + 0.5,
            "fuera de la ventana ({width}×{height}): {:?} {:?}",
            element.key,
            element.rect
        );
    }
}
