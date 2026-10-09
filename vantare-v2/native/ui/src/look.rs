//! Aspectos del producto. El contenido y su proyección no dependen de Look.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Look {
    Eficiencia,
    #[default]
    #[serde(other)]
    Vantare,
}
impl Look {
    pub const ALL: &'static [Self] = &[Self::Eficiencia, Self::Vantare];
    pub fn has_variants(self) -> bool {
        matches!(self, Self::Vantare)
    }
    pub fn legacy(self) -> bool {
        matches!(self, Self::Eficiencia)
    }
}

impl Look {
    pub(crate) fn workshop_defaults(self, kind: crate::Kind) -> crate::Settings {
        use crate::standings::DesignSystem;
        use crate::workshop::default_columns;
        use crate::{Kind, Settings};
        match (kind, self) {
            (Kind::Standings, DesignSystem::Vantare) => {
                Settings::Standings(crate::standings::Settings {
                    row_count: 8,
                    columns: Some(crate::standings::vantare_template("standard")),
                    brand_visible: Some(true),
                    ..Default::default()
                })
            }
            (Kind::Standings, DesignSystem::Eficiencia) => {
                Settings::Standings(crate::standings::Settings {
                    row_count: 10,
                    columns: Some(default_columns(Kind::Standings)),
                    player_window: true,
                    window_around: 4,
                    class_scope: "all-classes".into(),
                    brand_visible: Some(true),
                    ..crate::standings::Settings::eficiencia()
                })
            }
            (Kind::Relative, DesignSystem::Vantare) => {
                Settings::Relative(crate::relative::Settings {
                    columns: Some(crate::relative::vantare_template("standard")),
                    brand_visible: Some(true),
                    ..Default::default()
                })
            }
            (Kind::FuelStrategy, DesignSystem::Vantare) => {
                Settings::FuelStrategy(crate::fuel_strategy::Settings {
                    brand_visible: Some(true),
                    ..Default::default()
                })
            }
            (Kind::Delta, DesignSystem::Vantare) => Settings::Delta(crate::delta::Settings {
                brand_visible: Some(true),
                ..Default::default()
            }),
            (Kind::Delta, DesignSystem::Eficiencia) => {
                Settings::Delta(crate::delta::Settings::eficiencia())
            }
            (Kind::FuelStrategy, DesignSystem::Eficiencia) => {
                Settings::FuelStrategy(crate::fuel_strategy::Settings::eficiencia())
            }
            (Kind::Relative, DesignSystem::Eficiencia) => {
                Settings::Relative(crate::relative::Settings {
                    columns: Some(default_columns(Kind::Relative)),
                    ..crate::relative::Settings::eficiencia()
                })
            }
            _ => Settings::default_for(kind),
        }
    }
}

impl Look {
    pub fn name(self) -> &'static str {
        match self {
            Self::Eficiencia => "eficiencia",
            Self::Vantare => "vantare",
        }
    }
    pub fn label(self) -> &'static str {
        match self {
            Self::Eficiencia => "Eficiencia",
            Self::Vantare => "Vantare",
        }
    }
    pub fn from_name(name: &str) -> Option<Self> {
        Self::ALL.iter().copied().find(|l| l.name() == name)
    }
}
impl crate::Settings {
    pub fn look(&self) -> Option<Look> {
        match self {
            Self::Standings(s) => Some(s.design_system),
            Self::Relative(s) => Some(s.design_system),
            Self::Delta(s) => Some(s.design_system),
            Self::FuelStrategy(s) => Some(s.design_system),
            _ => None,
        }
    }
    pub fn set_look(&mut self, look: Look) {
        match self {
            Self::Standings(s) => s.design_system = look,
            Self::Relative(s) => s.design_system = look,
            Self::Delta(s) => s.design_system = look,
            Self::FuelStrategy(s) => s.design_system = look,
            _ => {}
        }
    }
    pub fn look_change(&self, next: &Self) -> Option<Look> {
        if !matches!(self, Self::Standings(_)) {
            return None;
        }
        let look = next.look()?;
        if self.look() == Some(look) {
            return None;
        }
        let mut expected = self.clone();
        expected.set_look(look);
        (expected == *next).then_some(look)
    }
}
