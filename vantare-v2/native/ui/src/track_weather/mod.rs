//! Track weather Eficiencia: geometría de `TrackWeatherFunctional` a 240 × 150.
//! Sin efectos temporales en el productivo: el host solo despierta por datos.

use crate::efficiency::preview::PaintWindow as Window;
use gpui::{App, BorderStyle, Corners, Edges, linear_color_stop, linear_gradient, px, quad};
use vantare_domain::{
    Snapshot,
    format::Preferences,
    track_weather::{self, Status, ViewModel},
};

use crate::app::{Paint, Wake, replace_if_changed};
use crate::efficiency::text::{self, ink};
use crate::efficiency::{col, paint_frame, paint_panel, rect, tokens};

const SIZE: (f32, f32) = (240.0, 150.0);
const SLOT_HEIGHT: f32 = 28.0;
const ROW_GAP: f32 = 1.0;
const COLUMN_WIDTH: f32 = 101.0;

#[derive(Clone, Debug, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(default, rename_all = "camelCase")]
// Claves independientes del contrato productivo, aunque su renderer aún las ignora.
#[allow(clippy::struct_excessive_bools)]
pub struct Settings {
    pub show_ambient: bool,
    pub show_track: bool,
    pub show_rain: bool,
    pub show_wind: bool,
}
impl Default for Settings {
    fn default() -> Self {
        Self {
            show_ambient: true,
            show_track: true,
            show_rain: true,
            show_wind: true,
        }
    }
}
impl Settings {
    pub const UNSUPPORTED: &'static [(&'static str, &'static str)] = &[
        (
            "showAmbient",
            "TrackWeatherFunctional no consulta este filtro",
        ),
        (
            "showTrack",
            "TrackWeatherFunctional no consulta este filtro",
        ),
        ("showRain", "TrackWeatherFunctional no consulta este filtro"),
        ("showWind", "TrackWeatherFunctional no consulta este filtro"),
    ];
    #[must_use]
    pub fn normalized(&self) -> Self {
        self.clone()
    }
}

pub(crate) struct Widget {
    vm: ViewModel,
}

impl Widget {
    pub(crate) fn new(settings: &Settings, prefs: Preferences) -> Self {
        let _ = settings;
        Self {
            vm: track_weather::project(&Snapshot::default(), prefs),
        }
    }

    #[allow(clippy::unused_self)] // Contrato del registro; tamaño fijo.
    pub(crate) fn size(&self) -> (f32, f32) {
        SIZE
    }

    pub(crate) fn ingest(&mut self, snapshot: &Snapshot, prefs: Preferences) -> bool {
        replace_if_changed(&mut self.vm, track_weather::project(snapshot, prefs))
    }

    pub(crate) fn frame(&mut self, _prefs: Preferences) -> (Paint, Wake) {
        let vm = self.vm.clone();
        (
            Box::new(move |window, cx| paint(&vm, window, cx)),
            Wake::Idle,
        )
    }

    #[cfg(feature = "parity-capture")]
    #[allow(clippy::unused_self)]
    pub(crate) fn animating(&self) -> bool {
        false
    }
}

