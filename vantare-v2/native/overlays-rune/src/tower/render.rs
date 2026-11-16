//! Torre Vantare Look: it only paints the sampled scene; retained Rune values stay here.
use super::Update;
use super::scene::{self, Scene};
use crate::vantare::Style;
use crate::vantare::alpha;
use crate::vantare::paint::{Face, font};
use rune::{Align, Color, El, Live, LiveText, el, text};
use std::collections::{BTreeMap, BTreeSet};
use std::sync::Arc;
use vantare_domain::{
    broadcast_tower::{self, Accent, Row, Status},
    format::Preferences,
    geometry::Size,
};

const WIDTH: f32 = 1400.0;
const HEIGHT: f32 = 56.0;
const MASK_X: f32 = 156.0;
const MASK_Y: f32 = 1.0;
const MASK_W: f32 = 1236.0;
const MASK_H: f32 = 54.0;
const CLEAR: Color = Color {
    r: 0.0,
    g: 0.0,
    b: 0.0,
    a: 0.0,
};

struct Palette {
    title: Color,
    white: Color,
    pill: Color,
    pill_ink: Color,
    player: Color,
    gained: Color,
    lost: Color,
    red: Color,
    blue: Color,
    green: Color,
    neutral: Color,
}

impl Palette {
    fn new() -> Self {
        let hex = |value: &str| rune::color::hex(value).expect("literal de color");
        Self {
            title: hex("#faf7f7"),
            white: hex("#ffffff"),
            pill: hex("#f2eeee"),
            pill_ink: hex("#161314"),
            player: hex("#e14a54"),
            gained: hex("#4ade80"),
            lost: hex("#ff7a82"),
            red: hex("#e14a54"),
            blue: hex("#4f8ef7"),
            green: hex("#22c55e"),
            neutral: hex("#8e8587"),
        }
    }
    fn class(&self, accent: Accent) -> Color {
        match accent {
            Accent::Red => self.red,
            Accent::Blue => self.blue,
            Accent::Amber => self.green,
            Accent::Neutral => self.neutral,
        }
    }
}

struct CardLive {
    id: u32,
    copy: u8,
    player: bool,
    place: LiveText,
    code: LiveText,
    gap: LiveText,
    position: Live<[f32; 2]>,
    ink: Live<Color>,
    highlight: Live<Color>,
    cue: Live<Color>,
    /// Texto y ancho con los que se midió cada recorte; solo se remide si cambian.
    code_key: (String, f32),
    gap_key: (String, f32),
}

#[derive(PartialEq)]
struct Structure {
    ready: bool,
    width: f32,
    cards: Vec<((u32, u8), bool)>,
    classes: Vec<(usize, String, Accent)>,
    intervals: Vec<usize>,
}

pub(super) struct Painter {
    prefs: Preferences,
    style: Arc<Style>,
    palette: Palette,
    show_weather: bool,
    ready: bool,
    width: f32,
    classes: Vec<(usize, String, Accent)>,
    intervals: Vec<usize>,
    cards: BTreeMap<(u32, u8), CardLive>,
    order: Vec<(u32, u8)>,
    session: LiveText,
    lap: LiveText,
    status: LiveText,
    weather: LiveText,
    interval_text: Vec<LiveText>,
    structure: Option<Structure>,
}

