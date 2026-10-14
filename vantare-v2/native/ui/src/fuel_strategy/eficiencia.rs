use crate::efficiency::preview::PaintWindow as Window;
use gpui::{App, BorderStyle, Corners, Edges, linear_color_stop, linear_gradient, px, quad};
use std::sync::OnceLock;

use vantare_domain::{
    format::Preferences,
    fuel_strategy::{self, Board},
};

use crate::efficiency::text::{self, Ink, ink};
use crate::efficiency::{col, paint_highlighted_frame, paint_panel, paint_rect, rect, tokens};

pub const SIZE: (f32, f32) = (523.0, 272.0);
pub(super) const ROW_HEIGHT: f32 = 23.0;
pub(super) const HISTORY_TOP: f32 = 173.0;

fn draw(window: &mut Window, cx: &mut App, value: &str, x: f32, top: f32, style: &Ink) {
    text::draw(
        window,
        cx,
        value,
        x,
        text::baseline(top, style.size, style.size),
        style,
    );
}

pub fn paint(vm: &Labels, window: &mut Window, cx: &mut App) {
    paint_panel(window, SIZE.0, SIZE.1, 0.87);
    // Igual al panel Standings; el kit aún no expone el brillo común.
    window.paint_quad(quad(
        rect(0.0, 0.0, SIZE.0, SIZE.1),
        Corners::all(px(tokens::RADIUS)),
        linear_gradient(
            120.0,
            linear_color_stop(col(0xffffff, 0.03), 0.0),
            linear_color_stop(col(0xffffff, 0.0), 0.38),
        ),
        Edges::all(px(0.0)),
        col(0x000000, 0.0),
        BorderStyle::default(),
    ));
    if let Some(status) = vm.status {
        let style = ink(14.0, 600.0, 0.14, col(tokens::MUTED, 1.0));
        draw(
            window,
            cx,
            status,
            (SIZE.0 - text::width(window, status, &style)) / 2.0,
            (SIZE.1 - 14.0) / 2.0,
            &style,
        );
    } else {
        paint_main(vm, window, cx);
        paint_history(vm, window, cx);
    }
    paint_highlighted_frame(window, SIZE.0, SIZE.1);
}

fn paint_main(vm: &Labels, window: &mut Window, cx: &mut App) {
    let label = ink(11.0, 600.0, 0.0, col(tokens::MUTED, 1.0));
    let fuel = ink(28.0, 700.0, 0.0, col(tokens::INK, 1.0));
    draw(window, cx, vm.labels[0], 7.0, 22.0, &label);
    draw(
        window,
        cx,
        &vm.fuel,
        SIZE.0 - 7.0 - text::width(window, &vm.fuel, &fuel),
        14.0,
        &fuel,
    );
    // Celdas en el espacio libre de las filas existentes: medidas intactas.
    for (caption, value, left) in [
        ("MIN", &vm.fitted.get().expect("prepared labels")[0], 104.0),
        ("MAX", &vm.fitted.get().expect("prepared labels")[1], 250.0),
    ] {
        text::draw(
            window,
            cx,
            caption,
            left,
            text::baseline(58.0, ROW_HEIGHT, 11.0).round(),
            &label,
        );
        let style = ink(14.0, 650.0, 0.0, col(tokens::INK, 1.0));
        text::draw(
            window,
            cx,
            value,
            left + 30.0,
            text::baseline(58.0, ROW_HEIGHT, 14.0).round(),
            &style,
        );
    }
    if vm.show_projection {
        text::draw(
            window,
            cx,
            vm.stops_label,
            164.0,
            text::baseline(127.0, ROW_HEIGHT, 11.0).round(),
            &label,
        );
        let style = ink(14.0, 650.0, 0.0, col(0xe2c568, 1.0));
        let stops = &vm.fitted.get().expect("prepared labels")[2];
        text::draw(
            window,
            cx,
            stops,
            240.0,
            text::baseline(127.0, ROW_HEIGHT, 14.0).round(),
            &style,
        );
    }
    for (index, value) in [&vm.average, &vm.laps, &vm.required, &vm.finish]
        .into_iter()
        .enumerate()
    {
        if !vm.show_projection && index > 0 {
            continue;
        }
        let top = 58.0 + index as f32 * ROW_HEIGHT;
        paint_rect(window, 7.0, top, SIZE.0 - 14.0, 1.0, col(tokens::INK, 0.08));
        let style = ink(
            14.0,
            650.0,
            0.0,
            col(if index >= 2 { 0xe2c568 } else { tokens::INK }, 1.0),
        );
        text::draw(
            window,
            cx,
            vm.labels[index + 1],
            7.0,
            text::baseline(top, ROW_HEIGHT, 11.0).round(),
            &label,
        );
        text::draw(
            window,
            cx,
            value,
            SIZE.0 - 7.0 - text::width(window, value, &style),
            text::baseline(top, ROW_HEIGHT, 14.0).round(),
            &style,
        );
    }
}

