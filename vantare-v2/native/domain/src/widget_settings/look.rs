//! Data-only widget design-system, tone and accent identifiers.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[cfg_attr(feature = "bindings", derive(ts_rs::TS))]
#[cfg_attr(feature = "bindings", ts(rename = "WidgetLook"))]
#[serde(rename_all = "lowercase")]
pub enum Look {
    Eficiencia,
    #[default]
    #[serde(other)]
    Vantare,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[cfg_attr(feature = "bindings", derive(ts_rs::TS))]
#[cfg_attr(feature = "bindings", ts(rename = "WidgetTone"))]
#[serde(rename_all = "lowercase")]
pub enum Tone {
    /// Neo con fondos en escala de grises, sin subtono rojo.
    Neutro,
    #[default]
    #[serde(other)]
    Neo,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[cfg_attr(feature = "bindings", derive(ts_rs::TS))]
#[cfg_attr(feature = "bindings", ts(rename = "WidgetAccent"))]
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
    pub fn from_name(name: &str) -> Option<Self> {
        Self::ALL.iter().copied().find(|l| l.name() == name)
    }
}
