//! Elecciones del primer arranque; sin red ni detección paralela al Launcher.
mod equipment;
pub use equipment::Equipment;
use vantare_ui::{Kind, performance::Level};

pub const SAY: [&str; 7] = [
    "Soy Vanta. Te ayudo a configurar Vantare en menos de un minuto.",
    "He detectado Le Mans Ultimate en tu PC.",
    "Elige cómo corres y te propongo los widgets.",
    "Inicia sesión para conectar tu cuenta. Tu configuración se guarda en este PC.",
    "Recomiendo Automático: ajusta el rendimiento según tu PC.",
    usage_say(false),
    "Configuración completa.",
];
/// Bocadillo del paso de privacidad: sigue al interruptor y nunca dice
/// «desactivados» con el permiso ya activado.
pub const fn usage_say(on: bool) -> &'static str {
    if on {
        "Datos de uso activados. Son anónimos."
    } else {
        "Los datos de uso están desactivados. Puedes activarlos si quieres."
    }
}
/// Bocadillo del interruptor de informes de fallos: sigue al interruptor.
pub const fn crash_say(on: bool) -> &'static str {
    if on {
        "Informes de fallos activados. Son anónimos."
    } else {
        "Informes de fallos desactivados."
    }
}
pub const STY: [&str; 4] = [
    "Para carreras online: Standings, Relative, Delta y Banderas.",
    "Para ligas añado el widget Duelo.",
    "Para resistencia añado Combustible y Clima.",
    "Para streaming añado Torre de TV, Mapa y Pedals.",
];
pub const STY_NAMES: [&str; 4] = ["Carreras online", "Ligas", "Resistencia", "Streaming"];
pub const ORDER: [Kind; 10] = [
    Kind::Standings,
    Kind::Relative,
    Kind::Delta,
    Kind::Pedals,
    Kind::RacingFlags,
    Kind::HeadToHead,
    Kind::FuelStrategy,
    Kind::TrackWeather,
    Kind::BroadcastTower,
    Kind::TrackMap,
];
const KITS: [&[Kind]; 4] = [
    &[
        Kind::Standings,
        Kind::Relative,
        Kind::Delta,
        Kind::RacingFlags,
    ],
    &[
        Kind::Standings,
        Kind::Relative,
        Kind::Delta,
        Kind::RacingFlags,
        Kind::HeadToHead,
    ],
    &[
        Kind::Standings,
        Kind::Relative,
        Kind::Delta,
        Kind::RacingFlags,
        Kind::FuelStrategy,
        Kind::TrackWeather,
    ],
    &[
        Kind::BroadcastTower,
        Kind::TrackMap,
        Kind::Pedals,
        Kind::HeadToHead,
    ],
];
pub fn position(kind: Kind) -> (f32, f32) {
    match kind {
        Kind::Standings => (60.0, 70.0),
        Kind::Relative => (690.0, 770.0),
        Kind::Delta => (730.0, 70.0),
        Kind::RacingFlags => (580.0, 70.0),
        Kind::Pedals => (1580.0, 760.0),
        Kind::BroadcastTower => (1500.0, 70.0),
        Kind::HeadToHead => (730.0, 480.0),
        Kind::FuelStrategy => (60.0, 550.0),
        Kind::TrackWeather => (60.0, 850.0),
        Kind::TrackMap => (1350.0, 550.0),
        _ => (60.0, 480.0),
    }
}

pub fn free(kind: Kind) -> bool {
    matches!(
        kind,
        Kind::Standings | Kind::Relative | Kind::Delta | Kind::Pedals
    )
}
pub fn label(kind: Kind) -> &'static str {
    match kind {
        Kind::FuelStrategy => "Combustible",
        Kind::TrackWeather => "Clima",
        Kind::BroadcastTower => "Torre de TV",
        Kind::TrackMap => "Mapa",
        Kind::HeadToHead => "Duelo",
        Kind::RacingFlags => "Banderas",
        Kind::Pedals => "Pedals",
        _ => kind.label(),
    }
}

