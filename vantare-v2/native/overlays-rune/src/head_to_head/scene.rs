//! Cara a cara: the domain pair, its widget anchors and its status texts.
//! No Rune, colours or window. Nothing slides or pulses, so reduced motion needs no
//! special case: one visible change is one image, idle costs no clock, and the same
//! photo always samples the same scene.
use vantare_domain::{
    format::{Language, PLACEHOLDER},
    head_to_head::{Row, ViewModel},
};

/// Left edge of each half in widget pixels; the Look owns the rest of its box.
const LEFT_X: f32 = 8.0;
const RIGHT_X: f32 = 392.0;
/// First sector column and the step between the three.
const SECTOR_X: f32 = 610.0;
const SECTOR_STEP: f32 = 53.0;
const SECTOR_LABELS: [&str; 3] = ["S1", "S2", "S3"];

/// One half of the strip: the player or the selected rival.
#[derive(Clone, Debug, PartialEq)]
pub struct Half {
    pub place: String,
    pub name: String,
    pub number: String,
    pub lap: String,
    /// `MEJOR`/`ÚLTIMA` en español, `BEST`/`LAST` en inglés.
    pub caption: String,
    pub is_player: bool,
    pub x: f32,
}

impl Half {
    /// Exact label GPUI prints: `P{place}  {name}  #{number}`.
    pub fn label(&self) -> String {
        format!("P{}  {}  #{}", self.place, self.name, self.number)
    }
}

/// One sector column: its label, its delta and its left edge.
#[derive(Clone, Debug, PartialEq)]
pub struct Sector {
    pub label: &'static str,
    pub delta: String,
    pub x: f32,
}

/// The pair: two halves, the centre values and the sectors.
#[derive(Clone, Debug, PartialEq)]
pub struct Duel {
    /// `VS DELANTE`/`VS DETRÁS`/`VS POLE`; never the domain `H2H · ` prefix.
    pub header: String,
    /// Best place first, as the domain orders them.
    pub halves: [Half; 2],
    /// `—` when the photo carries no relative gap.
    pub gap: String,
    /// Empty means nothing is painted there, as in GPUI.
    pub trend: String,
    pub catch: String,
    /// The trend is good for the player; the Look paints it green or red.
    pub good: bool,
    /// Empty when the setting hides them.
    pub sectors: Vec<Sector>,
}

/// Everything the widget shows. `duel: None` means no half is painted.
#[derive(Clone, Debug, PartialEq)]
pub struct Scene {
    /// Text painted alone when there is no pair (`SIN RIVAL`/`ESPERANDO A LMU`).
    pub status: Option<String>,
    /// Pause band label (`EN PAUSA`/`PAUSED`); it never changes the pair.
    pub pause: Option<String>,
    pub duel: Option<Duel>,
}

/// Pure sampling: same photo, same scene, no clock.
/// The caller retains the last live photo on pause, as GPUI does.
pub fn sample(vm: &ViewModel, show_sectors: bool, language: Language, paused: bool) -> Scene {
    let pause = paused.then(|| match language {
        Language::Es => "EN PAUSA".to_owned(),
        Language::En => "PAUSED".to_owned(),
    });
    let Some(duel) = &vm.duel else {
        return Scene {
            status: Some(vm.no_rival.clone()),
            pause,
            duel: None,
        };
    };
    let caption = match (duel.best_laps, language) {
        (true, Language::Es) => "MEJOR",
        (true, Language::En) => "BEST",
        (false, Language::Es) => "ÚLTIMA",
        (false, Language::En) => "LAST",
    };
    let sectors = if show_sectors {
        SECTOR_LABELS
            .iter()
            .zip(&duel.sectors)
            .enumerate()
            .map(|(index, (label, delta))| Sector {
                label,
                delta: present(delta),
                x: SECTOR_X + index as f32 * SECTOR_STEP,
            })
            .collect()
    } else {
        Vec::new()
    };
    Scene {
        status: None,
        pause,
        duel: Some(Duel {
            header: vm.header.replace("H2H · ", "VS "),
            halves: [
                half(&duel.left, &duel.laps[0], LEFT_X, caption, language),
                half(&duel.right, &duel.laps[1], RIGHT_X, caption, language),
            ],
            gap: present(&duel.gap),
            trend: duel.trend.clone(),
            catch: duel.catch.clone(),
            good: duel.good,
            sectors,
        }),
    }
}

