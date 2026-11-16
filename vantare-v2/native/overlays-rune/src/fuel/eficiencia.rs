//! Look Eficiencia de Fuel: 523×272, sin animación. Copia la geometría de GPUI;
//! los textos salen de `domain` para no duplicarlos.
use super::eficiencia_tokens::{self as tokens, color, fit, font};
use super::scene::{Bar, Scene};
use crate::widget::Update;
use rune::{Align, Color, El, el, text};
use std::sync::Arc;
use vantare_domain::{
    format::Preferences,
    fuel_strategy::{self, Board},
    geometry::Size,
};

pub(super) const SIZE: (f32, f32) = (523.0, 272.0);
const ROW: f32 = 23.0;
const HISTORY_TOP: f32 = 173.0;
const AMBER: u32 = 0xe2c568;

pub(super) struct Painter {
    prefs: Preferences,
    board: Arc<Board>,
    labels: fuel_strategy::Labels,
    history: Vec<(String, String)>,
    last: Option<(Arc<Board>, Preferences)>,
}

impl Painter {
    pub(super) fn new(prefs: Preferences, scene: &Scene) -> Self {
        let mut painter = Self {
            prefs,
            board: scene.board.clone(),
            labels: fuel_strategy::labels(&scene.board, prefs),
            history: Vec::new(),
            last: None,
        };
        painter.refresh();
        painter.last = Some((painter.board.clone(), prefs));
        painter
    }
    pub(super) fn size(&self) -> Size {
        Size {
            width: SIZE.0,
            height: SIZE.1,
        }
    }
    /// Este Look no tiene líneas propias: la sesión no cambia nada.
    pub(super) fn prepare(
        &mut self,
        _board: &Arc<Board>,
        _session: Option<vantare_domain::widget_session::Session>,
    ) -> bool {
        false
    }
    /// Eficiencia no anima nada.
    pub(super) fn targets(&self) -> Vec<(Bar, f32)> {
        Vec::new()
    }
    pub(super) fn pulses(&self) -> bool {
        false
    }
    pub(super) fn view(&self) -> El {
        view(self)
    }
    pub(super) fn sync(&mut self, scene: &Scene) -> Update {
        let build = self
            .last
            .as_ref()
            .is_none_or(|(board, prefs)| !Arc::ptr_eq(board, &scene.board) || *prefs != self.prefs);
        if build {
            self.board = scene.board.clone();
            self.refresh();
            self.last = Some((self.board.clone(), self.prefs));
        }
        Update {
            build,
            pixels: build,
        }
    }
    fn refresh(&mut self) {
        self.labels = fuel_strategy::labels(&self.board, self.prefs);
        self.history = self
            .board
            .history_rows()
            .map(|(_, row)| {
                (
                    fuel_strategy::history_lap(row.lap, self.prefs.language),
                    fuel_strategy::history_consumed(row.consumed),
                )
            })
            .collect();
    }
}

