//! Stored settings extracted without changing wire bytes or normalization.
#[derive(Clone, Debug, PartialEq, serde::Serialize, serde::Deserialize)]
#[cfg_attr(feature = "bindings", derive(ts_rs::TS))]
#[cfg_attr(feature = "bindings", ts(rename = "SessionAlertsWidgetSettings"))]
#[serde(default, rename_all = "camelCase")]
#[allow(clippy::struct_excessive_bools)]
pub struct Settings {
    pub thresholds: Vec<u8>,
    pub session: bool,
    pub calendar: bool,
    pub finished: bool,
    pub starts: bool,
    pub duration_seconds: u8,
    pub sound: bool,
    pub volume: u8,
    pub sound_zero: bool,
    pub mini: bool,
    pub mini_session: bool,
    pub mini_final: bool,
    pub mini_calendar: bool,
    pub mini_start: bool,
    pub mini_limit: u8,
    pub mini_size: String,
    /// La mini es otra instancia del mismo widget, unida al aviso por ID.
    pub companion_for: Option<String>,
    pub style: String,
}
impl Default for Settings {
    fn default() -> Self {
        Self {
            thresholds: vec![5, 1],
            session: true,
            calendar: true,
            finished: true,
            starts: true,
            duration_seconds: 8,
            sound: true,
            volume: 70,
            sound_zero: false,
            mini: true,
            mini_session: true,
            mini_final: true,
            mini_calendar: true,
            mini_start: true,
            mini_limit: 3,
            mini_size: "m".into(),
            companion_for: None,
            style: "neo".into(),
        }
    }
}
impl Settings {
    pub const UNSUPPORTED: &'static [(&'static str, &'static str)] = &[];
    #[must_use]
    pub fn normalized(&self) -> Self {
        let mut s = self.clone();
        s.thresholds.retain(|n| (1..=60).contains(n));
        s.thresholds.sort_unstable_by(|a, b| b.cmp(a));
        s.thresholds.dedup();
        s.thresholds.truncate(5);
        s.duration_seconds = s.duration_seconds.clamp(4, 15);
        s.volume = s.volume.min(100);
        s.mini_limit = s.mini_limit.clamp(1, 3);

        if !["neo", "carmin", "limpio", "transparente"].contains(&s.style.as_str()) {
            s.style = "neo".into();
        }
        if !["s", "m", "l"].contains(&s.mini_size.as_str()) {
            s.mini_size = "m".into();
        }
        s
    }
    pub fn set_threshold(&mut self, index: usize, minutes: u8) {
        self.thresholds
            .resize(index.max(self.thresholds.len().saturating_sub(1)) + 1, 0);
        self.thresholds[index] = minutes;
        *self = self.normalized();
    }
}
