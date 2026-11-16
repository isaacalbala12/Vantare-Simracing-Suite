//! Look Eficiencia de Fuel: 523×272, sin animación. Geometría de GPUI; los
//! textos salen de `domain` y los tokens y medidas del módulo común Eficiencia.
use super::scene::{Bar, Scene};
use crate::eficiencia::{self, INK, MUTED, PANEL, RADIUS};
use crate::widget::Update;
use rune::{Color, El, el};
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
/// Marco del panel: lados al 12 % y borde superior compuesto al 24 %.
const FRAME: f32 = 0.12;
const FRAME_TOP: f32 = 0.24;

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
        .child(eficiencia::panel(SIZE.0, SIZE.1).pin(Some(0.0), Some(0.0), None, None));
    if let Some(status) = state.labels.status {
        let style = eficiencia::font(14.0, 600, 0.14);
        let x = (SIZE.0 - eficiencia::width(status, style)) / 2.0;
        let base = eficiencia::baseline((SIZE.1 - 14.0) / 2.0, 14.0, 14.0);
        return root
            .child(outline().pin(Some(0.0), Some(0.0), None, None))
            .child(eficiencia::label(
                status,
                x,
                base,
                style,
                eficiencia::color(MUTED, 1.0),
            ));
    }
    let ink = eficiencia::color(INK, 1.0);
    let muted = eficiencia::color(MUTED, 1.0);
    let amber = eficiencia::color(AMBER, 1.0);
    root = left(
        root,
        state.labels.labels[0],
        7.0,
        22.0,
        11.0,
        11.0,
        600,
        muted,
    );
    root = right(
        root,
        &state.labels.fuel,
        SIZE.0 - 7.0,
        14.0,
        28.0,
        28.0,
        700,
        ink,
    );
    root = left(root, "MIN", 104.0, 58.0, ROW, 11.0, 600, muted);
    root = fitted(
        root,
        &state.labels.minimum,
        134.0,
        58.0,
        ROW,
        14.0,
        650,
        ink,
        87.0,
    );
    root = left(root, "MAX", 250.0, 58.0, ROW, 11.0, 600, muted);
    root = fitted(
        root,
        &state.labels.maximum,
        280.0,
        58.0,
        ROW,
        14.0,
        650,
        ink,
        87.0,
    );
    if state.labels.show_projection {
        root = left(
            root,
            state.labels.stops_label,
            164.0,
            127.0,
            ROW,
            11.0,
            600,
            muted,
        );
        root = fitted(
            root,
            &state.labels.stops,
            240.0,
            127.0,
            ROW,
            14.0,
            650,
            amber,
            90.0,
        );
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
            .child(eficiencia::rect(
                7.0,
                top,
                SIZE.0 - 14.0,
                1.0,
                eficiencia::color(INK, 0.08),
            ))
            .child(eficiencia::label(
                state.labels.labels[index + 1],
                7.0,
                eficiencia::baseline(top, ROW, 11.0),
                eficiencia::font(11.0, 600, 0.0),
                muted,
            ));
        root = right(
            root,
            value,
            SIZE.0 - 7.0,
            top,
            ROW,
            14.0,
            650,
            if index >= 2 { amber } else { ink },
        );
    }
    if !state.history.is_empty() {
        root = left(
            root,
            state.labels.history_label,
            7.0,
            HISTORY_TOP - ROW,
            ROW,
            11.0,
            600,
            muted,
        );
        for (index, (lap, consumed)) in state.history.iter().enumerate() {
            let [left_edge, top, width, _] = history_cell(index, state.history.len());
            root = root
                .child(eficiencia::rect(
                    left_edge,
                    top,
                    width,
                    ROW - 1.0,
                    eficiencia::color(INK, 0.03),
                ))
                .child(eficiencia::label(
                    lap,
                    left_edge + 6.0,
                    eficiencia::baseline(top, ROW, 11.0),
                    eficiencia::font(11.0, 600, 0.0),
                    muted,
                ));
            root = right(
                root,
                consumed,
                left_edge + width - 6.0,
                top,
                ROW,
                14.0,
                700,
                ink,
            );
        }
    }
    root.child(outline().pin(Some(0.0), Some(0.0), None, None))
}

