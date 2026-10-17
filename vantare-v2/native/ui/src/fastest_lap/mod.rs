//! Aviso Eficiencia de vuelta rápida. Valores y reglas vienen de domain;
//! geometría del renderer productivo a 480 × 104, captura congelada ISA-1427.

use crate::app::{Paint, Wake};
use crate::efficiency::preview::PaintWindow as Window;
use crate::efficiency::text;
use crate::vantare::{
    paint::{Face, Kit, round_rect},
    style::{Color, Style},
};
use gpui::{App, BorderStyle, Corners, Edges, linear_color_stop, linear_gradient, px, quad};
use std::time::{Duration, Instant};
use vantare_domain::{
    Snapshot,
    fastest_lap::{self, Kind, Records, Timing, Update, ViewModel},
    format::Preferences,
};

pub const SIZE: (f32, f32) = (480.0, 104.0);
#[cfg(test)]
const LIFETIME: Duration = Duration::from_secs(6);
const TRANSITION: Duration = Duration::from_millis(220);

// Marca inmutable del recurso en esta App: no registrar la fuente en cada frame.

struct Notice {
    kind: Kind,
    timing: Timing,
    started: Instant,
}

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
    pub const UNSUPPORTED: &'static [(&'static str, &'static str)] = &[];
    #[must_use]
    pub fn normalized(&self) -> Self {
        Self {
            duration_seconds: self.duration_seconds.clamp(3, 15),
            ..self.clone()
        }
    }
    fn project(&self, snapshot: &Snapshot, prefs: Preferences) -> ViewModel {
        let mut vm = fastest_lap::project(snapshot, prefs);
        vm.show_driver = self.show_driver;
        vm
    }
    fn lifetime(&self) -> Duration {
        Duration::from_secs(u64::from(self.duration_seconds))
    }
}

pub(crate) struct Widget {
    settings: Settings,
    vm: ViewModel,
    records: Records,
    notice: Option<Notice>,
    preview: bool,
    detail: std::sync::Arc<Vec<Detail>>,
    improvement: Option<f64>,
    personal_improvement: Option<f64>,
    improvement_label: std::sync::Arc<str>,
    personal_improvement_label: std::sync::Arc<str>,
}

impl Widget {
    pub(crate) fn new(settings: &Settings, prefs: Preferences) -> Self {
        let settings = settings.normalized();
        Self {
            settings: settings.clone(),
            vm: settings.project(&Snapshot::default(), prefs),
            records: Records::default(),
            notice: None,
            preview: false,
            detail: std::sync::Arc::default(),
            improvement: None,
            personal_improvement: None,
            improvement_label: std::sync::Arc::from("—"),
            personal_improvement_label: std::sync::Arc::from("—"),
        }
    }

    #[allow(clippy::unused_self)]
    pub(crate) fn size(&self) -> (f32, f32) {
        SIZE
    }

