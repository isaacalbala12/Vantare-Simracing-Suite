//! Placas de banderas y sanciones, marco fijo de 340 × 88.

use crate::app::{Paint, Wake, replace_if_changed};
use crate::efficiency::preview::PaintWindow as Window;
use crate::efficiency::text;
use crate::vantare::{
    paint::{Face, Kit, round_rect},
    style::{Color, Style},
};
use gpui::App;
use std::time::{Duration, Instant};
use vantare_domain::{
    FlagKind, Snapshot,
    format::Preferences,
    racing_flags::{self, ViewModel},
};

pub const SIZE: (f32, f32) = (340.0, 88.0);
const PULSE: Duration = Duration::from_millis(920);

pub fn paint(vm: &ViewModel, pulse: f32, window: &mut Window, cx: &mut App) {
    paint_content(vm, pulse, Preferences::default(), window, cx);
}
fn paint_content(
    vm: &ViewModel,
    _pulse: f32,
    prefs: Preferences,
    window: &mut Window,
    cx: &mut App,
) {
    use vantare_domain::PenaltyKind;
    if vm.hidden {
        return;
    }
    let style = Style::compiled();
    let kit = Kit {
        style: &style,
        variant: &style.styles.neo,
        accent: style.accents.red,
        language: prefs.language,
        width: SIZE.0,
    };
    kit.panel(window, SIZE.1);
    let (color, title, message, plate) = match vm.penalty {
        Some(PenaltyKind::DriveThrough) => (
            0xe14a54,
            "DRIVE-THROUGH",
            if kit.es() {
                "Sanción · pasa por el pit lane"
            } else {
                "Penalty · drive through the pit lane"
            },
            Some("DT"),
        ),
        Some(PenaltyKind::StopGo) => (
            0xe14a54,
            "STOP & GO",
            if kit.es() {
                "Sanción · para en tu box"
            } else {
                "Penalty · stop in your pit box"
            },
            Some("SG"),
        ),
        Some(PenaltyKind::Disqualified) => (
            0xe14a54,
            if kit.es() {
                "BANDERA NEGRA"
            } else {
                "BLACK FLAG"
            },
            if kit.es() {
                "Descalificado · vuelve a boxes"
            } else {
                "Disqualified · return to pits"
            },
            None,
        ),
        None => match vm.flag.as_ref() {
            Some(FlagKind::Yellow) => (
                0xf5c518,
                if kit.es() { "AMARILLA" } else { "YELLOW" },
                if kit.es() {
                    "Precaución · no adelantes"
                } else {
                    "Caution · no overtaking"
                },
                None,
            ),
            Some(FlagKind::Green) => (
                0x22c55e,
                if kit.es() { "VERDE" } else { "GREEN" },
                if kit.es() {
                    "Pista libre · se puede adelantar"
                } else {
                    "Track clear · overtaking allowed"
                },
                None,
            ),
            Some(FlagKind::Red) => (
                0xe14a54,
                if kit.es() { "ROJA" } else { "RED" },
                if kit.es() {
                    "Sesión detenida · vuelve a boxes"
                } else {
                    "Session stopped · return to pits"
                },
                None,
            ),
            Some(FlagKind::Blue) => (
                0x4f8ef7,
                if kit.es() { "AZUL" } else { "BLUE" },
                if kit.es() {
                    "Coche más rápido · déjale pasar"
                } else {
                    "Faster car · let it pass"
                },
                None,
            ),
            Some(FlagKind::White) => (
                0xf2eeee,
                if kit.es() { "BLANCA" } else { "WHITE" },
                if kit.es() {
                    "Coche lento delante"
                } else {
                    "Slow car ahead"
                },
                None,
            ),
            Some(FlagKind::Black) => (
                0xe14a54,
                if kit.es() {
                    "BANDERA NEGRA"
                } else {
                    "BLACK FLAG"
                },
                if kit.es() {
                    "Descalificado · vuelve a boxes"
                } else {
                    "Disqualified · return to pits"
                },
                None,
            ),
            Some(FlagKind::Checkered) => (
                0xf2eeee,
                if kit.es() {
                    "BANDERA A CUADROS"
                } else {
                    "CHEQUERED FLAG"
                },
                if kit.es() {
                    "Fin de la sesión"
                } else {
                    "Session finished"
                },
                None,
            ),
            _ => (
                0x8e8587,
                if kit.es() { "SIN BANDERAS" } else { "NO FLAGS" },
                if kit.es() {
                    "Esperando información de pista"
                } else {
                    "Waiting for track information"
                },
                None,
            ),
        },
    };
    round_rect(
        window,
        1.0,
        1.0,
        150.0,
        86.0,
        9.0,
        Color(color, 0.13).hsla(),
    );
    let swatch = if plate.is_some() {
        0x1a1214
    } else if vm.penalty == Some(PenaltyKind::Disqualified) || vm.flag == Some(FlagKind::Black) {
        0x0b0b0b
    } else {
        color
    };
    round_rect(
        window,
        14.0,
        27.0,
        48.0,
        34.0,
        4.0,
        Color(if plate.is_some() { 0xe14a54 } else { swatch }, 1.0).hsla(),
    );
    if let Some(plate) = plate {
        round_rect(
            window,
            16.0,
            29.0,
            44.0,
            30.0,
            2.0,
            Color(swatch, 1.0).hsla(),
        );
        let ink = kit.ink(Face::Display, 16.0, 1.6, Color(0xff7a82, 1.0).hsla());
        kit.label(
            window,
            cx,
            plate,
            38.0 - text::width(window, plate, &ink) / 2.0,
            None,
            34.0,
            20.0,
            Face::Display,
            &ink,
        );
    } else if vm.flag == Some(FlagKind::Checkered) {
        for row in 0..3 {
            for column in 0..4 {
                round_rect(
                    window,
                    14.0 + column as f32 * 12.0,
                    27.0 + row as f32 * 11.33,
                    12.0,
                    11.33,
                    0.0,
                    Color(
                        if (row + column) % 2 == 0 {
                            0x111111
                        } else {
                            0xf2eeee
                        },
                        1.0,
                    )
                    .hsla(),
                );
            }
        }
    }
    let heading = kit.ink(Face::Display, 20.0, 1.0, Color(0xfaf7f7, 1.0).hsla());
    let title = text::fit(window, title, &heading, 250.0);
    kit.label(
        window,
        cx,
        &title,
        76.0,
        None,
        17.0,
        22.0,
        Face::Display,
        &heading,
    );
    let body = kit.ink(Face::Body, 12.0, 0.0, style.colors.text.hsla());
    let message = text::fit(window, message, &body, 250.0);
    kit.label(
        window,
        cx,
        &message,
        76.0,
        None,
        41.0,
        16.0,
        Face::Body,
        &body,
    );
    if vm.penalty.is_none() && !vm.sectors.is_empty() {
        for i in 0..3 {
            let active = vm
                .sectors
                .get(i)
                .is_some_and(|f| *f == Some(FlagKind::Yellow));
            let x = 76.0 + i as f32 * 35.0;
            round_rect(
                window,
                x,
                63.0,
                32.0,
                14.0,
                3.0,
                Color(
                    if active { 0xf5c518 } else { 0xffffff },
                    if active { 1.0 } else { 0.06 },
                )
                .hsla(),
            );
            let ink = kit.ink(
                Face::Display,
                10.0,
                1.0,
                Color(if active { 0x1a1205 } else { 0x8e8587 }, 1.0).hsla(),
            );
            kit.label(
                window,
                cx,
                &format!("S{}", i + 1),
                x + 8.0,
                None,
                63.0,
                14.0,
                Face::Display,
                &ink,
            );
        }
    }
}

