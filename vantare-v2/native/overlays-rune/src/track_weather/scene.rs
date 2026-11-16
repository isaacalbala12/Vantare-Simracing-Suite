//! Track weather scene: status, notice, metrics, the two catalogue footprints and
//! the wind arrow. Session label, heading and wet fraction arrive as parameters until
//! the domain presentation PR lands; nothing here parses the formatted values.
use vantare_domain::{
    format::Language,
    track_weather::{Metric, Status, ViewModel},
};

/// Catalogue card: temperatures, wind, water and the forecast strip.
pub const WIDE: (f32, f32) = (280.0, 210.0);
/// Vertical column: the same facts stacked.
pub const VERTICAL: (f32, f32) = (132.0, 440.0);

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Layout {
    Wide,
    Vertical,
}

impl Layout {
    #[must_use]
    pub fn size(self) -> (f32, f32) {
        match self {
            Self::Wide => WIDE,
            Self::Vertical => VERTICAL,
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct Scene {
    pub layout: Layout,
    pub status: Status,
    /// Aviso de la fuente ya en el idioma del usuario (`""` cuando no hay).
    pub status_text: &'static str,
    /// Etiqueta y valor ya formateados por domain, en el orden del productivo.
    pub metrics: Vec<Metric>,
    /// TEMPORAL: etiqueta de sesión tal cual la pintará la tarjeta (sin mayúsculas).
    pub session: String,
    /// TEMPORAL: rumbo del viento en radianes (0 = norte, sentido horario).
    pub wind_heading: Option<f32>,
    /// TEMPORAL: humedad de pista 0–100; `None` sin dato.
    pub wet: Option<f32>,
    /// Banda superior ya resuelta: aviso, PISTA MOJADA/WET TRACK o SECO/DRY.
    pub banner: &'static str,
}

/// Pure sampling: the Look chooses pixels and colours, never these values.
#[must_use]
pub fn sample(
    vm: &ViewModel,
    layout: Layout,
    language: Language,
    session: &str,
    wind_heading: Option<f32>,
    wet: Option<f32>,
) -> Scene {
    let banner = if vm.status != Status::Ready {
        vm.status_text
    } else if wet.is_some_and(|value| value > 0.0) {
        if language == Language::Es {
            "PISTA MOJADA"
        } else {
            "WET TRACK"
        }
    } else if language == Language::Es {
        "SECO"
    } else {
        "DRY"
    };
    Scene {
        layout,
        status: vm.status,
        status_text: vm.status_text,
        metrics: vm.metrics.clone(),
        session: session.to_uppercase(),
        wind_heading,
        wet,
        banner,
    }
}

/// GPUI's wind arrow: seven points around the circle centre (203, 79), turned by
/// `heading_rad` (0 = north/up, clockwise). The Look places them at that centre.
#[must_use]
pub fn arrow(heading_rad: f32) -> [[f32; 2]; 7] {
    let (sin, cos) = heading_rad.sin_cos();
    [
        (0.0, -7.0),
        (4.0, 3.0),
        (1.0, 2.0),
        (1.0, 7.0),
        (-1.0, 7.0),
        (-1.0, 2.0),
        (-4.0, 3.0),
    ]
    .map(|(x, y)| [x * cos - y * sin, x * sin + y * cos])
}

#[cfg(test)]
mod tests {
    use super::*;

    fn vm() -> ViewModel {
        ViewModel {
            status: Status::Ready,
            status_text: "",
            metrics: vec![
                Metric {
                    label: "PISTA",
                    value: "28 °C".into(),
                },
                Metric {
                    label: "SECO",
                    value: "100%".into(),
                },
            ],
        }
    }

    #[test]
    fn each_layout_keeps_its_catalogue_size() {
        assert_eq!(Layout::Wide.size(), (280.0, 210.0));
        assert_eq!(Layout::Vertical.size(), (132.0, 440.0));
    }

    #[test]
    fn the_scene_copies_status_notice_and_metrics_in_order() {
        let scene = sample(
            &vm(),
            Layout::Wide,
            Language::Es,
            "CARRERA",
            Some(0.5),
            Some(25.0),
        );
        assert_eq!(scene.layout, Layout::Wide);
        assert_eq!(scene.status, Status::Ready);
        assert_eq!(scene.status_text, "");
        assert_eq!(scene.session, "CARRERA");
        assert_eq!(scene.wind_heading, Some(0.5));
        assert_eq!(scene.wet, Some(25.0));
        assert_eq!(
            scene
                .metrics
                .iter()
                .map(|metric| (metric.label, metric.value.as_str()))
                .collect::<Vec<_>>(),
            [("PISTA", "28 °C"), ("SECO", "100%")]
        );
        let mut missing = vm();
        missing.status = Status::Missing;
        missing.status_text = "SIN DATOS";
        missing.metrics.clear();
        let scene = sample(&missing, Layout::Vertical, Language::Es, "", None, None);
        assert_eq!(scene.status, Status::Missing);
        assert_eq!(scene.status_text, "SIN DATOS");
        assert!(scene.metrics.is_empty());
    }

    #[test]
    fn the_banner_follows_status_and_wetness_in_the_users_language() {
        let ready = vm();
        assert_eq!(
            sample(&ready, Layout::Wide, Language::Es, "", None, None).banner,
            "SECO"
        );
        assert_eq!(
            sample(&ready, Layout::Wide, Language::En, "", None, Some(0.0)).banner,
            "DRY"
        );
        assert_eq!(
            sample(&ready, Layout::Wide, Language::En, "", None, Some(12.0)).banner,
            "WET TRACK"
        );
        assert_eq!(
            sample(&ready, Layout::Wide, Language::Es, "", None, Some(12.0)).banner,
            "PISTA MOJADA"
        );
        let mut stale = vm();
        stale.status = Status::Stale;
        stale.status_text = "DATOS ANTIGUOS";
        assert_eq!(
            sample(&stale, Layout::Wide, Language::Es, "", None, Some(12.0)).banner,
            "DATOS ANTIGUOS"
        );
    }

    #[test]
    fn a_zero_heading_leaves_the_arrow_pointing_up() {
        let points = arrow(0.0);
        assert_eq!(points[0], [0.0, -7.0]);
        assert_eq!(points[3], [1.0, 7.0]);
    }

    #[test]
    fn a_quarter_turn_points_the_arrow_east_and_keeps_its_length() {
        let points = arrow(std::f32::consts::FRAC_PI_2);
        assert!((points[0][0] - 7.0).abs() < 1e-5);
        assert!(points[0][1].abs() < 1e-5);
        for (original, turned) in [
            ((0.0_f32, -7.0_f32), points[0]),
            ((4.0_f32, 3.0_f32), points[1]),
            ((-4.0_f32, 3.0_f32), points[6]),
        ] {
            let length = original.0.hypot(original.1);
            assert!((turned[0].hypot(turned[1]) - length).abs() < 1e-4);
        }
    }

    #[test]
    fn a_full_turn_matches_no_turn_and_every_point_is_finite() {
        let none = arrow(0.0);
        let full = arrow(std::f32::consts::TAU);
        for (left, right) in none.iter().zip(full) {
            assert!((left[0] - right[0]).abs() < 1e-4);
            assert!((left[1] - right[1]).abs() < 1e-4);
        }
        assert!(arrow(1.234).iter().flatten().all(|value| value.is_finite()));
    }
}