#[derive(Clone, Debug)]
pub struct Choices {
    pub simulators: [bool; 2],
    pub styles: [bool; 4],
    pub level: Level,
    pub automatic: bool,
    pub usage: bool,
    pub crashes: bool,
}
impl Default for Choices {
    fn default() -> Self {
        Self {
            simulators: [true, false],
            styles: [true, false, false, false],
            level: Level::Balanced,
            automatic: true,
            usage: false,
            // Decisión 15-oct (#1628): fallos encendidos con el aviso visible y
            // la salida apagada sin guardar siempre disponible.
            crashes: true,
        }
    }
}
impl Choices {
    /// Automático resuelve una cadencia existente; no mide ni cambia el juego.
    pub fn select_automatic(&mut self, equipment: &Equipment) {
        self.automatic = true;
        self.level = equipment.recommended_level();
    }
    pub fn can_advance(&self, step: usize) -> bool {
        match step {
            1 => self.simulators.iter().any(|on| *on),
            2 => self.styles.iter().any(|on| *on),
            _ => true,
        }
    }
    pub fn kit(&self) -> Vec<Kind> {
        ORDER
            .into_iter()
            .filter(|kind| {
                self.styles
                    .iter()
                    .zip(KITS)
                    .any(|(on, kit)| *on && kit.contains(kind))
            })
            .collect()
    }
    pub fn widgets_summary(&self) -> String {
        let kit = self.kit();
        let pro = kit.iter().filter(|kind| !free(**kind)).count();
        format!(
            "{} widgets{}",
            kit.len(),
            if pro == 0 {
                String::new()
            } else {
                format!(" · {pro} Pro")
            }
        )
    }
    pub fn simulator_reaction(&self, index: usize) -> &'static str {
        if !self.can_advance(1) {
            "Selecciona al menos un simulador."
        } else if !self.simulators[index] {
            "Simulador quitado."
        } else if index == 1 {
            "ACC añadido."
        } else {
            "Le Mans Ultimate añadido."
        }
    }
    pub fn style_reaction(&self, index: usize) -> &'static str {
        if !self.can_advance(2) {
            "Selecciona al menos un estilo."
        } else if self.styles[index] {
            STY[index]
        } else {
            "Widgets quitados."
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn preselected_route_takes_enter_without_enabling_usage() {
        let choices = Choices::default();
        assert!((0..7).all(|step| choices.can_advance(step)));
        assert!(!choices.usage);
        assert!(choices.crashes);
        assert!(choices.automatic);
        assert_eq!(choices.kit(), KITS[0]);
        assert_eq!(choices.widgets_summary(), "4 widgets · 1 Pro");
    }
    #[test]
    fn each_kit_and_union_follow_the_approved_order_without_duplicates() {
        let expected: [&[&str]; 4] = [
            &["Standings", "Relative", "Delta", "Banderas"],
            &["Standings", "Relative", "Delta", "Banderas", "Duelo"],
            &[
                "Standings",
                "Relative",
                "Delta",
                "Banderas",
                "Combustible",
                "Clima",
            ],
            &["Pedals", "Duelo", "Torre de TV", "Mapa"],
        ];
        for (index, expected) in expected.iter().enumerate() {
            let choices = Choices {
                styles: std::array::from_fn(|i| i == index),
                ..Default::default()
            };
            assert_eq!(
                choices.kit().into_iter().map(label).collect::<Vec<_>>(),
                *expected
            );
        }
        let choices = Choices {
            styles: [true; 4],
            ..Default::default()
        };
        assert_eq!(choices.kit(), ORDER);
        assert_eq!(choices.kit().iter().filter(|k| free(**k)).count(), 4);
    }
    #[test]
    fn empty_selections_block_only_their_page() {
        let choices = Choices {
            simulators: [false; 2],
            styles: [false; 4],
            ..Default::default()
        };
        assert!(!choices.can_advance(1));
        assert!(!choices.can_advance(2));
        assert!(choices.can_advance(5));
        assert_eq!(
            choices.simulator_reaction(0),
            "Selecciona al menos un simulador."
        );
        assert_eq!(choices.style_reaction(0), "Selecciona al menos un estilo.");
    }
}