/// Solo fotos exactas de la demo; nunca aporta sanciones a live.
fn demo_penalty(snapshot: &Snapshot) -> Option<vantare_domain::PenaltyKind> {
    use std::sync::OnceLock;
    use vantare_domain::PenaltyKind;
    static PHOTOS: OnceLock<Vec<Snapshot>> = OnceLock::new();
    let photos = PHOTOS.get_or_init(|| {
        crate::workshop::snapshots_from_json(include_str!(
            "../../fixtures/racing-flags-design-system.sequence.json"
        ))
        .unwrap_or_default()
    });
    let index = photos.iter().position(|p| p == snapshot)?;
    let penalties: Vec<Option<String>> = serde_json::from_str(include_str!(
        "../../fixtures/racing-flags-design-system.penalties.json"
    ))
    .ok()?;
    match penalties.get(index)?.as_deref()? {
        "drive-through" => Some(PenaltyKind::DriveThrough),
        "stop-go" => Some(PenaltyKind::StopGo),
        "disqualified" => Some(PenaltyKind::Disqualified),
        _ => None,
    }
}

#[derive(Clone, Debug, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Settings {
    pub text_color: String,
    pub show_sector_flags: bool,
    pub hide_when_green: bool,
}
impl Default for Settings {
    fn default() -> Self {
        Self {
            text_color: "#000000".into(),
            show_sector_flags: true,
            hide_when_green: false,
        }
    }
}
impl Settings {
    pub const UNSUPPORTED: &'static [(&'static str, &'static str)] = &[];
    fn project(&self, snapshot: &Snapshot, prefs: Preferences) -> ViewModel {
        racing_flags::project_with_penalty(
            snapshot,
            prefs,
            racing_flags::Config {
                text_color: u32::from_str_radix(self.text_color.trim_start_matches('#'), 16)
                    .unwrap_or(0),
                show_sector_flags: self.show_sector_flags,
                hide_when_green: self.hide_when_green,
            },
            demo_penalty(snapshot),
        )
    }