    pub(crate) fn ingest(&mut self, snapshot: &Snapshot, prefs: Preferences) -> bool {
        let old_improvement = (self.improvement, self.personal_improvement);
        let preview_changed = crate::app::replace_if_changed(&mut self.preview, is_demo(snapshot));
        let next = self.settings.project(snapshot, prefs);
        if self.vm.scope != next.scope {
            self.improvement = None;
            self.personal_improvement = None;
        }
        if let Some((old, new)) = self
            .vm
            .candidate
            .as_ref()
            .and_then(|t| t.best_ms)
            .zip(next.candidate.as_ref().and_then(|t| t.best_ms))
            && new < old
        {
            self.improvement = Some((new as f64 - old as f64) / 1000.0);
        }
        if let Some((old, new)) = self
            .vm
            .personal
            .as_ref()
            .and_then(|t| t.best_ms)
            .zip(next.personal.as_ref().and_then(|t| t.best_ms))
            && new < old
        {
            self.personal_improvement = Some((new as f64 - old as f64) / 1000.0);
        }
        if old_improvement.0 != self.improvement {
            self.improvement_label = self
                .improvement
                .map_or_else(|| "—".into(), |v| format!("{v:.3}"))
                .into();
        }
        if old_improvement.1 != self.personal_improvement {
            self.personal_improvement_label = self
                .personal_improvement
                .map_or_else(|| "—".into(), |v| format!("{v:.3}"))
                .into();
        }
        let detail_changed = crate::app::replace_if_changed(
            std::sync::Arc::make_mut(&mut self.detail),
            details(snapshot, &next, prefs),
        );

        let labels_changed = detail_changed
            || self.vm.class_label != next.class_label
            || self.vm.personal_label != next.personal_label
            || self.vm.active_class != next.active_class;
        let update = self.records.accept_visible(
            next.clone(),
            self.settings.show_class,
            self.settings.show_personal,
        );
        #[cfg(feature = "parity-capture")]
        let preview_changed = preview_changed
            || self.vm.candidate != next.candidate
            || self.vm.personal != next.personal
            || self.vm.ready != next.ready
            || self.vm.active_class != next.active_class;
        self.vm = next;
        let changed = match update {
            Update::Unchanged => labels_changed && self.notice.is_some(),
            Update::Clear => self.notice.take().is_some(),
            Update::Notice(kind, timing) => {
                self.notice = Some(Notice {
                    kind,
                    timing,
                    started: Instant::now(),
                });
                true
            }
        };
        #[cfg(feature = "parity-capture")]
        {
            changed || preview_changed || labels_changed
        }
        #[cfg(not(feature = "parity-capture"))]
        {
            changed || preview_changed
        }
    }

    pub(crate) fn frame(&mut self, prefs: Preferences, reduced: bool) -> (Paint, Wake) {
        let details = self.detail.clone();
        let class_improvement = std::sync::Arc::clone(&self.improvement_label);
        let personal_improvement = std::sync::Arc::clone(&self.personal_improvement_label);
        if cfg!(feature = "parity-capture") || self.preview {
            // El harness productivo previsualiza el récord sin crear un aviso live.
            let vm = self.vm.clone();
            let timing = if vm.ready {
                vm.candidate
                    .clone()
                    .filter(|_| self.settings.show_class)
                    .or_else(|| vm.personal.clone().filter(|_| self.settings.show_personal))
                    .filter(|timing| timing.best_ms.is_some())
            } else {
                None
            };
            let kind = if self.settings.show_class && vm.candidate.is_some() {
                Kind::Class
            } else {
                Kind::Personal
            };
            let improvement = if kind == Kind::Personal {
                personal_improvement
            } else {
                class_improvement
            };
            (
                Box::new(move |window, cx| {
                    if let Some(timing) = &timing {
                        paint(
                            &vm,
                            kind,
                            timing,
                            details.iter().find(|d| d.id == timing.car),
                            &improvement,
                            1.0,
                            0.0,
                            prefs,
                            window,
                            cx,
                        );
                    }
                }),
                Wake::Idle,
            )
        } else {
            let Some(notice) = &self.notice else {
                return (Box::new(|_, _| {}), Wake::Idle);
            };
            let age = notice.started.elapsed();
            let lifetime = self.settings.lifetime();
            let (alpha, offset, wake) = if reduced {
                (1.0, 0.0, Wake::At(lifetime.saturating_sub(age)))
            } else {
                motion_for(age, lifetime)
            };
            if age >= lifetime {
                self.notice = None;
                return (Box::new(|_, _| {}), Wake::Idle);
            }
            let vm = self.vm.clone();
            let kind = notice.kind;
            let timing = notice.timing.clone();
            let improvement = if kind == Kind::Personal {
                personal_improvement
            } else {
                class_improvement
            };
            (
                Box::new(move |window, cx| {
                    paint(
                        &vm,
                        kind,
                        &timing,
                        details.iter().find(|d| d.id == timing.car),
                        &improvement,
                        alpha,
                        offset,
                        prefs,
                        window,
                        cx,
                    );
                }),
                wake,
            )
        }
    }

    #[cfg(feature = "parity-capture")]
    #[allow(clippy::unused_self)]
    pub(crate) fn animating(&self) -> bool {
        false
    }
}

#[cfg(test)]
fn motion(age: Duration) -> (f32, f32, Wake) {
    motion_for(age, LIFETIME)
}

