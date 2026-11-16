//! Car damage visual scene: one 200 × 272 frame with the Car and Values views.
//! Values come from `domain::car_damage_visual`; the settings only pick the view,
//! hide the aero legend and its row, and turn the aero percentage off.
use vantare_domain::{car_damage_visual::ViewModel, format::Language};

/// The single box of both views, as GPUI's `SIZE`.
pub const WIDTH: f32 = 200.0;
/// Height of the only box.
pub const HEIGHT: f32 = 272.0;

/// First row of the values view; each row advances this much.
pub const ROWS_TOP: f32 = 62.0;
/// Row pitch of the values view.
pub const ROW_PITCH: f32 = 43.0;
/// Offset of a row's separator below its top.
pub const SEPARATOR: f32 = 39.0;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum View {
    Car,
    Numbers,
}

impl View {
    #[must_use]
    pub fn from_settings(value: &str) -> Self {
        if value == "numbers" {
            Self::Numbers
        } else {
            Self::Car
        }
    }
    /// El atajo seguirá usando este giro cuando el host entregue la tecla.
    #[allow(dead_code)] // Solo lo usa `toggle_view`, que espera al evento del host.
    #[must_use]
    pub fn toggled(self) -> Self {
        match self {
            Self::Car => Self::Numbers,
            Self::Numbers => Self::Car,
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct Scene {
    pub view: View,
    /// The aero row and its legend (settings, not domain).
    pub show_aero: bool,
    /// Integrity 0–1 per part: aero, body, suspension.
    pub integrity: [Option<f64>; 3],
    /// Remaining tyre grip 0–1, front-left to rear-right.
    pub tyres: [Option<f64>; 4],
    /// Damage percentages already formatted by domain.
    pub percentages: [String; 3],
    /// Wear percentages of the tyres row (`1 − grip`, as GPUI).
    pub tyre_percentages: [String; 4],
    /// `Aero N%`, only with the percentage on and the aero row visible.
    pub aero_legend: Option<String>,
    /// Any part below 0.6 shows the warning band.
    pub band: Option<&'static str>,
    pub heading: &'static str,
    pub tab_car: &'static str,
    pub tab_numbers: &'static str,
    pub labels: [&'static str; 4],
    /// Source status or the integrity caption, already resolved.
    pub status: String,
}

impl Scene {
    /// Rows of the values view, in paint order, after the aero compaction.
    #[must_use]
    pub fn rows(&self) -> Vec<usize> {
        (0..4)
            .filter(|index| self.show_aero || *index != 0)
            .collect()
    }
}

/// Pure sampling: the Look chooses pixels and colours, never these values.
#[must_use]
pub fn sample(vm: &ViewModel, view: View, show_percent: bool, language: Language) -> Scene {
    let es = language == Language::Es;
    let severe = vm.integrity.iter().flatten().any(|value| *value < 0.6);
    // GPUI's local rounding, one step before `format::percent`.
    let percentage = |value: Option<f64>| {
        vantare_domain::format::percent(value.map(|v| (v * 100.0).round() / 100.0))
    };
    let tyre_percentages = vm.tyres.map(|tyre| percentage(tyre.map(|v| 1.0 - v)));
    let aero_legend =
        (show_percent && vm.show_aero).then(|| format!("Aero {}", percentage(vm.integrity[0])));
    let intact = vm.integrity.iter().all(|value| *value == Some(1.0));
    let status = vm.status.map_or_else(
        || match (intact, es) {
            (true, true) => "Coche intacto".to_owned(),
            (true, false) => "Car intact".to_owned(),
            (false, true) => "Integridad del coche".to_owned(),
            (false, false) => "Car integrity".to_owned(),
        },
        str::to_owned,
    );
    Scene {
        view,
        show_aero: vm.show_aero,
        integrity: vm.integrity,
        tyres: vm.tyres,
        percentages: vm.percentages.clone(),
        tyre_percentages,
        aero_legend,
        band: severe.then_some(if es {
            "REVISA EL COCHE"
        } else {
            "CHECK YOUR CAR"
        }),
        heading: if es { "DAÑOS" } else { "DAMAGE" },
        tab_car: if es { "Coche" } else { "Car" },
        tab_numbers: if es { "Cifras" } else { "Values" },
        labels: if es {
            ["Aero", "Carrocería", "Suspensión", "Neumáticos"]
        } else {
            ["Aero", "Body", "Suspension", "Tyres"]
        },
        status,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use vantare_domain::car_damage_visual::ViewModel;

    fn vm() -> ViewModel {
        ViewModel {
            show_aero: true,
            integrity: [Some(0.2), Some(0.7), Some(0.9)],
            tyres: [Some(0.98), Some(0.91), Some(0.87), Some(0.93)],
            status: None,
            damage: [Some(0.8), Some(0.3), Some(0.1)],
            labels: ["AERO", "CARROC.", "SUSP"],
            percentages: ["80%".into(), "30%".into(), "10%".into()],
        }
    }

    #[test]
    fn the_settings_pick_the_view_and_the_toggle_returns_to_the_car() {
        assert_eq!(View::from_settings("numbers"), View::Numbers);
        assert_eq!(View::from_settings("car"), View::Car);
        assert_eq!(View::from_settings("other"), View::Car);
        assert_eq!(View::Numbers.toggled(), View::Car);
        assert_eq!(View::Car.toggled(), View::Numbers);
        assert_eq!(View::Numbers.toggled().toggled(), View::Numbers);
    }

    #[test]
    fn the_scene_copies_the_domain_values_and_formats_the_tyres() {
        let scene = sample(&vm(), View::Numbers, true, Language::Es);
        assert_eq!(scene.percentages, ["80%", "30%", "10%"]);
        assert_eq!(scene.tyre_percentages, ["2%", "9%", "13%", "7%"]);
        assert_eq!(scene.aero_legend.as_deref(), Some("Aero 20%"));
        assert_eq!(scene.band, Some("REVISA EL COCHE"));
        assert_eq!(scene.status, "Integridad del coche");
    }

    #[test]
    fn the_band_needs_a_part_below_sixty_percent() {
        for (integrity, band) in [
            ([Some(1.0); 3], false),
            ([Some(0.6), Some(1.0), Some(1.0)], false),
            ([Some(0.59), Some(1.0), Some(1.0)], true),
            ([None, Some(0.1), None], true),
            ([None; 3], false),
        ] {
            let mut view = vm();
            view.integrity = integrity;
            assert_eq!(
                sample(&view, View::Car, true, Language::Es).band.is_some(),
                band
            );
        }
    }

    #[test]
    fn hidden_aero_compacts_the_rows_and_removes_the_legend() {
        let mut view = vm();
        view.show_aero = false;
        let scene = sample(&view, View::Numbers, true, Language::Es);
        assert_eq!(scene.rows(), [1, 2, 3]);
        assert_eq!(scene.aero_legend, None);
        assert_eq!(scene.labels[1], "Carrocería");
        assert_eq!(scene.tyre_percentages[0], "2%", "las ruedas siguen ahí");
    }

    #[test]
    fn the_percentage_setting_only_hides_the_aero_legend() {
        let scene = sample(&vm(), View::Car, false, Language::Es);
        assert_eq!(scene.aero_legend, None);
        assert_eq!(scene.percentages, ["80%", "30%", "10%"]);
    }

    #[test]
    fn english_words_and_the_intact_car_caption() {
        let mut view = vm();
        view.integrity = [Some(1.0); 3];
        let scene = sample(&view, View::Car, true, Language::En);
        assert_eq!(scene.heading, "DAMAGE");
        assert_eq!(scene.tab_car, "Car");
        assert_eq!(scene.tab_numbers, "Values");
        assert_eq!(scene.labels[3], "Tyres");
        assert_eq!(scene.status, "Car intact");
        assert_eq!(scene.aero_legend.as_deref(), Some("Aero 100%"));
    }

    #[test]
    fn a_source_status_wins_over_the_integrity_caption() {
        let mut view = vm();
        view.status = Some("DATOS ANTIGUOS");
        view.integrity = [None; 3];
        assert_eq!(
            sample(&view, View::Car, true, Language::Es).status,
            "DATOS ANTIGUOS"
        );
        view.status = Some("DATA OUT OF DATE");
        assert_eq!(
            sample(&view, View::Car, true, Language::En).status,
            "DATA OUT OF DATE"
        );
    }
}