fn view(state: &Painter) -> El {
    let mut root = el()
        .key("fuel-efi-view")
        .size(SIZE.0, SIZE.1)
        .motion(rune::Spring::NONE)
        .child(
            el().key("efi-panel")
                .size(SIZE.0, SIZE.1)
                .radius(tokens::RADIUS)
                .fill(color(tokens::PANEL, 0.87)),
        )
        .child(
            el().key("efi-shine")
                .size(SIZE.0, SIZE.1)
                .radius(tokens::RADIUS)
                .linear_gradient(
                    std::f32::consts::PI * 120.0 / 180.0,
                    [(0.0, color(0xffffff, 0.03)), (1.0, color(0xffffff, 0.0))],
                ),
        );
    if let Some(status) = state.labels.status {
        return root
            .child(cell(
                status,
                "status",
                [0.0, (SIZE.1 - 14.0) / 2.0, SIZE.0, 14.0],
                14.0,
                600.0,
                color(tokens::MUTED, 1.0),
                Align::Center,
                None,
            ))
            .child(frame());
    }
    root = root
        .child(cell(
            state.labels.labels[0],
            "title",
            [7.0, 22.0, SIZE.0 - 14.0, 11.0],
            11.0,
            600.0,
            color(tokens::MUTED, 1.0),
            Align::Start,
            None,
        ))
        .child(cell(
            &state.labels.fuel,
            "fuel",
            [0.0, 14.0, SIZE.0 - 7.0, 28.0],
            28.0,
            700.0,
            color(tokens::INK, 1.0),
            Align::End,
            None,
        ))
        .child(cell(
            "MIN",
            "min-caption",
            [104.0, 58.0, 30.0, ROW],
            11.0,
            600.0,
            color(tokens::MUTED, 1.0),
            Align::Start,
            None,
        ))
        .child(cell(
            &state.labels.minimum,
            "min-value",
            [134.0, 58.0, 87.0, ROW],
            14.0,
            650.0,
            color(tokens::INK, 1.0),
            Align::Start,
            Some(87.0),
        ))
        .child(cell(
            "MAX",
            "max-caption",
            [250.0, 58.0, 30.0, ROW],
            11.0,
            600.0,
            color(tokens::MUTED, 1.0),
            Align::Start,
            None,
        ))
        .child(cell(
            &state.labels.maximum,
            "max-value",
            [280.0, 58.0, 87.0, ROW],
            14.0,
            650.0,
            color(tokens::INK, 1.0),
            Align::Start,
            Some(87.0),
        ));
    if state.labels.show_projection {
        root = root
            .child(cell(
                state.labels.stops_label,
                "stops-caption",
                [164.0, 127.0, 60.0, ROW],
                11.0,
                600.0,
                color(tokens::MUTED, 1.0),
                Align::Start,
                None,
            ))
            .child(cell(
                &state.labels.stops,
                "stops-value",
                [240.0, 127.0, 90.0, ROW],
                14.0,
                650.0,
                color(AMBER, 1.0),
                Align::Start,
                Some(90.0),
            ));
    }
    let values = [
        &state.labels.average,
        &state.labels.laps,
        &state.labels.required,
        &state.labels.finish,
    ];
    for (index, value) in values.into_iter().enumerate() {
        if !state.labels.show_projection && index > 0 {
            continue;
        }
        let top = 58.0 + index as f32 * ROW;
        root = root
            .child(
                el().key(format!("rule-{index}"))
                    .size(SIZE.0 - 14.0, 1.0)
                    .fill(color(tokens::INK, 0.08))
                    .pin(Some(7.0), Some(top), None, None),
            )
            .child(cell(
                state.labels.labels[index + 1],
                format!("label-{index}"),
                [7.0, top, 200.0, ROW],
                11.0,
                600.0,
                color(tokens::MUTED, 1.0),
                Align::Start,
                None,
            ))
            .child(cell(
                value,
                format!("value-{index}"),
                [0.0, top, SIZE.0 - 7.0, ROW],
                14.0,
                650.0,
                if index >= 2 {
                    color(AMBER, 1.0)
                } else {
                    color(tokens::INK, 1.0)
                },
                Align::End,
                None,
            ));
    }
    if !state.history.is_empty() {
        root = root.child(cell(
            state.labels.history_label,
            "history-title",
            [7.0, HISTORY_TOP - ROW, SIZE.0 - 14.0, ROW],
            11.0,
            600.0,
            color(tokens::MUTED, 1.0),
            Align::Start,
            None,
        ));
        for (index, (lap, consumed)) in state.history.iter().enumerate() {
            let [left, top, width, _] = history_cell(index, state.history.len());
            root = root
                .child(
                    el().key(format!("history-{index}"))
                        .size(width, ROW - 1.0)
                        .fill(color(tokens::INK, 0.03))
                        .pin(Some(left), Some(top), None, None),
                )
                .child(cell(
                    lap,
                    format!("history-lap-{index}"),
                    [left + 6.0, top, width - 12.0, ROW],
                    11.0,
                    600.0,
                    color(tokens::MUTED, 1.0),
                    Align::Start,
                    None,
                ))
                .child(cell(
                    consumed,
                    format!("history-value-{index}"),
                    [0.0, top, left + width - 6.0, ROW],
                    14.0,
                    700.0,
                    color(tokens::INK, 1.0),
                    Align::End,
                    None,
                ));
        }
    }
    root.child(frame())
}

/// Marco del panel: 1 px al 12 % y refuerzo superior hasta el 24 %.
fn frame() -> El {
    el().key("efi-frame")
        .size(SIZE.0, SIZE.1)
        .radius(tokens::RADIUS)
        .border(1.0, color(0xffffff, 0.12))
        .border_sides(
            [1.0, 0.0, 0.0, 0.0],
            color(0xffffff, (0.24 - 0.12) / (1.0 - 0.12)),
        )
}

/// Caja de una vuelta del historial: dos columnas de cuatro como máximo.
fn history_cell(index: usize, count: usize) -> [f32; 4] {
    let columns = count.div_ceil(4).max(1);
    let width = (SIZE.0 - 14.0) / columns as f32;
    [
        7.0 + (index / 4) as f32 * width,
        HISTORY_TOP + (index % 4) as f32 * ROW,
        width,
        ROW - 1.0,
    ]
}

#[allow(clippy::too_many_arguments)] // Texto: sitio, tamaño, tinta y recorte.
fn cell(
    value: &str,
    key: impl Into<String>,
    area: [f32; 4],
    size: f32,
    weight: f32,
    ink: Color,
    align: Align,
    fit_to: Option<f32>,
) -> El {
    let [x, y, width, height] = area;
    let value = fit_to.map_or_else(|| value.to_string(), |max| fit(value, max, size, weight));
    text(&value)
        .key(key)
        .font(font(size, weight))
        .color(ink)
        .size(width, height)
        .align(align)
        .pin(Some(x), Some(y), None, None)
}

