//! Daños: un único marco con vistas Coche y Cifras, ambas de 200×272.
use crate::app::{Paint, Wake, replace_if_changed};
use crate::efficiency::{preview::PaintWindow as Window, text};
use crate::vantare::{
    paint::{Face, Kit, round_rect},
    style::{Color, Style},
};
use gpui::{App, PathBuilder, point, px};
use vantare_domain::{
    Snapshot,
    car_damage_visual::{self, ViewModel},
    format::Preferences,
};
const SIZE: (f32, f32) = (200.0, 272.0);
fn tone(value: Option<f64>) -> Color {
    Color(
        match value {
            Some(v) if v < 0.6 => 0xf25a5a,
            Some(v) if v < 0.9 => 0xf59e0b,
            Some(_) => 0x22c55e,
            None => 0x5a5052,
        },
        1.0,
    )
}
fn percentage(value: Option<f64>) -> String {
    vantare_domain::format::percent(value.map(|v| (v * 100.0).round() / 100.0))
}
fn paint_number_text(
    vm: &ViewModel,
    kit: &Kit<'_>,
    mut draw: impl FnMut(crate::vantare::paint::Label<'_>),
) {
    for (i, label) in [
        "Aero",
        if kit.es() { "Carrocería" } else { "Body" },
        if kit.es() {
            "Suspensión"
        } else {
            "Suspension"
        },
        if kit.es() { "Neumáticos" } else { "Tyres" },
    ]
    .into_iter()
    .enumerate()
    {
        if i == 0 && !vm.show_aero {
            continue;
        }
        let slot = i - usize::from(!vm.show_aero);
        let y = 62.0 + slot as f32 * 43.0;
        draw(crate::vantare::paint::Label {
            value: label,
            x: 12.0,
            right: None,
            top: y,
            height: 18.0,
            face: Face::Body,
            ink: kit.ink(Face::Body, 11.0, 0.3, kit.style.colors.muted.hsla()),
        });
        if i < 3 {
            draw(crate::vantare::paint::Label {
                value: &vm.percentages[i],
                x: 0.0,
                right: Some(188.0),
                top: y + 12.0,
                height: 24.0,
                face: Face::Display,
                ink: kit.ink(Face::Display, 22.0, 0.0, tone(vm.integrity[i]).hsla()),
            });
        } else {
            for j in 0..4 {
                let value = percentage(vm.tyres[j].map(|v| 1.0 - v));
                draw(crate::vantare::paint::Label {
                    value: &value,
                    x: 16.0 + j as f32 * 43.0,
                    right: None,
                    top: y + 18.0,
                    height: 16.0,
                    face: Face::Mono,
                    ink: kit.ink(Face::Mono, 10.0, 0.0, tone(vm.tyres[j]).hsla()),
                });
            }
        }
    }
}

fn paint(
    vm: &ViewModel,
    numbers: bool,
    percent: bool,
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
        width: SIZE.0,
    };
    kit.panel(window, SIZE.1);
    let severe = vm.integrity.iter().flatten().any(|v| *v < 0.6);
    if severe {
        round_rect(
            window,
            1.0,
            1.0,
            198.0,
            22.0,
            9.0,
            Color(0xb52b35, 1.0).hsla(),
        );
        let ink = kit.ink(Face::Display, 12.0, 1.4, style.colors.text.hsla());
        kit.label(
            window,
            cx,
            if kit.es() {
                "REVISA EL COCHE"
            } else {
                "CHECK YOUR CAR"
            },
            12.0,
            None,
            2.0,
            18.0,
            Face::Display,
            &ink,
        );
    }
    let muted = kit.ink(Face::Body, 11.0, 0.3, style.colors.muted.hsla());
    kit.label(
        window,
        cx,
        if kit.es() { "DAÑOS" } else { "DAMAGE" },
        12.0,
        None,
        31.0,
        18.0,
        Face::Body,
        &muted,
    );
    for (label, x, selected) in [
        (if kit.es() { "Coche" } else { "Car" }, 100.0, !numbers),
        (if kit.es() { "Cifras" } else { "Values" }, 144.0, numbers),
    ] {
        round_rect(
            window,
            x,
            28.0,
            44.0,
            24.0,
            4.0,
            Color(
                if selected { 0xe14a54 } else { 0xffffff },
                if selected { 0.38 } else { 0.03 },
            )
            .hsla(),
        );
        if selected {
            round_rect(
                window,
                x + 1.0,
                29.0,
                42.0,
                22.0,
                3.0,
                Color(0x51272c, 1.0).hsla(),
            );
        }
        let ink = kit.ink(
            Face::Body,
            10.0,
            0.0,
            Color(if selected { 0xece6e7 } else { 0x8e8587 }, 1.0).hsla(),
        );
        kit.label(
            window,
            cx,
            label,
            x + 6.0,
            None,
            32.0,
            16.0,
            Face::Body,
            &ink,
        );
    }
    if numbers {
        for slot in 0..(4 - usize::from(!vm.show_aero)) {
            round_rect(
                window,
                12.0,
                62.0 + slot as f32 * 43.0 + 39.0,
                176.0,
                1.0,
                0.0,
                Color(0xffffff, 0.06).hsla(),
            );
        }
        paint_number_text(vm, &kit, |label| {
            label.paint(&kit, window, cx);
        });
    } else {
        let (ox, oy) = text::origin();
        // SVG aprobado: viewBox 120×180 ajustado al cuerpo de la tarjeta.
        let pt = |x: f32, y: f32| point(px(ox + 47.2 + x * 0.88), px(oy + 70.0 + y * 0.88));
        let body_color = if vm.integrity[1] == Some(1.0) {
            Color(0x3a3335, 0.5)
        } else {
            let c = tone(vm.integrity[1]);
            Color(c.0, 0.22)
        };
        for (mut body, color) in [
            (PathBuilder::fill(), body_color),
            (PathBuilder::stroke(px(1.2)), Color(0xffffff, 0.28)),
        ] {
            body.move_to(pt(32.0, 34.0));
            body.curve_to(pt(48.0, 9.0), pt(30.0, 14.0));
            body.line_to(pt(72.0, 9.0));
            body.curve_to(pt(88.0, 34.0), pt(90.0, 14.0));
            body.line_to(pt(90.0, 58.0));
            body.curve_to(pt(90.0, 122.0), pt(85.0, 90.0));
            body.line_to(pt(88.0, 148.0));
            body.curve_to(pt(76.0, 158.0), pt(86.0, 158.0));
            body.line_to(pt(44.0, 158.0));
            body.curve_to(pt(32.0, 148.0), pt(34.0, 158.0));
            body.line_to(pt(30.0, 122.0));
            body.curve_to(pt(30.0, 58.0), pt(35.0, 90.0));
            body.close();
            if let Ok(body) = body.build() {
                window.paint_path(body, color.hsla());
            }
        }
        for (x, y) in [(18.0, 24.0), (92.0, 24.0), (18.0, 118.0), (92.0, 118.0)] {
            round_rect(
                window,
                47.2 + x * 0.88,
                70.0 + y * 0.88,
                8.8,
                24.64,
                3.0,
                Color(0x5a5052, 1.0).hsla(),
            );
        }
        let mut panels = PathBuilder::stroke(px(2.0));
        for (from, to) in [
            ((60.0, 54.0), (60.0, 124.0)),
            ((30.0, 54.0), (90.0, 54.0)),
            ((30.0, 124.0), (90.0, 124.0)),
        ] {
            panels.move_to(pt(from.0, from.1));
            panels.line_to(pt(to.0, to.1));
        }
        if let Ok(panels) = panels.build() {
            window.paint_path(panels, Color(0x110f10, 1.0).hsla());
        }
        for (mut cabin, color) in [
            (PathBuilder::fill(), Color(0x0d0b0c, 1.0)),
            (PathBuilder::stroke(px(1.0)), Color(0xffffff, 0.18)),
        ] {
            cabin.move_to(pt(52.0, 62.0));
            cabin.curve_to(pt(68.0, 62.0), pt(60.0, 50.0));
            cabin.line_to(pt(68.0, 92.0));
            cabin.curve_to(pt(52.0, 92.0), pt(60.0, 98.0));
            cabin.close();
            if let Ok(cabin) = cabin.build() {
                window.paint_path(cabin, color.hsla());
            }
        }
        if vm.show_aero {
            // Integridad aero agregada no identifica el estado de un alerón concreto.
            round_rect(
                window,
                68.32,
                212.56,
                63.36,
                7.92,
                2.0,
                Color(0xffffff, 0.09).hsla(),
            );
        }
        if percent && vm.show_aero {
            let ink = kit.ink(Face::Mono, 10.0, 0.0, tone(vm.integrity[0]).hsla());
            kit.label(
                window,
                cx,
                &format!("Aero {}", percentage(vm.integrity[0])),
                12.0,
                None,
                62.0,
                16.0,
                Face::Mono,
                &ink,
            );
        }
    }
    round_rect(
        window,
        12.0,
        244.0,
        176.0,
        1.0,
        0.0,
        Color(0xffffff, 0.08).hsla(),
    );
    let status = vm
        .status
        .unwrap_or(if vm.integrity.iter().all(|v| *v == Some(1.0)) {
            if kit.es() {
                "Coche intacto"
            } else {
                "Car intact"
            }
        } else {
            if kit.es() {
                "Integridad del coche"
            } else {
                "Car integrity"
            }
        });
    kit.label(
        window,
        cx,
        status,
        12.0,
        None,
        248.0,
        16.0,
        Face::Body,
        &muted,
    );
}

