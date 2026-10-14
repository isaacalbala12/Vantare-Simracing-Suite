//! Prueba física opt-in. No se convierte la ausencia del juego en un éxito.
#[cfg(windows)]
#[test]
#[ignore = "requiere ACC en sesión activa y broadcasting configurado; no iniciar el juego automáticamente"]
fn live_acc_player_and_registered_grid() {
    use std::time::{Duration, Instant};
    use vantare_domain::{Adapter, Capability};
    use vantare_runtime::adapter::Acc;

    let start = Instant::now();
    let mut adapter = Acc::new();
    let mut player_seen = false;
    let mut grid_seen = false;
    while start.elapsed() < Duration::from_secs(15) {
        match adapter.poll(start.elapsed()) {
            Ok(Some(o)) => {
                player_seen |= o.state.player.is_some()
                    && o.state.capabilities.driver_inputs == Capability::Fresh;
                grid_seen |= o.state.cars.len() > 1
                    && o.state
                        .cars
                        .iter()
                        .all(|c| !c.number.is_empty() && !c.driver.name.is_empty())
                    && o.state.capabilities.positions == Capability::Fresh;
                if player_seen && grid_seen {
                    break;
                }
            }
            Ok(None) | Err(vantare_domain::AdapterError::Disconnected) => {}
            Err(e) => panic!("fuente real ACC rechazada: {e}"),
        }
        // Solo esta prueba física espera la cadencia real de SHM/UDP; no inventa frames.
        std::thread::sleep(Duration::from_millis(10));
    }
    assert!(player_seen, "no hubo telemetría fresca del jugador en 15 s");
    assert!(
        grid_seen,
        "no hubo parrilla UDP identificada y fresca en 15 s"
    );
}