fn half(row: &Row, lap: &str, x: f32, caption: &str, language: Language) -> Half {
    Half {
        place: row.place.clone(),
        name: if row.is_player {
            match language {
                Language::Es => "Tú",
                Language::En => "You",
            }
            .to_owned()
        } else {
            row.name.clone()
        },
        number: row.number.clone(),
        lap: lap.to_owned(),
        caption: caption.to_owned(),
        is_player: row.is_player,
        x,
    }
}

/// GPUI substitutes the shared placeholder for a missing value; `—` stays `—`.
fn present(value: &str) -> String {
    if value.is_empty() {
        PLACEHOLDER.to_owned()
    } else {
        value.to_owned()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use vantare_domain::{
        CarId,
        Quality::Reliable,
        SessionKind, Snapshot, SourceState,
        format::Preferences,
        head_to_head::{self, Target},
    };

    /// Seven cars, player in P4, rival ahead in P3; race order, not best lap.
    fn snapshot() -> Snapshot {
        let mut snapshot = crate::testdata::snapshot();
        snapshot.state.session.kind = Reliable(SessionKind::Race);
        for car in &mut snapshot.state.cars {
            let id = f64::from(car.id.0);
            car.relative_s = Reliable(4.0 - id);
            car.last_lap_s = Reliable(110.0 - id);
            car.number = car.id.0.to_string();
            car.driver.name = format!("DRIVER-{:03}", car.id.0);
        }
        snapshot
    }

    fn visual(snapshot: &Snapshot, target: Target, prefs: Preferences) -> Scene {
        sample(
            &head_to_head::project(snapshot, prefs, target),
            true,
            prefs.language,
            false,
        )
    }

    #[test]
    fn race_pair_shows_both_halves_centre_values_and_sectors() {
        let scene = visual(&snapshot(), Target::Ahead, Preferences::default());
        assert_eq!(scene.status, None);
        assert_eq!(scene.pause, None);
        let duel = scene.duel.expect("pair");
        assert_eq!(duel.header, "VS DELANTE");
        assert_eq!(duel.gap, "+1.000");
        assert_eq!(duel.trend, "recortas 1.00 s/v");
        assert_eq!(duel.catch, "le alcanzas en ~1 v");
        let [left, right] = &duel.halves;
        assert_eq!(left.label(), "P3  DRIVER-003  #3");
        assert!(!left.is_player && left.x == 8.0);
        assert_eq!(
            (left.lap.as_str(), left.caption.as_str()),
            ("1:47.000", "ÚLTIMA")
        );
        assert_eq!(right.label(), "P4  Tú  #4");
        assert!(right.is_player && right.x == 392.0);
        assert_eq!(right.lap, "1:46.000");
        assert_eq!(
            duel.sectors
                .iter()
                .map(|s| (s.label, s.x, s.delta.as_str()))
                .collect::<Vec<_>>(),
            [("S1", 610.0, "—"), ("S2", 663.0, "—"), ("S3", 716.0, "—")]
        );
        let hidden = sample(
            &head_to_head::project(&snapshot(), Preferences::default(), Target::Ahead),
            false,
            Language::Es,
            false,
        );
        assert!(hidden.duel.expect("pair").sectors.is_empty());
    }

    #[test]
    fn no_neighbour_leaves_no_rows_and_only_the_status() {
        for (player, target) in [(1, Target::Ahead), (7, Target::Behind)] {
            let mut snapshot = snapshot();
            snapshot.state.player.as_mut().expect("player").car = CarId(player);
            let scene = visual(&snapshot, target, Preferences::default());
            assert_eq!(
                (scene.duel, scene.status.as_deref()),
                (None, Some("SIN RIVAL"))
            );
        }
    }

    #[test]
    fn every_other_source_state_waits_for_lmu_without_rows() {
        for state in [
            SourceState::Waiting,
            SourceState::Paused,
            SourceState::Stale,
            SourceState::Lost,
        ] {
            let mut snapshot = snapshot();
            snapshot.state.source_state = state;
            let scene = visual(&snapshot, Target::Ahead, Preferences::default());
            assert_eq!(scene.duel, None, "{state:?}");
            assert_eq!(
                scene.status.as_deref(),
                Some("ESPERANDO A LMU"),
                "{state:?}"
            );
        }
    }

    #[test]
    fn missing_or_invalid_gap_paints_the_shared_placeholder() {
        for quality in [
            vantare_domain::Quality::Unavailable,
            Reliable(f64::NAN),
            Reliable(f64::INFINITY),
        ] {
            let mut snapshot = snapshot();
            snapshot.state.cars[2].relative_s = quality;
            let duel = visual(&snapshot, Target::Ahead, Preferences::default())
                .duel
                .expect("pair");
            assert_eq!(duel.gap, "—");
            assert!(duel.catch.is_empty(), "no reach time without a gap");
        }
    }

    #[test]
    fn english_uses_its_own_status_caption_and_header() {
        let prefs = Preferences {
            language: Language::En,
            ..Preferences::default()
        };
        let duel = visual(&snapshot(), Target::Ahead, prefs)
            .duel
            .expect("pair");
        assert_eq!(duel.header, "VS AHEAD");
        assert_eq!(duel.halves[1].name, "You");
        assert_eq!(duel.halves[1].caption, "LAST");
        let mut waiting = snapshot();
        waiting.state.source_state = SourceState::Waiting;
        assert_eq!(
            visual(&waiting, Target::Ahead, prefs).status.as_deref(),
            Some("WAITING FOR LMU")
        );
    }

    #[test]
    fn best_lap_session_compares_the_class_pole_and_predicts_nothing() {
        let mut snapshot = snapshot();
        snapshot.state.session.kind = Reliable(SessionKind::Practice);
        for car in &mut snapshot.state.cars {
            car.best_lap_s = Reliable(100.0 + f64::from(car.id.0));
        }
        let duel = visual(&snapshot, Target::Ahead, Preferences::default())
            .duel
            .expect("class pole");
        assert_eq!(duel.header, "VS POLE");
        assert_eq!(duel.gap, "+3.000");
        assert_eq!(duel.halves[0].label(), "P1  DRIVER-001  #1");
        assert_eq!(duel.halves[1].caption, "MEJOR");
        assert_eq!((duel.trend.as_str(), duel.catch.as_str()), ("", ""));
    }

    #[test]
    fn pause_keeps_the_pair_and_adds_only_its_band_label() {
        let live = head_to_head::project(&snapshot(), Preferences::default(), Target::Ahead);
        let paused = sample(&live, true, Language::Es, true);
        assert_eq!(paused.pause.as_deref(), Some("EN PAUSA"));
        assert_eq!(paused.duel, sample(&live, true, Language::Es, false).duel);
        assert_eq!(
            sample(&live, true, Language::En, true).pause.as_deref(),
            Some("PAUSED")
        );
    }

    #[test]
    fn repeating_the_same_photo_gives_the_same_scene_without_a_clock() {
        let vm = head_to_head::project(&snapshot(), Preferences::default(), Target::Ahead);
        let first = sample(&vm, true, Language::Es, false);
        assert_eq!(first, sample(&vm, true, Language::Es, false));
        assert_eq!(first, sample(&vm, true, Language::Es, false));
    }
}