#[derive(Clone, Debug, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Settings {
    pub show_aero: bool,
    pub view: String,
    pub toggle_key: String,
    pub show_percent: bool,
}
impl Default for Settings {
    fn default() -> Self {
        Self {
            show_aero: true,
            view: "car".into(),
            toggle_key: String::new(),
            show_percent: true,
        }
    }
}
impl Settings {
    pub const UNSUPPORTED: &'static [(&'static str, &'static str)] = &[];
    pub fn key_matches(&self, key: &gpui::Keystroke) -> bool {
        !self.toggle_key.is_empty()
            && key.key.eq_ignore_ascii_case(&self.toggle_key)
            && !key.modifiers.control
            && !key.modifiers.alt
            && !key.modifiers.shift
            && !key.modifiers.platform
    }
    pub fn toggle_view(&mut self) {
        self.view = if self.view == "numbers" {
            "car"
        } else {
            "numbers"
        }
        .into();
    }
    #[must_use]
    pub fn normalized(&self) -> Self {
        let mut s = self.clone();
        if s.view != "numbers" {
            s.view = "car".into();
        }
        s.toggle_key = s.toggle_key.to_ascii_lowercase();
        if !s
            .toggle_key
            .strip_prefix('f')
            .and_then(|n| n.parse::<u8>().ok())
            .is_some_and(|n| (1..=12).contains(&n))
        {
            s.toggle_key.clear();
        }
        s
    }
    fn project(&self, snapshot: &Snapshot, prefs: Preferences) -> ViewModel {
        let mut vm = car_damage_visual::project(snapshot, prefs);
        vm.show_aero = self.show_aero;
        vm
    }
}