impl Painter {
    pub fn new(scene: &Scene, prefs: Preferences, show_weather: bool) -> Self {
        let mut painter = Self {
            prefs,
            style: Style::compiled(),
            palette: Palette::new(),
            show_weather,
            ready: false,
            width: 0.0,
            classes: Vec::new(),
            intervals: Vec::new(),
            cards: BTreeMap::new(),
            order: Vec::new(),
            session: LiveText::new(""),
            lap: LiveText::new(""),
            status: LiveText::new(""),
            weather: LiveText::new(""),
            interval_text: Vec::new(),
            structure: None,
        };
        painter.sync(scene);
        painter
    }
    pub fn size(&self) -> Size {
        Size {
            width: WIDTH,
            height: HEIGHT,
        }
    }
    pub fn view(&self) -> El {
        view(self)
    }
    /// The only build decision: compare structure, while texts and positions stay Live.
    pub fn sync(&mut self, scene: &Scene) -> Update {
        let mut pixels = false;
        let view = &scene.view;
        self.ready = view.status == Status::Ready;
        self.width = scene::card_width(view, self.show_weather);
        pixels |= self.session.set(view.session.clone());
        pixels |= self.lap.set(scene.labels.lap.clone());
        pixels |= self
            .status
            .set(broadcast_tower::status_text(view.status, self.prefs.language).to_string());
        if self.show_weather {
            pixels |= self.weather.set(view.weather.clone());
        }
        self.order.clear();
        let per_copy = view.rows.len().max(1);
        for (index, visual) in scene.rows.iter().enumerate() {
            let row = &visual.row;
            let copy = u8::try_from(index / per_copy).unwrap_or(0).min(1);
            let key = (row.id.0, copy);
            let live = self.cards.entry(key).or_insert_with(|| CardLive {
                id: row.id.0,
                copy,
                player: row.is_player,
                place: LiveText::new(""),
                code: LiveText::new(""),
                gap: LiveText::new(""),
                position: Live::new([0.0, 0.0]),
                ink: Live::new(CLEAR),
                highlight: Live::new(CLEAR),
                cue: Live::new(CLEAR),
                code_key: (String::new(), -1.0),
                gap_key: (String::new(), -1.0),
            });
            live.player = row.is_player;
            pixels |= live.place.set(place(row));
            let code = scene::driver_code(&row.name);
            let code_max = (self.width - 29.0).max(0.0);
            if live.code_key != (code.clone(), code_max) {
                live.code_key = (code.clone(), code_max);
                pixels |= live.code.set(fitted(
                    &self.style,
                    &code,
                    code_max,
                    Face::Display,
                    16.0,
                    20.0,
                    1.2,
                ));
            }
            let gap = gap(row);
            let gap_max = (self.width - 69.0).max(0.0);
            if live.gap_key != (gap.clone(), gap_max) {
                live.gap_key = (gap.clone(), gap_max);
                pixels |= live.gap.set(fitted(
                    &self.style,
                    &gap,
                    gap_max,
                    Face::Mono,
                    10.0,
                    18.0,
                    0.0,
                ));
            }
            let x = scene::card_left(visual.slot, self.width, view) - MASK_X;
            pixels |= live.position.set([x, 0.0]);
            pixels |= live.ink.set(alpha(self.palette.title, visual.opacity));
            pixels |= live
                .highlight
                .set(alpha(self.palette.player, 0.28 * visual.opacity));
            let cue = visual.cue.map_or(CLEAR, |cue| {
                let color = match cue.kind {
                    scene::CueKind::Gained => self.palette.gained,
                    scene::CueKind::Lost => self.palette.lost,
                };
                alpha(color, cue.opacity)
            });
            pixels |= live.cue.set(cue);
            self.order.push(key);
        }
        let retained: BTreeSet<(u32, u8)> = self.order.iter().copied().collect();
        self.cards.retain(|id, _| retained.contains(id));
        let classes: Vec<(usize, String, Accent)> = scene::class_starts(view)
            .map(|start| {
                let row = &view.rows[start];
                (start, chip(&row.class), row.accent)
            })
            .collect();
        let intervals: Vec<usize> = scene
            .labels
            .intervals
            .iter()
            .enumerate()
            .filter_map(|(index, label)| label.as_ref().map(|_| index))
            .collect();
        let structure = Structure {
            ready: self.ready,
            width: self.width,
            cards: self
                .order
                .iter()
                .map(|key| (*key, self.cards[key].player))
                .collect(),
            classes: classes.clone(),
            intervals: intervals.clone(),
        };
        let build = self.structure.as_ref() != Some(&structure);
        if build {
            self.structure = Some(structure);
            self.classes = classes;
            self.intervals = intervals;
            self.interval_text = scene
                .labels
                .intervals
                .iter()
                .filter_map(|label| label.clone())
                .map(LiveText::new)
                .collect();
        } else {
            let values = self
                .intervals
                .iter()
                .filter_map(|index| scene.labels.intervals[*index].clone());
            for (live, value) in self.interval_text.iter().zip(values) {
                pixels |= live.set(value);
            }
        }
        Update { build, pixels }
    }
    #[allow(clippy::too_many_arguments)] // Una celda de texto con su caja y su tinta.
    fn caption(
        &self,
        value: &LiveText,
        key: String,
        x: f32,
        top: f32,
        width: f32,
        height: f32,
        face: Face,
        size: f32,
        weight: f32,
        tracking: f32,
        ink: Color,
        align: Align,
    ) -> El {
        let baseline = match face {
            Face::Display => self.style.fonts.display_baseline,
            Face::Mono => self.style.fonts.mono_baseline,
            Face::Body => 0.0,
        };
        text(value.get().to_string())
            .key(key)
            .live_text(value)
            .font(font(&self.style, face, size, height, tracking, weight))
            .color(ink)
            .size(width, height)
            .align(align)
            .truncate_fade_width(0.0)
            .pin(Some(x), Some(top + baseline), None, None)
    }
    fn card(&self, live: &CardLive) -> El {
        let width = self.width;
        let mut node = el()
            .key(format!("tower-card-{}-{}", live.id, live.copy))
            .size(width, MASK_H)
            .pin(Some(0.0), Some(0.0), None, None)
            .live_offset(&live.position);
        if live.player {
            node = node.child(
                el().key(format!("tower-highlight-{}-{}", live.id, live.copy))
                    .size((width - 4.0).max(0.0), 36.0)
                    .radius(6.0)
                    .live_fill(&live.highlight)
                    .pin(Some(0.0), Some(9.0), None, None),
            );
        }
        let s = &self.style;
        node.child(
            el().key(format!("tower-cue-{}-{}", live.id, live.copy))
                .size((width - 8.0).max(0.0), 2.0)
                .radius(1.0)
                .live_fill(&live.cue)
                .pin(Some(4.0), Some(43.0), None, None),
        )
        .child(self.caption(
            &live.place,
            format!("tower-place-{}-{}", live.id, live.copy),
            6.0,
            17.0,
            19.0,
            20.0,
            Face::Display,
            15.0,
            600.0,
            0.0,
            s.colors.muted,
            Align::Start,
        ))
        .child(
            self.caption(
                &live.code,
                format!("tower-code-{}-{}", live.id, live.copy),
                25.0,
                17.0,
                (width - 29.0).max(0.0),
                20.0,
                Face::Display,
                16.0,
                600.0,
                1.2,
                self.palette.title,
                Align::Start,
            )
            .live_text_color(&live.ink),
        )
        .child(self.caption(
            &live.gap,
            format!("tower-gap-{}-{}", live.id, live.copy),
            65.0,
            18.0,
            (width - 69.0).max(0.0),
            18.0,
            Face::Mono,
            10.0,
            400.0,
            0.0,
            s.colors.value,
            Align::Start,
        ))
    }
}

