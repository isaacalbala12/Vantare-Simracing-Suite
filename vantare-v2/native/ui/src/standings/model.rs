//! Modelo visual de Standings Eficiencia: configuración, geometría y la
//! geometría del Plan común de `domain` para el movimiento y el
//! pintado. Geometría de `functional-standings-layout.ts` y
//! `StandingsFunctional.tsx`. Lógica pura, sin GPUI.

use vantare_domain::format::Language;
#[cfg(test)]
use vantare_domain::format::Preferences;
#[cfg(test)]
use vantare_domain::{Capability, SourceState, standings};

pub(crate) const ROW_HEIGHT: f32 = 30.0;
#[cfg(test)]
pub(crate) const SESSION_HEADER_HEIGHT: f32 = 42.0;
#[cfg(test)]
pub(crate) const COLUMN_HEADER_HEIGHT: f32 = 28.0;
#[cfg(test)]
pub(crate) const FOOTER_HEIGHT: f32 = 22.0;
#[cfg(test)]
pub(crate) const BRAND_BAND_HEIGHT: f32 = 22.0;
pub const PIT_RAIL_WIDTH: f32 = 34.0;

// ---------------------------------------------------------------------------
// Configuración (equivale a contenido + ajustes del widget en producción)
// ---------------------------------------------------------------------------

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum Metric {
    Position,
    DriverNumber,
    DriverName,
    VehicleClass,
    Gap,
    Interval,
    CurrentLap,
    LastLap,
    BestLap,
    Pit,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum Preset {
    Xs,
    Sm,
    Md,
    Lg,
    Auto,
}

impl Preset {
    fn extra(self) -> f32 {
        match self {
            Preset::Md => 6.0,
            Preset::Lg => 12.0,
            _ => 0.0,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum Align {
    Left,
    Center,
    Right,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum NameMode {
    Full,
    Initial,
    Surname,
    Truncate,
}
impl NameMode {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Full => "full",
            Self::Initial => "initial",
            Self::Surname => "surname",
            Self::Truncate => "truncate",
        }
    }
}

#[derive(Clone, Copy, Debug)]
pub(crate) struct Column {
    pub metric: Metric,
    pub preset: Preset,
    pub align: Option<Align>,
    pub name_mode: NameMode,
    pub max_chars: usize,
}

/// Datos del pie que el `ViewModel` de `domain` ya trae.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum InfoMetric {
    None,
    Track,
    EstimatedLaps,
}

#[derive(Clone, Debug)]
#[allow(clippy::struct_excessive_bools)] // Opciones productivas independientes, no estados excluyentes.
pub(crate) struct Config {
    pub style: std::sync::Arc<super::style::Style>,
    pub study: String,
    pub broadcast: bool,
    pub multiclass: bool,
    pub footer_slots: Vec<String>,
    pub footer_ids: Vec<String>,
    pub footer_rows: usize,
    pub columns: Vec<Column>,
    pub row_count: usize,
    pub show_session_header: bool,
    pub show_session_footer: bool,
    pub footer_first: InfoMetric,
    pub footer_second: InfoMetric,
    /// `settings.brandVisible ?? hasHeader`.
    pub brand_visible: Option<bool>,
    /// Ancho y alto del widget en px CSS (sin el carril PIT).
    pub width: f32,
    pub height: f32,
}

impl Config {
    /// Configuración de paridad (`parity/SPEC.md` §1): columnas posición, número,
    /// piloto, gap y mejor vuelta más el rail PIT, `rowCount = 10`.
    pub fn reference() -> Self {
        let col = |metric, preset| Column {
            metric,
            preset,
            align: None,
            name_mode: NameMode::Full,
            max_chars: 16,
        };
        let mut config = Self {
            style: super::style::Style::compiled(),
            study: "v1".into(),
            broadcast: false,
            multiclass: false,
            footer_slots: Vec::new(),
            footer_ids: Vec::new(),
            footer_rows: 1,
            columns: vec![
                col(Metric::Position, Preset::Xs),
                col(Metric::DriverNumber, Preset::Sm),
                col(Metric::DriverName, Preset::Lg),
                col(Metric::Gap, Preset::Md),
                col(Metric::BestLap, Preset::Lg),
                col(Metric::Pit, Preset::Auto),
            ],
            row_count: 10,
            show_session_header: true,
            show_session_footer: true,
            footer_first: InfoMetric::Track,
            footer_second: InfoMetric::EstimatedLaps,
            brand_visible: None,
            width: 0.0,
            height: 0.0,
        };
        config.fit(0);
        config
    }

    /// `resolveFunctionalStandingsSize`: ancho = suma de columnas (sin PIT),
    /// alto = cabecera 42 + filas * 30 + pie 22.
    pub fn fit(&mut self, rows: usize) {
        let enabled: Vec<Column> = self
            .columns
            .iter()
            .copied()
            .filter(|c| c.metric != Metric::Pit)
            .collect();
        let width: f32 = enabled
            .iter()
            .map(|c| column_width_for(c, self.broadcast))
            .sum();
        let header = if self.broadcast {
            self.style.geometry.broadcast_column_height
                + if self.show_session_header {
                    self.style.geometry.broadcast_header_height
                } else {
                    0.0
                }
        } else if identity_span(&enabled) == 0 {
            self.style.geometry.column_header_height
                + if self.show_session_header {
                    self.style.geometry.session_header_height
                } else {
                    0.0
                }
        } else if self.show_session_header {
            self.style.geometry.session_header_height
        } else {
            self.style.geometry.column_header_height
        };
        self.width = width.max(if self.broadcast { 258.0 } else { 238.0 });
        self.height = header
            + rows as f32 * self.style.geometry.row_height
            + if self.show_session_footer {
                self.style.geometry.footer_height
            } else {
                0.0
            }
            + if !self.show_session_header && self.brand_visible == Some(true) {
                self.style.geometry.brand_band_height
            } else {
                0.0
            };
    }
    pub fn footer_height(&self) -> f32 {
        if !self.show_session_footer {
            return 0.0;
        }
        if self.footer_slots.is_empty() {
            self.style.geometry.footer_height
        } else {
            15.0 + self.footer_rows as f32 * 14.0
        }
    }
}

/// `resolveFunctionalColumnWidth` de producción (firma Signature).
pub(crate) fn column_width(column: &Column) -> f32 {
    column_width_for(column, false)
}

pub(crate) fn column_width_for(column: &Column, broadcast: bool) -> f32 {
    let minimum = match column.metric {
        Metric::DriverName => {
            let base = if broadcast { 208.0 } else { 188.0 };
            match column.name_mode {
                NameMode::Initial => 140.0 + if broadcast { 20.0 } else { 0.0 },
                NameMode::Surname => 124.0 + if broadcast { 20.0 } else { 0.0 },
                NameMode::Truncate => (column.max_chars as f32 * 8.4 + 24.0)
                    .round()
                    .clamp(96.0, base),
                NameMode::Full => base,
            }
        }
        Metric::Position | Metric::DriverNumber => 30.0,
        Metric::Gap => 86.0,
        Metric::Interval | Metric::LastLap | Metric::BestLap => 76.0,
        Metric::Pit => 32.0,
        Metric::CurrentLap => 48.0,
        Metric::VehicleClass => 54.0,
    };
    minimum + column.preset.extra()
}

fn is_identity(metric: Metric) -> bool {
    matches!(
        metric,
        Metric::Position | Metric::DriverNumber | Metric::DriverName | Metric::VehicleClass
    )
}

/// `resolveFunctionalIdentitySpan`.
pub(crate) fn identity_span(columns: &[Column]) -> usize {
    let first_metric = columns
        .iter()
        .position(|c| !is_identity(c.metric))
        .unwrap_or(columns.len());
    let prefix = &columns[..first_metric];
    let width: f32 = prefix
        .iter()
        .map(|c| {
            column_width(&Column {
                name_mode: NameMode::Full,
                ..*c
            })
        })
        .sum();
    if prefix.iter().any(|c| c.metric == Metric::DriverName) && width >= 238.0 {
        first_metric
    } else {
        0
    }
}

// ---------------------------------------------------------------------------
// Rótulos de interfaz (`labels.ts`, solo lo que usa Standings). Los valores
// de datos ya llegan localizados desde `domain`.
// ---------------------------------------------------------------------------

pub(crate) struct Labels {
    pub position: &'static str,
    pub driver_number: &'static str,
    pub driver_name: &'static str,
    pub vehicle_class: &'static str,
    pub gap: &'static str,
    pub pace_gap: &'static str,
    pub interval: &'static str,
    pub current_lap: &'static str,
    pub last_lap: &'static str,
    pub best_lap: &'static str,
    pub pit: &'static str,
    pub stale: &'static str,
    pub disconnected: &'static str,
    pub missing: &'static str,
    pub track: &'static str,
    pub estimated_laps: &'static str,
}

pub(crate) fn labels(language: Language) -> Labels {
    match language {
        Language::En => Labels {
            position: "POS",
            driver_number: "NO",
            driver_name: "DRIVER",
            vehicle_class: "CLASS",
            gap: "TO LEADER",
            pace_gap: "TO BEST",
            interval: "INTERVAL",
            current_lap: "LAP",
            last_lap: "LAST LAP",
            best_lap: "BEST LAP",
            pit: "PIT",
            stale: "DATA OUT OF DATE",
            disconnected: "DISCONNECTED",
            missing: "NO DATA",
            track: "TRACK",
            estimated_laps: "EST. LAPS LEFT",
        },
        Language::Es => Labels {
            position: "POS",
            driver_number: "NO",
            driver_name: "PILOTO",
            vehicle_class: "CLASE",
            gap: "AL LÍDER",
            pace_gap: "AL MEJOR",
            interval: "INTERVALO",
            current_lap: "VUELTA",
            last_lap: "ÚLT. VUELTA",
            best_lap: "MEJOR V.",
            pit: "PIT",
            stale: "DATOS ANTIGUOS",
            disconnected: "DESCONECTADO",
            missing: "SIN DATOS",
            track: "PISTA",
            estimated_laps: "V. REST. EST.",
        },
    }
}

impl Labels {
    pub fn metric(&self, metric: Metric, pace_session: bool) -> &'static str {
        match metric {
            Metric::Position => self.position,
            Metric::DriverNumber => self.driver_number,
            Metric::DriverName => self.driver_name,
            Metric::VehicleClass => self.vehicle_class,
            Metric::Gap if pace_session => self.pace_gap,
            Metric::Gap => self.gap,
            Metric::Interval => self.interval,
            Metric::CurrentLap => self.current_lap,
            Metric::LastLap => self.last_lap,
            Metric::BestLap => self.best_lap,
            Metric::Pit => self.pit,
        }
    }

    pub fn info(&self, metric: InfoMetric) -> &'static str {
        match metric {
            InfoMetric::None => "",
            InfoMetric::Track => self.track,
            InfoMetric::EstimatedLaps => self.estimated_laps,
        }
    }
}

