//! Delta Vantare: domain projects facts; the painter retains only visible values.
mod paint;
#[cfg(test)]
mod tests;
use crate::{
    motion::Tween,
    relative::Update,
    vantare::{Style, waiting},
};
use rune::{Color, El, Live, LiveText, Tx};
use vantare_domain::{
    Snapshot, SourceState,
    delta::{self, Board, Phase, Reference, Sector},
    format::{Language, Preferences, lap_time},
    geometry::Size,
    widget_settings::{delta::Settings, look::Tone},
};

pub(crate) struct Delta {
    settings: Settings,
    prefs: Preferences,
    board: Board,
    labels: [LiveText; 6],
    ink: Live<Color>,
    bar: Live<[f32; 4]>,
    fill: Live<Color>,
    motion: Tween,
    reduced: bool,
    projected: bool,
    paused: bool,
}
impl Delta {
    pub fn new(settings: &Settings, prefs: Preferences, reduced: bool) -> Self {
        let settings = settings.normalized();
        let board = delta::project_reference(&Snapshot::default(), prefs, reference(&settings));
        let value = Self {
            settings,
            prefs,
            board,
            labels: std::array::from_fn(|_| LiveText::new("")),
            ink: Live::new(Style::compiled().colors.text),
            fill: Live::new(Style::compiled().colors.gain),
            bar: Live::new([0.0; 4]),
            motion: Tween::fixed(0.0),
            reduced,
            projected: false,
            paused: false,
        };
        value.publish();
        value
    }
    pub fn configured(&self, settings: &Settings, prefs: Preferences) -> bool {
        self.settings == settings.normalized() && self.prefs == prefs
    }
    pub fn size(&self) -> Size {
        let style = Style::compiled();
        let d = &style.delta;
        let v = self.variant(&style);
        let (width, height) = match self.settings.size.as_str() {
            "pill" => (d.pill_width, d.pill_height),
            size => (
                if size == "expanded" {
                    d.width_expanded
                } else {
                    d.width_bar
                },
                2.0 * v.padding_y
                    + v.header_height
                    + v.header_gap
                    + d.message_height.max(d.big_height)
                    + 27.0
                    + if self.settings.show_bar {
                        d.bar + d.tick_labels
                    } else {
                        0.0
                    }
                    + if size == "expanded" && self.settings.show_sectors {
                        d.sector_height
                    } else {
                        0.0
                    },
            ),
        };
        Size {
            width,
            height: height + if self.paused { 22.0 } else { 0.0 },
        }
    }
    pub fn size_for(&self, snapshot: Option<&Snapshot>) -> Size {
        let paused = snapshot.map_or(self.paused, |s| s.state.source_state == SourceState::Paused);
        Size {
            height: self.size().height + if paused { 22.0 } else { 0.0 }
                - if self.paused { 22.0 } else { 0.0 },
            ..self.size()
        }
    }
    fn variant<'a>(&self, style: &'a Style) -> &'a crate::vantare::Variant {
        if self.settings.style == Tone::Neo {
            &style.styles.neo
        } else {
            &style.styles.neutro
        }
    }
    fn message(&self) -> bool {
        waiting(Some((self.board.source_state, self.board.player_present)))
            || self.board.phase == Phase::NoReference
    }
    fn grey(&self) -> bool {
        matches!(self.board.phase, Phase::Invalid | Phase::Paused(_))
    }
    fn bar_visible(&self) -> bool {
        self.settings.size != "pill" && self.settings.show_bar && !self.message()
    }
    fn sectors(&self) -> &[Sector] {
        if self.settings.size == "expanded"
            && self.settings.show_sectors
            && !self.message()
            && !self.grey()
        {
            &self.board.sectors
        } else {
            &[]
        }
    }
    fn target(&self) -> f32 {
        if self.board.phase != Phase::Live {
            return 0.0;
        }
        self.board.delta_s.map_or(0.0, |d| {
            (d as f32 / Style::compiled().delta.range_s.max(0.01)).clamp(-1.0, 1.0)
        })
    }
    /// The host already applied the instance Cadence before publishing this snapshot.
    pub fn update(&mut self, snapshot: &Snapshot, clock: f64) -> Update {
        let paused = snapshot.state.source_state == SourceState::Paused;
        if paused && self.projected {
            let changed = self.paused != paused;
            self.paused = paused;
            return Update {
                build: changed,
                pixels: false,
            };
        }
        let was_paused = self.paused;
        self.paused = paused;
        let retained;
        let snapshot = if paused {
            retained = {
                let mut s = snapshot.clone();
                s.state.source_state = SourceState::Live;
                s
            };
            &retained
        } else {
            snapshot
        };
        let next = delta::project_reference(snapshot, self.prefs, reference(&self.settings));
        if next == self.board && was_paused == paused {
            return Update::default();
        }
        let build = was_paused != paused
            || self.message() != message(&next)
            || self.board.banner != next.banner
            || !self
                .sectors()
                .iter()
                .map(paint::sector_parts)
                .eq(shown_sectors(&next, &self.settings)
                    .iter()
                    .map(paint::sector_parts));
        let snap = !self.projected
            || next.identity != self.board.identity
            || self.reduced
            || message(&next);
        self.board = next;
        let target = self.target();
        if snap || !self.bar_visible() {
            self.motion = Tween::fixed(target);
        } else {
            self.motion.retarget(
                target,
                clock,
                f64::from(Style::compiled().delta.ease_ms) / 1000.0,
            );
        }
        self.projected = true;
        let pixels = self.publish() | self.animate(clock).pixels;
        Update { build, pixels }
    }
    fn publish(&self) -> bool {
        let s = Style::compiled();
        let es = self.prefs.language == Language::Es;
        let ref_name = match (self.board.reference, es) {
            (Reference::PersonalBest, true) => "Mejor",
            (Reference::PersonalBest, false) => "Best",
            (Reference::Optimal, true) => "Óptima",
            (Reference::Optimal, false) => "Optimal",
            (Reference::Leader, true) => "Líder",
            (Reference::Leader, false) => "Leader",
            _ => "—",
        };
        let number = if self.message() {
            "-.---".into()
        } else if matches!(self.board.phase, Phase::Paused(_)) {
            "—.———".into()
        } else {
            self.board.delta_text().replace('-', "−")
        };
        let status = if self.message() {
            if es {
                "Esperando referencia"
            } else {
                "Waiting for reference"
            }
        } else {
            self.board
                .status_text(self.prefs.language)
                .unwrap_or_default()
        };
        let values = [
            format!("DELTA · VS {}", ref_name.to_uppercase()),
            number,
            format!("{ref_name} {}", lap_time(self.board.reference_lap_s)),
            format!(
                "{} {}",
                if es { "Predicha" } else { "Predicted" },
                lap_time(self.board.predicted_s)
            ),
            self.board.lap.map_or_else(String::new, |lap| {
                format!("{} {lap}", if es { "Vuelta" } else { "Lap" })
            }),
            status.into(),
        ];
        let mut changed = false;
        for (index, (live, value)) in self.labels.iter().zip(values).enumerate() {
            let set = live.set(value);
            changed |= set && (self.settings.size != "pill" || matches!(index, 1 | 2));
        }
        let color = if self.grey() || self.message() || self.board.status != delta::Status::Ready {
            s.delta.grey
        } else {
            match self.board.delta_s {
                Some(d) if d < 0.0 => s.delta.fill_gain,
                Some(d) if d > 0.0 => s.delta.fill_loss,
                _ => s.colors.text,
            }
        };
        changed |= self.ink.set(color);
        let fill = self.fill.set(color);
        changed |= fill && self.bar_visible();
        changed
    }
    pub fn policy(&mut self, reduced: bool, clock: f64) -> Update {
        if self.reduced == reduced {
            return Update::default();
        }
        self.reduced = reduced;
        if reduced {
            self.motion.settle();
        }
        self.animate(clock)
    }
    pub fn animate(&self, clock: f64) -> Update {
        if !self.bar_visible() {
            return Update::default();
        }
        let s = Style::compiled();
        let v = self.variant(&s);
        let size = self.size();
        let value = self.motion.value(clock);
        let half = (size.width - 2.0 * v.padding_x) / 2.0;
        let y = v.padding_y
            + v.header_height
            + v.header_gap
            + s.delta.message_height.max(s.delta.big_height)
            + if self.board.banner.is_some() {
                27.0
            } else {
                0.0
            };
        Update {
            build: false,
            pixels: self.bar.set([
                size.width / 2.0 + value.min(0.0) * half,
                y,
                value.abs() * half,
                s.delta.bar,
            ]),
        }
    }
    pub fn schedule(&self, clock: f64, tx: &mut Tx) {
        if !self.reduced && self.bar_visible() && self.motion.active(clock) {
            tx.wake_after(std::time::Duration::ZERO);
        }
    }
    pub fn view(&self) -> El {
        paint::view(self)
    }
}
fn reference(settings: &Settings) -> Reference {
    match settings.reference.as_str() {
        "optimal" => Reference::Optimal,
        "leader" => Reference::Leader,
        _ => Reference::PersonalBest,
    }
}
fn message(board: &Board) -> bool {
    waiting(Some((board.source_state, board.player_present))) || board.phase == Phase::NoReference
}
fn shown_sectors<'a>(board: &'a Board, settings: &Settings) -> &'a [Sector] {
    if settings.size == "expanded"
        && settings.show_sectors
        && !message(board)
        && !matches!(board.phase, Phase::Invalid | Phase::Paused(_))
    {
        &board.sectors
    } else {
        &[]
    }
}
