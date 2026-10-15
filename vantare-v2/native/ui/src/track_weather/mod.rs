//! Tiempo en pista: tarjeta de 280 × 210 o columna vertical de 132 × 440.
//! Sin efectos temporales en el productivo: el host solo despierta por datos.

use crate::efficiency::preview::PaintWindow as Window;
use gpui::{App, PathBuilder, point, px};
use vantare_domain::{
    Snapshot,
    format::Preferences,
    track_weather::{self, Status, ViewModel},
};

use crate::app::{Paint, Wake, replace_if_changed};
use crate::vantare::{
    paint::{Face, Kit, round_rect},
    style::{Color, Style},
};
const SIZE: (f32, f32) = (132.0, 440.0);
const WIDE: (f32, f32) = (280.0, 210.0);

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
    vertical: bool,
    vm: ViewModel,
    session: String,
    wind_heading: Option<f32>,
}

impl Widget {
    pub(crate) fn new(settings: &Settings, prefs: Preferences) -> Self {
        Self {
            vertical: settings.vertical,
            vm: track_weather::project(&Snapshot::default(), prefs),
            session: String::new(),
            wind_heading: None,
        }
    }

    pub(crate) fn size(&self) -> (f32, f32) {
        if self.vertical { SIZE } else { WIDE }
    }

    pub(crate) fn ingest(&mut self, snapshot: &Snapshot, prefs: Preferences) -> bool {
        let label = snapshot
            .state
            .session
            .kind
            .current()
            .map_or_else(String::new, |kind| {
                let name = vantare_domain::format::session_kind(kind, prefs);
                if kind.ranks_by_best_lap() {
                    let clock = vantare_domain::format::clock(
                        snapshot.state.session.remaining_s.current().copied(),
                    );
                    let clock = if clock.len() == 4 {
                        format!("0{clock}")
                    } else {
                        clock
                    };
                    format!("{name} · {clock}")
                } else {
                    name
                }
            });
        let changed = replace_if_changed(&mut self.session, label);
        let heading = snapshot
            .state
            .session
            .weather
            .wind_direction_rad
            .current()
            .filter(|value| value.is_finite())
            .map(|value| *value as f32);
        let wind_changed = replace_if_changed(&mut self.wind_heading, heading) && !self.vertical;
        replace_if_changed(&mut self.vm, track_weather::project(snapshot, prefs))
            || changed
            || wind_changed
    }

    pub(crate) fn frame(&mut self, prefs: Preferences, _reduced: bool) -> (Paint, Wake) {
        let vm = self.vm.clone();
        let vertical = self.vertical;
        let session = self.session.clone();
        let wind_heading = self.wind_heading;
        (
            Box::new(move |window, cx| {
                if vertical {
                    paint(&vm, prefs, window, cx);
                } else {
                    paint_wide(&vm, &session, wind_heading, prefs, window, cx);
                }
            }),
            Wake::Idle,
        )
    }

    #[cfg(feature = "parity-capture")]
    #[allow(clippy::unused_self)]
    pub(crate) fn animating(&self) -> bool {
        false
    }
}

