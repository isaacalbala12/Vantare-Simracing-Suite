//! Banderas: proyección live y pintura Vantare (340 × 88).
//! Sin reloj: GPUI calculaba un pulso de 920 ms que `paint_content` no usaba
//! (`_pulse`), así que no cambia ningún píxel. La descalificación (negra)
//! manda sobre la bandera. Placas DT/SG de la demo: fuera; paridad pendiente.
mod render;
pub mod scene;

use crate::widget::{Update, Widget};
use render::Painter;
use vantare_domain::{
    FlagKind, PenaltyKind, Snapshot, SourceState,
    format::Preferences,
    geometry::Size,
    racing_flags::{self, ViewModel},
    widget_session::Session,
    widget_settings::{Settings, racing_flags::Settings as Config},
};

pub(crate) struct RacingFlags {
    settings: Config,
    prefs: Preferences,
    painter: Painter,
    visual: Option<scene::Scene>,
}

impl RacingFlags {
    pub fn new(
        settings: &Config,
        prefs: Preferences,
        _reduced: bool,
        _hz: u16,
        _clock: f64,
    ) -> Self {
        let settings = settings.normalized();
        // Como GPUI: sin foto todavía se ve la tarjeta de espera.
        let visual = scene::sample(
            &project(&settings, &Snapshot::default(), prefs),
            true,
            &scene::SessionInfo::default(),
            prefs,
        );
        let painter = Painter::new(visual.as_ref());
        Self {
            settings,
            prefs,
            painter,
            visual,
        }
    }

    pub fn configured(&self, settings: &Settings, prefs: Preferences) -> bool {
        let Settings::RacingFlags(settings) = settings else {
            return false;
        };
        self.settings == settings.normalized() && self.prefs == prefs
    }

    pub fn size(&self) -> Size {
        self.size_for(None)
    }

    pub fn size_for(&self, _snapshot: Option<&Snapshot>) -> Size {
        Size {
            width: render::WIDTH,
            height: render::HEIGHT,
        }
    }

    /// Sin animación visible no hay política que aplicar.
    pub fn policy(&mut self, _reduced: bool, _hz: u16, _clock: f64) -> Update {
        Update::default()
    }

    /// Proyección y estado del aviso; el muestreo de la tarjeta es de `animate`.
    /// Se proyecta en cada foto (sin llave por secuencia) y manda la escena.
    pub fn update(&mut self, snapshot: &Snapshot, _clock: f64) -> Update {
        let vm = project(&self.settings, snapshot, self.prefs);
        let waiting = matches!(
            snapshot.state.source_state,
            SourceState::Waiting | SourceState::Lost
        );
        let kind = Session::of(&snapshot.state.session.kind);
        let finish = if !waiting
            && kind == Some(Session::Race)
            && vm.flag.as_ref() == Some(&FlagKind::Checkered)
            && vm.penalty.is_none()
        {
            snapshot.state.player_car().and_then(|car| {
                car.class_position
                    .current()
                    .copied()
                    .filter(|position| *position > 0)
                    .zip(car.class.as_ref())
                    .map(|(position, class)| (position, class.name.clone()))
            })
        } else {
            None
        };
        let session = scene::SessionInfo { kind, finish };
        let visual = scene::sample(&vm, waiting, &session, self.prefs);
        if visual == self.visual {
            return Update::default();
        }
        self.visual = visual;
        Update {
            build: false,
            pixels: true,
        }
    }

    /// La tarjeta se recompone aquí, una sola vez por cambio visible. Sin reloj.
    pub fn animate(&mut self, _clock: f64) -> Update {
        self.painter.sync(self.visual.as_ref())
    }

    pub fn schedule(&self, _clock: f64, _tx: &mut rune::Tx) {}

    pub fn view(&self) -> rune::El {
        self.painter.view()
    }
}

fn project(settings: &Config, snapshot: &Snapshot, prefs: Preferences) -> ViewModel {
    racing_flags::project_with_penalty(
        snapshot,
        prefs,
        racing_flags::Config {
            text_color: u32::from_str_radix(settings.text_color.trim_start_matches('#'), 16)
                .unwrap_or(0),
            show_sector_flags: settings.show_sector_flags,
            hide_when_green: settings.hide_when_green,
        },
        demo_penalty(snapshot),
    )
}