    #[must_use]
    pub fn normalized(&self) -> Self {
        let value = self.text_color.as_bytes();
        if value.len() == 7 && value[0] == b'#' && value[1..].iter().all(u8::is_ascii_hexdigit) {
            Self {
                text_color: self.text_color.to_ascii_lowercase(),
                ..self.clone()
            }
        } else {
            Self {
                text_color: "#000000".into(),
                ..self.clone()
            }
        }
    }
}

pub(crate) struct Widget {
    settings: Settings,
    vm: ViewModel,
    yellow_since: Option<Instant>,
}

impl Widget {
    pub(crate) fn new(settings: &Settings, prefs: Preferences) -> Self {
        let settings = settings.normalized();
        Self {
            vm: settings.project(&Snapshot::default(), prefs),
            settings,
            yellow_since: None,
        }
    }

    #[allow(clippy::unused_self)]
    pub(crate) fn size(&self) -> (f32, f32) {
        SIZE
    }

    pub(crate) fn ingest(&mut self, snapshot: &Snapshot, prefs: Preferences) -> bool {
        let vm = self.settings.project(snapshot, prefs);
        if vm.flag != self.vm.flag {
            self.yellow_since = (vm.flag == Some(FlagKind::Yellow)).then(Instant::now);
        }
        replace_if_changed(&mut self.vm, vm)
    }

    pub(crate) fn frame(&mut self, prefs: Preferences, reduced: bool) -> (Paint, Wake) {
        let elapsed = self.yellow_since.map(|start| start.elapsed());
        let (pulse, wake) = if reduced {
            (0.0, Wake::Idle)
        } else {
            pulse(elapsed)
        };
        if matches!(wake, Wake::Idle) {
            self.yellow_since = None;
        }
        let vm = self.vm.clone();
        (
            Box::new(move |window, cx| paint_content(&vm, pulse, prefs, window, cx)),
            wake,
        )
    }

    #[cfg(feature = "parity-capture")]
    pub(crate) fn animating(&self) -> bool {
        self.yellow_since
            .is_some_and(|start| start.elapsed() < PULSE)
    }
}

/// Una sola vuelta del aviso de 920 ms al entrar en amarillo; luego reposo.
fn pulse(elapsed: Option<Duration>) -> (f32, Wake) {
    match elapsed {
        Some(elapsed) if elapsed < PULSE => {
            let t = elapsed.as_secs_f32() / PULSE.as_secs_f32();
            ((1.0 - (t * std::f32::consts::TAU).cos()) / 2.0, Wake::Frame)
        }
        _ => (0.0, Wake::Idle),
    }
}

