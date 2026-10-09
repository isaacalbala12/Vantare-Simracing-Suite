//! Ajustes consumidos por los renderizadores productivos; no persiste ni dibuja widgets.
use crate::orbit::NumberRange;
use vantare_ui::Settings;

/// Acciones de posición sobre el lienzo lógico. No añade anclajes al documento.
pub fn anchored_position(size: (f32, f32), column: u8, row: u8) -> Option<(f32, f32)> {
    if column > 2
        || row > 2
        || !size.0.is_finite()
        || !size.1.is_finite()
        || size.0 <= 0.0
        || size.1 <= 0.0
    {
        return None;
    }
    Some((
        (1920.0 - size.0) * f32::from(column) / 2.0,
        (1080.0 - size.1) * f32::from(row) / 2.0,
    ))
}

pub fn nudged_position(position: (f32, f32), direction: (i8, i8), shift: bool) -> (f32, f32) {
    let step = if shift { 8.0 } else { 1.0 };
    (
        (position.0 + f32::from(direction.0) * step).clamp(-100_000.0, 100_000.0),
        (position.1 + f32::from(direction.1) * step).clamp(-100_000.0, 100_000.0),
    )
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Tab {
    Layout,
    Content,
    Behavior,
    Appearance,
}
impl Tab {
    pub const ALL: [Self; 4] = [
        Self::Content,
        Self::Appearance,
        Self::Behavior,
        Self::Layout,
    ];
    pub fn label(self) -> &'static str {
        match self {
            Self::Layout => "Posición y tamaño",
            Self::Content => "Contenido",
            Self::Behavior => "En pista",
            Self::Appearance => "Apariencia",
        }
    }
}
pub enum Control {
    Boolean {
        value: bool,
        set: fn(&mut Settings, bool),
    },
    Choice {
        options: Vec<(&'static str, &'static str)>,
        selected: Option<usize>,
        set: fn(&mut Settings, &str),
    },
    Number {
        range: NumberRange,
        set: fn(&mut Settings, f64),
    },
}
pub struct Field {
    pub title: &'static str,
    pub tab: Tab,
    pub control: Control,
}
fn boolean(title: &'static str, tab: Tab, value: bool, set: fn(&mut Settings, bool)) -> Field {
    Field {
        title,
        tab,
        control: Control::Boolean { value, set },
    }
}
fn choice(
    title: &'static str,
    tab: Tab,
    value: &str,
    options: &[(&'static str, &'static str)],
    set: fn(&mut Settings, &str),
) -> Field {
    Field {
        title,
        tab,
        control: Control::Choice {
            selected: options.iter().position(|(_, key)| *key == value),
            options: options.to_vec(),
            set,
        },
    }
}
fn number(
    title: &'static str,
    value: f64,
    min: f64,
    max: f64,
    step: f64,
    set: fn(&mut Settings, f64),
) -> Field {
    Field {
        title,
        tab: Tab::Content,
        control: Control::Number {
            range: NumberRange {
                min,
                max,
                step,
                value,
            },
            set,
        },
    }
}
const METRICS: &[(&str, &str)] = &[
    ("Ninguna", "none"),
    ("Circuito", "track"),
    ("Vueltas estimadas", "estimatedLaps"),
];
const CLASSES: &[(&str, &str)] = &[
    ("Todas las clases", "all-classes"),
    ("Clase del jugador", "player-class"),
];

// Solo elimina la repetición del setter; cada fila sigue nombrando su Settings tipado.
macro_rules! set {
    ($variant:ident.$field:ident) => {
        |settings, next| {
            if let Settings::$variant(value) = settings {
                value.$field = next;
            }
        }
    };
    ($variant:ident.$field:ident string) => {
        |settings, next| {
            if let Settings::$variant(value) = settings {
                value.$field = next.into();
            }
        }
    };
    ($variant:ident.$field:ident as $ty:ty) => {
        |settings, next| {
            if let Settings::$variant(value) = settings {
                value.$field = next as $ty;
            }
        }
    };
}

