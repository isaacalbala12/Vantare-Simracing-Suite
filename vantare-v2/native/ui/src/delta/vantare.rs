//! Delta en el sistema de diseño Vantare (#1497), según el catálogo r10b.
//!
//! El ViewModel es puro (`vantare_domain::delta`); aquí se mide y se
//! pinta con el kit Vantare: píldora (la del Studio), barra de 380 y ampliado
//! de 520 con referencia, vuelta predicha y sectores. La barra se desliza hacia
//! el valor nuevo y una vuelta récord personal destella en morado.

use crate::app::Wake;
use crate::efficiency::preview::PaintWindow as Window;
use crate::efficiency::text;
use crate::standings::{Accent, Look};
use crate::vantare::paint::{Face, Kit, round_rect};
use crate::vantare::style::{Color, Style, Variant};
use gpui::{App, BorderStyle, Corners, Edges, Hsla, linear_color_stop, linear_gradient, px, quad};
use std::sync::{Arc, OnceLock};
use std::time::{Duration, Instant};
use vantare_domain::SourceState;
use vantare_domain::delta::{Banner, Board, Pause, Phase, Reference, Sector, SectorTone};
use vantare_domain::format::{Language, PLACEHOLDER, lap_time};

// ---------------------------------------------------------------------------
// Opciones
// ---------------------------------------------------------------------------

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub(crate) enum Size {
    #[default]
    Pill,
    Bar,
    Expanded,
}

#[derive(Clone, Debug, PartialEq)]
pub(crate) struct Options {
    pub look: Look,
    pub accent: Accent,
    pub size: Size,
    pub reference: Reference,
    pub show_bar: bool,
    pub show_sectors: bool,
    /// Marca Vantare en la cabecera (`brandVisible`, decidido por la licencia).
    pub brand: bool,
}

impl Options {
    pub(crate) fn from_settings(settings: &super::Settings) -> Self {
        Self {
            look: settings.style,
            accent: settings.accent,
            size: match settings.size.as_str() {
                "bar" => Size::Bar,
                "expanded" => Size::Expanded,
                _ => Size::Pill,
            },
            reference: match settings.reference.as_str() {
                "optimal" => Reference::Optimal,
                "leader" => Reference::Leader,
                _ => Reference::PersonalBest,
            },
            show_bar: settings.show_bar,
            show_sectors: settings.show_sectors,
            brand: settings.brand_visible == Some(true),
        }
    }

    fn variant<'a>(&self, style: &'a Style) -> &'a Variant {
        match self.look {
            Look::Neo => &style.styles.neo,
            Look::Neutro => &style.styles.neutro,
        }
    }

    fn accent(&self, style: &Style) -> Color {
        match self.accent {
            Accent::Red => style.accents.red,
            Accent::Amber => style.accents.amber,
            Accent::Green => style.accents.green,
            Accent::White => style.accents.white,
        }
    }
}

// ---------------------------------------------------------------------------
// Layout (puro)
// ---------------------------------------------------------------------------

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Item {
    Banner,
    Header,
    /// Número grande, predicha y vuelta/sector.
    Big,
    /// Sin referencia, esperando o espectador: aviso centrado.
    Message,
    Bar,
    Sectors,
}

#[derive(Clone, Debug, PartialEq)]
struct Layout {
    width: f32,
    height: f32,
    items: Vec<(f32, Item)>,
}

fn waiting(board: Option<&Board>) -> bool {
    board.is_none_or(|b| {
        !b.player_present || matches!(b.source_state, SourceState::Waiting | SourceState::Lost)
    })
}

/// Sin número que mostrar: aviso en lugar del número grande.
fn message(board: Option<&Board>) -> bool {
    waiting(board) || board.is_some_and(|b| b.phase == Phase::NoReference)
}

/// Gris: vuelta invalidada o delta en pausa.
fn grey(board: &Board) -> bool {
    matches!(board.phase, Phase::Invalid | Phase::Paused(_))
}