/// Marco común con los valores de GPUI de Fuel: 12 % de base y 24 % arriba.
fn outline() -> El {
    eficiencia::outline(SIZE.0, SIZE.1, FRAME, FRAME_TOP)
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

fn style(size: f32, weight: u16) -> rune::TextStyle {
    eficiencia::font(size, weight, 0.0)
}

/// Texto alineado a la izquierda, con la línea base CSS de GPUI.
#[allow(clippy::too_many_arguments)] // Un texto: sitio, línea, fuente y tinta.
fn left(
    root: El,
    value: &str,
    x: f32,
    top: f32,
    line_height: f32,
    size: f32,
    weight: u16,
    ink: Color,
) -> El {
    root.child(eficiencia::label(
        value,
        x,
        eficiencia::baseline(top, line_height, size),
        style(size, weight),
        ink,
    ))
}

/// Texto alineado a la derecha por su borde derecho, como `right − ancho`.
#[allow(clippy::too_many_arguments)] // Un texto: sitio, línea, fuente y tinta.
fn right(
    root: El,
    value: &str,
    edge: f32,
    top: f32,
    line_height: f32,
    size: f32,
    weight: u16,
    ink: Color,
) -> El {
    let x = edge - eficiencia::width(value, style(size, weight));
    left(root, value, x, top, line_height, size, weight, ink)
}

/// Valor recortado con puntos suspensivos al ancho que fija GPUI.
#[allow(clippy::too_many_arguments)] // Un texto: sitio, línea, fuente y tinta.
fn fitted(
    root: El,
    value: &str,
    x: f32,
    top: f32,
    line_height: f32,
    size: f32,
    weight: u16,
    ink: Color,
    max: f32,
) -> El {
    let text = eficiencia::fit(value, style(size, weight), max);
    left(root, &text, x, top, line_height, size, weight, ink)
}

#[cfg(test)]
mod tests {
    use super::*;
    use rune::render::Instance;
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

    fn draw(painter: Painter) -> Vec<Instance> {
        fn view(painter: &Painter, _: &mut rune::Cx<Painter>) -> El {
            painter.view()
        }
        fn poll(_: &mut Painter, _: f64, _: &mut rune::Tx) -> bool {
            true
        }
        let mut runtime = rune::Runtime::with_text(
            painter,
            view,
            (523.0, 272.0),
            rune::Env::new(true, 1.0),
            rune::text::TextSystem::new(eficiencia::FONTS, ("Inter W400", "Inter W400")),
        );
        runtime.poll = Some(poll);
        runtime.frame(0.0);
        runtime.instances.clone()
    }

    fn at(instances: &[Instance], x: f32, y: f32, width: f32, height: f32) -> Vec<&Instance> {
        instances
            .iter()
            .filter(|instance| {
                (instance.rect[0] - x).abs() < 0.02
                    && (instance.rect[1] - y).abs() < 0.02
                    && (instance.rect[2] - width).abs() < 0.02
                    && (instance.rect[3] - height).abs() < 0.02
            })
            .collect()
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
    fn panel_and_frame_keep_the_two_gpui_layers() {
        let instances = draw(Painter::new(
            Preferences::default(),
            &scene(42.0, &[], false),
        ));
        let panel = at(&instances, 0.0, 0.0, SIZE.0, SIZE.1);
        assert!(
            panel
                .iter()
                .any(|instance| (instance.fill[3] - 0.87).abs() < 0.01),
            "fondo del panel al 87 %"
        );
        assert!(
            panel
                .iter()
                .any(|instance| (instance.border[3] - FRAME).abs() < 0.01),
            "anillo completo al 12 %"
        );
        let top = at(&instances, 0.0, 0.0, SIZE.0, RADIUS);
        assert!(
            top.iter().any(|instance| {
                (instance.border[3] - (FRAME_TOP - FRAME) / (1.0 - FRAME)).abs() < 0.01
            }),
            "tira superior con el borde al 24 % compuesto"
        );
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
        assert_eq!(painter.labels.fuel, "—", "con aviso no se pintan litros");
        assert_eq!(painter.labels.average, "—");
        assert!(painter.history.is_empty(), "sin aviso no hay historial");
        let instances = draw(painter);
        assert!(
            at(&instances, 0.0, 0.0, SIZE.0, SIZE.1)
                .iter()
                .any(|instance| (instance.fill[3] - 0.87).abs() < 0.01),
            "el panel sigue"
        );
    }

    #[test]
    fn without_projection_only_the_average_row_survives() {
        let mut photo = crate::fuel::photo(11.3, 25);
        let player = photo.state.player.as_mut().expect("player");
        player.fuel.level_l = Reliable(42.0);
        player.fuel.per_lap_l = Reliable(2.14);
        player.fuel.laps_left = vantare_domain::Quality::Unavailable;
        let board = fuel_strategy::project_with_config(
            &photo,
            Preferences::default(),
            fuel_strategy::Config {
                show_projection: false,
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
        assert!(!painter.labels.show_projection);
        assert_eq!(painter.labels.average, "2.14 L", "MED. se queda");
        assert_eq!(painter.labels.laps, "—", "VUELTAS se apaga");
        assert_eq!(painter.labels.required, "—", "NEC. se apaga");
        assert_eq!(painter.labels.finish, "—", "EST. META se apaga");
        let _ = draw(painter);
    }
}