// Los casts de los steppers están acotados por NumberRange y la normalización compartida.
#[allow(
    clippy::too_many_lines,
    clippy::cast_possible_truncation,
    clippy::cast_sign_loss,
    clippy::cast_precision_loss
)]
pub fn fields(settings: &Settings) -> Vec<Field> {
    let mut rows = match settings {
        Settings::Standings(value) => {
            let mut rows = vec![
                number(
                    "Filas",
                    value.row_count as f64,
                    1.0,
                    30.0,
                    1.0,
                    set!(Standings.row_count as usize),
                ),
                choice(
                    "Clases",
                    Tab::Content,
                    &value.class_scope,
                    CLASSES,
                    set!(Standings.class_scope string),
                ),
                choice(
                    "Clasificación",
                    Tab::Content,
                    &value.classification_mode,
                    &[("Normal", "normal"), ("Multiclase", "multiclass")],
                    set!(Standings.classification_mode string),
                ),
                boolean(
                    "Cabecera de sesión",
                    Tab::Content,
                    value.show_session_header,
                    set!(Standings.show_session_header),
                ),
                boolean(
                    "Pie de sesión",
                    Tab::Content,
                    value.show_session_footer,
                    set!(Standings.show_session_footer),
                ),
                choice(
                    "Diseño",
                    Tab::Appearance,
                    &value.template_id,
                    &[("Signature", "signature"), ("Broadcast", "broadcast")],
                    set!(Standings.template_id string),
                ),
                choice(
                    "Primera métrica del pie",
                    Tab::Content,
                    &value.footer_first,
                    METRICS,
                    set!(Standings.footer_first string),
                ),
                choice(
                    "Segunda métrica del pie",
                    Tab::Content,
                    &value.footer_second,
                    METRICS,
                    set!(Standings.footer_second string),
                ),
            ];
            rows.push(choice(
                "Marca",
                Tab::Appearance,
                match value.brand_visible {
                    None => "auto",
                    Some(true) => "show",
                    Some(false) => "hide",
                },
                &[
                    ("Automática", "auto"),
                    ("Visible", "show"),
                    ("Oculta", "hide"),
                ],
                |settings, next| {
                    if let Settings::Standings(value) = settings {
                        value.brand_visible = match next {
                            "show" => Some(true),
                            "hide" => Some(false),
                            _ => None,
                        };
                    }
                },
            ));
            rows
        }
        Settings::Delta(value) => vec![choice(
            "Diseño",
            Tab::Appearance,
            &value.template_id,
            &[("Instrumento", "instrument"), ("Cápsula", "capsule")],
            set!(Delta.template_id string),
        )],
        Settings::Pedals(value) => vec![boolean(
            "Fondo transparente",
            Tab::Appearance,
            value.transparent_background,
            set!(Pedals.transparent_background),
        )],
        Settings::BroadcastTower(value) => vec![
            number(
                "Filas",
                value.row_count as f64,
                3.0,
                10.0,
                1.0,
                set!(BroadcastTower.row_count as usize),
            ),
            boolean(
                "Carrusel de pilotos",
                Tab::Behavior,
                value.driver_carousel,
                set!(BroadcastTower.driver_carousel),
            ),
            boolean(
                "Meteorología",
                Tab::Content,
                value.show_weather,
                set!(BroadcastTower.show_weather),
            ),
        ],
        Settings::CarDamageNumbers(value) => vec![boolean(
            "Neumáticos",
            Tab::Content,
            value.show_tyres,
            set!(CarDamageNumbers.show_tyres),
        )],
        Settings::CarDamageVisual(value) => vec![boolean(
            "Aerodinámica",
            Tab::Content,
            value.show_aero,
            set!(CarDamageVisual.show_aero),
        )],
        Settings::DeltaTrace(value) => vec![number(
            "Ventana (segundos)",
            value.window_seconds,
            1.0,
            8.0,
            1.0,
            set!(DeltaTrace.window_seconds),
        )],
        Settings::FastestLap(value) => vec![
            boolean(
                "Vuelta personal",
                Tab::Content,
                value.show_personal,
                set!(FastestLap.show_personal),
            ),
            boolean(
                "Clase",
                Tab::Content,
                value.show_class,
                set!(FastestLap.show_class),
            ),
            boolean(
                "Piloto",
                Tab::Content,
                value.show_driver,
                set!(FastestLap.show_driver),
            ),
            number(
                "Duración (segundos)",
                f64::from(value.duration_seconds),
                3.0,
                15.0,
                1.0,
                set!(FastestLap.duration_seconds as u8),
            ),
        ],
        Settings::FuelStrategy(value) => vec![
            number(
                "Filas del historial",
                f64::from(value.history_rows),
                1.0,
                8.0,
                1.0,
                set!(FuelStrategy.history_rows as u8),
            ),
            boolean(
                "Proyección",
                Tab::Content,
                value.show_projection,
                set!(FuelStrategy.show_projection),
            ),
        ],
        Settings::HeadToHead(value) => vec![choice(
            "Objetivo",
            Tab::Content,
            &value.target,
            &[("Delante", "ahead"), ("Detrás", "behind")],
            set!(HeadToHead.target string),
        )],
        Settings::InputTelemetry(value) => vec![
            number(
                "Historial (segundos)",
                f64::from(value.history_seconds),
                1.0,
                8.0,
                1.0,
                set!(InputTelemetry.history_seconds as u8),
            ),
            boolean(
                "Embrague",
                Tab::Content,
                value.show_clutch,
                set!(InputTelemetry.show_clutch),
            ),
        ],
        Settings::MulticlassRelative(value) => vec![
            number(
                "Filas",
                value.row_count as f64,
                3.0,
                7.0,
                1.0,
                set!(MulticlassRelative.row_count as usize),
            ),
            choice(
                "Clases",
                Tab::Content,
                &value.class_mode,
                &[("Todas", "all"), ("Misma", "same"), ("Otras", "other")],
                set!(MulticlassRelative.class_mode string),
            ),
            boolean(
                "Separador de clase",
                Tab::Content,
                value.show_class_divider,
                set!(MulticlassRelative.show_class_divider),
            ),
        ],
        Settings::PedalsTelemetry(value) => {
            let mut rows = vec![boolean(
                "Embrague",
                Tab::Content,
                value.show_clutch,
                set!(PedalsTelemetry.show_clutch),
            )];
            let wheels: Vec<_> = vantare_domain::pedals_telemetry::WHEELS
                .iter()
                .map(|id| (*id, *id))
                .collect();
            rows.push(choice(
                "Volante",
                Tab::Appearance,
                &value.steering_wheel,
                &wheels,
                set!(PedalsTelemetry.steering_wheel string),
            ));
            rows
        }
        Settings::RacingFlags(value) => vec![
            boolean(
                "Banderas por sector",
                Tab::Content,
                value.show_sector_flags,
                set!(RacingFlags.show_sector_flags),
            ),
            boolean(
                "Ocultar en verde",
                Tab::Behavior,
                value.hide_when_green,
                set!(RacingFlags.hide_when_green),
            ),
        ],
        Settings::Relative(value) => vec![
            number(
                "Filas alrededor · delante",
                value.range_ahead as f64,
                0.0,
                8.0,
                1.0,
                set!(Relative.range_ahead as usize),
            ),
            number(
                "Filas alrededor · detrás",
                value.range_behind as f64,
                0.0,
                8.0,
                1.0,
                set!(Relative.range_behind as usize),
            ),
            choice(
                "Clases",
                Tab::Content,
                &value.class_scope,
                &[("Todas", "all"), ("Misma clase", "sameClass")],
                set!(Relative.class_scope string),
            ),
        ],
        _ => vec![],
    };
    if let Some((_, look, accent)) = appearance(settings) {
        use vantare_ui::standings::{Accent, Look};
        rows.extend([
            choice(
                "Estilo del widget",
                Tab::Appearance,
                if look == Look::Neo { "neo" } else { "neutro" },
                &[("Neo", "neo"), ("Neutro", "neutro")],
                |settings, next| {
                    let value = if next == "neutro" {
                        Look::Neutro
                    } else {
                        Look::Neo
                    };
                    match settings {
                        Settings::Standings(s) => s.style = value,
                        Settings::Relative(s) => s.style = value,
                        Settings::Delta(s) => s.style = value,
                        Settings::FuelStrategy(s) => s.style = value,
                        _ => {}
                    }
                },
            ),
            choice(
                "Acento del widget",
                Tab::Appearance,
                match accent {
                    Accent::Red => "red",
                    Accent::Amber => "amber",
                    Accent::Green => "green",
                    Accent::White => "white",
                },
                &[
                    ("Rojo", "red"),
                    ("Ámbar", "amber"),
                    ("Verde", "green"),
                    ("Blanco", "white"),
                ],
                |settings, next| {
                    let value = match next {
                        "amber" => Accent::Amber,
                        "green" => Accent::Green,
                        "white" => Accent::White,
                        _ => Accent::Red,
                    };
                    match settings {
                        Settings::Standings(s) => s.accent = value,
                        Settings::Relative(s) => s.accent = value,
                        Settings::Delta(s) => s.accent = value,
                        Settings::FuelStrategy(s) => s.accent = value,
                        _ => {}
                    }
                },
            ),
        ]);
    }
    rows
}

