//! Data-only widget design-system, tone and accent identifiers.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Look {
    Eficiencia,
    #[default]
    #[serde(other)]
    Vantare,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Tone {
    /// Neo con fondos en escala de grises, sin subtono rojo.
    Neutro,
    #[default]
    #[serde(other)]
    Neo,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Accent {
    Amber,
    Green,
    White,
    #[default]
    #[serde(other)]
    Red,
}

impl Tone {
    pub fn name(self) -> &'static str {
        match self {
            Self::Neo => "neo",
            Self::Neutro => "neutro",
        }
    }
    pub fn from_name(name: &str) -> Self {
        if name == "neutro" {
            Self::Neutro
        } else {
            Self::Neo
        }
    }
}

impl Look {
    pub const ALL: &'static [Self] = &[Self::Eficiencia, Self::Vantare];
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
    pub fn choices() -> Vec<(&'static str, &'static str)> {
        let mut looks = Self::ALL.to_vec();
        looks.sort_by_key(|look| *look != Self::default());
        looks
            .into_iter()
            .map(|look| (look.name(), look.label()))
            .collect()
    }
    pub fn from_name(name: &str) -> Option<Self> {
        Self::ALL.iter().copied().find(|l| l.name() == name)
    }
}
