//! Paints the shared Delta Vantare scene with the product kit (no motion yet).
use super::scene::{self, Item, Scene, Size};
use crate::eficiencia;
use crate::vantare::{
    Style,
    paint::{Face, WHITE, font},
};
use rune::{Align, Color, El, Path, Shape, canvas, el, text};
use vantare_domain::{
    delta::{Banner, Phase, SectorTone},
    format::Language,
};

const BLACK: Color = Color {
    r: 0.0,
    g: 0.0,
    b: 0.0,
    a: 1.0,
};

pub(super) struct Painter {
    style: std::sync::Arc<Style>,
    prefs: vantare_domain::format::Preferences,
    scene: Scene,
}

impl Painter {
    pub fn new(prefs: vantare_domain::format::Preferences, scene: &Scene) -> Self {
        Self {
            style: Style::compiled(),
            prefs,
            scene: scene.clone(),
        }
    }
    pub fn sync(
        &mut self,
        scene: &Scene,
        prefs: vantare_domain::format::Preferences,
    ) -> crate::widget::Update {
        let build = *scene != self.scene || prefs != self.prefs;
        self.scene = scene.clone();
        self.prefs = prefs;
        crate::widget::Update {
            build,
            pixels: false,
        }
    }
    fn es(&self) -> bool {
        self.prefs.language == Language::Es
    }
    /// Sobre el juego la cabecera y el texto atenuado suben de contraste.
    fn ink(&self, color: Color) -> Color {
        let s = &self.style;
        if !self.scene.options.transparent {
            return color;
        }
        if color == self.variant().header_color {
            s.colors.text
        } else if color == s.colors.muted {
            s.colors.header_em
        } else {
            color
        }
    }
    fn variant(&self) -> &crate::vantare::Variant {
        match self.scene.options.tone {
            vantare_domain::widget_settings::look::Tone::Neo => &self.style.styles.neo,
            vantare_domain::widget_settings::look::Tone::Neutro => &self.style.styles.neutro,
        }
    }
    fn accent(&self) -> Color {
        match self.scene.options.accent {
            vantare_domain::widget_settings::look::Accent::Red => self.style.accents.red,
            vantare_domain::widget_settings::look::Accent::Amber => self.style.accents.amber,
            vantare_domain::widget_settings::look::Accent::Green => self.style.accents.green,
            vantare_domain::widget_settings::look::Accent::White => self.style.accents.white,
        }
    }
    fn header_color(&self) -> Color {
        self.ink(self.variant().header_color)
    }
    fn number(&self) -> (&str, Color) {
        let c = &self.style.colors;
        if self.scene.message || self.scene.grey {
            return (&self.scene.labels.number, self.style.delta.grey);
        }
        let color = if self.scene.gain { c.gain } else { c.loss };
        (&self.scene.labels.number, color)
    }
    #[allow(clippy::too_many_arguments)] // Una celda de texto: caja, cara e ink.
    fn label(
        &self,
        key: impl Into<String>,
        value: impl Into<String>,
        x: f32,
        y: f32,
        width: f32,
        height: f32,
        face: Face,
        size: f32,
        tracking: f32,
        weight: f32,
        ink: Color,
        align: Align,
    ) -> El {
        let name = key.into();
        let value = value.into();
        let style = font(&self.style, face, size, height, tracking, weight);
        if !self.scene.options.transparent {
            return text(value)
                .key(name)
                .font(style)
                .color(ink)
                .size(width, height)
                .align(align)
                .pin(Some(x), Some(y), None, None);
        }
        // Sobre el juego, GPUI dibuja cuatro sombras y una copia baja.
        let mut node = el().key(name).size(width, height).pin(Some(x), Some(y), None, None);
        for (index, (dx, dy, strength)) in [
            (-1.0f32, 0.0f32, 0.35f32),
            (1.0, 0.0, 0.35),
            (0.0, -1.0, 0.35),
            (0.0, 2.0, 0.35),
            (0.0, 1.0, 0.9),
        ]
        .into_iter()
        .enumerate()
        {
            node = node.child(
                text(value.clone())
                    .key(format!("{name}-shadow-{index}"))
                    .font(style)
                    .color(crate::vantare::alpha(BLACK, strength))
                    .size(width, height)
                    .align(align)
                    .pin(Some(dx), Some(dy), None, None),
            );
        }
        node.child(
            text(value)
                .key(format!("{name}-ink"))
                .font(style)
                .color(ink)
                .size(width, height)
                .align(align)
                .pin(Some(0.0), Some(0.0), None, None),
        )
    }
    pub fn view(&self) -> El {
        let size = (self.scene.width, self.scene.height);
        let mut root = el()
            .key("delta")
            .size(size.0, size.1)
            .motion(rune::Spring::NONE);
        if self.scene.options.size == Size::Pill {
            return self.pill(root);
        }
        if !self.scene.options.transparent {
            root = root.child(self.panel(self.scene.width, self.scene.content));
        }
        for (y, item) in &self.scene.items {
            root = match item {
                Item::Banner => self.banner(root),
                Item::Header => self.header(root, *y),
                Item::Big => self.big(root, *y),
                Item::Message => self.message(root, *y),
                Item::Bar => self.bar(root, *y),
                Item::Sectors => self.sectors(root, *y),
            };
        }
        root
    }
    fn panel(&self, width: f32, height: f32) -> El {
        let s = &self.style;
        let v = self.variant();
        let border = if v.border_accent > 0.0 {
            crate::vantare::alpha(self.accent(), v.border_accent)
        } else {
            v.border
        };
        el().key("panel")
            .pin(Some(0.0), Some(0.0), None, None)
            .size(width, height)
            .radius(v.radius)
            .border(1.0, border)
            .linear_gradient(std::f32::consts::PI, [(0.0, v.top), (1.0, v.bottom)])
            .shadow(
                v.shadow_y,
                v.shadow_blur,
                crate::vantare::alpha(s.colors.shadow, v.shadow_alpha),
            )
    }
    fn pill(&self, root: El) -> El {
        let s = &self.style;
        let d = &s.delta;
        let content = self.scene.content;
        let pad = if self.scene.options.transparent {
            16.0
        } else {
            17.0
        };
        let (value, color) = self.number();
        let label_ink = self.ink(s.colors.muted);
        let label_font = font(
            s,
            Face::Body,
            d.pill_label,
            d.pill_label,
            0.3,
            s.fonts.regular_weight,
        );
        let live = self.scene.live;
        let (face, size) = if live {
            (Face::Display, d.pill_value)
        } else {
            (Face::Mono, d.pill_value - 2.0)
        };
        let weight = if matches!(face, Face::Display) {
            600.0
        } else {
            400.0
        };
        let value_font = font(s, face, size, size, 0.0, weight);
        let label_width = eficiencia::width("DELTA", label_font);
        let width = (2.0 * pad + label_width + 14.0 + eficiencia::width(value, value_font))
            .min(self.scene.width);
        let root = if self.scene.options.transparent {
            root
        } else {
            root.child(self.panel(width, content))
        };
        let x = pad + label_width + 14.0;
        let offset = text_top(s, face, 0.0);
        root.child(self.label(
            "pill-label",
            "DELTA",
            pad,
            0.0,
            label_width + 2.0,
            content,
            Face::Body,
            d.pill_label,
            0.3,
            s.fonts.regular_weight,
            label_ink,
            Align::Start,
        ))
        .child(self.label(
            "pill-value",
            value.to_owned(),
            x,
            offset,
            (self.scene.width - x).max(0.0),
            content - offset,
            face,
            size,
            0.0,
            weight,
            color,
            Align::Start,
        ))
    }
    fn banner(&self, mut root: El) -> El {
        let Some(kind) = self.scene.banner else {
            return root;
        };
        let s = &self.style;
        let g = &s.geometry;
        let v = self.variant();
        let c = &s.colors;
        let (fill, title, line) = match kind {
            Banner::InPits => (
                c.stops_fill,
                if self.es() { "EN BOXES" } else { "IN THE PITS" },
                Some(c.line),
            ),
            Banner::FullCourseYellow => (c.fcy_fill, "FCY", None),
        };
        let ink = if kind == Banner::FullCourseYellow {
            c.fcy_text
        } else {
            c.text
        };
        let pad = v.padding_x;
        let radius = (v.radius - 1.0).max(0.0);
        let width = self.scene.width;
        let mut band = el()
            .key("banner")
            .pin(Some(0.0), Some(0.0), None, None)
            .size(width, g.banner_height)
            .corners([radius, radius, 0.0, 0.0])
            .fill(fill);
        if let Some(line) = line {
            band = band.child(
                el().pin(Some(0.0), Some(g.banner_height - 1.0), None, None)
                    .size(width, 1.0)
                    .fill(line),
            );
        }
        let right = if self.es() {
            "delta en pausa"
        } else {
            "delta paused"
        };
        root = root
            .child(band)
            .child(
                text(title)
                    .key("banner-title")
                    .font(font(
                        s,
                        Face::Display,
                        s.fonts.banner,
                        g.banner_height,
                        s.fonts.banner_tracking,
                        600.0,
                    ))
                    .color(ink)
                    .size(width * 0.5, g.banner_height)
                    .pin(
                        Some(pad),
                        Some(text_top(s, Face::Display, 0.0)),
                        None,
                        None,
                    ),
            )
            .child(
                text(right)
                    .key("banner-right")
                    .font(font(
                        s,
                        Face::Mono,
                        s.fonts.mono_small,
                        g.banner_height,
                        0.0,
                        400.0,
                    ))
                    .color(ink)
                    .size(200.0, g.banner_height)
                    .align(Align::End)
                    .pin(
                        Some(width - pad - 200.0),
                        Some(text_top(s, Face::Mono, 0.0)),
                        None,
                        None,
                    ),
            );
        root
    }
    fn header(&self, mut root: El, y: f32) -> El {
        let s = &self.style;
        let v = self.variant();
        let h = v.header_height - if v.header_rule > 0.0 { 6.0 } else { 0.0 };
        let face = if v.header_display {
            Face::Display
        } else {
            Face::Body
        };
        let weight = if matches!(face, Face::Display) {
            600.0
        } else {
            s.fonts.regular_weight
        };
        let (pad, width) = (v.padding_x, self.scene.width);
        root = root.child(self.label(
            "header-title",
            self.scene.labels.title.clone(),
            pad,
            text_top(s, face, y),
            width * 0.62,
            h,
            face,
            v.header_size,
            v.header_tracking,
            weight,
            self.header_color(),
            Align::Start,
        ));
        let mut edge = width - pad;
        if self.scene.options.brand {
            let (brand, used) = self.brand(edge, y, h);
            root = root.child(brand);
            edge -= used + s.brand.margin;
        }
        if self.scene.options.size == Size::Expanded {
            root = self.segments(root, edge, y, h);
        } else {
            let box_width = (edge - pad).max(0.0);
            root = root.child(self.label(
                "header-reference",
                self.scene.labels.reference.clone(),
                edge - box_width,
                text_top(s, Face::Mono, y),
                box_width,
                h,
                Face::Mono,
                s.fonts.mono_small,
                0.0,
                400.0,
                self.ink(s.colors.header_em),
                Align::End,
            ));
        }
        if v.header_rule > 0.0 {
            root = root.child(
                eficiencia::rect(
                    pad,
                    y + v.header_height - 1.0,
                    width - 2.0 * pad,
                    1.0,
                    crate::vantare::alpha(self.accent(), v.header_rule),
                )
                .key("header-rule"),
            );
        }
        root
    }
    fn brand(&self, right: f32, y: f32, h: f32) -> (El, f32) {
        let s = &self.style;
        let b = &s.brand;
        let name_font = font(s, Face::Display, b.size, h, b.tracking, 600.0);
        let name = eficiencia::width("VANTARE", name_font);
        let scale = b.symbol_height / 41.0;
        let symbol = 46.0 * scale;
        let left = right - name - b.gap - symbol;
        let top = y + (h - b.symbol_height) / 2.0;
        // El canvas es local: mismo trazado de mark.svg, sin sumar su origen.
        let at = |x: f32, y: f32| [(x - 9.0) * scale, (y - 10.0) * scale];
        let mark = Path::new()
            .move_to(at(9.0, 51.0))
            .line_to(at(32.0, 10.0))
            .line_to(at(55.0, 51.0))
            .line_to(at(42.0, 51.0))
            .line_to(at(32.0, 32.0))
            .line_to(at(22.0, 51.0))
            .close();
        let element = el()
            .key("brand")
            .pin(Some(0.0), Some(0.0), None, None)
            .size(self.scene.width, self.scene.height)
            .child(
                canvas(Shape::new().fill_path(&mark, b.symbol))
                    .key("brand-symbol")
                    .pin(Some(left), Some(top), None, None)
                    .size(symbol.max(1.0), b.symbol_height.max(1.0)),
            )
            .child(
                text("VANTARE")
                    .key("brand-name")
                    .font(name_font)
                    .color(self.variant().header_color)
                    .size(name + 2.0, h)
                    .pin(Some(right - name), Some(text_top(s, Face::Display, y)), None, None),
            );
        (element, name + b.gap + symbol)
    }
    fn segments(&self, mut root: El, right: f32, y: f32, h: f32) -> El {
        let s = &self.style;
        let d = &s.delta;
        let c = &s.colors;
        let ink = self.ink(c.value);
        let active = self.ink(c.text);
        let names = self.scene.labels.segments;
        let widths = names.map(|name| {
            eficiencia::width(
                name,
                font(
                    s,
                    Face::Body,
                    s.fonts.small,
                    s.fonts.small,
                    0.0,
                    s.fonts.regular_weight,
                ),
            ) + 20.0
        });
        let mut x = right - widths.iter().sum::<f32>();
        let top = y + (h - d.segment_height) / 2.0;
        for (index, (name, width)) in names.iter().zip(widths).enumerate() {
            let on = index
                == match self.scene.options.reference {
                    vantare_domain::delta::Reference::PersonalBest => 0,
                    vantare_domain::delta::Reference::Optimal => 1,
                    _ => 2,
                };
            if on {
                root = root.child(
                    el().key(format!("segment-{index}"))
                        .pin(Some(x), Some(top), None, None)
                        .size(width, d.segment_height)
                        .radius(4.0)
                        .fill(crate::vantare::alpha(self.accent(), 0.25))
                        .border(1.0, crate::vantare::alpha(self.accent(), 0.5)),
                );
            }
            root = root.child(self.label(
                format!("segment-text-{index}"),
                (*name).to_owned(),
                x + 10.0,
                text_top(s, Face::Body, top),
                width - 10.0,
                d.segment_height,
                Face::Body,
                s.fonts.small,
                0.0,
                s.fonts.regular_weight,
                if on { active } else { ink },
                Align::Start,
            ));
            x += width;
        }
        root
    }
    fn big(&self, mut root: El, y: f32) -> El {
        let s = &self.style;
        let d = &s.delta;
        let c = &s.colors;
        let pad = self.variant().padding_x;
        let width = self.scene.width;
        let (value, color) = self.number();
        let value_font = font(s, Face::Display, d.big, d.big, 0.5, 600.0);
        let value_width = eficiencia::width(value, value_font);
        root = root.child(
            text(value.to_owned())
                .key("big-number")
                .font(value_font)
                .color(color)
                .size(value_width + 4.0, d.big)
                .pin(Some(pad), Some(text_top(s, Face::Display, y)), None, None),
        );
        if self.scene.phase == Phase::Invalid {
            root = root.child(
                eficiencia::rect(pad, y + d.big / 2.0, value_width, 2.0, color)
                    .radius(1.0)
                    .key("big-strike"),
            );
        }
        let x = pad + value_width + 12.0;
        let muted = self.ink(c.muted);
        let base = y + 12.0;
        let label_h = d.big - 6.0;
        if let Some(note) = self.scene.labels.phase_note {
            root = root.child(self.label(
                "big-note",
                note,
                x,
                text_top(s, Face::Body, base),
                (width - pad - x).max(1.0),
                label_h,
                Face::Body,
                s.fonts.small,
                0.0,
                s.fonts.regular_weight,
                muted,
                Align::Start,
            ));
        } else {
            let lead = self.scene.labels.predicted_lead;
            let lead_width = eficiencia::width(
                lead,
                font(
                    s,
                    Face::Body,
                    s.fonts.small,
                    label_h,
                    0.0,
                    s.fonts.regular_weight,
                ),
            );
            root = root
                .child(self.label(
                    "big-lead",
                    lead,
                    x,
                    text_top(s, Face::Body, base),
                    lead_width + 2.0,
                    label_h,
                    Face::Body,
                    s.fonts.small,
                    0.0,
                    s.fonts.regular_weight,
                    muted,
                    Align::Start,
                ))
                .child(self.label(
                    "big-predicted",
                    self.scene.labels.predicted.clone(),
                    x + lead_width,
                    text_top(s, Face::Mono, base),
                    (width - pad - x - lead_width).max(1.0),
                    label_h,
                    Face::Mono,
                    s.fonts.mono,
                    0.0,
                    400.0,
                    c.text,
                    Align::Start,
                ));
        }
        if self.scene.options.size == Size::Expanded {
            root = root.child(self.label(
                "big-lap",
                self.scene.labels.lap.clone(),
                width - pad - width * 0.3,
                text_top(s, Face::Body, base),
                width * 0.3,
                label_h,
                Face::Body,
                s.fonts.small,
                0.0,
                s.fonts.regular_weight,
                muted,
                Align::End,
            ));
        }
        root
    }
    fn message(&self, mut root: El, y: f32) -> El {
        let s = &self.style;
        let c = &s.colors;
        let f = &s.fonts;
        let Some((title, hint)) = self.scene.labels.message else {
            return root;
        };
        root = root
            .child(self.label(
                "message-title",
                title,
                0.0,
                text_top(s, Face::Display, y + 4.0),
                self.scene.width,
                f.wait_title,
                Face::Display,
                f.wait_title,
                f.separator_tracking,
                600.0,
                self.ink(c.header_em),
                Align::Center,
            ))
            .child(self.label(
                "message-hint",
                hint,
                0.0,
                y + 20.0,
                self.scene.width,
                18.0,
                Face::Body,
                f.small,
                0.0,
                f.regular_weight,
                self.ink(c.muted),
                Align::Start,
            ));
        root
    }
    fn bar(&self, mut root: El, y: f32) -> El {
        let s = &self.style;
        let d = &s.delta;
        let c = &s.colors;
        let (pad, width) = (self.variant().padding_x, self.scene.width);
        let span = width - 2.0 * pad;
        let mid = pad + span / 2.0;
        let transparent = self.scene.options.transparent;
        let mut track = el()
            .key("bar-track")
            .pin(Some(pad), Some(y), None, None)
            .size(span, d.bar)
            .radius(d.bar / 2.0);
        if transparent {
            track = track
                .fill(crate::eficiencia::color(0x000000, 0.5))
                .border(1.0, crate::vantare::alpha(WHITE, 0.14));
        } else {
            track = track.fill(d.track);
        }
        root = root.child(track);
        if !self.scene.message && self.scene.phase == Phase::Live && self.scene.bar != 0.0 {
            let half = span / 2.0;
            let length = half * self.scene.bar.abs();
            let (x, solid, angle, corners): (f32, Color, f32, [f32; 4]) =
                if self.scene.bar < 0.0 {
                    (
                        mid - length,
                        d.fill_gain,
                        270.0,
                        [d.bar / 2.0, 0.0, 0.0, d.bar / 2.0],
                    )
                } else {
                    (
                        mid,
                        d.fill_loss,
                        90.0,
                        [0.0, d.bar / 2.0, d.bar / 2.0, 0.0],
                    )
                };
            root = root.child(
                el().key("bar-fill")
                    .pin(Some(x), Some(y), None, None)
                    .size(length, d.bar)
                    .corners(corners)
                    .linear_gradient(
                        angle.to_radians(),
                        [
                            (0.0, crate::vantare::alpha(solid, d.fill_from)),
                            (1.0, solid),
                        ],
                    ),
            );
        }
        let center = if self.scene.message {
            c.pulse
        } else {
            d.center
        };
        root = root.child(
            el().key("bar-center")
                .pin(Some(mid - 1.0), Some(y + (d.bar - d.tick) / 2.0), None, None)
                .size(2.0, d.tick)
                .radius(1.0)
                .fill(center),
        );
        if self.scene.message {
            return root;
        }
        let ink = self.ink(c.column);
        let top = y + d.bar + 2.0;
        let h = d.tick_labels - 2.0;
        let zero_width = eficiencia::width(
            "0",
            font(s, Face::Mono, 9.0, h, 0.0, 400.0),
        );
        root = root
            .child(self.label(
                "bar-min",
                self.scene.labels.range[0].clone(),
                pad,
                text_top(s, Face::Mono, top),
                80.0,
                h,
                Face::Mono,
                9.0,
                0.0,
                400.0,
                ink,
                Align::Start,
            ))
            .child(self.label(
                "bar-zero",
                "0",
                mid - zero_width / 2.0,
                text_top(s, Face::Mono, top),
                zero_width + 2.0,
                h,
                Face::Mono,
                9.0,
                0.0,
                400.0,
                ink,
                Align::Start,
            ))
            .child(self.label(
                "bar-max",
                self.scene.labels.range[1].clone(),
                width - pad - 80.0,
                text_top(s, Face::Mono, top),
                80.0,
                h,
                Face::Mono,
                9.0,
                0.0,
                400.0,
                ink,
                Align::End,
            ));
        root
    }
    fn sectors(&self, mut root: El, y: f32) -> El {
        let s = &self.style;
        let d = &s.delta;
        let c = &s.colors;
        let (pad, width) = (self.variant().padding_x, self.scene.width);
        let count = self.scene.labels.sectors.len().max(1);
        let gap = 6.0;
        let cell = (width - 2.0 * pad - gap * (count - 1) as f32) / count as f32;
        let top = y + 6.0;
        let muted = self.ink(c.muted);
        for (index, sector) in self.scene.labels.sectors.iter().enumerate() {
            let x = pad + index as f32 * (cell + gap);
            root = root.child(
                el().key(format!("sector-track-{index}"))
                    .pin(Some(x), Some(top), None, None)
                    .size(cell, d.sector_bar)
                    .radius(d.sector_bar / 2.0)
                    .fill(c.sector_pending),
            );
            let fill = sector.tone.map(|tone| {
                (
                    1.0,
                    match tone {
                        SectorTone::SessionBest => c.purple,
                        SectorTone::PersonalBest => c.green,
                        SectorTone::Slower => c.yellow,
                    },
                )
            });
            let fill = fill.or_else(|| {
                sector
                    .live
                    .then_some(sector.progress)
                    .flatten()
                    .map(|fraction| (fraction, if self.scene.gain { c.green } else { d.fill_loss }))
            });
            if let Some((fraction, color)) = fill {
                root = root.child(
                    el().key(format!("sector-fill-{index}"))
                        .pin(Some(x), Some(top), None, None)
                        .size(cell * fraction, d.sector_bar)
                        .radius(d.sector_bar / 2.0)
                        .fill(color),
                );
            }
            let label_top = top + d.sector_bar + 3.0;
            root = root.child(self.label(
                format!("sector-title-{index}"),
                sector.title.clone(),
                x,
                text_top(s, Face::Mono, label_top),
                cell,
                14.0,
                Face::Mono,
                10.0,
                0.0,
                400.0,
                muted,
                Align::Start,
            ));
            let value_color = sector.tone.map_or(c.muted, |tone| match tone {
                SectorTone::SessionBest => c.purple,
                SectorTone::PersonalBest => c.gain,
                SectorTone::Slower => c.yellow,
            });
            root = root.child(self.label(
                format!("sector-value-{index}"),
                sector.value.clone(),
                x,
                text_top(s, Face::Mono, label_top),
                cell,
                14.0,
                Face::Mono,
                10.0,
                0.0,
                400.0,
                self.ink(value_color),
                Align::End,
            ));
        }
        root
    }
}

/// GPUI's `baseline` adds the face offset; Rune's layout needs it in the y.
pub(super) fn text_top(style: &Style, face: Face, top: f32) -> f32 {
    top + match face {
        Face::Display => style.fonts.display_baseline,
        Face::Mono => style.fonts.mono_baseline,
        Face::Body => 0.0,
    }
}