fn place(row: &Row) -> String {
    row.place
        .map_or_else(|| "—".into(), |place| place.to_string())
}

fn gap(row: &Row) -> String {
    if row.in_pits {
        "BOX".into()
    } else if matches!(row.gap.as_str(), "LEADER" | "LÍDER") {
        "Líder".into()
    } else {
        row.gap.clone()
    }
}

fn chip(class: &str) -> String {
    match class {
        "HYP" => "HY".into(),
        "LMG" => "GT3".into(),
        other => other.into(),
    }
}

/// Recorta con puntos lo que no cabe, midiendo el texto como lo hará Rune (lo mismo
/// que GPUI hacía con `fit_borrowed`). La cadena recortada viaja como texto normal,
/// así que sigue siendo un valor vivo y se puede comprobar en los tests.
pub(super) fn fitted(
    style: &Style,
    value: &str,
    max: f32,
    face: Face,
    size: f32,
    height: f32,
    tracking: f32,
) -> String {
    if max <= 0.0 {
        return String::new();
    }
    let weight = if matches!(face, Face::Display) {
        600.0
    } else {
        400.0
    };
    let shape = font(style, face, size, height, tracking, weight);
    let width = |text: &str| rune::text::measure(text, &[], shape, None).0;
    if width(value) <= max + 0.01 {
        return value.to_string();
    }
    let mut kept: Vec<char> = value.chars().collect();
    while kept.pop().is_some() {
        let candidate: String = kept.iter().collect::<String>() + "…";
        if width(&candidate) <= max + 0.01 {
            return candidate;
        }
    }
    String::new()
}

