//! Geometría Go portada sobre los ejes neutrales del radar (ahead/right).
//! Falta `Car.velocity_mps` para el filtro de cierre: no se activa voz desde aquí.

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Side {
    Left,
    Right,
}

pub fn classify_position(ahead_m: f64, right_m: f64, existing_overlap: bool) -> Option<Side> {
    if !ahead_m.is_finite() || !right_m.is_finite() || right_m.abs() <= 1.8 || right_m.abs() > 20.0
    {
        return None;
    }
    let length = if existing_overlap {
        5.0
    } else if ahead_m > 0.0 {
        4.9
    } else {
        4.5
    };
    if ahead_m.abs() >= length {
        return None;
    }
    Some(if right_m < 0.0 {
        Side::Left
    } else {
        Side::Right
    })
}