/// Penaltis de la demo del taller, en el orden de su secuencia (GPUI). El test
/// los ancla al fixture: si gana o pierde entradas, falla.
const DEMO_PENALTIES: [Option<PenaltyKind>; 4] = [
    None,
    Some(PenaltyKind::DriveThrough),
    Some(PenaltyKind::StopGo),
    Some(PenaltyKind::Disqualified),
];

/// Solo fotos exactas de la demo; nunca aporta sanciones a live.
fn demo_penalty(snapshot: &Snapshot) -> Option<PenaltyKind> {
    use std::sync::OnceLock;
    static PHOTOS: OnceLock<Vec<Snapshot>> = OnceLock::new();
    let photos = PHOTOS.get_or_init(|| {
        vantare_ipc::snapshots_from_json(include_str!(
            "../../../ui/fixtures/racing-flags-design-system.sequence.json"
        ))
        .unwrap_or_default()
    });
    let index = photos.iter().position(|photo| photo == snapshot)?;
    DEMO_PENALTIES.get(index).copied().flatten()
}

impl Widget for RacingFlags {
    fn new(
        settings: &Settings,
        prefs: Preferences,
        reduced: bool,
        hz: u16,
        clock: f64,
    ) -> Option<Box<dyn Widget>> {
        let Settings::RacingFlags(settings) = settings else {
            return None;
        };
        Some(Box::new(RacingFlags::new(
            settings, prefs, reduced, hz, clock,
        )))
    }

    fn configured(&self, settings: &Settings, prefs: Preferences) -> bool {
        RacingFlags::configured(self, settings, prefs)
    }

    fn size(&self) -> Size {
        RacingFlags::size(self)
    }

    fn size_for(&self, snapshot: Option<&Snapshot>) -> Size {
        RacingFlags::size_for(self, snapshot)
    }

    fn policy(&mut self, reduced: bool, hz: u16, clock: f64) -> Update {
        RacingFlags::policy(self, reduced, hz, clock)
    }

    fn update(&mut self, snapshot: &Snapshot, clock: f64) -> Update {
        RacingFlags::update(self, snapshot, clock)
    }

    fn animate(&mut self, clock: f64) -> Update {
        RacingFlags::animate(self, clock)
    }

    fn schedule(&self, clock: f64, tx: &mut rune::Tx) {
        RacingFlags::schedule(self, clock, tx);
    }

