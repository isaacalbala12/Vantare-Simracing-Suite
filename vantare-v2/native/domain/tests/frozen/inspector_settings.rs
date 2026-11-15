pub(super) mod broadcast_tower {
    // Frozen UI Settings before D106; migration oracle, never product code.
    #[derive(Clone, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
    #[serde(default, rename_all = "camelCase")]
    pub struct Settings {
        pub driver_carousel: bool,
        pub row_count: usize,
        pub show_weather: bool,
        /// SOF está desactivado también en el contrato Eficiencia productivo.
        pub show_sof: bool,
    }
    impl Default for Settings {
        fn default() -> Self {
            Self {
                driver_carousel: false,
                row_count: 11,
                show_weather: false,
                show_sof: false,
            }
        }
    }
    impl Settings {
        #[must_use]
        pub fn normalized(&self) -> Self {
            let mut value = self.clone();
            value.row_count = value.row_count.clamp(3, 11);
            value.show_sof = false;
            value
        }
    }
}

pub(super) mod car_damage_numbers {
    // Frozen UI Settings before D106; migration oracle, never product code.
    #[derive(Clone, Debug, PartialEq, serde::Serialize, serde::Deserialize)]
    #[serde(default, rename_all = "camelCase")]
    pub struct Settings {
        pub show_tyres: bool,
        pub format: String,
    }
    impl Default for Settings {
        fn default() -> Self {
            Self {
                show_tyres: true,
                format: "percent".into(),
            }
        }
    }
    impl Settings {
        #[must_use]
        pub fn normalized(&self) -> Self {
            Self {
                format: "percent".into(),
                ..self.clone()
            }
        }
    }
}

pub(super) mod car_damage_visual {
    // Frozen UI Settings before D106; migration oracle, never product code.
    #[derive(Clone, Debug, PartialEq, serde::Serialize, serde::Deserialize)]
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
}

pub(super) mod delta_trace {
    // Frozen UI Settings before D106; migration oracle, never product code.
    #[derive(Clone, Debug, PartialEq, serde::Serialize, serde::Deserialize)]
    #[serde(default, rename_all = "camelCase")]
    pub struct Settings {
        pub reference: String,
        pub window_seconds: f64,
        pub show_sectors: bool,
        pub show_track_map: bool,
    }
    impl Default for Settings {
        fn default() -> Self {
            Self {
                reference: "best".into(),
                window_seconds: 4.0,
                show_sectors: true,
                show_track_map: true,
            }
        }
    }
    impl Settings {
        #[must_use]
        pub fn normalized(&self) -> Self {
            Self {
                reference: match self.reference.as_str() {
                    "optimal" | "leader" => self.reference.clone(),
                    _ => "best".into(),
                },
                window_seconds: if self.window_seconds.is_finite() {
                    self.window_seconds.clamp(1.0, 8.0)
                } else {
                    4.0
                },
                ..self.clone()
            }
        }
    }
}

pub(super) mod fastest_lap {
    // Frozen UI Settings before D106; migration oracle, never product code.
    #[derive(Clone, Debug, PartialEq, serde::Serialize, serde::Deserialize)]
    #[serde(default, rename_all = "camelCase")]
    pub struct Settings {
        pub show_personal: bool,
        pub show_class: bool,
        pub duration_seconds: u8,
        pub show_driver: bool,
    }
    impl Default for Settings {
        fn default() -> Self {
            Self {
                show_personal: true,
                show_class: true,
                duration_seconds: 6,
                show_driver: true,
            }
        }
    }
    impl Settings {
        #[must_use]
        pub fn normalized(&self) -> Self {
            Self {
                duration_seconds: self.duration_seconds.clamp(3, 15),
                ..self.clone()
            }
        }
    }
}

pub(super) mod head_to_head {
    // Frozen UI Settings before D106; migration oracle, never product code.
    #[derive(Clone, Debug, PartialEq, serde::Serialize, serde::Deserialize)]
    #[serde(default, rename_all = "camelCase")]
    pub struct Settings {
        pub target: String,
        /// Muestra los sectores fiables de la última vuelta y la mejor vuelta.
        pub show_sectors: bool,
    }
    impl Default for Settings {
        fn default() -> Self {
            Self {
                target: "ahead".into(),
                show_sectors: true,
            }
        }
    }
    impl Settings {
        #[must_use]
        pub fn normalized(&self) -> Self {
            let mut settings = self.clone();
            if settings.target != "behind" {
                settings.target = "ahead".into();
            }
            settings
        }
    }
}

pub(super) mod input_telemetry {
    // Frozen UI Settings before D106; migration oracle, never product code.
    #[derive(Clone, Debug, PartialEq, serde::Serialize, serde::Deserialize)]
    #[serde(default, rename_all = "camelCase")]
    pub struct Settings {
        pub history_seconds: u8,
        pub show_clutch: bool,
    }
    impl Default for Settings {
        fn default() -> Self {
            Self {
                history_seconds: 6,
                show_clutch: false,
            }
        }
    }
    impl Settings {
        #[must_use]
        pub fn normalized(&self) -> Self {
            Self {
                history_seconds: self.history_seconds.clamp(1, 8),
                ..self.clone()
            }
        }
    }
}

