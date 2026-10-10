//! Textos derivados del Board en ingest; medidas de fuente una vez por presentación.
use super::*;
use std::{collections::HashMap, sync::OnceLock};
use vantare_domain::{CarId, relative::Row};

pub(super) struct Column {
    pub setting: crate::standings::options::ColumnSetting,
    pub x: f32,
    pub width: f32,
    pub centered: bool,
    pub left: bool,
    pub tick: bool,
}
impl Column {
    pub fn font(&self, opacity: f32) -> Ink {
        let metric = self.setting.metric_id.as_str();
        ink(
            if metric == "driverName" {
                14.0
            } else if metric == "gap" {
                16.0
            } else {
                13.0
            } * SCALE,
            if metric == "driverName" { 700.0 } else { 600.0 },
            -0.02,
            col(tokens::INK, opacity),
        )
    }
}
struct Input {
    row: Arc<Row>,
    name: String,
    badge: Option<String>,
    color: u32,
    names: Vec<Option<String>>,
}
pub(super) struct Cell {
    pub text: String,
    pub width: f32,
}
impl Cell {
    fn new(window: &Window, value: &str, font: &Ink, width: f32) -> Self {
        let text = text::fit(window, value, font, width);
        let width = text::width(window, &text, font);
        Self { text, width }
    }
}
pub(super) struct RowLabels {
    pub color: u32,
    pub two_ch: f32,
    pub position_width: f32,
    pub number: Cell,
    pub name: Cell,
    pub badge: Option<String>,
    pub badge_width: f32,
    pub gap: Cell,
    pub best: Cell,
    pub columns: Vec<Cell>,
}
pub(super) struct Prepared {
    pub track: String,
    pub badge_width: f32,
    pub header_advance: f32,
    pub footer_widths: [f32; 4],
    pub footer_advances: [f32; 4],
    pub session_advance: f32,
    pub rows: HashMap<CarId, RowLabels>,
}
pub(super) struct Labels {
    pub language: Language,
    pub columns: Vec<Column>,
    session: String,
    inputs: HashMap<CarId, Input>,
    prepared: OnceLock<Prepared>,
}
impl Labels {
    pub fn new(
        board: &ViewModel,
        settings: &Settings,
        language: Language,
        ghosts: &[RowVisual],
    ) -> Self {
        #[cfg(feature = "parity-capture")]
        crate::benchmark::mark(crate::benchmark::Work::Labels);
        let selected: Vec<_> = settings
            .columns
            .iter()
            .flatten()
            .filter(|c| {
                c.enabled
                    && [
                        "position",
                        "class",
                        "carNumber",
                        "driverName",
                        "gap",
                        "bestLap",
                        "lastLap",
                    ]
                    .contains(&c.metric_id.as_str())
            })
            .take(7)
            .cloned()
            .collect();
        let total = selected
            .iter()
            .map(|c| c.relative_width())
            .sum::<f32>()
            .max(1.0);
        let has_position = selected.iter().any(|c| c.metric_id == "position");
        let has_class = selected.iter().any(|c| c.metric_id == "class");
        let mut x = 0.0;
        let columns: Vec<_> = selected
            .into_iter()
            .map(|setting| {
                let width = setting.relative_width() / total * SIZE.0;
                let metric = setting.metric_id.as_str();
                let centered = setting
                    .style
                    .align
                    .as_deref()
                    .map_or(matches!(metric, "position" | "class" | "carNumber"), |a| {
                        a == "center"
                    });
                let left = setting.style.align.as_deref() == Some("left")
                    || (metric == "driverName" && setting.style.align.is_none());
                let tick =
                    (metric == "class" && !has_position) || (metric == "position" && has_class);
                let c = Column {
                    setting,
                    x,
                    width,
                    centered,
                    left,
                    tick,
                };
                x += width;
                c
            })
            .collect();
        let inputs = ghosts
            .iter()
            .map(|v| &v.row)
            .chain(board.slots.iter().flatten())
            .map(|row| {
                let badge = row
                    .lap_delta
                    .filter(|n| *n != 0 && row.side != Side::Player)
                    .map(|n| {
                        format!(
                            "{}{} {}",
                            if n > 0 { "+" } else { "−" },
                            n.unsigned_abs(),
                            if language == Language::Es { "V" } else { "L" }
                        )
                    });
                let color = match row.class.to_uppercase().as_str() {
                    "HYPERCAR" => 0xc1121f,
                    "LMP2" => 0x0055a4,
                    "LMP3" => 0xf59e0b,
                    "GT3" | "LMGT3" => 0x2ecc71,
                    _ => 0x6b7280,
                };
                let names = columns
                    .iter()
                    .map(|c| {
                        (c.setting.metric_id == "driverName")
                            .then(|| c.setting.driver_name(&row.driver).to_uppercase())
                    })
                    .collect();
                (
                    row.id,
                    Input {
                        row: row.clone(),
                        name: row.driver.to_uppercase(),
                        badge,
                        color,
                        names,
                    },
                )
            })
            .collect();
        let session = [&board.session, &board.remaining]
            .into_iter()
            .filter(|v| !v.is_empty())
            .map(String::as_str)
            .collect::<Vec<_>>()
            .join(" ");
        Self {
            language,
            columns,
            session,
            inputs,
            prepared: OnceLock::new(),
        }
    }
    pub fn fields<'a>(&'a self, board: &'a ViewModel) -> [(&'static str, &'a str, bool); 4] {
        let (_, weather) = super::labels(self.language);
        [
            ("", &self.session, false),
            (weather[0], &board.air, board.header_stale.air),
            (
                weather[1],
                &board.track_temperature,
                board.header_stale.track_temperature,
            ),
            (weather[2], &board.wind, board.header_stale.wind),
        ]
    }
    /// GPUI aporta Window al pintar: esta preparación idempotente ocurre solo
    /// al estrenar Board/presentación. El pintor posterior lee medidas y textos.
    pub fn prepare(&self, board: &ViewModel, width: f32, window: &Window) -> &Prepared {
        self.prepared.get_or_init(|| {
            let (label, _) = super::labels(self.language);
            let font = ink(14.0 * SCALE, 650.0, -0.01, col(tokens::INK, 1.0));
            let badge_width = text::width(window, &board.player_badge, &font);
            // La medida histórica del label de cabecera usa 11 px sin SCALE.
            let label_width = text::width(
                window,
                label,
                &ink(11.0, 600.0, 0.1, col(tokens::MUTED, 1.0)),
            );
            let track = text::fit(
                window,
                &board.track,
                &font,
                (width - badge_width - label_width - 42.0).max(0.0),
            );
            let header_advance = item_width(window, label, "");
            let fields = self.fields(board);
            let footer_widths = fields.map(|(l, v, _)| item_width(window, l, v));
            let footer_advances = fields.map(|(l, _, _)| {
                if l.is_empty() {
                    0.0
                } else {
                    item_width(window, l, "")
                }
            });
            let session_advance = if board.session.is_empty() || board.remaining.is_empty() {
                0.0
            } else {
                item_width(window, "", &board.session) + item_width(window, "", " ")
            };
            let number_font = ink(11.0 * SCALE, 600.0, -0.02, col(tokens::INK, 1.0));
            let name_font = ink(14.0 * SCALE, 700.0, -0.025, col(tokens::INK, 1.0));
            let badge_font = ink(8.0 * SCALE, 650.0, 0.01, col(tokens::INK, 1.0));
            let gap_font = ink(16.0 * SCALE, 650.0, -0.02, col(tokens::INK, 1.0));
            let lap_font = ink(13.0 * SCALE, 600.0, -0.02, col(tokens::INK, 1.0));
            let position_font = ink(13.0 * SCALE, 600.0, -0.02, col(tokens::INK, 1.0));
            let two_ch = text::width(
                window,
                "00",
                &ink(13.0 * SCALE, 600.0, 0.0, col(tokens::INK, 1.0)),
            );
            let rows = self
                .inputs
                .iter()
                .map(|(&id, input)| {
                    let badge_width = input
                        .badge
                        .as_ref()
                        .map_or(0.0, |v| text::width(window, v, &badge_font) + 10.0 * SCALE);
                    let reserve = if input.badge.is_some() {
                        badge_width + 7.0 * SCALE
                    } else {
                        0.0
                    };
                    let columns = self
                        .columns
                        .iter()
                        .zip(&input.names)
                        .map(|(c, name)| {
                            let value = match c.setting.metric_id.as_str() {
                                "position" => input.row.position.as_ref(),
                                "carNumber" => &input.row.number,
                                "driverName" => name.as_deref().unwrap_or(""),
                                "gap" => input.row.gap.as_ref(),
                                "bestLap" => &input.row.best_lap,
                                "lastLap" => &input.row.last_lap,
                                _ => "",
                            };
                            let reserve = if c.setting.metric_id == "driverName" {
                                reserve
                            } else {
                                0.0
                            };
                            Cell::new(
                                window,
                                value,
                                &c.font(1.0),
                                if c.left {
                                    (c.width - 10.0 * SCALE - reserve).max(0.0)
                                } else {
                                    c.width - 12.0 * SCALE
                                },
                            )
                        })
                        .collect();
                    (
                        id,
                        RowLabels {
                            color: input.color,
                            two_ch,
                            position_width: text::width(
                                window,
                                &input.row.position,
                                &position_font,
                            ),
                            number: Cell::new(
                                window,
                                &input.row.number,
                                &number_font,
                                EDGES[3] - EDGES[2] - 12.0 * SCALE,
                            ),
                            name: Cell::new(
                                window,
                                &input.name,
                                &name_font,
                                EDGES[4] - EDGES[3] - 10.0 * SCALE - reserve,
                            ),
                            badge: input.badge.clone(),
                            badge_width,
                            gap: Cell::new(
                                window,
                                &input.row.gap,
                                &gap_font,
                                EDGES[5] - EDGES[4] - 12.0 * SCALE,
                            ),
                            best: Cell::new(
                                window,
                                &input.row.best_lap,
                                &lap_font,
                                EDGES[6] - EDGES[5] - 12.0 * SCALE,
                            ),
                            columns,
                        },
                    )
                })
                .collect();
            Prepared {
                track,
                badge_width,
                header_advance,
                footer_widths,
                footer_advances,
                session_advance,
                rows,
            }
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn row_texts_are_prepared_including_badges_and_configured_names() {
        let prefs = Preferences::default();
        let mut board = vantare_domain::relative::project(&crate::source::fixed(), prefs);
        let row = board.slots.iter_mut().flatten().next().expect("fila real");
        let row = Arc::make_mut(row);
        row.driver = "André Lotterer".into();
        row.side = Side::Behind;
        row.lap_delta = Some(-2);
        let id = row.id;
        let settings = Settings {
            columns: Some(vec![crate::standings::options::ColumnSetting {
                metric_id: "driverName".into(),
                ..Default::default()
            }]),
            ..Settings::eficiencia()
        };
        let es = Labels::new(&board, &settings, Language::Es, &[]);
        let en = Labels::new(&board, &settings, Language::En, &[]);
        assert_eq!(es.inputs[&id].name, "ANDRÉ LOTTERER");
        assert_eq!(es.inputs[&id].badge.as_deref(), Some("−2 V"));
        assert_eq!(en.inputs[&id].badge.as_deref(), Some("−2 L"));
        assert_eq!(es.inputs[&id].names[0].as_deref(), Some("ANDRÉ LOTTERER"));
        assert!(
            es.prepared.get().is_none(),
            "la fuente se mide al disponer de Window"
        );
    }
}