fn motion_for(age: Duration, lifetime: Duration) -> (f32, f32, Wake) {
    if age >= lifetime {
        return (0.0, -6.0, Wake::Idle);
    }
    let exit = lifetime.saturating_sub(TRANSITION);
    let progress = if age < TRANSITION {
        ease_out(age.as_secs_f32() / TRANSITION.as_secs_f32())
    } else if age >= exit {
        // ease-in es el reflejo de ease-out; aquí se pinta la opacidad restante.
        ease_out(1.0 - age.saturating_sub(exit).as_secs_f32() / TRANSITION.as_secs_f32())
    } else {
        1.0
    };
    let wake = if age < TRANSITION || age >= exit {
        Wake::Frame
    } else {
        Wake::At(exit.saturating_sub(age))
    };
    (progress, -6.0 * (1.0 - progress), wake)
}

/// CSS cubic-bezier(0, 0, .58, 1), como Standings; pendiente de subir al kit.
fn ease_out(x: f32) -> f32 {
    if x <= 0.0 {
        return 0.0;
    }
    if x >= 1.0 {
        return 1.0;
    }
    let (mut lo, mut hi) = (0.0, 1.0);
    for _ in 0..30 {
        let t = f32::midpoint(lo, hi);
        let curve_x = 1.74 * (1.0 - t) * t * t + t * t * t;
        if curve_x < x {
            lo = t;
        } else {
            hi = t;
        }
    }
    let t = f32::midpoint(lo, hi);
    t * t * (3.0 - 2.0 * t)
}

#[derive(Clone, PartialEq)]
struct Detail {
    id: vantare_domain::CarId,
    timing: Timing,
    subtitle: String,
    time: String,
    lap: String,
    sectors: [Option<bool>; 3],
    session: Option<crate::session::Session>,
    clock: String,
}
fn details(snapshot: &Snapshot, vm: &ViewModel, prefs: Preferences) -> Vec<Detail> {
    snapshot
        .state
        .cars
        .iter()
        .filter(|c| {
            vm.candidate.as_ref().is_some_and(|t| t.car == c.id)
                || vm.personal.as_ref().is_some_and(|t| t.car == c.id)
        })
        .map(|car| {
            let timing = vm
                .candidate
                .as_ref()
                .filter(|timing| timing.car == car.id)
                .or_else(|| vm.personal.as_ref().filter(|timing| timing.car == car.id))
                .expect("el filtro anterior exige un aviso de este coche");
            let session = crate::session::Session::of(&snapshot.state.session.kind);
            let clock = if session == Some(crate::session::Session::Qualifying) {
                vantare_domain::format::clock(snapshot.state.session.remaining_s.current().copied())
            } else {
                String::new()
            };
            let lap = if !clock.is_empty() && clock != "—" {
                clock.clone()
            } else {
                timing.laps.map_or_else(
                    || "—".into(),
                    |n| {
                        format!(
                            "{} {n}",
                            if prefs.language == vantare_domain::format::Language::Es {
                                "V"
                            } else {
                                "L"
                            }
                        )
                    },
                )
            };
            Detail {
                timing: timing.clone(),
                session,
                clock,
                lap,
                time: timing.text(),
                id: car.id,
                subtitle: format!(
                    "{} · {} #{}",
                    timing.driver,
                    car.vehicle.as_str(),
                    car.number
                ),
                sectors: std::array::from_fn(|i| {
                    let value = car
                        .last_sectors_s
                        .get(i)?
                        .current()
                        .filter(|v| v.is_finite() && **v > 0.0)?;
                    if car.last_lap_s.current() != car.best_lap_s.current() {
                        return None;
                    }
                    snapshot
                        .state
                        .cars
                        .iter()
                        .filter(|c| c.class == car.class)
                        .filter_map(|c| c.best_sectors_s.get(i)?.current())
                        .filter(|v| v.is_finite() && **v > 0.0)
                        .min_by(|a, b| a.total_cmp(b))
                        .map(|best| value <= best)
                }),
            }
        })
        .collect()
}