pub(super) mod track_map {
    // Frozen UI Settings before D106; migration oracle, never product code.
    #[derive(Clone, Debug, PartialEq, serde::Serialize, serde::Deserialize)]
    #[serde(default, rename_all = "camelCase")]
    pub struct Settings {
        pub show_track_label: bool,
        pub transparent: bool,
    }
    impl Default for Settings {
        fn default() -> Self {
            Self {
                show_track_label: true,
                transparent: false,
            }
        }
    }
    impl Settings {
        #[must_use]
        pub fn normalized(&self) -> Self {
            self.clone()
        }
    }
}

pub(super) mod multiclass_relative {
    // Frozen UI Settings before D106; migration oracle, never product code.
    #[derive(Clone, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
    #[serde(default, rename_all = "camelCase")]
    pub struct Settings {
        pub row_count: usize,
        pub class_mode: String,
        pub show_class_divider: bool,
    }
    impl Default for Settings {
        fn default() -> Self {
            Self {
                row_count: 7,
                class_mode: "all".into(),
                show_class_divider: false,
            }
        }
    }
    impl Settings {
        #[must_use]
        pub fn normalized(&self) -> Self {
            let mut value = self.clone();
            value.row_count = vantare_domain::multiclass_relative::row_count(value.row_count);
            if !["all", "same", "other"].contains(&value.class_mode.as_str()) {
                value.class_mode = "all".into();
            }
            value
        }
    }
}

pub(super) mod pedals_telemetry {
    // Frozen UI Settings before D106; migration oracle, never product code.
    #[derive(Clone, Debug, PartialEq, serde::Serialize, serde::Deserialize)]
    #[serde(default, rename_all = "camelCase")]
    pub struct Settings {
        pub steering_wheel: String,
        pub show_clutch: bool,
        /// Eficiencia no dibuja posición aunque el contenido general la conserve.
        pub show_position: bool,
    }
    impl Default for Settings {
        fn default() -> Self {
            Self {
                steering_wheel: "generic".into(),
                show_clutch: true,
                show_position: true,
            }
        }
    }
    impl Settings {
        #[must_use]
        pub fn normalized(&self) -> Self {
            if vantare_domain::pedals_telemetry::WHEELS.contains(&self.steering_wheel.as_str()) {
                self.clone()
            } else {
                Self {
                    steering_wheel: "generic".into(),
                    ..self.clone()
                }
            }
        }
    }
}

pub(super) mod radar {
    // Frozen UI Settings before D106; migration oracle, never product code.
    #[derive(Clone, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
    #[serde(default, rename_all = "camelCase")]
    pub struct Settings {
        pub show_phrases: bool,
    }
    impl Default for Settings {
        fn default() -> Self {
            Self { show_phrases: true }
        }
    }
    impl Settings {
        #[must_use]
        pub fn normalized(&self) -> Self {
            self.clone()
        }
    }
}

pub(super) mod racing_flags {
    // Frozen UI Settings before D106; migration oracle, never product code.
    #[derive(Clone, Debug, PartialEq, serde::Serialize, serde::Deserialize)]
    #[serde(default, rename_all = "camelCase")]
    pub struct Settings {
        /// 0 identifica el color negro heredado, antes ignorado por este pintor.
        #[serde(default)]
        pub content_version: u8,
        pub text_color: String,
        pub show_sector_flags: bool,
        pub hide_when_green: bool,
    }
    impl Default for Settings {
        fn default() -> Self {
            Self {
                content_version: 1,
                text_color: "#ece6e7".into(),
                show_sector_flags: true,
                hide_when_green: false,
            }
        }
    }
    impl Settings {
        #[must_use]
        pub fn normalized(&self) -> Self {
            let value = self.text_color.as_bytes();
            let legacy_black = self.content_version == 0 && self.text_color == "#000000";
            if !legacy_black
                && value.len() == 7
                && value[0] == b'#'
                && value[1..].iter().all(u8::is_ascii_hexdigit)
            {
                Self {
                    content_version: self.content_version.max(1),
                    text_color: self.text_color.to_ascii_lowercase(),
                    ..self.clone()
                }
            } else {
                Self {
                    content_version: self.content_version.max(1),
                    text_color: Self::default().text_color,
                    ..self.clone()
                }
            }
        }
    }
}

pub(super) mod track_weather {
    // Frozen UI Settings before D106; migration oracle, never product code.
    #[derive(Clone, Debug, PartialEq, serde::Serialize, serde::Deserialize)]
    #[serde(default, rename_all = "camelCase")]
    // Claves independientes del contrato productivo, aunque su renderer aún las ignora.
    #[allow(clippy::struct_excessive_bools)]
    pub struct Settings {
        /// Columna de 132 × 440 en vez de la tarjeta horizontal de 280 × 210.
        pub vertical: bool,
        pub show_ambient: bool,
        pub show_track: bool,
        pub show_rain: bool,
        pub show_wind: bool,
    }
    impl Default for Settings {
        fn default() -> Self {
            Self {
                vertical: false,
                show_ambient: true,
                show_track: true,
                show_rain: true,
                show_wind: true,
            }
        }
    }
    impl Settings {
        #[must_use]
        pub fn normalized(&self) -> Self {
            self.clone()
        }
    }
}

pub(super) mod session_alerts {
    // Frozen UI Settings before D106; migration oracle, never product code.
    #[derive(Clone, Debug, PartialEq, serde::Serialize, serde::Deserialize)]
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
}