impl Settings {
    #[allow(clippy::unused_self)] // Contrato común de demanda por renderer.
    pub fn demand(&self) -> vantare_ipc::Demand {
        use vantare_ipc::Signal::Flags;
        crate::demand::signals(33, &[Flags])
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn demo_penalties_have_separate_plates_and_never_leak_to_live() {
        use vantare_domain::PenaltyKind;
        let photos = crate::workshop::snapshots_from_json(include_str!(
            "../../fixtures/racing-flags-design-system.sequence.json"
        ))
        .expect("demo");
        for (photo, expected) in photos.iter().zip([
            None,
            Some(PenaltyKind::DriveThrough),
            Some(PenaltyKind::StopGo),
            Some(PenaltyKind::Disqualified),
        ]) {
            assert_eq!(demo_penalty(photo), expected);
            let mut widget = Widget::new(&Settings::default(), Preferences::default());
            widget.ingest(photo, Preferences::default());
            assert_eq!(widget.size(), SIZE);
            let mut live = photo.clone();
            live.origin.source.kind = vantare_domain::SourceKind::Live;
            assert!(demo_penalty(&live).is_none());
        }
    }

    #[test]
    fn variant_scenes_cover_sector_filter_and_green_hiding() {
        let sectors = vantare_ipc::snapshot_from_json(include_str!("scenes/sectors.snapshot.json"))
            .expect("sectores reconstruidos en DTO v4");
        let prefs = Preferences::default();
        let vm = Settings::default().project(&sectors, prefs);
        assert_eq!(vm.flag, Some(FlagKind::Yellow));
        assert_eq!(
            vm.sectors,
            vec![Some(FlagKind::Yellow), Some(FlagKind::Green)]
        );
        let settings = Settings {
            show_sector_flags: false,
            ..Settings::default()
        };
        assert!(settings.project(&sectors, prefs).sectors.is_empty());
        let green = vantare_ipc::snapshot_from_json(include_str!("scenes/green.snapshot.json"))
            .expect("verde reconstruido en DTO v4");
        let settings = Settings {
            hide_when_green: true,
            ..Settings::default()
        };
        assert!(settings.project(&green, prefs).hidden);
    }

    #[test]
    fn flags_settings_project_color_sectors_and_visibility() {
        let mut snapshot = Snapshot::default();
        snapshot.state.source_state = vantare_domain::SourceState::Live;
        snapshot.state.flags = vantare_domain::Quality::Reliable(vec![
            vantare_domain::Flag {
                kind: FlagKind::Green,
                scope: vantare_domain::FlagScope::Session,
            },
            vantare_domain::Flag {
                kind: FlagKind::Yellow,
                scope: vantare_domain::FlagScope::Sector(0),
            },
        ]);
        let settings = Settings {
            text_color: "#123ABC".into(),
            show_sector_flags: false,
            hide_when_green: true,
        }
        .normalized();
        let vm = settings.project(&snapshot, Preferences::default());
        assert_eq!(vm.text_color, 0x123abc);
        assert!(vm.hidden && vm.sectors.is_empty());
        snapshot.state.flags = vantare_domain::Quality::Reliable(vec![vantare_domain::Flag {
            kind: FlagKind::Black,
            scope: vantare_domain::FlagScope::Session,
        }]);
        assert_eq!(
            Settings::default()
                .project(&snapshot, Preferences::default())
                .text_color,
            0xffffff
        );
        assert_eq!(
            settings
                .project(&snapshot, Preferences::default())
                .text_color,
            0x123abc
        );
    }

    use super::*;
    use vantare_domain::{Flag, FlagScope, Quality};

    #[test]
    fn default_scene_projects_the_frozen_green_banner() {
        let snapshot = vantare_ipc::snapshot_from_json(include_str!(
            "../../fixtures/racing-flags.snapshot.json"
        ))
        .expect("escena Workshop DTO v3 válida");
        let vm = racing_flags::project(&snapshot, Preferences::default());
        assert_eq!(vm.flag, Some(FlagKind::Green));
        assert_eq!((vm.heading, vm.message), ("BANDERA", "VERDE"));
        assert!(vm.sectors.is_empty());
        assert!(!vm.hidden);
        assert!(snapshot.state.cars.is_empty());
        assert!(snapshot.state.player.is_none());
    }

    #[test]
    fn qa_stale_scene_contains_old_flags_and_preserves_the_product_contract() {
        let snapshot = vantare_ipc::snapshot_from_json(include_str!(
            "../../fixtures/racing-flags-stale.snapshot.json"
        ))
        .expect("escena de banderas antiguas válida");
        assert!(matches!(snapshot.state.flags, Quality::Stale(_)));
        assert_eq!(
            snapshot.state.capabilities.flags,
            vantare_domain::Capability::WithData
        );
        let vm = racing_flags::project(&snapshot, Preferences::default());
        assert_eq!(vm.flag, Some(FlagKind::Green));
    }

    #[test]
    fn yellow_pulse_ends_and_identical_snapshots_do_not_restart_it() {
        for elapsed in [None, Some(PULSE), Some(PULSE * 2)] {
            assert!(matches!(pulse(elapsed), (0.0, Wake::Idle)));
        }
        assert!(matches!(pulse(Some(PULSE / 2)), (1.0, Wake::Frame)));
        let mut widget = Widget::new(&Settings::default(), Preferences::default());
        let mut snapshot = Snapshot::default();
        snapshot.state.flags = Quality::Reliable(vec![Flag {
            kind: FlagKind::Yellow,
            scope: FlagScope::Session,
        }]);
        assert!(widget.ingest(&snapshot, Preferences::default()));
        widget.yellow_since = Instant::now().checked_sub(PULSE * 2);
        let (_, wake) = widget.frame(Preferences::default(), false);
        assert!(matches!(wake, Wake::Idle));
        assert!(!widget.ingest(&snapshot, Preferences::default()));
        assert!(widget.yellow_since.is_none());
        #[cfg(feature = "parity-capture")]
        assert!(!widget.animating());
        snapshot.state.flags = Quality::Unavailable;
        assert!(widget.ingest(&snapshot, Preferences::default()));
        assert!(!widget.ingest(&snapshot, Preferences::default()));
        assert!(widget.ingest(
            &snapshot,
            Preferences {
                language: vantare_domain::format::Language::En,
                ..Preferences::default()
            }
        ));
    }
}