#[cfg(test)]
mod tests {
    use super::*;
    use vantare_domain::{Quality::Reliable, format::Language};

    fn scene(level: f64, laps: &[(u32, f64)], status: bool) -> Scene {
        let mut photo = crate::fuel::photo(11.3, 25);
        let player = photo.state.player.as_mut().expect("player");
        player.fuel.level_l = Reliable(level);
        player.fuel.per_lap_l = Reliable(2.14);
        player.fuel.laps_left = vantare_domain::Quality::Unavailable;
        for (slot, (lap, litres)) in laps.iter().enumerate() {
            player.fuel.history[slot] = Some((*lap, *litres));
        }
        photo.state.session.laps_remaining = Reliable(79);
        if status {
            photo.state.source_state = vantare_domain::SourceState::Waiting;
        }
        let board = crate::fuel::board_of(&photo);
        Scene {
            board: Arc::new(board),
            bars: Vec::new(),
            border: 0.0,
        }
    }

    #[test]
    fn size_is_fixed_at_the_catalogue_frame() {
        let painter = Painter::new(Preferences::default(), &scene(42.0, &[], false));
        assert_eq!(painter.size().width, 523.0);
        assert_eq!(painter.size().height, 272.0);
        assert!(painter.targets().is_empty(), "Eficiencia no anima");
        assert!(!painter.pulses());
    }

    #[test]
    fn values_come_from_domain_and_keep_the_gpui_texts() {
        let painter = Painter::new(Preferences::default(), &scene(42.0, &[], false));
        let labels = &painter.labels;
        assert_eq!(labels.fuel, "42.0 L");
        assert_eq!(labels.average, "2.14 L");
        assert_eq!(labels.laps, "79.0");
        assert_eq!(labels.required, "169.1 L");
        assert_eq!(labels.finish, "169.1 L NEC.");
        assert_eq!(labels.labels[0], "COMBUSTIBLE");
        assert_eq!(labels.stops_label, "PARADAS");
        let english = Painter::new(
            Preferences {
                language: Language::En,
                ..Preferences::default()
            },
            &scene(42.0, &[], false),
        );
        assert_eq!(english.labels.labels[0], "FUEL");
        assert_eq!(english.labels.stops_label, "STOPS");
    }

    #[test]
    fn history_uses_two_columns_of_four_and_keeps_the_gpui_rows() {
        let laps: Vec<(u32, f64)> = (14..22)
            .map(|lap| (lap, 2.1 + f64::from(lap % 3) / 10.0))
            .collect();
        let mut photo = crate::fuel::photo(11.3, 25);
        let player = photo.state.player.as_mut().expect("player");
        player.fuel.level_l = Reliable(42.0);
        for (slot, (lap, litres)) in laps.iter().enumerate() {
            player.fuel.history[slot] = Some((*lap, *litres));
        }
        let board = fuel_strategy::project_with_config(
            &photo,
            Preferences::default(),
            fuel_strategy::Config {
                history_rows: 8,
                ..fuel_strategy::Config::default()
            },
        );
        let painter = Painter::new(
            Preferences::default(),
            &Scene {
                board: Arc::new(board),
                bars: Vec::new(),
                border: 0.0,
            },
        );
        assert_eq!(painter.history.len(), 8);
        assert_eq!(painter.history[0].0, "VUELTA 21", "recientes primero");
        assert_eq!(painter.history[7].0, "VUELTA 14");
        let first = history_cell(0, 8);
        let fifth = history_cell(4, 8);
        assert_eq!(first[0], 7.0);
        assert_eq!(first[1], HISTORY_TOP);
        assert_eq!(fifth[0], 7.0 + (SIZE.0 - 14.0) / 2.0);
        assert_eq!(fifth[1], HISTORY_TOP);
        let last = history_cell(7, 8);
        assert_eq!(last[1], HISTORY_TOP + 3.0 * ROW);
    }

    #[test]
    fn a_status_hides_the_data_and_still_builds() {
        let painter = Painter::new(Preferences::default(), &scene(42.0, &[], true));
        assert_eq!(painter.labels.status, Some("SIN DATOS"));
        let _ = painter.view();
    }

    #[test]
    fn without_projection_only_the_average_row_survives() {
        let mut photo = crate::fuel::photo(11.3, 25);
        photo.state.player.as_mut().expect("player").fuel.level_l = Reliable(42.0);
        let board = crate::fuel::board_of(&photo);
        let labels = fuel_strategy::labels(&board, Preferences::default());
        assert!(labels.show_projection);
        let scene = Scene {
            board: Arc::new(board),
            bars: Vec::new(),
            border: 0.0,
        };
        let painter = Painter::new(Preferences::default(), &scene);
        let _ = painter.view();
    }
}