fn is_demo(snapshot: &Snapshot) -> bool {
    use std::sync::OnceLock;
    static PHOTO: OnceLock<Option<Snapshot>> = OnceLock::new();
    PHOTO
        .get_or_init(|| {
            crate::workshop::snapshots_from_json(include_str!(
                "../../fixtures/fastest-lap-design-system.sequence.json"
            ))
            .ok()
            .and_then(|v| v.into_iter().last())
        })
        .as_ref()
        == Some(snapshot)
}

fn paint_sector_chips(
    detail: Option<&Detail>,
    kit: &Kit<'_>,
    mut draw: impl FnMut(f32, Color, crate::vantare::paint::Label<'_>),
) {
    for i in 0..3 {
        let x = 371.0 + i as f32 * 33.0;
        let color = detail
            .and_then(|d| d.sectors[i])
            .map_or(Color(0xffffff, 0.08), |record| {
                Color(if record { 0xb26bff } else { 0x22c55e }, 1.0)
            });
        draw(
            x,
            color,
            crate::vantare::paint::Label {
                value: ["S1", "S2", "S3"][i],
                x: x + 8.0,
                right: None,
                top: 55.0,
                height: 16.0,
                face: Face::Display,
                ink: kit.ink(Face::Display, 10.0, 1.0, kit.style.colors.text.hsla()),
            },
        );
    }
}

#[allow(clippy::too_many_arguments)]
fn paint(
    vm: &ViewModel,
    kind: Kind,
    timing: &Timing,
    detail: Option<&Detail>,
    improvement: &str,
    alpha: f32,
    _offset: f32,
    prefs: Preferences,
    window: &mut Window,
    cx: &mut App,
) {
    // Un aviso retenido puede sobrevivir al candidato actual. Sus textos
    // preparados solo valen para la misma vuelta, no solo para el mismo coche.
    let detail = detail.filter(|detail| &detail.timing == timing);
    let style = Style::compiled();
    let mut variant = style.styles.neo.clone();
    variant.top.1 *= alpha;
    variant.bottom.1 *= alpha;
    variant.border.1 *= alpha;
    variant.shadow_alpha *= alpha;
    let kit = Kit {
        style: &style,
        variant: &variant,
        accent: style.accents.red,
        language: prefs.language,
        width: SIZE.0,
    };
    kit.panel(window, SIZE.1);
    let color = if kind == Kind::Personal {
        0x4ade80
    } else {
        0xb26bff
    };
    window.paint_quad(quad(
        crate::efficiency::rect(1.0, 1.0, 280.0, 102.0),
        Corners::all(px(9.0)),
        linear_gradient(
            90.0,
            linear_color_stop(Color(color, 0.26 * alpha).hsla(), 0.0),
            linear_color_stop(Color(color, 0.0).hsla(), 1.0),
        ),
        Edges::all(px(0.0)),
        Color(0x000000, 0.0).hsla(),
        BorderStyle::default(),
    ));
    let heading = kit.ink(Face::Display, 12.0, 1.6, Color(color, alpha).hsla());
    let title = if kind == Kind::Personal {
        if kit.es() {
            "TU MEJOR VUELTA"
        } else {
            "PERSONAL BEST"
        }
    } else {
        match (detail.and_then(|d| d.session), kit.es()) {
            (Some(crate::session::Session::Qualifying), true) => "POLE PROVISIONAL",
            (Some(crate::session::Session::Qualifying), false) => "PROVISIONAL POLE",
            (Some(crate::session::Session::Practice), true) => "MEJOR DE LA PRÁCTICA",
            (Some(crate::session::Session::Practice), false) => "PRACTICE BEST",
            (_, true) => "VUELTA RÁPIDA",
            (_, false) => "FASTEST LAP",
        }
    };
    kit.label(
        window,
        cx,
        title,
        16.0,
        None,
        12.0,
        16.0,
        Face::Display,
        &heading,
    );
    if let Some(class) = &vm.active_class {
        let ink = kit.ink(Face::Display, 10.0, 0.0, Color(0xffffff, alpha).hsla());
        let class = text::fit_borrowed(window, class, &ink, 92.0);
        let width = text::width(window, &class, &ink) + 12.0;
        let x = 16.0 + text::width(window, title, &heading) + 8.0;
        round_rect(
            window,
            x,
            12.0,
            width,
            14.0,
            3.0,
            style.class(&class).dot.alpha(alpha),
        );
        kit.label(
            window,
            cx,
            &class,
            x + 6.0,
            None,
            12.0,
            14.0,
            Face::Display,
            &ink,
        );
    }
    let time = kit.ink(Face::Display, 40.0, 0.5, Color(0xfaf7f7, alpha).hsla());
    let time_text = detail.map_or_else(
        || std::borrow::Cow::Owned(timing.text()),
        |detail| std::borrow::Cow::Borrowed(detail.time.as_str()),
    );
    kit.label(
        window,
        cx,
        &time_text,
        16.0,
        None,
        30.0,
        40.0,
        Face::Display,
        &time,
    );
    if vm.show_driver {
        let ink = kit.ink(Face::Body, 12.0, 0.0, Color(0xc9c0c2, alpha).hsla());
        let subtitle = detail.map_or(timing.driver.as_str(), |detail| detail.subtitle.as_str());
        let driver = text::fit_borrowed(window, subtitle, &ink, 320.0);
        kit.label(
            window,
            cx,
            &driver,
            16.0,
            None,
            74.0,
            16.0,
            Face::Body,
            &ink,
        );
    }
    let muted = kit.ink(Face::Mono, 10.0, 0.0, style.colors.muted.hsla());
    kit.label(
        window,
        cx,
        if kit.es() {
            "vs anterior"
        } else {
            "vs previous"
        },
        0.0,
        Some(464.0),
        32.0,
        14.0,
        Face::Mono,
        &muted,
    );
    let value = kit.ink(Face::Display, 22.0, 0.0, Color(color, alpha).hsla());
    kit.label(
        window,
        cx,
        improvement,
        0.0,
        Some(464.0),
        12.0,
        22.0,
        Face::Display,
        &value,
    );
    paint_sector_chips(detail, &kit, |x, color, label| {
        round_rect(window, x, 55.0, 30.0, 16.0, 3.0, color.hsla());
        label.paint(&kit, window, cx);
    });
    let lap = detail.map_or_else(
        || {
            std::borrow::Cow::Owned(timing.laps.map_or_else(
                || "—".into(),
                |v| format!("{} {v}", if kit.es() { "V" } else { "L" }),
            ))
        },
        |detail| std::borrow::Cow::Borrowed(detail.lap.as_str()),
    );
    kit.label(
        window,
        cx,
        &lap,
        0.0,
        Some(464.0),
        76.0,
        14.0,
        Face::Mono,
        &muted,
    );
}

impl Settings {
    #[allow(clippy::unused_self)] // Contrato común de demanda por renderer.
    pub fn demand(&self) -> vantare_ipc::Demand {
        use vantare_ipc::Signal::{LapCount, LapTimes, SessionClock, SessionInfo, TrackName};
        crate::demand::signals(
            250,
            &[LapTimes, LapCount, TrackName, SessionInfo, SessionClock],
        )
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn title_and_clock_follow_the_session_without_announcing_an_old_live_record() {
        let mut photo = crate::workshop::snapshots_from_json(include_str!(
            "../../fixtures/fastest-lap-design-system.sequence.json"
        ))
        .expect("fotos")
        .remove(1);
        photo.origin.source.kind = vantare_domain::SourceKind::Live;
        let prefs = Preferences::default();
        let mut widget = Widget::new(&Settings::default(), prefs);
        widget.ingest(&photo, prefs);
        photo.state.session.kind =
            vantare_domain::Quality::Reliable(vantare_domain::SessionKind::Qualifying);
        photo.state.session.remaining_s = vantare_domain::Quality::Reliable(522.0);
        widget.ingest(&photo, prefs);
        assert!(!widget.detail.is_empty());
        assert!(
            widget
                .detail
                .iter()
                .all(|d| d.session == Some(crate::session::Session::Qualifying)
                    && d.clock == "08:42")
        );
        assert!(!widget.ingest(&photo, prefs));
        assert!(widget.notice.is_none());
    }

    #[test]
    fn workshop_preview_is_explicit_and_does_not_announce_an_old_live_record() {
        let photos = crate::workshop::snapshots_from_json(include_str!(
            "../../fixtures/fastest-lap-design-system.sequence.json"
        ))
        .expect("demo");
        assert!(is_demo(photos.last().expect("foto final")));
        let mut live = photos[0].clone();
        live.origin.source.kind = vantare_domain::SourceKind::Live;
        assert!(!is_demo(&live));
        let mut widget = Widget::new(&Settings::default(), Preferences::default());
        widget.ingest(&live, Preferences::default());
        assert!(widget.notice.is_none());
        assert_eq!(widget.size(), SIZE);
    }

    #[test]
    fn driver_and_duration_variants_affect_projection_and_expiry() {
        for duration in [3, 15] {
            let settings = Settings {
                show_driver: false,
                duration_seconds: duration,
                ..Settings::default()
            };
            let vm = settings.project(&Snapshot::default(), Preferences::default());
            assert!(!vm.show_driver);
            assert!(matches!(
                motion_for(
                    settings.lifetime().saturating_sub(Duration::from_secs(1)),
                    settings.lifetime()
                )
                .2,
                Wake::At(_)
            ));
            assert_eq!(
                motion_for(settings.lifetime(), settings.lifetime()).2,
                Wake::Idle
            );
        }
    }

    use super::*;

    fn reference_scene() -> Snapshot {
        vantare_ipc::snapshot_from_fixture_json(include_str!(
            "../../fixtures/fastest-lap.snapshot.json"
        ))
        .expect("escena DTO v3 válida")
    }

    #[test]
    fn reference_scene_projects_the_frozen_class_record_and_labels() {
        use vantare_domain::format::Language;
        let snapshot = reference_scene();
        assert_eq!((snapshot.epoch, snapshot.sequence), (3, 2));
        assert_eq!(snapshot.state.cars.len(), 20);
        for (language, class_label, personal_label) in [
            (Language::Es, "VUELTA RÁPIDA", "MEJOR PERSONAL"),
            (Language::En, "FASTEST LAP", "PERSONAL BEST"),
        ] {
            let vm = fastest_lap::project(
                &snapshot,
                Preferences {
                    language,
                    ..Preferences::default()
                },
            );
            assert!(vm.ready);
            let candidate = vm.candidate.expect("récord de clase");
            assert_eq!(candidate.driver, "Antonio Giovinazzi");
            assert_eq!(candidate.text(), "1:30.904");
            assert_eq!(vm.active_class.as_deref(), Some("HYPERCAR"));
            assert_eq!(vm.class_label, class_label);
            assert_eq!(vm.personal_label, personal_label);
            assert_eq!(vm.personal.expect("jugador").text(), "1:30.964");
        }
    }

    #[cfg(feature = "parity-capture")]
    #[test]
    fn preview_is_settled_and_clears_when_the_scene_is_unavailable() {
        let prefs = Preferences::default();
        let mut widget = Widget::new(&Settings::default(), prefs);
        let mut snapshot = reference_scene();
        assert!(widget.ingest(&snapshot, prefs));
        assert!(matches!(widget.frame(prefs, false).1, Wake::Idle));
        assert!(!widget.animating());
        snapshot.sequence += 1;
        assert!(!widget.ingest(&snapshot, prefs));
        assert!(widget.ingest(&Snapshot::default(), prefs));
        assert!(!widget.vm.ready);
        assert!(matches!(widget.frame(prefs, false).1, Wake::Idle));
        assert!(!widget.animating());
    }

    #[cfg(not(feature = "parity-capture"))]
    #[test]
    fn live_widget_is_silent_until_improvement_and_expires_without_ingest() {
        use vantare_domain::{Capability, Car, CarId, Class, Driver, Player, Quality};
        let prefs = Preferences::default();
        let mut snapshot = Snapshot {
            sequence: 1,
            ..Snapshot::default()
        };
        snapshot.state.source_state = vantare_domain::SourceState::Live;
        snapshot.state.capabilities.lap_times = Capability::Fresh;
        snapshot.state.player = Some(Player {
            car: CarId(1),
            ..Player::default()
        });
        snapshot.state.cars.push(Car {
            id: CarId(1),
            driver: Driver {
                name: "Isaac".into(),
                ..Driver::default()
            },
            class: Some(Class {
                name: "GT3".into(),
                ..Class::default()
            }),
            best_lap_s: Quality::Reliable(90.0),
            ..Car::default()
        });
        let mut widget = Widget::new(&Settings::default(), prefs);
        assert!(!widget.ingest(&snapshot, prefs));
        assert!(matches!(widget.frame(prefs, false).1, Wake::Idle));
        snapshot.sequence = 2;
        snapshot.state.cars[0].best_lap_s = Quality::Reliable(89.0);
        assert!(widget.ingest(&snapshot, prefs));
        assert!(!widget.ingest(&snapshot, prefs));
        assert!(matches!(widget.frame(prefs, false).1, Wake::Frame));
        widget.notice.as_mut().expect("notice").started =
            Instant::now().checked_sub(LIFETIME).expect("clock");
        assert!(matches!(widget.frame(prefs, false).1, Wake::Idle));
        assert!(widget.notice.is_none());
        snapshot.sequence = 3;
        snapshot.state.cars[0].best_lap_s = Quality::Reliable(88.0);
        assert!(widget.ingest(&snapshot, prefs));
        snapshot.epoch += 1;
        assert!(widget.ingest(&snapshot, prefs));
        assert!(widget.notice.is_none());
    }

    #[test]
    fn notice_requests_frames_only_during_transitions_and_ends_without_data() {
        for (ms, state) in [
            (0, 0),
            (219, 0),
            (220, 1),
            (5779, 1),
            (5780, 0),
            (5999, 0),
            (6000, 2),
            (9000, 2),
        ] {
            let (alpha, _, wake) = motion(Duration::from_millis(ms));
            assert!((0.0..=1.0).contains(&alpha));
            assert!(matches!(
                (state, wake),
                (0, Wake::Frame) | (1, Wake::At(_)) | (2, Wake::Idle)
            ));
        }
    }
}

#[cfg(test)]
mod record_render_tests {
    use super::*;
    #[test]
    fn missing_class_sector_references_never_paint_a_record_chip() {
        use vantare_domain::{Quality, SourceState, format::Language};
        let prefs = Preferences::default();
        let mut photo = crate::source::fixed();
        photo.state.source_state = SourceState::Live;
        let own = photo.state.player.expect("jugador").car;
        for car in &mut photo.state.cars {
            car.best_sectors_s = vec![Quality::Unavailable; 3];
        }
        let car = photo
            .state
            .cars
            .iter_mut()
            .find(|c| c.id == own)
            .expect("coche");
        car.last_lap_s = Quality::Reliable(90.0);
        car.best_lap_s = Quality::Reliable(90.0);
        car.last_sectors_s = vec![Quality::Reliable(30.0); 3];
        let vm = vantare_domain::fastest_lap::project(&photo, prefs);
        let detail = details(&photo, &vm, prefs);
        let own_detail = detail.iter().find(|d| d.id == own).expect("detalle propio");
        crate::paint_tests::with_kit(SIZE.0, Language::Es, |kit| {
            let mut painted = Vec::new();
            paint_sector_chips(Some(own_detail), kit, |_, color, label| {
                painted.push((label.value.to_owned(), color));
            });
            assert_eq!(painted.len(), 3);
            assert!(
                painted
                    .iter()
                    .all(|(_, color)| *color == Color(0xffffff, 0.08)),
                "sin una referencia no se afirma récord: {painted:?}"
            );
        });
        photo
            .state
            .cars
            .iter_mut()
            .find(|c| c.id == own)
            .expect("coche")
            .best_sectors_s = vec![Quality::Reliable(31.0); 3];
        let detail = details(&photo, &vm, prefs);
        let own_detail = detail.iter().find(|d| d.id == own).expect("detalle propio");
        crate::paint_tests::with_kit(SIZE.0, Language::Es, |kit| {
            let mut painted = Vec::new();
            paint_sector_chips(Some(own_detail), kit, |_, color, _| painted.push(color));
            assert_eq!(
                painted,
                [Color(0xb26bff, 1.0); 3],
                "referencia real superada, ficha morada"
            );
        });
    }
}