// ---------------------------------------------------------------------------
// ViewModel de `domain` -> modelo visual
// ---------------------------------------------------------------------------

pub(crate) use vantare_domain::standings::{Plan as ContentPlan, SelectedRow as Row, Status};

// ---------------------------------------------------------------------------
// Geometría (StandingsFunctional.tsx)
// ---------------------------------------------------------------------------

// Las banderas reflejan las decisiones de layout de `StandingsFunctional.tsx`.
#[allow(clippy::struct_excessive_bools)]
#[derive(Clone, Debug)]
pub(crate) struct Plan {
    /// Columnas visibles sin `pit`.
    pub columns: Vec<Column>,
    pub pit_enabled: bool,
    pub identity_span: usize,
    pub external_header: bool,
    pub has_header: bool,
    pub brand_visible: bool,
    pub brand_band: f32,
    pub loose_header: f32,
    pub table_header: f32,
    pub visible_rows: usize,
    /// Anchos de columna en px; la del piloto ocupa el resto.
    pub widths: Vec<f32>,
    pub table_top: f32,
    /// Alto real de la fila de cabecera (43 con la cabecera integrada, 28 si va suelta).
    pub head_row: f32,
    pub row_tops: Vec<f32>,
    pub class_bands: Vec<(f32, String)>,
}