fn layout(board: Option<&Board>, options: &Options, style: &Style) -> Layout {
    #[cfg(feature = "parity-capture")]
    crate::benchmark::mark(crate::benchmark::Work::Plan);
    let d = &style.delta;
    if options.size == Size::Pill {
        return Layout {
            width: d.pill_width,
            height: d.pill_height,
            items: Vec::new(),
        };
    }
    let variant = options.variant(style);
    let g = &style.geometry;
    let mut items = Vec::new();
    let mut y = variant.padding_y;
    let shown = board.filter(|b| !waiting(Some(b)));
    if shown.is_some_and(|b| b.banner.is_some()) {
        items.push((0.0, Item::Banner));
        y = g.banner_height + g.banner_gap;
    }
    items.push((y, Item::Header));
    y += variant.header_height + variant.header_gap;
    if message(board) {
        items.push((y, Item::Message));
        y += d.message_height;
    } else {
        items.push((y, Item::Big));
        y += d.big_height;
    }
    if options.show_bar {
        items.push((y, Item::Bar));
        y += d.bar + d.tick_labels;
    }
    let sectors = shown.is_some_and(|b| !b.sectors.is_empty() && !grey(b) && !message(Some(b)));
    if options.size == Size::Expanded && sectors && options.show_sectors {
        items.push((y, Item::Sectors));
        y += d.sector_height;
    }
    Layout {
        width: match options.size {
            Size::Expanded => d.width_expanded,
            _ => d.width_bar,
        },
        height: y + variant.padding_y,
        items,
    }
}

/// `−0.214` (signo menos tipográfico) o `+0.382`.
fn signed(seconds: f64) -> String {
    let text = format!("{:.3}", seconds.abs());
    if seconds < 0.0 && text != "0.000" {
        format!("\u{2212}{text}")
    } else {
        format!("+{text}")
    }
}

/// Fracción de media barra, con signo: negativo crece a la izquierda.
fn bar_target(board: Option<&Board>, style: &Style) -> f32 {
    board
        .filter(|b| b.phase == Phase::Live)
        .and_then(|b| b.delta_s)
        .map_or(0.0, |d| {
            (d as f32 / style.delta.range_s.max(0.01)).clamp(-1.0, 1.0)
        })
}

// ---------------------------------------------------------------------------
// Estado
// ---------------------------------------------------------------------------

struct Labels {
    language: Language,
    title: String,
    number: String,
    reference: String,
    predicted: String,
    lap: String,
    range: [String; 2],
    sectors: Vec<(String, String)>,
    segments: OnceLock<[f32; 3]>,
}
fn reference_name(reference: Reference, language: Language) -> &'static str {
    match (reference, language) {
        (Reference::PersonalBest, Language::Es) => "Mejor",
        (Reference::PersonalBest, Language::En) => "Best",
        (Reference::Optimal, Language::Es) => "Óptima",
        (Reference::Optimal, Language::En) => "Optimal",
        (Reference::Leader, Language::Es) => "Líder",
        (Reference::Leader, Language::En) => "Leader",
        (_, Language::Es) => "No disponible",
        (_, Language::En) => "Unavailable",
    }
}
impl Labels {
    fn new(board: Option<&Board>, options: &Options, style: &Style, language: Language) -> Self {
        #[cfg(feature = "parity-capture")]
        crate::benchmark::mark(crate::benchmark::Work::Labels);
        let es = language == Language::Es;
        let live = board.filter(|b| !message(Some(b)));
        Self {
            language,
            title: format!(
                "DELTA · VS {}",
                reference_name(options.reference, language).to_uppercase()
            ),
            number: match live {
                Some(b) if matches!(b.phase, Phase::Paused(_)) => "—.———".into(),
                Some(b) => signed(b.delta_s.unwrap_or(0.0)),
                None => "-.---".into(),
            },
            reference: lap_time(board.and_then(|b| b.reference_lap_s)),
            predicted: lap_time(board.and_then(|b| b.predicted_s)),
            lap: match board.map(|b| (b.lap, b.sector)) {
                Some((Some(lap), Some(sector))) => {
                    format!("{} {lap} · S{sector}", if es { "Vuelta" } else { "Lap" })
                }
                Some((Some(lap), None)) => format!("{} {lap}", if es { "Vuelta" } else { "Lap" }),
                _ => String::new(),
            },
            range: [
                format!("−{:.1}", style.delta.range_s),
                format!("+{:.1}", style.delta.range_s),
            ],
            sectors: board
                .into_iter()
                .flat_map(|b| &b.sectors)
                .enumerate()
                .map(|(i, sector)| {
                    let title = if matches!(sector, Sector::Live(_)) {
                        format!("S{} · {}", i + 1, if es { "en curso" } else { "live" })
                    } else {
                        format!("S{}", i + 1)
                    };
                    let value = match sector {
                        Sector::Done(_, delta) => delta.map_or_else(|| PLACEHOLDER.into(), signed),
                        Sector::Live(_) => String::new(),
                        Sector::Pending => PLACEHOLDER.into(),
                    };
                    (title, value)
                })
                .collect(),
            segments: OnceLock::new(),
        }
    }
}

