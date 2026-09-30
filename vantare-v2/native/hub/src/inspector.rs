//! Capacidades verificadas en los constructores de ui, no un catálogo alternativo.
use vantare_ui::Settings;

#[derive(Clone, Copy)]
pub enum Control {
    Header,
    Footer,
    Brand,
    FooterFirst,
    FooterSecond,
}
impl Control {
    pub fn rows(settings: &Settings) -> Vec<(Self, String)> {
        let Settings::Standings(value) = settings else {
            return vec![];
        };
        vec![
            (
                Self::Header,
                format!("Cabecera: {}", value.show_session_header),
            ),
            (Self::Footer, format!("Pie: {}", value.show_session_footer)),
            (
                Self::Brand,
                format!(
                    "Marca: {}",
                    match value.brand_visible {
                        None => "automática",
                        Some(true) => "visible",
                        Some(false) => "oculta",
                    }
                ),
            ),
            (
                Self::FooterFirst,
                format!("Pie 1: {}", metric_label(&value.footer_first)),
            ),
            (
                Self::FooterSecond,
                format!("Pie 2: {}", metric_label(&value.footer_second)),
            ),
        ]
    }
    pub fn title(self) -> &'static str {
        match self {
            Self::Header => "Cabecera de sesión",
            Self::Footer => "Pie de sesión",
            Self::Brand => "Marca",
            Self::FooterFirst => "Primera métrica del pie",
            Self::FooterSecond => "Segunda métrica del pie",
        }
    }
    pub fn label(self) -> &'static str {
        match self {
            Self::Header => "Mostrar / ocultar cabecera",
            Self::Footer => "Mostrar / ocultar pie",
            Self::Brand => "Cambiar marca",
            Self::FooterFirst => "Elegir métrica de pie 1",
            Self::FooterSecond => "Elegir métrica de pie 2",
        }
    }
    pub fn apply(self, settings: &mut Settings) {
        if let Settings::Standings(value) = settings {
            match self {
                Self::Header => value.show_session_header = !value.show_session_header,
                Self::Footer => value.show_session_footer = !value.show_session_footer,
                Self::Brand => {
                    value.brand_visible = match value.brand_visible {
                        None => Some(false),
                        Some(false) => Some(true),
                        Some(true) => None,
                    }
                }
                Self::FooterFirst => value.footer_first = next_metric(&value.footer_first).into(),
                Self::FooterSecond => {
                    value.footer_second = next_metric(&value.footer_second).into();
                }
            }
        }
    }
}
fn next_metric(value: &str) -> &'static str {
    match value {
        "none" => "track",
        "track" => "estimatedLaps",
        _ => "none",
    }
}
fn metric_label(value: &str) -> String {
    if ["none", "track", "estimatedLaps"].contains(&value) {
        value.into()
    } else {
        format!("{value} (pendiente; elegir none / track / estimatedLaps)")
    }
}

/// Filas sin manejador ni foco: las opciones solo persistidas no se pueden editar.
pub fn pending(settings: &Settings) -> Vec<String> {
    let rows = match settings {
        Settings::Standings(value) => vec![
            format!("Plantilla: {}", value.template_id),
            format!(
                "Métricas de cabecera: {}, {}",
                value.header_first, value.header_second
            ),
            format!("Marca legacy (showBrand): {}", value.show_brand),
            format!("Slots alternativos del pie: {:?}", value.footer_slots),
        ],
        Settings::Delta(value) => vec![format!("Plantilla: {}", value.template_id)],
        Settings::Pedals(value) => vec![format!(
            "Fondo transparente: {}",
            value.transparent_background
        )],
        Settings::BroadcastTower(value) => {
            vec![format!("Carrusel de pilotos: {}", value.driver_carousel)]
        }
        Settings::PedalsTelemetry(value) => vec![format!("Volante: {}", value.steering_wheel)],
        Settings::RacingFlags(value) => vec![format!("Color del texto: {}", value.text_color)],
        Settings::HeadToHead(value) => vec![format!("Objetivo: {}", value.target)],
        _ => vec![],
    };
    rows.into_iter()
        .map(|row| format!("{row} · pendiente"))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use vantare_ui::Kind;
    #[test]
    fn applied_controls_edit_typed_settings_and_preserve_unimplemented_fields() {
        let mut settings = Settings::default_for(Kind::Standings);
        if let Settings::Standings(value) = &mut settings {
            value.template_id = "broadcast".into();
            value.header_first = "rain".into();
            value.footer_slots = Some(vec!["rain".into()]);
        }
        Control::Header.apply(&mut settings);
        Control::Footer.apply(&mut settings);
        Control::Brand.apply(&mut settings);
        Control::FooterFirst.apply(&mut settings);
        Control::FooterSecond.apply(&mut settings);
        let Settings::Standings(value) = &settings else {
            panic!("tipo conservado");
        };
        assert!(!value.show_session_header);
        assert!(!value.show_session_footer);
        assert_eq!(value.brand_visible, Some(false));
        assert_eq!(value.footer_first, "estimatedLaps");
        assert_eq!(value.footer_second, "none");
        assert_eq!(value.template_id, "broadcast");
        assert_eq!(value.header_first, "rain");
        assert_eq!(value.footer_slots, Some(vec!["rain".into()]));
        for kind in Kind::ALL {
            let settings = Settings::default_for(*kind);
            if *kind != Kind::Standings {
                assert!(Control::rows(&settings).is_empty());
            }
            assert!(
                pending(&settings)
                    .iter()
                    .all(|row| row.contains("pendiente"))
            );
        }
        for kind in [
            Kind::Delta,
            Kind::Pedals,
            Kind::BroadcastTower,
            Kind::PedalsTelemetry,
            Kind::RacingFlags,
            Kind::HeadToHead,
        ] {
            assert!(!pending(&Settings::default_for(kind)).is_empty());
        }
    }
}