/// Tarjeta horizontal del catálogo: temperaturas, viento, agua y los cinco pasos del pronóstico.
fn paint_wide(
    vm: &ViewModel,
    session: &str,
    wind_heading: Option<f32>,
    prefs: Preferences,
    window: &mut Window,
    cx: &mut App,
) {
    let style = Style::compiled();
    let kit = Kit {
        style: &style,
        variant: &style.styles.neo,
        accent: style.accents.red,
        language: prefs.language,
        width: WIDE.0,
    };
    kit.panel(window, WIDE.1);
    if matches!(vm.status, Status::Missing | Status::Disconnected) {
        let muted = kit.ink(Face::Body, 11.0, 0.3, style.colors.muted.hsla());
        kit.label(
            window,
            cx,
            if kit.es() {
                "TIEMPO EN PISTA"
            } else {
                "TRACK WEATHER"
            },
            14.0,
            None,
            10.0,
            18.0,
            Face::Body,
            &muted,
        );
        for (x, size, label) in [
            (14.0, 24.0, if kit.es() { "pista" } else { "track" }),
            (104.0, 18.0, if kit.es() { "aire" } else { "air" }),
        ] {
            let ink = kit.ink(Face::Mono, size, 0.0, Color(0x5e5658, 1.0).hsla());
            kit.label(window, cx, "--°", x, None, 36.0, 34.0, Face::Mono, &ink);
            kit.label(window, cx, label, x, None, 74.0, 14.0, Face::Body, &muted);
        }
        round_rect(
            window,
            14.0,
            109.0,
            7.0,
            7.0,
            3.5,
            style.colors.muted.hsla(),
        );
        kit.label(
            window,
            cx,
            if kit.es() {
                "Esperando a LMU"
            } else {
                "Waiting for LMU"
            },
            28.0,
            None,
            102.0,
            20.0,
            Face::Body,
            &muted,
        );
        return;
    }
    let metric = |i: usize| vm.metrics.get(i).map_or("—", |m| m.value.as_str());
    let wet = metric(4)
        .split_whitespace()
        .next()
        .and_then(|s| s.parse::<f32>().ok());
    let is_wet = wet.is_some_and(|v| v > 0.0);
    let banner = if vm.status != Status::Ready {
        vm.status_text
    } else if is_wet {
        if kit.es() {
            "PISTA MOJADA"
        } else {
            "WET TRACK"
        }
    } else if kit.es() {
        "SECO"
    } else {
        "DRY"
    };
    let muted = kit.ink(Face::Body, 10.0, 0.4, style.colors.muted.hsla());
    let text = style.colors.text.hsla();
    round_rect(
        window,
        1.0,
        1.0,
        278.0,
        26.0,
        8.0,
        Color(if is_wet { 0x20334f } else { 0x2b2527 }, 1.0).hsla(),
    );
    let heading = kit.ink(Face::Display, 11.0, 0.5, text);
    kit.label(
        window,
        cx,
        banner,
        12.0,
        None,
        6.0,
        18.0,
        Face::Display,
        &heading,
    );
    kit.label(
        window,
        cx,
        if kit.es() {
            "TIEMPO EN PISTA"
        } else {
            "TRACK WEATHER"
        },
        14.0,
        None,
        38.0,
        14.0,
        Face::Body,
        &muted,
    );
    let big = kit.ink(Face::Display, 32.0, 0.0, Color(0xfaf7f7, 1.0).hsla());
    kit.label(
        window,
        cx,
        &session.to_uppercase(),
        0.0,
        Some(266.0),
        38.0,
        14.0,
        Face::Body,
        &muted,
    );
    let track = metric(0)
        .split_whitespace()
        .next()
        .filter(|s| *s != "—")
        .map_or_else(|| "--°".into(), |s| format!("{s}°"));
    kit.label(
        window,
        cx,
        &track,
        14.0,
        None,
        54.0,
        34.0,
        Face::Display,
        &big,
    );
    kit.label(
        window,
        cx,
        if kit.es() { "PISTA" } else { "TRACK" },
        14.0,
        None,
        92.0,
        14.0,
        Face::Body,
        &muted,
    );
    let mid = kit.ink(Face::Display, 22.0, 0.0, text);
    let air = metric(1).replace(" °C", "°").replace(" °F", "°");
    kit.label(
        window,
        cx,
        &air,
        104.0,
        None,
        62.0,
        26.0,
        Face::Display,
        &mid,
    );
    kit.label(
        window,
        cx,
        if kit.es() { "AIRE" } else { "AIR" },
        104.0,
        None,
        92.0,
        14.0,
        Face::Body,
        &muted,
    );
    let mono = kit.ink(Face::Mono, 13.0, 0.0, text);
    if let Some(heading) = wind_heading {
        window.paint_quad(gpui::quad(
            crate::efficiency::rect(193.0, 69.0, 20.0, 20.0),
            gpui::Corners::all(px(10.0)),
            gpui::transparent_black(),
            gpui::Edges::all(px(1.0)),
            Color(0xffffff, 0.12).hsla(),
            gpui::BorderStyle::default(),
        ));
        let (ox, oy) = crate::efficiency::text::origin();
        let (sin, cos) = heading.sin_cos();
        let mut arrow = PathBuilder::fill();
        for (i, (x, y)) in [
            (0.0, -7.0),
            (4.0, 3.0),
            (1.0, 2.0),
            (1.0, 7.0),
            (-1.0, 7.0),
            (-1.0, 2.0),
            (-4.0, 3.0),
        ]
        .into_iter()
        .enumerate()
        {
            let p = point(
                px(ox + 203.0 + x * cos - y * sin),
                px(oy + 79.0 + x * sin + y * cos),
            );
            if i == 0 {
                arrow.move_to(p);
            } else {
                arrow.line_to(p);
            }
        }
        arrow.close();
        if let Ok(path) = arrow.build() {
            window.paint_path(path, text);
        }
    }
    let wind = if wind_heading.is_some() {
        metric(2)
            .rsplit_once(' ')
            .map_or(metric(2), |(speed, _)| speed)
    } else {
        metric(2)
    };
    kit.label(
        window,
        cx,
        wind,
        0.0,
        Some(266.0),
        70.0,
        18.0,
        Face::Mono,
        &mono,
    );
    kit.label(
        window,
        cx,
        if kit.es() { "VIENTO" } else { "WIND" },
        0.0,
        Some(266.0),
        92.0,
        14.0,
        Face::Body,
        &muted,
    );
    kit.label(
        window,
        cx,
        if kit.es() { "Pista" } else { "Track" },
        14.0,
        None,
        116.0,
        16.0,
        Face::Body,
        &muted,
    );
    round_rect(
        window,
        56.0,
        122.0,
        176.0,
        5.0,
        2.5,
        Color(0xffffff, 0.08).hsla(),
    );
    if let Some(wet) = wet {
        round_rect(
            window,
            56.0,
            122.0,
            176.0 * wet.clamp(0.0, 100.0) / 100.0,
            5.0,
            2.5,
            Color(0x4f8ef7, 1.0).hsla(),
        );
    }
    kit.label(
        window,
        cx,
        if wet == Some(0.0) {
            if kit.es() { "Seca" } else { "Dry" }
        } else {
            metric(4)
        },
        0.0,
        Some(266.0),
        116.0,
        16.0,
        Face::Mono,
        &mono,
    );
    for (i, label) in [
        if kit.es() { "Ahora" } else { "Now" },
        "+15",
        "+30",
        "+45",
        "+60",
    ]
    .into_iter()
    .enumerate()
    {
        let x = 14.0 + i as f32 * 50.4;
        round_rect(
            window,
            x,
            142.0,
            49.0,
            58.0,
            3.0,
            Color(if i == 0 { 0x2a2426 } else { 0x110f10 }, 0.98).hsla(),
        );
        round_rect(
            window,
            x + 18.0,
            150.0,
            13.0,
            13.0,
            6.5,
            Color(0xffffff, 0.06).hsla(),
        );
        let ink = kit.ink(Face::Mono, 11.0, 0.0, text);
        kit.label(
            window,
            cx,
            if i == 0 { metric(3) } else { "—" },
            0.0,
            Some(x + 24.5 + 8.0),
            168.0,
            14.0,
            Face::Mono,
            &ink,
        );
        kit.label(
            window,
            cx,
            label,
            x + 10.0,
            None,
            183.0,
            14.0,
            Face::Body,
            &muted,
        );
    }
}