pub(crate) fn plan(config: &Config, content_plan: &ContentPlan) -> Plan {
    #[cfg(feature = "parity-capture")]
    crate::benchmark::mark(crate::benchmark::Work::Plan);
    let columns: Vec<Column> = config
        .columns
        .iter()
        .copied()
        .filter(|c| c.metric != Metric::Pit)
        .collect();
    let pit_enabled = config.columns.iter().any(|c| c.metric == Metric::Pit);
    let span = identity_span(&columns);
    let has_header = config.show_session_header;
    let brand_visible = config.brand_visible.unwrap_or(has_header);
    let unavailable = !matches!(content_plan.status, Status::Ready | Status::Stale);
    let external = config.broadcast || span == 0 || unavailable || content_plan.rows.is_empty();
    let footer = config.footer_height();
    let brand_band = if !has_header && brand_visible {
        config.style.geometry.brand_band_height
    } else {
        0.0
    };
    let loose_header = if external && has_header {
        if config.broadcast {
            config.style.geometry.broadcast_header_height
        } else {
            config.style.geometry.session_header_height
        }
    } else {
        0.0
    };
    let table_header = if config.broadcast {
        config.style.geometry.broadcast_column_height
    } else if !has_header || external || span == 0 {
        config.style.geometry.column_header_height
    } else {
        config.style.geometry.session_header_height
    };
    let body = config.height - footer - brand_band - loose_header - table_header;
    let fit = (body.max(0.0) / config.style.geometry.row_height).floor() as usize;
    let mut row_tops = Vec::new();
    let mut class_bands = Vec::new();
    let mut top = 0.0;
    let mut previous = "";
    for row in content_plan.rows.iter().take(fit) {
        if config.multiclass && !row.class.is_empty() && previous != row.class.as_ref() {
            if top + config.style.geometry.class_band_height + config.style.geometry.row_height
                > body
            {
                break;
            }
            class_bands.push((top, row.class.to_string()));
            top += config.style.geometry.class_band_height;
            previous = &row.class;
        }
        if top + config.style.geometry.row_height > body {
            break;
        }
        row_tops.push(top);
        top += config.style.geometry.row_height;
    }
    let visible_rows = row_tops.len();
    let fixed: f32 = columns
        .iter()
        .filter(|c| c.metric != Metric::DriverName)
        .map(|c| column_width_for(c, config.broadcast))
        .sum();
    let widths = columns
        .iter()
        .map(|c| {
            if c.metric == Metric::DriverName {
                (config.width - fixed).max(0.0)
            } else {
                column_width_for(c, config.broadcast)
            }
        })
        .collect();
    let table_top = brand_band + loose_header;
    let head_row = if config.broadcast {
        config.style.geometry.broadcast_column_height
    } else if span > 0 && !external && has_header {
        config.style.geometry.session_header_height + 1.0
    } else {
        config.style.geometry.column_header_height
    };
    Plan {
        columns,
        pit_enabled,
        identity_span: span,
        external_header: external,
        has_header,
        brand_visible,
        brand_band,
        loose_header,
        table_header,
        visible_rows,
        widths,
        table_top,
        head_row,
        row_tops,
        class_bands,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use vantare_domain::{
        Capabilities, Car, CarId, Class, ClassId, Driver, Player, Quality::Reliable, Session,
        SessionKind, Snapshot, State,
    };

    pub fn test_row(position: i64) -> Row {
        let mut row = Row::unavailable(
            CarId(u32::try_from(position).expect("posición de test")),
            position,
        );
        let cells = std::sync::Arc::make_mut(&mut row.row);
        cells.driver = "X".into();
        cells.class = "GT3".into();
        row
    }

    #[test]
    fn default_reference_layout_matches_geometry_dump() {
        // SPEC.md: 30/30/200/92/88 = 440 px, cabecera integrada, filas desde y=43.
        let mut config = Config::reference();
        config.fit(10);
        assert_eq!((config.width, config.height), (440.0, 364.0));
        let content_plan = ContentPlan {
            rows: (0..44).map(|i| test_row(i + 1)).collect(),
            ..ContentPlan::unavailable(Status::Ready)
        };
        let plan = plan(&config, &content_plan);
        assert_eq!(plan.widths, vec![30.0, 30.0, 200.0, 92.0, 88.0]);
        assert_eq!(plan.identity_span, 3);
        assert!(!plan.external_header);
        assert_eq!(plan.head_row, 43.0);
        assert_eq!(plan.table_top + plan.head_row, 43.0);
        assert_eq!(plan.visible_rows, 10);
    }

    fn car(id: u32, position: u32, class: &str, best: f64) -> Car {
        Car {
            id: CarId(id),
            number: id.to_string(),
            driver: Driver {
                name: format!("Piloto {id}"),
                ..Driver::default()
            },
            class: Some(Class {
                id: ClassId(1),
                name: class.into(),
            }),
            position: Reliable(position),
            best_lap_s: Reliable(best),
            ..Car::default()
        }
    }

    fn snapshot(kind: SessionKind, cars: Vec<Car>) -> Snapshot {
        Snapshot {
            state: State {
                source_state: SourceState::Live,
                capabilities: Capabilities {
                    positions: Capability::Fresh,
                    ..Capabilities::default()
                },
                session: Session {
                    kind: Reliable(kind),
                    ..Session::default()
                },
                cars,
                player: Some(Player {
                    car: CarId(2),
                    ..Player::default()
                }),
                ..State::default()
            },
            ..Snapshot::default()
        }
    }

    fn vm_of(snapshot: &Snapshot, row_count: usize) -> ContentPlan {
        let prefs = Preferences::default();
        let content = standings::Content {
            row_count,
            ..standings::Content::default()
        };
        let domain = standings::project_content(snapshot, prefs, &content);
        ContentPlan::new(std::sync::Arc::new(domain), "s:1".into(), snapshot.sequence)
    }

    #[test]
    fn adapts_numbers_class_position_and_session_best() {
        let mut second = car(2, 2, "GT3", 100.8);
        second.in_pits = Reliable(true);
        let snapshot = snapshot(
            SessionKind::Practice,
            vec![
                car(1, 1, "LMP2", 100.0),
                second,
                car(3, 3, "GT3", 101.0),
                car(4, 4, "GT3", 102.0),
            ],
        );

        let content_plan = vm_of(&snapshot, 3);

        assert_eq!(content_plan.status, Status::Ready);
        assert_eq!(content_plan.rows.len(), 3, "se recorta a row_count");
        let classes: Vec<i64> = content_plan.rows.iter().map(|r| r.class_position).collect();
        assert_eq!(classes, [1, 1, 2]);
        assert_eq!(content_plan.rows[1].best_lap_s, Some(100.8));
        assert!(content_plan.rows[1].in_pits && content_plan.rows[1].is_player);
        assert_eq!(content_plan.session_best, Some((CarId(1), 100.0)));
        assert!(content_plan.board.gap_to_best_lap && !content_plan.race);
        assert!(
            content_plan
                .rows
                .iter()
                .all(|r| r.battle_gap_seconds.is_none()),
            "el duelo solo existe en carrera"
        );
    }

    #[test]
    fn race_gap_to_the_leader_feeds_the_battle_and_pits_are_excluded() {
        use vantare_domain::Gap;
        let mut cars = vec![
            car(1, 1, "GT3", 0.0),
            car(2, 2, "GT3", 0.0),
            car(3, 3, "GT3", 0.0),
        ];
        cars[1].gap_leader = Reliable(Gap::Time { seconds: 0.5 });
        cars[2].gap_leader = Reliable(Gap::Time { seconds: 0.9 });
        cars[2].in_pits = Reliable(true);

        let content_plan = vm_of(&snapshot(SessionKind::Race, cars), 10);

        assert!(content_plan.race);
        let gaps: Vec<Option<f64>> = content_plan
            .rows
            .iter()
            .map(|r| r.battle_gap_seconds)
            .collect();
        assert_eq!(gaps, [Some(0.0), Some(0.5), None]);
    }

    #[test]
    fn without_fresh_positions_the_widget_is_disconnected() {
        let mut snapshot = snapshot(SessionKind::Race, vec![car(1, 1, "GT3", 0.0)]);
        snapshot.state.capabilities.positions = Capability::Supported;
        assert_eq!(vm_of(&snapshot, 10).status, Status::Disconnected);
        snapshot.state.capabilities.positions = Capability::WithData;
        assert_eq!(vm_of(&snapshot, 10).status, Status::Stale);
    }

    #[test]
    fn source_status_overrides_fresh_positions() {
        let mut snapshot = snapshot(SessionKind::Race, vec![car(1, 1, "GT3", 0.0)]);
        for (source, expected) in [
            (SourceState::Waiting, Status::Disconnected),
            (SourceState::Live, Status::Ready),
            (SourceState::Stale, Status::Stale),
            (SourceState::Lost, Status::Disconnected),
        ] {
            snapshot.state.source_state = source;
            let content_plan = vm_of(&snapshot, 10);
            assert_eq!(content_plan.status, expected);
            assert_eq!(
                content_plan.rows.is_empty(),
                matches!(source, SourceState::Waiting | SourceState::Lost)
            );
        }
    }
}
