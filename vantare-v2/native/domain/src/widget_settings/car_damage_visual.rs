//! Stored settings extracted without changing wire bytes or normalization.
#[derive(Clone, Debug, PartialEq, serde::Serialize, serde::Deserialize)]
#[cfg_attr(feature = "bindings", derive(ts_rs::TS))]
#[cfg_attr(feature = "bindings", ts(rename = "CarDamageVisualWidgetSettings"))]
#[serde(default, rename_all = "camelCase")]
pub struct Settings {
    pub show_aero: bool,
    pub view: String,
    pub toggle_key: String,
    pub show_percent: bool,
}
impl Default for Settings {
    fn default() -> Self {
        Self {
            show_aero: true,
            view: "car".into(),
            toggle_key: String::new(),
            show_percent: true,
        }
    }
}
impl Settings {
    pub const UNSUPPORTED: &'static [(&'static str, &'static str)] = &[];
    pub fn toggle_view(&mut self) {
        self.view = if self.view == "numbers" {
            "car"
        } else {
            "numbers"
        }
        .into();
    }
    #[must_use]
    pub fn normalized(&self) -> Self {
        let mut s = self.clone();
        if s.view != "numbers" {
            s.view = "car".into();
        }
        s.toggle_key = s.toggle_key.to_ascii_lowercase();
        if !s
            .toggle_key
            .strip_prefix('f')
            .and_then(|n| n.parse::<u8>().ok())
            .is_some_and(|n| (1..=12).contains(&n))
        {
            s.toggle_key.clear();
        }
        s
    }
}