#[derive(Clone)]
pub(crate) struct Visual {
    pub options: Arc<Options>,
    pub style: Arc<Style>,
    pub board: Option<Arc<Board>>,
    layout: Arc<Layout>,
    labels: Arc<Labels>,
}

impl Visual {
    pub(crate) fn new(options: Options) -> Self {
        let style = Style::compiled();
        let layout = layout(None, &options, &style);
        let labels = Labels::new(None, &options, &style, Language::Es);
        Self {
            labels: Arc::new(labels),
            options: Arc::new(options),
            style,
            board: None,
            layout: Arc::new(layout),
        }
    }

    fn ease(&self) -> Duration {
        Duration::from_secs_f32(self.style.delta.ease_ms.max(0.0) / 1000.0)
    }

    fn bar_value(&self, movement: &Movement, now: Instant) -> f32 {
        movement.bar_value(now)
    }

    pub(crate) fn ingest_shared(&mut self, board: Arc<Board>, movement: &mut Movement) -> bool {
        let now = Instant::now();
        if let Some(old) = self.board.as_deref() {
            movement.notices.observe(old, &board, now);
        }
        if self
            .board
            .as_deref()
            .is_some_and(|old| same_visible(old, &board))
        {
            self.board = Some(board);
            return false;
        }
        let improved = matches!((self.board.as_ref().and_then(|b| b.best_lap_s), board.best_lap_s), (Some(old), Some(new)) if new < old - 1e-6);
        if improved {
            movement
                .notices
                .notify(now, vantare_domain::delta::Event::PersonalBest);
        }
        let to = bar_target(Some(&board), &self.style);
        let from = if self.board.is_some() {
            self.bar_value(movement, now)
        } else {
            to
        };
        movement.retarget_bar(from, to, now, self.ease());
        self.board = Some(board);
        self.layout = Arc::new(layout(self.board.as_deref(), &self.options, &self.style));
        self.relabel(self.labels.language);
        true
    }
    /// Reconstruye el pintor al cambiar Look sin observar otra foto ni reiniciar Motion.
    pub(crate) fn attach(&mut self, board: Arc<Board>) {
        self.board = Some(board);
        self.layout = Arc::new(layout(self.board.as_deref(), &self.options, &self.style));
        self.relabel(self.labels.language);
    }
    pub(crate) fn set_style(&mut self, style: Arc<Style>) {
        self.style = style;
        self.layout = Arc::new(layout(self.board.as_deref(), &self.options, &self.style));
        self.relabel(self.labels.language);
    }

    fn relabel(&mut self, language: Language) {
        self.labels = Arc::new(Labels::new(
            self.board.as_deref(),
            &self.options,
            &self.style,
            language,
        ));
    }
    pub(crate) fn presentation(&mut self, language: Language) {
        if self.labels.language != language {
            self.relabel(language);
        }
    }
    pub(crate) fn size(&self) -> (f32, f32) {
        (self.layout.width, self.layout.height)
    }

    fn flash(&self, movement: &Movement, now: Instant) -> Option<f32> {
        let duration = self.style.motion.timing().flash;
        let start = movement.notices.record()?;
        let t = now.saturating_duration_since(start).as_secs_f32() / duration.as_secs_f32();
        (t < 1.0).then_some(1.0 - t)
    }

    pub(crate) fn wake(&self, movement: &Movement, now: Instant) -> Wake {
        let moving = movement.moving(now);
        if moving || self.flash(movement, now).is_some() {
            Wake::Frame
        } else {
            Wake::Idle
        }
    }