fn paint(vm: &ViewModel, window: &mut Window, cx: &mut App) {
    let (width, height) = SIZE;
    paint_panel(window, width, height, 0.87);
    // ponytail: como Standings, primer tramo 120°; el resto es ≤ 1 %.
    // Completar los stops si una referencia exige ese brillo para la paridad.
    // Pendiente para el kit: panel con degradado y borde superior al 24 %.
    window.paint_quad(quad(
        rect(0.0, 0.0, width, height),
        Corners::all(px(tokens::RADIUS)),
        linear_gradient(
            120.0,
            linear_color_stop(col(0xffffff, 0.03), 0.0),
            linear_color_stop(col(0xffffff, 0.0), 0.38),
        ),
        Edges::all(px(0.0)),
        col(0, 0.0),
        BorderStyle::default(),
    ));

    if vm.status == Status::Ready {
        let rows = vm.metrics.len().div_ceil(2) as f32;
        let top = (height - (rows * SLOT_HEIGHT + (rows - 1.0) * ROW_GAP)) / 2.0;
        let label_ink = ink(11.0, 600.0, 0.12, col(tokens::MUTED, 1.0));
        let value_ink = ink(14.0, 650.0, 0.0, col(tokens::INK, 1.0));
        for (index, metric) in vm.metrics.iter().enumerate() {
            let x = 12.0 + (index % 2) as f32 * 115.0;
            let y = top + (index / 2) as f32 * (SLOT_HEIGHT + ROW_GAP);
            text::draw(
                window,
                cx,
                metric.label,
                x,
                text::baseline(y, 11.0, 11.0).round(),
                &label_ink,
            );
            let value = text::fit(window, &metric.value, &value_ink, COLUMN_WIDTH);
            text::draw(
                window,
                cx,
                &value,
                x,
                text::baseline(y + 13.0, 15.0, 14.0).round(),
                &value_ink,
            );
        }
    } else {
        // .vf-status conserva padding propio dentro del panel centrado.
        let status_ink = ink(14.0, 700.0, 0.0, col(0xe2c568, 1.0));
        text::draw(
            window,
            cx,
            vm.status_text,
            24.0,
            text::baseline((height - 29.0) / 2.0, 29.0, 14.0).round(),
            &status_ink,
        );
    }

    paint_frame(window, width, height);
    // Refuerzo del marco del kit: arriba el ::after productivo usa 24 %.
    window.paint_quad(quad(
        rect(0.0, 0.0, width, tokens::RADIUS),
        Corners {
            top_left: px(tokens::RADIUS),
            top_right: px(tokens::RADIUS),
            bottom_left: px(0.0),
            bottom_right: px(0.0),
        },
        col(0, 0.0),
        Edges {
            top: px(1.0),
            right: px(0.0),
            bottom: px(0.0),
            left: px(0.0),
        },
        col(0xffffff, 0.136),
        BorderStyle::default(),
    ));
}

impl Settings {
    #[allow(clippy::unused_self)] // Contrato común de demanda por renderer.
    pub fn demand(&self) -> vantare_ipc::Demand {
        use vantare_ipc::Signal::Weather;
        crate::demand::signals(500, &[Weather])
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use vantare_domain::{
        Quality,
        format::{Language, Units},
    };

    #[test]
    fn repaint_follows_visible_values_and_preferences() {
        let prefs = Preferences::default();
        let mut widget = Widget::new(&Settings::default(), prefs);
        let mut snapshot = Snapshot::default();
        assert!(!widget.ingest(&snapshot, prefs));
        snapshot.state.session.weather.air_temperature_k = Quality::Reliable(295.15);
        assert!(widget.ingest(&snapshot, prefs));
        assert!(!widget.ingest(&snapshot, prefs));
        snapshot.sequence += 1;
        snapshot.state.session.track_name = Quality::Reliable("Sebring".into());
        snapshot.state.session.weather.air_temperature_k = Quality::Reliable(295.16);
        assert!(!widget.ingest(&snapshot, prefs)); // Misma temperatura redondeada.
        assert!(widget.ingest(
            &snapshot,
            Preferences {
                units: Units::Imperial,
                language: Language::En
            }
        ));
        snapshot.state.session.weather.air_temperature_k = Quality::Stale(295.16);
        assert!(widget.ingest(&snapshot, prefs));
        assert_eq!(widget.vm.status, Status::Stale);
        assert_eq!(widget.frame(prefs).1, Wake::Idle);
        snapshot.state.session.weather.air_temperature_k = Quality::Unavailable;
        assert!(widget.ingest(&snapshot, prefs));
        assert_eq!(widget.vm.status, Status::Missing);
    }

    #[test]
    fn reference_fixture_preserves_frozen_weather_and_absent_pressure() {
        // Demostración Workshop reconstruida, no captura real de un simulador.
        let snapshot = vantare_ipc::snapshot_from_json(include_str!(
            "../../fixtures/track-weather.snapshot.json"
        ))
        .expect("escena DTO v3 válida");
        assert_eq!(
            snapshot.state.session.weather.pressure_pa,
            Quality::Unavailable
        );
        let prefs = Preferences::default();
        let mut widget = Widget::new(&Settings::default(), prefs);
        assert!(widget.ingest(&snapshot, prefs));
        assert_eq!(widget.vm.status, Status::Ready);
        assert_eq!(
            widget
                .vm
                .metrics
                .iter()
                .map(|m| m.value.as_str())
                .collect::<Vec<_>>(),
            ["28 °C", "21 °C", "14 km/h NO", "0 %", "0 %", "100%", "—"]
        );
        assert_eq!(widget.size(), SIZE);
        assert_eq!(widget.frame(prefs).1, Wake::Idle);
        #[cfg(feature = "parity-capture")]
        assert!(!widget.animating());
    }
}