    fn view(&self) -> rune::El {
        RacingFlags::view(self)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rune::{Env, Runtime};
    use vantare_domain::{
        Capability, Car, CarId, Class, ClassId, Flag, FlagScope, Player, Quality, SessionKind,
        SourceKind,
    };

    fn session_flag(kind: FlagKind) -> Flag {
        Flag {
            kind,
            scope: FlagScope::Session,
        }
    }

    fn photo(sequence: u64, source: SourceState, flags: Vec<Flag>) -> Snapshot {
        let mut snapshot = Snapshot {
            epoch: 1,
            sequence,
            ..Snapshot::default()
        };
        snapshot.state.source_state = source;
        snapshot.state.capabilities.flags = Capability::Fresh;
        snapshot.state.session.kind = Quality::Reliable(SessionKind::Race);
        snapshot.state.flags = Quality::Reliable(flags);
        snapshot
    }

    fn runtime(widget: RacingFlags) -> Runtime<RacingFlags> {
        let mut runtime = Runtime::with_text(
            widget,
            |widget, _| widget.view(),
            (render::WIDTH, render::HEIGHT),
            Env::new(true, 1.0),
            rune::text::TextSystem::new(crate::vantare::FONTS, ("Inter", "Inter")),
        );
        runtime.poll = Some(|widget, clock, tx| {
            // Como el anfitrión: un commit de datos no anima entradas ni salidas.
            tx.instant();
            let update = widget.animate(clock);
            widget.schedule(clock, tx);
            update.build
        });
        runtime
    }

    fn payload(instance: &rune::render::Instance) -> [[u32; 4]; 8] {
        [
            instance.rect.map(f32::to_bits),
            instance.radii.map(f32::to_bits),
            instance.fill.map(f32::to_bits),
            instance.border.map(f32::to_bits),
            instance.params.map(f32::to_bits),
            instance.uv.map(f32::to_bits),
            instance.clip.map(f32::to_bits),
            instance.fade,
        ]
    }

    /// Cuenta cambios reales del flujo CPU, como el anfitrión; sin ventana.
    fn rendered(runtime: &mut Runtime<RacingFlags>, dt: f64) -> bool {
        let before = runtime.instances.clone();
        runtime.frame(dt);
        before.len() != runtime.instances.len()
            || before
                .iter()
                .map(payload)
                .ne(runtime.instances.iter().map(payload))
    }

    /// Deja asentar una recompostura de texto antes de exigir reposo.
    fn settle(runtime: &mut Runtime<RacingFlags>) {
        for _ in 0..3 {
            rendered(runtime, 0.05);
        }
    }

    fn element<'a>(elements: &'a [rune::ElementInfo], key: &str) -> &'a rune::ElementInfo {
        elements
            .iter()
            .find(|element| element.key.as_deref() == Some(key))
            .unwrap_or_else(|| panic!("falta el elemento {key}"))
    }

    #[test]
    fn the_demo_penalties_const_matches_the_fixture_entry_by_entry() {
        let text =
            include_str!("../../../ui/fixtures/racing-flags-design-system.penalties.json").trim();
        let inner = text
            .strip_prefix('[')
            .and_then(|value| value.strip_suffix(']'))
            .expect("array de penaltis");
        let entries: Vec<&str> = inner.split(',').map(str::trim).collect();
        assert_eq!(
            entries.len(),
            DEMO_PENALTIES.len(),
            "el fixture ganó o perdió entradas"
        );
        for (entry, penalty) in entries.iter().zip(DEMO_PENALTIES) {
            let expected = match penalty {
                None => "null",
                Some(PenaltyKind::DriveThrough) => "\"drive-through\"",
                Some(PenaltyKind::StopGo) => "\"stop-go\"",
                Some(PenaltyKind::Disqualified) => "\"disqualified\"",
            };
            assert_eq!(*entry, expected);
        }
    }

    #[test]
    fn demo_photos_get_their_penalty_and_live_photos_never_do() {
        let photos = vantare_ipc::snapshots_from_json(include_str!(
            "../../../ui/fixtures/racing-flags-design-system.sequence.json"
        ))
        .expect("secuencia canónica");
        assert_eq!(photos.len(), DEMO_PENALTIES.len());
        for (photo, penalty) in photos.iter().zip(DEMO_PENALTIES) {
            assert_eq!(demo_penalty(photo), penalty);
        }
        let prefs = Preferences::default();
        assert_eq!(
            project(&Config::default(), &photos[1], prefs).penalty,
            Some(PenaltyKind::DriveThrough)
        );
        assert_eq!(
            project(&Config::default(), &photos[3], prefs).penalty,
            Some(PenaltyKind::Disqualified)
        );
        let live = photo(9, SourceState::Live, vec![session_flag(FlagKind::Green)]);
        assert_eq!(demo_penalty(&live), None);
        assert_eq!(project(&Config::default(), &live, prefs).penalty, None);
    }

    #[test]
    fn a_demo_photo_with_another_origin_or_epoch_is_not_the_demo() {
        let photos = vantare_ipc::snapshots_from_json(include_str!(
            "../../../ui/fixtures/racing-flags-design-system.sequence.json"
        ))
        .expect("secuencia canónica");
        assert_eq!(
            demo_penalty(&photos[1]),
            Some(PenaltyKind::DriveThrough),
            "la foto 2 sí es la de demo"
        );
        let mut live_origin = photos[1].clone();
        live_origin.origin.source.kind = SourceKind::Live;
        assert_eq!(demo_penalty(&live_origin), None, "origen vivo");
        let mut other_epoch = photos[1].clone();
        other_epoch.epoch += 1;
        assert_eq!(demo_penalty(&other_epoch), None, "otra época");
    }

    #[test]
    fn dispatch_builds_the_widget_with_its_settings() {
        let layout = vantare_ipc::layout::Layout::from_json(
            br#"{"version":2,"instances":[{"id":"f","x":0,"y":0,"settings":{"kind":"racing-flags"}}]}"#,
        )
        .expect("design");
        let instance = &layout.instances[0];
        assert!(crate::renderer::supports(instance));
        let prefs = Preferences::default();
        let painter = <RacingFlags as Widget>::new(&instance.settings, prefs, false, 15, 0.0)
            .expect("widget");
        assert!(painter.configured(&instance.settings, prefs));
        assert_eq!(
            painter.size(),
            Size {
                width: 340.0,
                height: 88.0
            }
        );
        let hidden = Settings::RacingFlags(Config {
            hide_when_green: true,
            ..Config::default()
        });
        assert!(!painter.configured(&hidden, prefs));
    }

    #[test]
    fn still_data_draws_nothing_and_a_flag_change_draws_once() {
        let prefs = Preferences::default();
        let mut runtime = runtime(RacingFlags::new(&Config::default(), prefs, false, 15, 0.0));
        assert!(rendered(&mut runtime, 0.05), "la espera inicial se pinta");
        for _ in 0..20 {
            assert!(!rendered(&mut runtime, 0.05), "reposo sin imagen");
        }
        assert!(runtime.wake_deadline().is_none(), "sin reloj");
        runtime.state.update(
            &photo(2, SourceState::Live, vec![session_flag(FlagKind::Green)]),
            runtime.clock,
        );
        assert!(rendered(&mut runtime, 0.05), "entra la bandera verde");
        settle(&mut runtime);
        assert!(!rendered(&mut runtime, 0.05), "quieta no repinta");
        assert!(runtime.wake_deadline().is_none(), "ni pulso ni reloj");
    }

    #[test]
    fn hidden_green_removes_the_card_and_waiting_always_shows_it() {
        let prefs = Preferences::default();
        let settings = Config {
            hide_when_green: true,
            ..Config::default()
        };
        let mut runtime = runtime(RacingFlags::new(&settings, prefs, false, 15, 0.0));
        assert!(rendered(&mut runtime, 0.05), "espera inicial");
        runtime.state.update(
            &photo(2, SourceState::Live, vec![session_flag(FlagKind::Green)]),
            runtime.clock,
        );
        assert!(
            rendered(&mut runtime, 0.05),
            "el verde oculto retira la tarjeta"
        );
        settle(&mut runtime);
        assert!(!rendered(&mut runtime, 0.05), "sigue oculta");
        runtime.state.update(
            &photo(3, SourceState::Waiting, vec![session_flag(FlagKind::Green)]),
            runtime.clock,
        );
        assert!(rendered(&mut runtime, 0.05), "la espera vuelve a verse");
        settle(&mut runtime);
        assert!(!rendered(&mut runtime, 0.05), "vuelve al reposo");
    }

    #[test]
    fn source_interruptions_and_recovery_keep_the_card_semantics() {
        let prefs = Preferences::default();
        let mut runtime = runtime(RacingFlags::new(&Config::default(), prefs, false, 15, 0.0));
        rendered(&mut runtime, 0.05);
        runtime.state.update(
            &photo(2, SourceState::Live, vec![session_flag(FlagKind::Yellow)]),
            runtime.clock,
        );
        assert!(rendered(&mut runtime, 0.05), "amarilla");
        settle(&mut runtime);
        runtime.state.update(
            &photo(
                3,
                SourceState::Waiting,
                vec![session_flag(FlagKind::Yellow)],
            ),
            runtime.clock,
        );
        assert!(
            rendered(&mut runtime, 0.05),
            "la espera sustituye la bandera"
        );
        settle(&mut runtime);
        runtime.state.update(
            &photo(4, SourceState::Lost, vec![session_flag(FlagKind::Yellow)]),
            runtime.clock,
        );
        assert!(!rendered(&mut runtime, 0.05), "la espera no cambia");
        runtime.state.update(
            &photo(5, SourceState::Live, vec![session_flag(FlagKind::Yellow)]),
            runtime.clock,
        );
        assert!(rendered(&mut runtime, 0.05), "recupera la bandera");
        settle(&mut runtime);
        assert!(!rendered(&mut runtime, 0.05), "reposo tras recuperar");
        assert!(runtime.wake_deadline().is_none());
    }

    #[test]
    fn display_texts_use_the_display_baseline() {
        let prefs = Preferences::default();
        let mut runtime = runtime(RacingFlags::new(&Config::default(), prefs, false, 15, 0.0));
        let mut yellow = photo(2, SourceState::Live, vec![session_flag(FlagKind::Yellow)]);
        yellow.state.flags = Quality::Reliable(vec![
            session_flag(FlagKind::Yellow),
            Flag {
                kind: FlagKind::Yellow,
                scope: FlagScope::Sector(0),
            },
        ]);
        runtime.state.update(&yellow, runtime.clock);
        assert!(rendered(&mut runtime, 0.05), "amarilla con sectores");
        settle(&mut runtime);
        let elements = runtime.elements();
        let baseline = crate::vantare::Style::compiled().fonts.display_baseline;
        assert!(baseline > 0.0, "el estilo canónico desplaza la Display");
        assert_eq!(element(&elements, "title").rect[1], 11.0 + baseline);
        assert_eq!(
            element(&elements, "sector-label-0").rect[1],
            59.0 + baseline
        );
        assert_eq!(
            element(&elements, "message").rect[1],
            37.0,
            "Body sin desplazamiento"
        );
    }

    #[test]
    fn checkered_race_reads_the_player_finish_position_and_class() {
        let prefs = Preferences::default();
        let mut widget = RacingFlags::new(&Config::default(), prefs, false, 15, 0.0);
        widget.update(&photo(1, SourceState::Live, vec![]), 0.0);
        let mut finish = photo(
            2,
            SourceState::Live,
            vec![session_flag(FlagKind::Checkered)],
        );
        finish.state.player = Some(Player {
            car: CarId(1),
            ..Player::default()
        });
        finish.state.cars = vec![Car {
            id: CarId(1),
            class: Some(Class {
                id: ClassId(1),
                name: "GT3".into(),
            }),
            class_position: Quality::Reliable(3),
            ..Car::default()
        }];
        widget.update(&finish, 1.0);
        assert_eq!(
            &*widget.visual.as_ref().expect("tarjeta").message,
            "Fin de la carrera · P3 en GT3"
        );
    }

    fn find<'a>(elements: &'a [rune::ElementInfo], key: &str) -> Option<&'a rune::ElementInfo> {
        elements
            .iter()
            .find(|element| element.key.as_deref() == Some(key))
    }

    fn color(value: &str) -> rune::Color {
        rune::color::hex(value).expect("color de prueba")
    }

    /// Tarjeta ya pintada y asentada para inspeccionar sus piezas.
    fn shown(flags: Vec<Flag>, source: SourceState) -> Runtime<RacingFlags> {
        let prefs = Preferences::default();
        let mut runtime = runtime(RacingFlags::new(&Config::default(), prefs, false, 15, 0.0));
        if matches!(source, SourceState::Waiting | SourceState::Lost) {
            assert!(rendered(&mut runtime, 0.05), "la espera se pinta");
        } else {
            runtime
                .state
                .update(&photo(2, source, flags), runtime.clock);
            assert!(rendered(&mut runtime, 0.05), "la tarjeta se pinta");
        }
        settle(&mut runtime);
        runtime
    }

    fn shown_photo(snapshot: Snapshot) -> Runtime<RacingFlags> {
        let prefs = Preferences::default();
        let mut runtime = runtime(RacingFlags::new(&Config::default(), prefs, false, 15, 0.0));
        runtime.state.update(&snapshot, runtime.clock);
        assert!(rendered(&mut runtime, 0.05), "la tarjeta se pinta");
        settle(&mut runtime);
        runtime
    }

    #[test]
    fn waiting_and_quiet_cards_paint_their_pieces() {
        let waiting = shown(vec![], SourceState::Waiting);
        let elements = waiting.elements();
        assert_eq!(element(&elements, "panel").rect, [0.0, 0.0, 340.0, 88.0]);
        assert_eq!(element(&elements, "swatch").rect, [14.0, 27.0, 48.0, 34.0]);
        assert!(find(&elements, "quiet-inner").is_some());
        assert!(find(&elements, "waiting-dot").is_some(), "punto de espera");
        assert!(
            find(&elements, "band").is_none(),
            "la espera no tiene banda"
        );
        let quiet = shown(vec![], SourceState::Live);
        let elements = quiet.elements();
        assert!(find(&elements, "quiet-inner").is_some());
        assert!(find(&elements, "waiting-dot").is_none());
        assert!(find(&elements, "band").is_none());
        assert!(
            find(&elements, "sector-0").is_none(),
            "sin sectores no hay chips"
        );
    }

    #[test]
    fn each_flag_paints_its_swatch_decoration_and_band() {
        for (flag, expected) in [
            (FlagKind::Green, "#22c55e"),
            (FlagKind::Yellow, "#f5c518"),
            (FlagKind::Red, "#e14a54"),
            (FlagKind::White, "#f2eeee"),
            (FlagKind::Black, "#0b0b0b"),
        ] {
            let runtime = shown(vec![session_flag(flag.clone())], SourceState::Live);
            let elements = runtime.elements();
            assert_eq!(
                element(&elements, "swatch").fill,
                color(expected),
                "{flag:?}"
            );
            assert!(find(&elements, "band").is_some(), "{flag:?}");
            assert!(find(&elements, "blue-stripe").is_none(), "{flag:?}");
        }
        let blue = shown(vec![session_flag(FlagKind::Blue)], SourceState::Live);
        let elements = blue.elements();
        assert!(find(&elements, "blue-stripe").is_some(), "franja azul");
        assert_eq!(element(&elements, "swatch").fill, color("#4f8ef7"));
        let checkered = shown(vec![session_flag(FlagKind::Checkered)], SourceState::Live);
        let elements = checkered.elements();
        let cells = elements
            .iter()
            .filter(|element| {
                element
                    .key
                    .as_deref()
                    .is_some_and(|key| key.starts_with("checkered-"))
            })
            .count();
        assert_eq!(cells, 30, "rejilla 5x6");
        assert_eq!(element(&elements, "swatch").fill, color("#f2eeee"));
    }

    #[test]
    fn sectors_paint_three_chips_with_their_active_color() {
        let runtime = shown(
            vec![
                session_flag(FlagKind::Yellow),
                Flag {
                    kind: FlagKind::Yellow,
                    scope: FlagScope::Sector(0),
                },
            ],
            SourceState::Live,
        );
        let elements = runtime.elements();
        assert_eq!(element(&elements, "sector-0").fill, color("#f5c518"));
        let inactive = element(&elements, "sector-1").fill;
        assert!(
            inactive.a > 0.0 && inactive.a < 0.1,
            "inactivo translúcido: {inactive:?}"
        );
        assert!(find(&elements, "sector-2").is_some());
        assert_eq!(element(&elements, "sector-label-0").rect[2], 24.0);
    }

    #[test]
    fn title_and_message_use_the_250_box_and_cut_with_ellipsis() {
        let long = "A VERY LONG CLASS NAME THAT DOES NOT FIT THE MESSAGE BOX EVEN WITH NARROWER WINDOWS FONT METRICS";
        let mut finish = photo(
            2,
            SourceState::Live,
            vec![session_flag(FlagKind::Checkered)],
        );
        finish.state.player = Some(Player {
            car: CarId(1),
            ..Player::default()
        });
        finish.state.cars = vec![Car {
            id: CarId(1),
            class: Some(Class {
                id: ClassId(1),
                name: long.into(),
            }),
            class_position: Quality::Reliable(3),
            ..Car::default()
        }];
        let runtime = shown_photo(finish);
        let elements = runtime.elements();
        assert_eq!(element(&elements, "title").rect[2], 250.0);
        assert_eq!(element(&elements, "message").rect[2], 250.0);
        let message = element(&elements, "message").text.clone().expect("mensaje");
        assert!(message.ends_with('…'), "recorte con puntos: {message:?}");
    }

    #[test]
    fn every_painted_element_stays_inside_the_window() {
        let states: Vec<(Vec<Flag>, SourceState)> = vec![
            (vec![], SourceState::Waiting),
            (vec![], SourceState::Live),
            (vec![session_flag(FlagKind::Green)], SourceState::Live),
            (
                vec![
                    session_flag(FlagKind::Yellow),
                    Flag {
                        kind: FlagKind::Yellow,
                        scope: FlagScope::Sector(0),
                    },
                ],
                SourceState::Live,
            ),
            (vec![session_flag(FlagKind::Red)], SourceState::Live),
            (vec![session_flag(FlagKind::Blue)], SourceState::Live),
            (vec![session_flag(FlagKind::White)], SourceState::Live),
            (vec![session_flag(FlagKind::Black)], SourceState::Live),
            (vec![session_flag(FlagKind::Checkered)], SourceState::Live),
        ];
        for (flags, source) in states {
            let runtime = shown(flags, source);
            let elements = runtime.elements();
            assert!(!elements.is_empty(), "sin elementos: {source:?}");
            for element in &elements {
                let [x, y, w, h] = element.rect;
                assert!(
                    x >= -0.5 && y >= -0.5,
                    "{:?} empieza en {x},{y}",
                    element.key
                );
                assert!(x + w <= 340.5, "{:?} acaba en x={}", element.key, x + w);
                assert!(y + h <= 88.5, "{:?} acaba en y={}", element.key, y + h);
            }
        }
    }
}