fn paint(vm: &ViewModel, prefs: Preferences, window: &mut Window, cx: &mut App) {
    let style = Style::compiled();
    let kit = Kit {
        style: &style,
        variant: &style.styles.neo,
        accent: style.accents.red,
        language: prefs.language,
        width: SIZE.0,
    };
    kit.panel(window, SIZE.1);
    let metric = |i: usize| vm.metrics.get(i).map_or("—", |m| m.value.as_str());
    let wet = metric(4)
        .split_whitespace()
        .next()
        .and_then(|s| s.parse::<f32>().ok());
    let banner = if vm.status != Status::Ready {
        vm.status_text
    } else if wet.is_some_and(|v| v > 0.0) {
        if kit.es() {
            "PISTA MOJADA"
        } else {
            "WET TRACK"
        }
    } else {
        if kit.es() { "SECO" } else { "DRY" }
    };
    round_rect(
        window,
        1.0,
        1.0,
        130.0,
        22.0,
        8.0,
        Color(
            if wet.is_some_and(|v| v > 0.0) {
                0x20334f
            } else {
                0x2b2527
            },
            1.0,
        )
        .hsla(),
    );
    let heading = kit.ink(Face::Display, 11.0, 0.5, style.colors.text.hsla());
    kit.label(
        window,
        cx,
        banner,
        12.0,
        None,
        3.0,
        18.0,
        Face::Display,
        &heading,
    );
    let muted = kit.ink(Face::Body, 10.0, 0.4, style.colors.muted.hsla());
    kit.label(
        window,
        cx,
        if kit.es() { "TIEMPO" } else { "WEATHER" },
        12.0,
        None,
        30.0,
        18.0,
        Face::Body,
        &muted,
    );
    let big = kit.ink(Face::Display, 40.0, 0.0, Color(0xfaf7f7, 1.0).hsla());
    let track = metric(0)
        .split_whitespace()
        .next()
        .filter(|s| *s != "—")
        .map_or_else(|| "--°".into(), |s| format!("{s}°"));
    kit.label(
        window,
        cx,
        &track,
        12.0,
        None,
        52.0,
        40.0,
        Face::Display,
        &big,
    );
    kit.label(
        window,
        cx,
        if kit.es() { "PISTA" } else { "TRACK" },
        83.0,
        None,
        68.0,
        14.0,
        Face::Body,
        &muted,
    );
    for (row, (label, value)) in [
        (if kit.es() { "AIRE" } else { "AIR" }, metric(1)),
        (if kit.es() { "VIENTO" } else { "WIND" }, metric(2)),
        (if kit.es() { "AGUA" } else { "WATER" }, metric(4)),
    ]
    .into_iter()
    .enumerate()
    {
        let y = 98.0 + row as f32 * 24.0;
        round_rect(
            window,
            12.0,
            y,
            108.0,
            1.0,
            0.0,
            Color(0xffffff, 0.05).hsla(),
        );
        kit.label(
            window,
            cx,
            label,
            12.0,
            None,
            y + 3.0,
            20.0,
            Face::Body,
            &muted,
        );
        let ink = kit.ink(
            Face::Mono,
            if row == 1 { 9.0 } else { 13.0 },
            0.0,
            style.colors.text.hsla(),
        );
        let value = if row == 0 {
            value.replace(" °C", "°").replace(" °F", "°")
        } else {
            value.into()
        };
        kit.label(
            window,
            cx,
            &value,
            0.0,
            Some(120.0),
            y + 3.0,
            20.0,
            Face::Mono,
            &ink,
        );
    }
    round_rect(
        window,
        12.0,
        174.0,
        108.0,
        5.0,
        2.5,
        Color(0xffffff, 0.08).hsla(),
    );
    if let Some(wet) = wet {
        round_rect(
            window,
            12.0,
            174.0,
            108.0 * wet.clamp(0.0, 100.0) / 100.0,
            5.0,
            2.5,
            Color(0x4f8ef7, 1.0).hsla(),
        );
    }
    for (i, label) in [
        if kit.es() { "Ahora" } else { "Now" },
        "+15",
        "+30",
        "+45",
        "+60",
    ]
    .into_iter()
    .enumerate()
    {
        let y = 189.0 + i as f32 * 47.5;
        round_rect(
            window,
            12.0,
            y,
            108.0,
            46.5,
            3.0,
            Color(if i == 0 { 0x2a2426 } else { 0x110f10 }, 0.98).hsla(),
        );
        kit.label(
            window,
            cx,
            label,
            20.0,
            None,
            y + 15.0,
            16.0,
            Face::Body,
            &muted,
        );
        round_rect(
            window,
            64.0,
            y + 16.0,
            14.0,
            14.0,
            7.0,
            Color(0xffffff, 0.06).hsla(),
        );
        let ink = kit.ink(Face::Mono, 11.0, 0.0, style.colors.text.hsla());
        kit.label(
            window,
            cx,
            if i == 0 { metric(3) } else { "—" },
            0.0,
            Some(113.0),
            y + 15.0,
            16.0,
            Face::Mono,
            &ink,
        );
    }
}

impl Settings {
    #[allow(clippy::unused_self)] // Contrato común de demanda por renderer.
    pub fn demand(&self) -> vantare_ipc::Demand {
        use vantare_ipc::Signal::{SessionClock, SessionInfo, Weather};
        crate::demand::signals(500, &[Weather, SessionInfo, SessionClock])
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
        assert_eq!(widget.frame(prefs, false).1, Wake::Idle);
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
        assert_eq!(widget.size(), WIDE);
        let mut timed = snapshot.clone();
        timed.state.session.kind = Quality::Reliable(vantare_domain::SessionKind::Qualifying);
        timed.state.session.remaining_s = Quality::Reliable(522.0);
        assert!(widget.ingest(&timed, prefs));
        assert_eq!(widget.session, "CLASIFICACIÓN · 08:42");
        assert!(!widget.ingest(&timed, prefs));
        let vertical = Widget::new(
            &Settings {
                vertical: true,
                ..Settings::default()
            },
            prefs,
        );
        assert_eq!(vertical.size(), SIZE);
        assert_eq!(widget.frame(prefs, false).1, Wake::Idle);
        #[cfg(feature = "parity-capture")]
        assert!(!widget.animating());
    }
}