pub fn appearance(
    settings: &Settings,
) -> Option<(
    vantare_ui::standings::DesignSystem,
    vantare_ui::standings::Look,
    vantare_ui::standings::Accent,
)> {
    match settings {
        Settings::Standings(s) => Some((s.design_system, s.style, s.accent)),
        Settings::Relative(s) => Some((s.design_system, s.style, s.accent)),
        Settings::Delta(s) => Some((s.design_system, s.style, s.accent)),
        Settings::FuelStrategy(s) => Some((s.design_system, s.style, s.accent)),
        _ => None,
    }
    .filter(|(system, _, _)| *system == vantare_ui::standings::DesignSystem::Vantare)
}
/// Capacidades publicadas por ui; una opción persistida pero ignorada no recibe manejador.
pub fn pending(settings: &Settings) -> Vec<String> {
    let unsupported = match settings {
        Settings::Standings(_) => vantare_ui::standings::Settings::UNSUPPORTED,
        Settings::Delta(_) => vantare_ui::delta::Settings::UNSUPPORTED,
        Settings::Pedals(_) => vantare_ui::pedals::Settings::UNSUPPORTED,
        Settings::BroadcastTower(_) => vantare_ui::broadcast_tower::Settings::UNSUPPORTED,
        Settings::CarDamageNumbers(_) => vantare_ui::car_damage_numbers::Settings::UNSUPPORTED,
        Settings::CarDamageVisual(_) => vantare_ui::car_damage_visual::Settings::UNSUPPORTED,
        Settings::DeltaTrace(_) => vantare_ui::delta_trace::Settings::UNSUPPORTED,
        Settings::FastestLap(_) => vantare_ui::fastest_lap::Settings::UNSUPPORTED,
        Settings::FuelStrategy(_) => vantare_ui::fuel_strategy::Settings::UNSUPPORTED,
        Settings::HeadToHead(_) => vantare_ui::head_to_head::Settings::UNSUPPORTED,
        Settings::InputTelemetry(_) => vantare_ui::input_telemetry::Settings::UNSUPPORTED,
        Settings::MulticlassRelative(_) => vantare_ui::multiclass_relative::Settings::UNSUPPORTED,
        Settings::PedalsTelemetry(_) => vantare_ui::pedals_telemetry::Settings::UNSUPPORTED,
        Settings::RacingFlags(_) => vantare_ui::racing_flags::Settings::UNSUPPORTED,
        Settings::Relative(_) => vantare_ui::relative::Settings::UNSUPPORTED,
        Settings::TrackMap(_) => vantare_ui::track_map::Settings::UNSUPPORTED,
        Settings::TrackWeather(_) => vantare_ui::track_weather::Settings::UNSUPPORTED,
        Settings::Radar(_) => vantare_ui::radar::Settings::UNSUPPORTED,
    };
    unsupported
        .iter()
        .map(|(key, reason)| format!("{key} · pendiente: {reason}"))
        .collect()
}