fn paint_history(vm: &Labels, window: &mut Window, cx: &mut App) {
    if vm.history.is_empty() {
        return;
    }
    let title = ink(11.0, 600.0, 0.0, col(tokens::MUTED, 1.0));
    text::draw(
        window,
        cx,
        vm.history_label,
        7.0,
        text::baseline(HISTORY_TOP - ROW_HEIGHT, ROW_HEIGHT, 11.0).round(),
        &title,
    );
    let value = ink(14.0, 700.0, 0.0, col(tokens::INK, 1.0));
    // Up to eight canonical laps fit in two columns, retaining 23 px rows.
    let columns = vm.history.len().div_ceil(4);
    let width = (SIZE.0 - 14.0) / columns as f32;
    for (index, row) in vm.history.iter().enumerate() {
        let left = 7.0 + (index / 4) as f32 * width;
        let top = HISTORY_TOP + (index % 4) as f32 * ROW_HEIGHT;
        paint_rect(
            window,
            left,
            top,
            width,
            ROW_HEIGHT - 1.0,
            col(tokens::INK, 0.03),
        );
        text::draw(
            window,
            cx,
            &row.lap,
            left + 6.0,
            text::baseline(top, ROW_HEIGHT, 11.0).round(),
            &title,
        );
        text::draw(
            window,
            cx,
            &row.consumed,
            left + width - 6.0 - text::width(window, &row.consumed, &value),
            text::baseline(top, ROW_HEIGHT, 14.0).round(),
            &value,
        );
    }
}

#[derive(Debug, PartialEq)]
pub(crate) struct HistoryText {
    pub lap: String,
    pub consumed: String,
}
#[derive(Debug)]
pub(crate) struct Labels {
    values: fuel_strategy::Labels,
    pub history: Vec<HistoryText>,
    fitted: OnceLock<[String; 3]>,
}
impl PartialEq for Labels {
    fn eq(&self, other: &Self) -> bool {
        self.values == other.values && self.history == other.history
    }
}
impl std::ops::Deref for Labels {
    type Target = fuel_strategy::Labels;
    fn deref(&self) -> &Self::Target {
        &self.values
    }
}
impl Labels {
    /// Window aporta las métricas de fuente: `OnceLock` las fija en la primera
    /// preparación de este Board/presentación. Rebuild/nuevas etiquetas invalidan
    /// la caché; después paint solo lee. No modifica datos, historial ni Motion.
    pub(crate) fn prepare(&self, window: &Window) {
        self.fitted.get_or_init(|| {
            let values = ink(14.0, 650.0, 0.0, col(tokens::INK, 1.0));
            let stops = ink(14.0, 650.0, 0.0, col(0xe2c568, 1.0));
            [
                text::fit(window, &self.minimum, &values, 87.0),
                text::fit(window, &self.maximum, &values, 87.0),
                text::fit(window, &self.stops, &stops, 90.0),
            ]
        });
    }
    pub(crate) fn new(board: &Board, prefs: Preferences) -> Self {
        #[cfg(feature = "parity-capture")]
        crate::benchmark::mark(crate::benchmark::Work::Labels);
        Self {
            fitted: OnceLock::new(),
            values: fuel_strategy::labels(board, prefs),
            history: board
                .history_rows()
                .map(|(_, row)| HistoryText {
                    lap: fuel_strategy::history_lap(row.lap, prefs.language),
                    consumed: fuel_strategy::history_consumed(row.consumed),
                })
                .collect(),
        }
    }
}