pub(crate) struct Widget {
    settings: Settings,
    vm: ViewModel,
    numbers: bool,
    #[cfg(any(windows, test))]
    key_down: bool,
}

impl Widget {
    pub(crate) fn new(settings: &Settings, prefs: Preferences) -> Self {
        let settings = settings.normalized();
        Self {
            numbers: settings.view == "numbers",
            #[cfg(any(windows, test))]
            key_down: false,
            settings: settings.clone(),
            vm: settings.project(&Snapshot::default(), prefs),
        }
    }

    #[allow(clippy::unused_self)] // Firma común; tamaño fijo.
    pub(crate) fn size(&self) -> (f32, f32) {
        SIZE
    }

    pub(crate) fn ingest(&mut self, snapshot: &Snapshot, prefs: Preferences) -> bool {
        replace_if_changed(&mut self.vm, self.settings.project(snapshot, prefs))
    }

    pub(crate) fn frame(&mut self, prefs: Preferences, _reduced: bool) -> (Paint, Wake) {
        let vm = self.vm.clone();
        let numbers = self.numbers;
        let percent = self.settings.show_percent;
        (
            Box::new(move |window, cx| paint(&vm, numbers, percent, prefs, window, cx)),
            Wake::Idle,
        )
    }

    #[cfg(windows)]
    pub(crate) fn shortcut_key(&self) -> &str {
        &self.settings.toggle_key
    }
    #[cfg(any(windows, test))]
    pub(crate) fn handle_shortcut(&mut self, down: bool) -> bool {
        let toggle = down && !self.key_down && !self.settings.toggle_key.is_empty();
        self.key_down = down;
        if toggle {
            self.numbers = !self.numbers;
        }
        toggle
    }

    #[cfg(feature = "parity-capture")]
    #[allow(clippy::unused_self)] // El productivo no tiene animaciones ni avisos.
    pub(crate) fn animating(&self) -> bool {
        false
    }
}