/// La familia de tablas comparte el tipo público de columnas; no recreamos sus defaults.
pub fn columns(settings: &Settings) -> Option<&Vec<vantare_ui::standings::options::ColumnSetting>> {
    match settings {
        Settings::Standings(s) => s.columns.as_ref(),
        Settings::Relative(s) => s.columns.as_ref(),
        _ => None,
    }
}
pub fn columns_mut(
    settings: &mut Settings,
) -> Option<&mut Vec<vantare_ui::standings::options::ColumnSetting>> {
    match settings {
        Settings::Standings(s) => s.columns.as_mut(),
        Settings::Relative(s) => s.columns.as_mut(),
        _ => None,
    }
}
pub fn valid_color(value: &str) -> bool {
    let bytes = value.as_bytes();
    bytes.len() == 7 && bytes[0] == b'#' && bytes[1..].iter().all(u8::is_ascii_hexdigit)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn automatic_player_visibility_has_no_redundant_center_switch() {
        assert!(
            !fields(&Settings::Standings(Default::default()))
                .iter()
                .any(|f| f.title == "Centrar en el jugador")
        );
    }
    #[test]
    fn surrounding_rows_belong_only_to_relative() {
        assert!(
            !fields(&Settings::Standings(Default::default()))
                .iter()
                .any(|f| f.title.starts_with("Filas alrededor"))
        );
        let relative = fields(&Settings::Relative(Default::default()));
        assert_eq!(
            relative
                .iter()
                .filter(|f| f.title.starts_with("Filas alrededor"))
                .count(),
            2
        );
    }
    #[test]
    fn anchors_align_all_nine_zones_and_reject_invalid_sizes() {
        for row in 0..3 {
            for column in 0..3 {
                assert_eq!(
                    anchored_position((400.0, 200.0), column, row),
                    Some((f32::from(column) * 760.0, f32::from(row) * 440.0))
                );
            }
        }
        for size in [
            (0.0, 100.0),
            (100.0, -1.0),
            (f32::NAN, 1.0),
            (1.0, f32::INFINITY),
        ] {
            assert_eq!(anchored_position(size, 1, 1), None);
        }
        assert_eq!(anchored_position((400.0, 200.0), 3, 0), None);
        assert_eq!(anchored_position((400.0, 200.0), 0, 3), None);
    }
    #[test]
    fn anchors_nudges_and_center_persist_reload_and_undo() {
        use crate::document::{Editor, tests::File};
        let file = File::new();
        let mut editor = Editor::open(file.path.clone()).expect("editor");
        editor.add(vantare_ui::Kind::Radar).expect("radar");
        let original = editor.layout().clone();
        for row in 0..3 {
            for column in 0..3 {
                let next = anchored_position((400.0, 200.0), column, row).expect("zona");
                editor
                    .edit_selected(|item| {
                        item.x = next.0;
                        item.y = next.1;
                    })
                    .expect("anclar");
                let reloaded = Editor::open(file.path.clone()).expect("recarga");
                assert_eq!(reloaded.layout(), editor.layout());
                assert_eq!(
                    (
                        reloaded.layout().instances[0].x,
                        reloaded.layout().instances[0].y
                    ),
                    next
                );
                editor.undo().expect("deshacer");
                assert_eq!(editor.layout(), &original);
            }
        }
        for direction in [(0, -1), (-1, 0), (1, 0), (0, 1)] {
            for shift in [false, true] {
                let next = nudged_position((20.0, 20.0), direction, shift);
                let step = if shift { 8.0 } else { 1.0 };
                assert_eq!(
                    next,
                    (
                        20.0 + f32::from(direction.0) * step,
                        20.0 + f32::from(direction.1) * step
                    )
                );
                editor
                    .edit_selected(|item| {
                        item.x = next.0;
                        item.y = next.1;
                    })
                    .expect("mover");
                assert_eq!(
                    Editor::open(file.path.clone()).expect("recarga").layout(),
                    editor.layout()
                );
                editor.undo().expect("deshacer");
                assert_eq!(editor.layout(), &original);
            }
        }
        assert_eq!(
            anchored_position((400.0, 200.0), 1, 1),
            Some((760.0, 440.0))
        );
        assert_eq!(
            nudged_position((100_000.0, -100_000.0), (1, -1), true),
            (100_000.0, -100_000.0)
        );
    }
    use vantare_ui::Kind;
    #[test]
    fn offered_controls_change_typed_settings_and_survive_normalization() {
        for kind in Kind::ALL {
            let initial = Settings::default_for(*kind);
            for field in fields(&initial) {
                let mut edited = initial.clone();
                match field.control {
                    Control::Boolean { value, set } => set(&mut edited, !value),
                    Control::Choice {
                        options,
                        selected,
                        set,
                    } => {
                        let index = selected.map_or(0, |index| (index + 1) % options.len());
                        set(&mut edited, options[index].1);
                    }
                    Control::Number { range, set } => set(
                        &mut edited,
                        if range.value >= range.max {
                            range.min
                        } else {
                            range.max
                        },
                    ),
                }
                assert_ne!(edited, initial, "{}: {}", kind.name(), field.title);
                assert_eq!(
                    edited.normalized(),
                    edited,
                    "{}: {}",
                    kind.name(),
                    field.title
                );
                assert_eq!(edited.kind(), *kind);
            }
        }
    }
    #[test]
    fn colors_reject_malformed_values_instead_of_resetting_them() {
        assert!(valid_color("#a1B2c3"));
        assert!(!valid_color("#gg0000"));
        assert!(!valid_color("000000"));
        assert!(!valid_color("#00000000"));
        assert!(!valid_color(""));
    }
    #[test]
    fn pending_uses_renderer_capabilities_and_preserves_legacy_fields() {
        let mut settings = Settings::default_for(Kind::Standings);
        if let Settings::Standings(value) = &mut settings {
            value.header_first = "rain".into();
            value.footer_slots = Some(vec!["rain".into()]);
        }
        for field in fields(&settings) {
            if let Control::Boolean { value, set } = field.control {
                set(&mut settings, !value);
            }
        }
        let Settings::Standings(value) = &settings else {
            panic!("Standings");
        };
        assert_eq!(value.header_first, "rain");
        assert_eq!(value.footer_slots, Some(vec!["rain".into()]));
        assert!(fields(&Settings::default_for(Kind::TrackWeather)).is_empty());
        assert_eq!(pending(&Settings::default_for(Kind::TrackWeather)).len(), 4);
        assert!(
            pending(&settings)
                .iter()
                .all(|row| row.contains("pendiente"))
        );
    }
}