    pub(crate) fn paint(
        &self,
        movement: &Movement,
        language: Language,
        window: &mut Window,
        cx: &mut App,
    ) {
        let now = Instant::now();
        let kit = Kit {
            style: &self.style,
            variant: self.options.variant(&self.style),
            accent: self.options.accent(&self.style),
            language,
            width: self.layout.width,
        };
        if self.options.size == Size::Expanded {
            let ink = kit.ink(
                Face::Body,
                self.style.fonts.small,
                0.0,
                self.style.colors.value.hsla(),
            );
            self.labels.segments.get_or_init(|| {
                [
                    Reference::PersonalBest,
                    Reference::Optimal,
                    Reference::Leader,
                ]
                .map(|r| text::width(window, reference_name(r, language), &ink) + 20.0)
            });
        }
        let painter = Painter {
            labels: &self.labels,
            kit,
            options: &self.options,
            board: self.board.as_deref(),
            bar: self.bar_value(movement, now),
            flash: self.flash(movement, now),
        };
        if self.options.size == Size::Pill {
            painter.pill_widget(window, cx, self.layout.height);
            return;
        }
        painter.panel(window, self.layout.height);
        for &(y, item) in &self.layout.items {
            match item {
                Item::Banner => painter.banner(window, cx),
                Item::Header => painter.header(window, cx, y),
                Item::Big => painter.big(window, cx, y),
                Item::Message => painter.message(window, cx, y),
                Item::Bar => painter.bar(window, cx, y),
                Item::Sectors => painter.sectors(window, cx, y),
            }
        }
    }
}

pub(crate) use super::motion::Motion as Movement;
fn same_visible(a: &Board, b: &Board) -> bool {
    (
        a.source_state,
        a.player_present,
        a.banner,
        a.reference,
        a.reference_lap_s,
        a.delta_s,
        a.phase,
        a.predicted_s,
        a.lap,
        a.sector,
        &a.sectors,
        a.best_lap_s,
    ) == (
        b.source_state,
        b.player_present,
        b.banner,
        b.reference,
        b.reference_lap_s,
        b.delta_s,
        b.phase,
        b.predicted_s,
        b.lap,
        b.sector,
        &b.sectors,
        b.best_lap_s,
    )
}
#[cfg(test)]
struct State {
    visual: Visual,
    movement: Movement,
}
#[cfg(test)]
impl std::ops::Deref for State {
    type Target = Visual;
    fn deref(&self) -> &Visual {
        &self.visual
    }
}
#[cfg(test)]
impl State {
    fn new(options: Options) -> Self {
        Self {
            visual: Visual::new(options),
            movement: Movement::default(),
        }
    }
    fn project(&self, snapshot: &vantare_domain::Snapshot) -> Board {
        vantare_domain::delta::project_reference(
            snapshot,
            vantare_domain::format::Preferences::default(),
            self.options.reference,
        )
    }
    fn ingest(&mut self, board: Board) -> bool {
        self.visual
            .ingest_shared(Arc::new(board), &mut self.movement)
    }
    fn wake(&self, now: Instant) -> Wake {
        self.visual.wake(&self.movement, now)
    }
    fn settle(&mut self) {
        self.movement.settle();
    }
}

// ---------------------------------------------------------------------------
// Pintado
// ---------------------------------------------------------------------------

struct Painter<'a> {
    labels: &'a Labels,
    kit: Kit<'a>,
    options: &'a Options,
    board: Option<&'a Board>,
    bar: f32,
    flash: Option<f32>,
}

impl<'a> std::ops::Deref for Painter<'a> {
    type Target = Kit<'a>;
    fn deref(&self) -> &Self::Target {
        &self.kit
    }
}