pub(super) fn view(state: &Painter) -> El {
    let s = &state.style;
    let v = &s.styles.neo;
    let p = &state.palette;
    let border = if v.border_accent > 0.0 {
        alpha(s.accents.red, v.border_accent)
    } else {
        v.border
    };
    let mut root = el()
        .key("tower-view")
        .size(WIDTH, HEIGHT)
        .motion(rune::Spring::NONE)
        .child(
            el().size(WIDTH, HEIGHT)
                .radius(v.radius)
                .border(1.0, border)
                .linear_gradient(std::f32::consts::PI, [(0.0, v.top), (1.0, v.bottom)])
                .shadow(
                    v.shadow_y,
                    v.shadow_blur,
                    alpha(
                        Color {
                            a: 1.0,
                            ..s.colors.shadow
                        },
                        v.shadow_alpha,
                    ),
                ),
        )
        .child(
            el().size(150.0, 54.0)
                .radius(9.0)
                .fill(alpha(p.white, 0.04))
                .pin(Some(1.0), Some(1.0), None, None),
        )
        .child(state.caption(
            &state.session,
            "tower-session".into(),
            16.0,
            9.0,
            400.0,
            20.0,
            Face::Display,
            18.0,
            600.0,
            1.6,
            p.title,
            Align::Start,
        ))
        .child(state.caption(
            &state.lap,
            "tower-lap".into(),
            16.0,
            32.0,
            400.0,
            14.0,
            Face::Mono,
            11.0,
            400.0,
            0.0,
            s.colors.muted,
            Align::Start,
        ));
    if !state.ready {
        return root.child(state.caption(
            &state.status,
            "tower-status".into(),
            190.0,
            18.0,
            WIDTH - 198.0,
            20.0,
            Face::Body,
            12.0,
            s.fonts.regular_weight,
            0.0,
            s.colors.muted,
            Align::Start,
        ));
    }
    for (ordinal, (start, label, accent)) in state.classes.iter().enumerate() {
        let x = 160.0 + *start as f32 * state.width + ordinal as f32 * 40.0;
        root = root
            .child(
                el().size(36.0, 22.0)
                    .radius(3.0)
                    .fill(p.class(*accent))
                    .pin(Some(x), Some(17.0), None, None),
            )
            .child(
                text(label.clone())
                    .key(format!("tower-class-{start}"))
                    .font(font(s, Face::Display, 11.0, 22.0, 1.2, 600.0))
                    .color(p.white)
                    .size(31.0, 22.0)
                    .truncate()
                    .pin(
                        Some(x + 5.0),
                        Some(17.0 + s.fonts.display_baseline),
                        None,
                        None,
                    ),
            );
    }
    for (index, row) in state.intervals.iter().enumerate() {
        let groups = state
            .classes
            .iter()
            .filter(|(start, _, _)| start <= row)
            .count() as f32;
        let x = 160.0 + *row as f32 * state.width + groups * 40.0;
        for (dx, y, w, h) in [
            (0.0, 10.0, (state.width * 2.0 - 4.0).max(0.0), 1.0),
            (0.0, 45.0, (state.width * 2.0 - 4.0).max(0.0), 1.0),
            (0.0, 10.0, 1.0, 36.0),
            ((state.width * 2.0 - 5.0).max(0.0), 10.0, 1.0, 36.0),
        ] {
            root = root.child(el().size(w, h).fill(alpha(p.white, 0.22)).pin(
                Some(x + dx),
                Some(y),
                None,
                None,
            ));
        }
        root = root
            .child(el().size(28.0, 12.0).radius(6.0).fill(p.pill).pin(
                Some(x + state.width - 14.0),
                Some(2.0),
                None,
                None,
            ))
            .child(state.caption(
                &state.interval_text[index],
                format!("tower-interval-{index}"),
                x + state.width - 14.0,
                1.0,
                28.0,
                12.0,
                Face::Mono,
                9.0,
                400.0,
                0.0,
                p.pill_ink,
                Align::Center,
            ));
    }
    let mut mask =
        el().size(MASK_W, MASK_H)
            .clip_rounded(0.0)
            .pin(Some(MASK_X), Some(MASK_Y), None, None);
    for key in &state.order {
        mask = mask.child(state.card(&state.cards[key]));
    }
    root = root.child(mask);
    if state.show_weather {
        root = root.child(state.caption(
            &state.weather,
            "tower-weather".into(),
            0.0,
            20.0,
            1388.0,
            16.0,
            Face::Mono,
            11.0,
            400.0,
            0.0,
            s.colors.muted,
            Align::End,
        ));
    }
    root
}
