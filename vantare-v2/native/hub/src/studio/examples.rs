//! Escenas explícitas de diseño, usadas exclusivamente por «Ejemplo».
//! El renderer productivo aplica las mismas opciones que en la fuente IPC.
use vantare_domain::{CarId, DriverId, Gap, Quality, Snapshot};

pub fn snapshot(scene: &str) -> Result<Snapshot, String> {
    let document: serde_json::Value = serde_json::from_str(scene).map_err(|e| e.to_string())?;
    vantare_ipc::snapshot_from_json(&document["frames"][0]["snapshot"].to_string())
        .map_err(|e| e.to_string())
}

/// Treinta pilotos por clase y ±8 rivales propios para probar todos los límites.
/// Son muestras rotuladas, no señales derivadas de una sesión real.
pub fn tables() -> Result<Snapshot, String> {
    let mut photo = snapshot(include_str!(
        "../../../ui/fixtures/standings-vantare.scene.json"
    ))?;
    let templates = photo.state.cars.clone();
    photo.state.cars.clear();
    for class in 0..3u32 {
        let template = templates
            .iter()
            .find(|car| car.class.as_ref().is_some_and(|c| c.id.0 == class))
            .ok_or("escena de ejemplo sin una clase")?;
        for position in 1..=30u32 {
            let mut car = template.clone();
            let id = class * 30 + position;
            car.id = CarId(id);
            car.driver.id = DriverId(id);
            car.driver.name = if id == 15 {
                "Tú · ejemplo".into()
            } else {
                format!("Piloto de ejemplo {id:02}")
            };
            car.number = id.to_string();
            car.position = Quality::Reliable(id);
            car.class_position = Quality::Reliable(position);
            car.grid_position = Quality::Reliable(id);
            car.relative_s =
                Quality::Reliable((15.0 - f64::from(position)) * 2.5 + f64::from(class) * 0.2);
            car.relative_laps = Quality::Reliable(0);
            car.gap_class_leader = Quality::Reliable(Gap::Time {
                seconds: f64::from(position - 1) * 2.5,
            });
            car.gap_leader = Quality::Reliable(Gap::Time {
                seconds: f64::from(id - 1) * 2.5,
            });
            photo.state.cars.push(car);
        }
    }
    photo
        .state
        .player
        .as_mut()
        .ok_or("escena de ejemplo sin jugador")?
        .car = CarId(15);
    Ok(photo)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn examples_support_all_rows_both_class_modes_and_asymmetric_relative_ranges() {
        let photo = tables().expect("ejemplo");
        let board = vantare_domain::standings_vantare::project(&photo, Default::default());
        assert_eq!(board.groups.len(), 3);
        assert!(board.groups.iter().all(|g| g.rows.len() == 30));
        for (ahead, behind) in [(0, 0), (1, 5), (8, 8)] {
            let board = vantare_domain::relative_vantare::project(&photo, ahead, behind, true);
            assert_eq!(board.slots.len(), ahead + behind + 1);
            assert!(board.slots.iter().all(Option::is_some));
        }
        let own = vantare_domain::relative_vantare::project(&photo, 8, 8, true);
        let all = vantare_domain::relative_vantare::project(&photo, 8, 8, false);
        assert!(all.strip.len() > own.strip.len());
    }
}