impl Painter<'_> {
    fn pick(&self, es: &'static str, en: &'static str) -> &'static str {
        if self.es() { es } else { en }
    }

    /// Board con número que mostrar.
    fn live(&self) -> Option<&Board> {
        self.board.filter(|b| !message(Some(b)))
    }

    /// Texto y color del número.
    fn number(&self) -> (&str, Hsla) {
        let c = &self.style.colors;
        let grey = self.style.delta.grey.hsla();
        match self.live() {
            Some(b) if matches!(b.phase, Phase::Paused(_)) => (&self.labels.number, grey),
            Some(b) => {
                let delta = b.delta_s.unwrap_or(0.0);
                let color = if b.phase == Phase::Invalid {
                    grey
                } else if delta < 0.0 {
                    c.gain.hsla()
                } else {
                    c.loss.hsla()
                };
                (&self.labels.number, color)
            }
            None => (&self.labels.number, grey),
        }
    }

    fn pill_widget(&self, window: &mut Window, cx: &mut App, height: f32) {
        let d = &self.style.delta;
        let c = &self.style.colors;
        self.panel(window, height);
        let pad = 16.0;
        let label = self.ink(Face::Body, d.pill_label, 0.3, c.muted.hsla());
        let x = pad
            + self.label(
                window,
                cx,
                "DELTA",
                pad,
                None,
                0.0,
                height,
                Face::Body,
                &label,
            );
        let (value, color) = self.number();
        let face = if self.live().is_some() {
            Face::Display
        } else {
            Face::Mono
        };
        let size = if self.live().is_some() {
            d.pill_value
        } else {
            d.pill_value - 2.0
        };
        let ink = self.ink(face, size, 0.3, color);
        self.label(window, cx, value, x + 14.0, None, 0.0, height, face, &ink);
    }

    fn banner(&self, window: &mut Window, cx: &mut App) {
        let Some(board) = self.board else { return };
        let c = &self.style.colors;
        let paused = Some(self.pick("delta en pausa", "delta paused"));
        match board.banner {
            Some(Banner::InPits) => self.band(
                window,
                cx,
                c.stops_fill,
                c.text,
                self.pick("En boxes", "In the pits"),
                paused,
                false,
                Some(c.line),
            ),
            Some(Banner::FullCourseYellow) => {
                self.band(
                    window, cx, c.fcy_fill, c.fcy_text, "FCY", paused, false, None,
                );
            }
            None => {}
        }
    }

    fn reference_name(&self, reference: Reference) -> &'static str {
        reference_name(reference, self.language)
    }

    fn header(&self, window: &mut Window, cx: &mut App, y: f32) {
        let v = self.variant;
        let c = &self.style.colors;
        let h = v.header_height - if v.header_rule > 0.0 { 6.0 } else { 0.0 };
        let (pad, w) = (v.padding_x, self.width);
        let face = if v.header_display {
            Face::Display
        } else {
            Face::Body
        };
        let ink = self.ink(
            face,
            v.header_size,
            v.header_tracking,
            v.header_color.hsla(),
        );
        self.label(window, cx, &self.labels.title, pad, None, y, h, face, &ink);
        let mut edge = w - pad;
        if self.options.brand {
            edge -= self.brand(window, cx, edge, y, h) + self.style.brand.margin;
        }
        if self.options.size == Size::Expanded {
            self.segments(window, cx, edge, y, h);
        } else {
            let em = self.ink(
                Face::Mono,
                self.style.fonts.mono_small,
                0.0,
                c.header_em.hsla(),
            );
            self.label(
                window,
                cx,
                &self.labels.reference,
                0.0,
                Some(edge),
                y,
                h,
                Face::Mono,
                &em,
            );
        }
        if v.header_rule > 0.0 {
            round_rect(
                window,
                pad,
                y + v.header_height - 1.0,
                w - 2.0 * pad,
                1.0,
                0.0,
                self.accent.alpha(v.header_rule),
            );
        }
    }

    /// Selector de referencia del catálogo: la activa resaltada.
    fn segments(&self, window: &mut Window, cx: &mut App, right: f32, y: f32, h: f32) {
        let c = &self.style.colors;
        let d = &self.style.delta;
        let ink = self.ink(Face::Body, self.style.fonts.small, 0.0, c.value.hsla());
        let active = self.ink(Face::Body, self.style.fonts.small, 0.0, c.text.hsla());
        let names = [
            Reference::PersonalBest,
            Reference::Optimal,
            Reference::Leader,
        ];
        let widths = self
            .labels
            .segments
            .get()
            .expect("segmentos preparados antes del pintor");
        let mut x = right - widths.iter().sum::<f32>();
        let top = y + (h - d.segment_height) / 2.0;
        for (reference, width) in names.iter().zip(widths.iter().copied()) {
            let on = *reference == self.options.reference;
            if on {
                window.paint_quad(quad(
                    crate::efficiency::rect(x, top, width, d.segment_height),
                    Corners::all(px(4.0)),
                    self.accent.alpha(0.25),
                    Edges::all(px(1.0)),
                    self.accent.alpha(0.5),
                    BorderStyle::default(),
                ));
            }
            self.label(
                window,
                cx,
                self.reference_name(*reference),
                x + 10.0,
                None,
                top,
                d.segment_height,
                Face::Body,
                if on { &active } else { &ink },
            );
            x += width;
        }
    }

    fn big(&self, window: &mut Window, cx: &mut App, y: f32) {
        let Some(board) = self.live() else { return };
        let d = &self.style.delta;
        let c = &self.style.colors;
        let (pad, w) = (self.variant.padding_x, self.width);
        if let Some(alpha) = self.flash {
            // Vuelta récord personal: destello morado bajo el número.
            self.highlight(
                window,
                y + (d.big - self.style.geometry.row_height) / 2.0,
                c.purple,
                alpha,
            );
        }
        let (value, color) = self.number();
        let ink = self.ink(Face::Display, d.big, 0.5, color);
        let width = self.label(window, cx, value, pad, None, y, d.big, Face::Display, &ink);
        if board.phase == Phase::Invalid {
            // Tachado del número.
            round_rect(window, pad, y + d.big / 2.0, width, 2.0, 1.0, color);
        }
        let x = pad + width + 12.0;
        let muted = self.ink(Face::Body, self.style.fonts.small, 0.0, c.muted.hsla());
        let base = y + 6.0;
        let label_h = d.big - 6.0;
        match board.phase {
            Phase::Invalid => {
                let text = self.pick(
                    "Vuelta invalidada · límites de pista",
                    "Lap invalidated · track limits",
                );
                self.label(window, cx, text, x, None, base, label_h, Face::Body, &muted);
            }
            Phase::Paused(pause) => {
                let text = match pause {
                    Pause::Pits => self.pick("En boxes", "In the pits"),
                    Pause::OutLap => self.pick("Vuelta de salida", "Out lap"),
                    Pause::Fcy => self.pick("FCY · en pausa", "FCY · paused"),
                };
                self.label(window, cx, text, x, None, base, label_h, Face::Body, &muted);
            }
            _ => {
                let lead = self.pick("Predicha ", "Predicted ");
                let at =
                    x + self.label(window, cx, lead, x, None, base, label_h, Face::Body, &muted);
                let mono = self.ink(Face::Mono, self.style.fonts.mono, 0.0, c.text.hsla());
                self.label(
                    window,
                    cx,
                    &self.labels.predicted,
                    at,
                    None,
                    base,
                    label_h,
                    Face::Mono,
                    &mono,
                );
            }
        }
        if self.options.size == Size::Expanded {
            self.label(
                window,
                cx,
                &self.labels.lap,
                0.0,
                Some(w - pad),
                base,
                label_h,
                Face::Body,
                &muted,
            );
        }
    }

    fn message(&self, window: &mut Window, cx: &mut App, y: f32) {
        let c = &self.style.colors;
        let f = &self.style.fonts;
        let center = self.width / 2.0;
        let spectator = self.board.is_some_and(|b| {
            !b.player_present && !matches!(b.source_state, SourceState::Waiting | SourceState::Lost)
        });
        let (title, hint) = if self
            .board
            .is_some_and(|b| b.player_present && b.phase == Phase::NoReference)
        {
            (
                self.pick("SIN REFERENCIA", "NO REFERENCE"),
                self.pick(
                    "Completa una vuelta lanzada para empezar",
                    "Complete a flying lap to start",
                ),
            )
        } else if spectator {
            (
                self.pick("SIN COCHE PROPIO", "NO CAR OF YOUR OWN"),
                self.pick("Modo espectador", "Spectator mode"),
            )
        } else {
            (
                self.pick("ESPERANDO AL SIMULADOR", "WAITING FOR THE SIMULATOR"),
                self.pick(
                    "Abre el simulador y entra en una sesión",
                    "Open the simulator and join a session",
                ),
            )
        };
        let ink = self.ink(
            Face::Display,
            f.wait_title,
            f.separator_tracking,
            c.header_em.hsla(),
        );
        let width = text::width(window, title, &ink);
        self.label(
            window,
            cx,
            title,
            center - width / 2.0,
            None,
            y + 4.0,
            f.wait_title,
            Face::Display,
            &ink,
        );
        let small = self.ink(Face::Body, f.small, 0.0, c.muted.hsla());
        let width = text::width(window, hint, &small);
        self.label(
            window,
            cx,
            hint,
            center - width / 2.0,
            None,
            y + 20.0,
            18.0,
            Face::Body,
            &small,
        );
    }

    fn bar(&self, window: &mut Window, cx: &mut App, y: f32) {
        let d = &self.style.delta;
        let c = &self.style.colors;
        let (pad, w) = (self.variant.padding_x, self.width);
        let span = w - 2.0 * pad;
        let mid = pad + span / 2.0;
        round_rect(window, pad, y, span, d.bar, d.bar / 2.0, d.track.hsla());
        let live = self.live().is_some_and(|b| b.phase == Phase::Live);
        if live && self.bar != 0.0 {
            let half = span / 2.0;
            let length = half * self.bar.abs();
            let (x, solid, angle, corners) = if self.bar < 0.0 {
                (
                    mid - length,
                    d.fill_gain,
                    270.0,
                    Corners {
                        top_left: px(d.bar / 2.0),
                        bottom_left: px(d.bar / 2.0),
                        top_right: px(0.0),
                        bottom_right: px(0.0),
                    },
                )
            } else {
                (
                    mid,
                    d.fill_loss,
                    90.0,
                    Corners {
                        top_left: px(0.0),
                        bottom_left: px(0.0),
                        top_right: px(d.bar / 2.0),
                        bottom_right: px(d.bar / 2.0),
                    },
                )
            };
            window.paint_quad(quad(
                crate::efficiency::rect(x, y, length, d.bar),
                corners,
                linear_gradient(
                    angle,
                    linear_color_stop(solid.alpha(d.fill_from), 0.0),
                    linear_color_stop(solid.hsla(), 1.0),
                ),
                Edges::all(px(0.0)),
                gpui::transparent_black(),
                BorderStyle::default(),
            ));
        }
        let center = if message(self.board) {
            self.style.colors.pulse.hsla()
        } else {
            d.center.hsla()
        };
        round_rect(
            window,
            mid - 1.0,
            y + (d.bar - d.tick) / 2.0,
            2.0,
            d.tick,
            1.0,
            center,
        );
        if message(self.board) {
            return;
        }
        let ink = self.ink(Face::Mono, 9.0, 0.0, c.column.hsla());
        let top = y + d.bar + 2.0;
        let h = d.tick_labels - 2.0;
        self.label(
            window,
            cx,
            &self.labels.range[0],
            pad,
            None,
            top,
            h,
            Face::Mono,
            &ink,
        );
        let zero = text::width(window, "0", &ink);
        self.label(
            window,
            cx,
            "0",
            mid - zero / 2.0,
            None,
            top,
            h,
            Face::Mono,
            &ink,
        );
        self.label(
            window,
            cx,
            &self.labels.range[1],
            0.0,
            Some(w - pad),
            top,
            h,
            Face::Mono,
            &ink,
        );
    }

    fn sectors(&self, window: &mut Window, cx: &mut App, y: f32) {
        let Some(board) = self.live() else { return };
        let d = &self.style.delta;
        let c = &self.style.colors;
        let (pad, w) = (self.variant.padding_x, self.width);
        let count = board.sectors.len().max(1);
        let gap = 6.0;
        let cell = (w - 2.0 * pad - gap * (count - 1) as f32) / count as f32;
        let top = y + 6.0;
        let small = self.ink(Face::Mono, 10.0, 0.0, c.muted.hsla());
        let gain = board.delta_s.is_some_and(|d| d < 0.0);
        for (index, sector) in board.sectors.iter().enumerate() {
            let x = pad + index as f32 * (cell + gap);
            round_rect(
                window,
                x,
                top,
                cell,
                d.sector_bar,
                d.sector_bar / 2.0,
                c.sector_pending.hsla(),
            );
            let tone_color = |tone: SectorTone| match tone {
                SectorTone::SessionBest => c.purple,
                SectorTone::PersonalBest => c.green,
                SectorTone::Slower => c.yellow,
            };
            let (fill, label, value, value_color) = match sector {
                Sector::Done(tone, _) => (
                    Some((1.0, tone_color(*tone))),
                    self.labels.sectors[index].0.as_str(),
                    self.labels.sectors[index].1.as_str(),
                    match tone {
                        SectorTone::SessionBest => c.purple.hsla(),
                        SectorTone::PersonalBest => c.gain.hsla(),
                        SectorTone::Slower => c.yellow.hsla(),
                    },
                ),
                Sector::Live(fraction) => (
                    fraction.map(|f| (f as f32, if gain { c.green } else { d.fill_loss })),
                    self.labels.sectors[index].0.as_str(),
                    "",
                    c.muted.hsla(),
                ),
                Sector::Pending => (
                    None,
                    self.labels.sectors[index].0.as_str(),
                    PLACEHOLDER,
                    c.muted.hsla(),
                ),
            };
            if let Some((fraction, color)) = fill {
                round_rect(
                    window,
                    x,
                    top,
                    cell * fraction,
                    d.sector_bar,
                    d.sector_bar / 2.0,
                    color.hsla(),
                );
            }
            let label_top = top + d.sector_bar + 3.0;
            self.label(
                window,
                cx,
                label,
                x,
                None,
                label_top,
                14.0,
                Face::Mono,
                &small,
            );
            let ink = self.ink(Face::Mono, 10.0, 0.0, value_color);
            self.label(
                window,
                cx,
                value,
                0.0,
                Some(x + cell),
                label_top,
                14.0,
                Face::Mono,
                &ink,
            );
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn frames(json: &str) -> Vec<vantare_domain::Snapshot> {
        let scene: serde_json::Value = serde_json::from_str(json).expect("escena");
        scene["frames"]
            .as_array()
            .expect("fases")
            .iter()
            .map(|f| vantare_ipc::snapshot_from_json(&f["snapshot"].to_string()).expect("foto"))
            .collect()
    }

    fn options(size: Size, reference: Reference) -> Options {
        Options {
            look: Look::Neo,
            accent: Accent::Red,
            size,
            reference,
            show_bar: true,
            show_sectors: true,
            brand: false,
        }
    }

    #[test]
    fn hiding_delta_bar_and_sectors_removes_their_geometry_and_survives_reload() {
        let settings = super::super::Settings {
            size: "expanded".into(),
            show_bar: false,
            show_sectors: false,
            ..Default::default()
        };
        let json = serde_json::to_string(&settings).expect("ajustes");
        let restored: super::super::Settings = serde_json::from_str(&json).expect("recarga");
        let options = Options::from_settings(&restored);
        let style = Style::compiled();
        let scene = frames(include_str!("../../fixtures/delta-vantare.scene.json"));
        let board = vantare_domain::delta::project_reference(
            &scene[0],
            vantare_domain::format::Preferences::default(),
            Reference::PersonalBest,
        );
        let shown = layout(
            Some(&board),
            &super::tests::options(Size::Expanded, Reference::PersonalBest),
            &style,
        );
        let hidden = layout(Some(&board), &options, &style);
        assert!(
            !hidden
                .items
                .iter()
                .any(|(_, item)| matches!(item, Item::Bar | Item::Sectors))
        );
        assert!(hidden.height < shown.height);
    }
    #[test]
    fn sizes_match_the_catalogue_and_states_change_the_items() {
        let style = Style::compiled();
        let photos = frames(include_str!("../../fixtures/delta-vantare.scene.json"));
        let state = State::new(options(Size::Expanded, Reference::PersonalBest));
        let board = |i: usize| state.project(&photos[i]);
        let pill = layout(
            Some(&board(0)),
            &options(Size::Pill, Reference::PersonalBest),
            &style,
        );
        assert_eq!((pill.width, pill.height), (150.0, 36.0));
        let bar = layout(
            Some(&board(0)),
            &options(Size::Bar, Reference::PersonalBest),
            &style,
        );
        assert_eq!(bar.width, 380.0);
        let items = |i: usize| {
            layout(
                Some(&board(i)),
                &options(Size::Expanded, Reference::PersonalBest),
                &style,
            )
            .items
            .into_iter()
            .map(|(_, item)| item)
            .collect::<Vec<_>>()
        };
        assert_eq!(
            items(0),
            vec![Item::Header, Item::Big, Item::Bar, Item::Sectors],
            "en vivo con sectores"
        );
        assert!(
            !items(2).contains(&Item::Sectors),
            "invalidada: sin sectores"
        );
        assert!(items(3).contains(&Item::Message), "sin referencia");
        assert_eq!(items(4)[0], Item::Banner, "boxes");
        assert!(items(6).contains(&Item::Message), "esperando");
        assert_eq!(signed(-0.214), "\u{2212}0.214");
        assert_eq!(signed(0.382), "+0.382");
        assert_eq!(signed(-0.0001), "+0.000");
    }

    #[test]
    fn bar_slides_and_a_personal_best_flashes() {
        let photos = frames(include_str!(
            "../../fixtures/delta-vantare-carrera.scene.json"
        ));
        let mut state = State::new(options(Size::Expanded, Reference::PersonalBest));
        assert!(state.ingest(state.project(&photos[0])));
        assert_eq!(state.wake(Instant::now()), Wake::Idle, "aparecer no anima");
        let mut flashed = false;
        let mut slid = false;
        for photo in &photos[1..] {
            state.ingest(state.project(photo));
            slid |= state.wake(Instant::now()) == Wake::Frame;
            flashed |= state.movement.notices.record().is_some();
        }
        assert!(slid, "la barra se desliza");
        assert!(flashed, "la secuencia marca vuelta récord");
        state.settle();
        assert_eq!(state.wake(Instant::now()), Wake::Idle);
    }
}
