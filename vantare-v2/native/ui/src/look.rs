//! Aspectos del producto. El contenido y su proyección no dependen de Look.
use crate::widget_settings::WorkshopSettings as _;
pub use vantare_domain::widget_settings::look::Look;
/// Estilo Vantare del catálogo r10b.
pub use vantare_domain::widget_settings::look::Tone;

/// Acento Vantare: fila propia, bordes y énfasis.
pub use vantare_domain::widget_settings::look::Accent;

pub(crate) trait WorkshopLook {
    fn choices() -> Vec<(&'static str, &'static str)>;
    fn workshop_defaults(self, kind: crate::Kind) -> crate::Settings;
}
impl WorkshopLook for Look {
    fn choices() -> Vec<(&'static str, &'static str)> {
        let mut looks = Self::ALL.to_vec();
        looks.sort_by_key(|look| *look != Self::default());
        looks
            .into_iter()
            .map(|look| (look.name(), look.label()))
            .collect()
    }

    fn workshop_defaults(self, kind: crate::Kind) -> crate::Settings {
        use crate::{Kind, Settings};
        match kind {
            Kind::Standings => {
                Settings::Standings(crate::standings::Settings::workshop_defaults(self))
            }
            Kind::Relative => {
                Settings::Relative(crate::relative::Settings::workshop_defaults(self))
            }
            Kind::Delta => Settings::Delta(crate::delta::Settings::workshop_defaults(self)),
            Kind::FuelStrategy => {
                Settings::FuelStrategy(crate::fuel_strategy::Settings::workshop_defaults(self))
            }
            Kind::Pedals => Settings::Pedals(crate::pedals::Settings::workshop_defaults(self)),
            _ => Settings::default_for(kind),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn delta_migrates_before_switch_and_stays_canonical_on_disk() {
        let old: crate::Settings = serde_json::from_str(
            r#"{"kind":"delta","designSystem":"eficiencia","reference":"optimal"}"#,
        )
        .expect("Delta v0");
        let mut settings = old.clone();
        settings.set_look(Look::Vantare);
        assert_eq!(old.look_change(&settings), Some(Look::Vantare));
        let crate::Settings::Delta(delta) = &settings else {
            panic!("Delta");
        };
        assert_eq!(delta.reference, "best");
        assert_eq!(delta.content_version, 1);
        let layout = crate::layout::Layout {
            instances: vec![crate::layout::Instance {
                off_track: crate::layout::OffTrack::default(),
                id: "delta".into(),
                x: 0.0,
                y: 0.0,
                visible: true,
                show_in: crate::session::ShowIn::default(),
                opacity: 1.0,
                geometry: crate::geometry::Geometry::default(),
                settings,
            }],
            ..Default::default()
        };
        let path = std::env::temp_dir().join(format!(
            "vantare-1531-delta-save-{}.json",
            std::process::id()
        ));
        let mut document = crate::layout::Document::open(path.clone()).expect("documento");
        document.save(&layout).expect("guardar");
        let bytes = std::fs::read(&path).expect("leer lo guardado");
        let restored = crate::layout::Layout::from_json(&bytes).expect("layout canónico");
        let crate::Settings::Delta(delta) = &restored.instances[0].settings else {
            panic!("Delta");
        };
        assert_eq!(delta.reference, "best");
        assert_eq!(delta.design_system, Look::Vantare);
        assert_eq!(delta.content_version, 1);
        std::fs::remove_file(path).expect("limpiar fichero propio de test");
    }
    #[test]
    fn explicit_current_delta_reference_survives_all_looks() {
        let mut settings = crate::Settings::Delta(crate::delta::Settings {
            reference: "leader".into(),
            ..Default::default()
        });
        for &look in Look::ALL {
            settings.set_look(look);
            let crate::Settings::Delta(s) = &settings else {
                panic!("Delta");
            };
            assert_eq!(s.reference, "leader");
        }
    }
    #[test]
    fn workshop_choices_and_presets_keep_the_existing_content() {
        assert_eq!(
            Look::choices(),
            [("vantare", "Vantare"), ("eficiencia", "Eficiencia")]
        );
        for &look in Look::ALL {
            for kind in [
                crate::Kind::Standings,
                crate::Kind::Relative,
                crate::Kind::Delta,
                crate::Kind::FuelStrategy,
            ] {
                let settings = look.workshop_defaults(kind);
                assert_eq!(settings.look(), Some(look));
                assert_eq!(settings.normalized(), settings);
                match settings {
                    crate::Settings::Standings(s) => {
                        assert_eq!(s.row_count, if look == Look::Vantare { 8 } else { 10 });
                        assert!(s.columns.is_some());
                    }
                    crate::Settings::Relative(s) => {
                        assert_eq!((s.range_ahead, s.range_behind), (3, 3));
                        assert!(s.columns.is_some());
                    }
                    crate::Settings::Delta(s) => assert_eq!(s.reference, "best"),
                    crate::Settings::FuelStrategy(s) => {
                        assert_eq!(s.history_rows, 4);
                        assert!(s.show_projection);
                    }
                    _ => panic!("widget con Looks"),
                }
            }
        }
    }
}