impl Settings {
    #[allow(clippy::unused_self)] // Contrato común de demanda por renderer.
    pub fn demand(&self) -> vantare_ipc::Demand {
        use vantare_ipc::Signal::Damage;
        crate::demand::signals(500, &[Damage])
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn shortcut_is_unassigned_and_toggles_once_per_press_without_resizing() {
        let prefs = Preferences::default();
        let mut none = Widget::new(&Settings::default(), prefs);
        assert!(!none.handle_shortcut(true));
        assert!(!none.numbers);
        let settings = Settings {
            view: "car".into(),
            toggle_key: "F7".into(),
            ..Settings::default()
        }
        .normalized();
        let saved = serde_json::to_string(&settings).expect("guardar");
        assert_eq!(
            serde_json::from_str::<Settings>(&saved)
                .expect("leer")
                .normalized(),
            settings
        );
        let mut widget = Widget::new(&settings, prefs);
        assert!(widget.handle_shortcut(true));
        assert!(widget.numbers);
        assert!(!widget.handle_shortcut(true));
        assert!(!widget.handle_shortcut(false));
        assert!(widget.handle_shortcut(true));
        assert!(!widget.numbers);
        assert_eq!(widget.size(), (200.0, 272.0));
        widget.ingest(&Snapshot::default(), prefs);
        assert_eq!(widget.size(), (200.0, 272.0));
    }

    #[test]
    fn aero_setting_hides_only_the_legend_and_preserves_svg_damage() {
        let snapshot = vantare_ipc::snapshot_from_fixture_json(include_str!(
            "../../fixtures/car-damage-visual.snapshot.json"
        ))
        .expect("scene");
        let normal = Settings::default().project(&snapshot, Preferences::default());
        let hidden = Settings {
            show_aero: false,
            ..Settings::default()
        }
        .project(&snapshot, Preferences::default());
        assert!(!hidden.show_aero);
        assert_eq!(hidden.damage, normal.damage);
        assert_eq!(hidden.percentages, normal.percentages);
    }

    use super::*;
    use vantare_domain::{Capability, Damage, Player, Quality};

    #[test]
    fn frozen_scene_decodes_and_matches_the_productive_damage_values()
    -> Result<(), vantare_ipc::Error> {
        // Workshop default/race/track/ready: dents [1,2,3,4,5,6,7,8]
        // producen daño 1 en las tres partes, es decir, integridad 0.
        let snapshot = vantare_ipc::snapshot_from_fixture_json(include_str!(
            "../../fixtures/car-damage-visual.snapshot.json"
        ))?;
        let vm = car_damage_visual::project(&snapshot, Preferences::default());
        assert_eq!(vm.status, None);
        assert_eq!(vm.damage, [Some(1.0); 3]);
        assert_eq!(vm.percentages, ["100%"; 3]);
        assert_eq!(vm.labels, ["AERO", "CARROC.", "SUSP"]);
        Ok(())
    }

    #[test]
    fn repaint_tracks_drawn_values_and_language_not_snapshot_sequence() {
        let prefs = Preferences::default();
        let mut data = Snapshot::default();
        data.state.source_state = vantare_domain::SourceState::Live;
        data.state.capabilities.damage = Capability::Fresh;
        data.state.player = Some(Player {
            damage: Damage {
                aero: Quality::Reliable(0.0),
                body: Quality::Reliable(0.0),
                suspension: Quality::Reliable(0.0),
                ..Damage::default()
            },
            ..Player::default()
        });
        let mut widget = Widget::new(&Settings::default(), prefs);
        assert!(widget.ingest(&data, prefs));
        data.sequence += 1;
        assert!(!widget.ingest(&data, prefs));
        assert!(widget.ingest(
            &data,
            Preferences {
                language: vantare_domain::format::Language::En,
                ..prefs
            }
        ));
        assert!(matches!(widget.frame(prefs, false).1, Wake::Idle));
        #[cfg(feature = "parity-capture")]
        assert!(!widget.animating());
    }
}

#[cfg(test)]
mod numbers_render_tests {
    use super::*;
    fn photo() -> Snapshot {
        use vantare_domain::{Capability, Quality::Reliable, SourceState};
        let mut photo = crate::source::fixed();
        photo.state.source_state = SourceState::Live;
        photo.state.capabilities.damage = Capability::Fresh;
        let p = photo.state.player.as_mut().expect("jugador");
        p.damage.aero = Reliable(0.2);
        p.damage.body = Reliable(0.7);
        p.damage.suspension = Reliable(0.9);
        p.damage.tyre_wear = [Reliable(0.98); 4];
        photo
    }
    #[test]
    fn numbers_paint_damage_loss_not_remaining_integrity() {
        let vm = Settings::default().project(&photo(), Preferences::default());
        crate::paint_tests::with_kit(SIZE.0, vantare_domain::format::Language::Es, |kit| {
            let painted = crate::paint_tests::observe(|draw| paint_number_text(&vm, kit, draw));
            let text: Vec<_> = painted.iter().map(|label| label.value.as_str()).collect();
            assert!(text.contains(&"80%") && text.contains(&"30%") && text.contains(&"10%"));
            assert_eq!(text.iter().filter(|v| **v == "2%").count(), 4);
            assert!(!text.contains(&"98%"));
        });
    }
    #[test]
    fn show_aero_false_removes_the_painted_row_and_compacts_the_rest() {
        let vm = Settings {
            show_aero: false,
            ..Settings::default()
        }
        .project(&photo(), Preferences::default());
        crate::paint_tests::with_kit(SIZE.0, vantare_domain::format::Language::Es, |kit| {
            let painted = crate::paint_tests::observe(|draw| paint_number_text(&vm, kit, draw));
            assert!(!painted.iter().any(|label| label.value == "Aero"));
            assert_eq!(painted[0].value, "Carrocería");
            assert_eq!(painted[0].top, 62.0);
        });
    }
}
