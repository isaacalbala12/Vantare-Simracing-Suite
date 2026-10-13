//! Perfil privado del piloto (#1612): datos de vista, catálogos y recorte.
//!
//! El editor solo maneja texto y la selección del recorte. El modelo
//! persistente (`services::pilot::PilotProfile`), la foto JPEG 256×256, sus
//! límites y la sincronización son de servicios: el propietario convierte su
//! perfil en [`Draft`] y recibe [`view::PilotEvent`]. Ver `pilot/README.md`.

pub mod view;

/// Máximo de caracteres del nombre público (propuesta de UI; manda servicios).
pub const NAME_MAX: usize = 32;
/// Máximo de caracteres de la descripción corta.
pub const DESCRIPTION_MAX: usize = 160;
/// Máximo de caracteres de coche o equipo favorito.
pub const FAVORITE_MAX: usize = 48;

/// Campos editables del perfil; foto y `extensions` quedan fuera a propósito.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct Draft {
    pub public_name: String,
    pub description: String,
    /// ISO 3166-1 alfa-2 en mayúsculas.
    pub country: Option<String>,
    /// Identificadores de [`SIMULATORS`], en el orden del catálogo.
    pub simulators: Vec<String>,
    pub favorite_car: String,
    pub favorite_team: String,
}

impl Draft {
    /// Primer problema que impide guardar, redactado para el piloto.
    pub fn problem(&self) -> Option<&'static str> {
        let count = |value: &str| value.trim().chars().count();
        if self.public_name.trim().is_empty() {
            Some("Escribe un nombre público.")
        } else if count(&self.public_name) > NAME_MAX {
            Some("El nombre público admite 32 caracteres.")
        } else if count(&self.description) > DESCRIPTION_MAX {
            Some("La descripción admite 160 caracteres.")
        } else if count(&self.favorite_car) > FAVORITE_MAX
            || count(&self.favorite_team) > FAVORITE_MAX
        {
            Some("Coche y equipo favoritos admiten 48 caracteres.")
        } else {
            None
        }
    }

    /// Copia con espacios recortados, lista para entregar a servicios.
    #[must_use]
    pub fn trimmed(&self) -> Self {
        Self {
            public_name: self.public_name.trim().into(),
            description: self.description.trim().into(),
            country: self.country.clone(),
            simulators: self.simulators.clone(),
            favorite_car: self.favorite_car.trim().into(),
            favorite_team: self.favorite_team.trim().into(),
        }
    }
}

/// Simuladores ofrecidos: identificador estable y nombre visible.
pub const SIMULATORS: &[(&str, &str)] = &[
    ("lmu", "Le Mans Ultimate"),
    ("iracing", "iRacing"),
    ("acc", "Assetto Corsa Competizione"),
    ("ac-evo", "Assetto Corsa EVO"),
    ("ac", "Assetto Corsa"),
    ("ams2", "Automobilista 2"),
    ("rf2", "rFactor 2"),
    ("r3e", "RaceRoom"),
    ("f1", "EA SPORTS F1"),
    ("gt7", "Gran Turismo 7"),
];

/// Nombre visible de un simulador; los desconocidos se muestran tal cual.
pub fn simulator_label(id: &str) -> &str {
    SIMULATORS
        .iter()
        .find(|(known, _)| *known == id)
        .map_or(id, |(_, label)| label)
}

/// Países del selector, por nombre en español.
///
/// ponytail: lista corta de los países más habituales en simracing; pasar a
/// la lista ISO completa si un piloto no encuentra el suyo.
pub const COUNTRIES: &[(&str, &str)] = &[
    ("DE", "Alemania"),
    ("AR", "Argentina"),
    ("AU", "Australia"),
    ("AT", "Austria"),
    ("BE", "Bélgica"),
    ("BR", "Brasil"),
    ("BG", "Bulgaria"),
    ("CA", "Canadá"),
    ("CL", "Chile"),
    ("CN", "China"),
    ("CO", "Colombia"),
    ("KR", "Corea del Sur"),
    ("HR", "Croacia"),
    ("DK", "Dinamarca"),
    ("SK", "Eslovaquia"),
    ("SI", "Eslovenia"),
    ("ES", "España"),
    ("US", "Estados Unidos"),
    ("EE", "Estonia"),
    ("FI", "Finlandia"),
    ("FR", "Francia"),
    ("GR", "Grecia"),
    ("HU", "Hungría"),
    ("IN", "India"),
    ("ID", "Indonesia"),
    ("IE", "Irlanda"),
    ("IT", "Italia"),
    ("JP", "Japón"),
    ("LV", "Letonia"),
    ("LT", "Lituania"),
    ("LU", "Luxemburgo"),
    ("MX", "México"),
    ("MC", "Mónaco"),
    ("NO", "Noruega"),
    ("NZ", "Nueva Zelanda"),
    ("NL", "Países Bajos"),
    ("PE", "Perú"),
    ("PL", "Polonia"),
    ("PT", "Portugal"),
    ("GB", "Reino Unido"),
    ("CZ", "República Checa"),
    ("RO", "Rumanía"),
    ("SE", "Suecia"),
    ("CH", "Suiza"),
    ("TH", "Tailandia"),
    ("TR", "Turquía"),
    ("UA", "Ucrania"),
    ("UY", "Uruguay"),
];

/// Nombre en español de un código ISO; un código fuera de la lista se muestra tal cual.
pub fn country_label(code: &str) -> &str {
    COUNTRIES
        .iter()
        .find(|(known, _)| known.eq_ignore_ascii_case(code))
        .map_or(code, |(_, label)| label)
}

/// Lado mínimo del recorte respecto al lado corto (zoom máximo ×4).
pub const CROP_MIN_SIDE: f32 = 0.25;

/// Recorte cuadrado normalizado de la foto original.
///
/// `x` e `y` son la esquina superior izquierda en fracción del ancho y del
/// alto; `side` es el lado en fracción del lado corto. Así el cuadrado es
/// cuadrado en píxeles: `side * min(ancho, alto)`.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Crop {
    pub x: f32,
    pub y: f32,
    pub side: f32,
}

impl Crop {
    /// Cuadrado máximo centrado.
    pub fn centered(width: u32, height: u32) -> Self {
        Self {
            x: 0.0,
            y: 0.0,
            side: 1.0,
        }
        .centered_on(0.5, 0.5, width, height)
    }

    /// Lado en fracción del ancho y del alto.
    #[allow(clippy::cast_precision_loss)] // Fotos ≤ 4096 px: exactas en f32.
    pub fn extent(self, width: u32, height: u32) -> (f32, f32) {
        let (w, h) = (width.max(1) as f32, height.max(1) as f32);
        let short = w.min(h);
        (self.side * short / w, self.side * short / h)
    }

    /// Desplaza en fracciones del ancho y del alto, sin salir de la imagen.
    #[must_use]
    pub fn moved(self, dx: f32, dy: f32, width: u32, height: u32) -> Self {
        Self {
            x: self.x + dx,
            y: self.y + dy,
            ..self
        }
        .clamped(width, height)
    }

    /// Cambia el lado conservando el centro; `factor` > 1 acerca.
    #[must_use]
    pub fn zoomed(self, factor: f32, width: u32, height: u32) -> Self {
        let (ew, eh) = self.extent(width, height);
        let (cx, cy) = (self.x + ew / 2.0, self.y + eh / 2.0);
        Self {
            side: (self.side / factor.max(f32::EPSILON)).clamp(CROP_MIN_SIDE, 1.0),
            ..self
        }
        .centered_on(cx, cy, width, height)
    }

    fn centered_on(self, cx: f32, cy: f32, width: u32, height: u32) -> Self {
        let (ew, eh) = self.extent(width, height);
        Self {
            x: cx - ew / 2.0,
            y: cy - eh / 2.0,
            ..self
        }
        .clamped(width, height)
    }

    fn clamped(self, width: u32, height: u32) -> Self {
        let side = if self.side.is_finite() {
            self.side.clamp(CROP_MIN_SIDE, 1.0)
        } else {
            1.0
        };
        let (ew, eh) = Self { side, ..self }.extent(width, height);
        let finite = |value: f32| if value.is_finite() { value } else { 0.0 };
        Self {
            x: finite(self.x).clamp(0.0, 1.0 - ew),
            y: finite(self.y).clamp(0.0, 1.0 - eh),
            side,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn close(a: f32, b: f32) -> bool {
        (a - b).abs() < 1e-5
    }

    #[test]
    fn centered_crop_uses_the_short_side() {
        let crop = Crop::centered(400, 200);
        assert!(close(crop.side, 1.0));
        assert!(close(crop.x, 0.25) && close(crop.y, 0.0));
        let (ew, eh) = crop.extent(400, 200);
        assert!(close(ew * 400.0, eh * 200.0), "cuadrado en píxeles");
    }

    #[test]
    fn moving_never_leaves_the_image() {
        let crop = Crop::centered(400, 200).moved(10.0, -10.0, 400, 200);
        assert!(close(crop.x, 0.5) && close(crop.y, 0.0));
        let crop = Crop::centered(400, 200).moved(f32::NAN, 0.0, 400, 200);
        assert!(close(crop.x, 0.0));
    }

    #[test]
    fn zoom_keeps_the_centre_and_its_limits() {
        let crop = Crop::centered(300, 300).zoomed(2.0, 300, 300);
        assert!(close(crop.side, 0.5) && close(crop.x, 0.25) && close(crop.y, 0.25));
        let crop = crop.zoomed(100.0, 300, 300);
        assert!(close(crop.side, CROP_MIN_SIDE));
        let crop = crop.zoomed(0.01, 300, 300);
        assert!(close(crop.side, 1.0) && close(crop.x, 0.0));
    }

    #[test]
    fn draft_reports_the_first_blocking_problem() {
        let mut draft = Draft {
            public_name: "  ".into(),
            ..Draft::default()
        };
        assert_eq!(draft.problem(), Some("Escribe un nombre público."));
        draft.public_name = "Isaac".into();
        assert_eq!(draft.problem(), None);
        draft.description = "ñ".repeat(DESCRIPTION_MAX);
        assert_eq!(draft.problem(), None, "cuenta caracteres, no bytes");
        draft.description.push('x');
        assert!(draft.problem().is_some());
    }

    #[test]
    fn catalogue_labels_fall_back_to_the_raw_value() {
        assert_eq!(country_label("es"), "España");
        assert_eq!(country_label("ZZ"), "ZZ");
        assert_eq!(simulator_label("lmu"), "Le Mans Ultimate");
        assert_eq!(simulator_label("otro"), "otro");
    }
}
