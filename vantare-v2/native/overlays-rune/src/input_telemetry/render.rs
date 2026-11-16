//! Telemetría de entrada, Look Vantare: pinta la escena y mantiene los valores vivos.
use super::Update;
use super::scene::{PLOT, Scene, Segment};
use crate::vantare::Style;
use crate::vantare::alpha;
use crate::vantare::paint::{Face, font};
use rune::{Align, Color, El, LineCap, Live, LiveText, Shape, canvas, el, text};
use std::sync::Arc;
use vantare_domain::geometry::Size;

const WIDTH: f32 = 600.0;
const HEIGHT: f32 = 84.0;
const GRID: [(f32, f32); 4] = [(0.25, 0.05), (0.5, 0.05), (0.75, 0.05), (1.0, 0.12)];

struct Palette {
    clutch: Color,
    brake: Color,
    throttle: Color,
    white: Color,
}

impl Palette {
    fn new() -> Self {
        let hex = |value: &str| rune::color::hex(value).expect("literal de color");
        Self {
            clutch: hex("#4f8ef7"),
            brake: hex("#e14a54"),
            throttle: hex("#22c55e"),
            white: hex("#ffffff"),
        }
    }
    fn signal(&self, signal: usize) -> Color {
        match signal {
            0 => self.clutch,
            1 => self.brake,
            _ => self.throttle,
        }
    }
}

struct Last {
    seconds: u8,
    show_clutch: bool,
    segments: Arc<Vec<Segment>>,
}

pub(super) struct Painter {
    style: Arc<Style>,
    palette: Palette,
    seconds: u8,
    show_clutch: bool,
    segments: Arc<Vec<Segment>>,
    seconds_text: LiveText,
    status: LiveText,
    rpm: LiveText,
    gear: LiveText,
    speed: LiveText,
    bars: [Live<[f32; 4]>; 3],
    dot: Live<[f32; 2]>,
    dot_opacity: Live<f32>,
    last: Option<Last>,
}

impl Painter {
    pub fn new(scene: &Scene) -> Self {
        let mut painter = Self {
            style: Style::compiled(),
            palette: Palette::new(),
            seconds: scene.seconds,
            show_clutch: scene.show_clutch,
            segments: scene.segments.clone(),
            seconds_text: LiveText::new(""),
            status: LiveText::new(""),
            rpm: LiveText::new(""),
            gear: LiveText::new(""),
            speed: LiveText::new(""),
            bars: std::array::from_fn(|_| Live::new([0.0; 4])),
            dot: Live::new([0.0, 0.0]),
            dot_opacity: Live::new(0.0),
            last: None,
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
    /// Las trazas solo se rehacen cuando cambian las muestras (Arc nuevo), nunca por tick.
    pub fn sync(&mut self, scene: &Scene) -> Update {
        let mut pixels = false;
        let build = self.last.as_ref().is_none_or(|last| {
            last.seconds != scene.seconds
                || last.show_clutch != scene.show_clutch
                || !Arc::ptr_eq(&last.segments, &scene.segments)
        });
        if build {
            self.last = Some(Last {
                seconds: scene.seconds,
                show_clutch: scene.show_clutch,
                segments: scene.segments.clone(),
            });
            self.seconds = scene.seconds;
            self.show_clutch = scene.show_clutch;
            self.segments = scene.segments.clone();
        }
        let view = &scene.view;
        pixels |= self.seconds_text.set(format!("{} s", scene.seconds));
        pixels |= self
            .status
            .set(view.status_text.unwrap_or_default().to_string());
        pixels |= self.rpm.set(format!("{} rpm", view.rpm));
        pixels |= self.gear.set(view.gear.clone());
        pixels |= self.speed.set(view.speed.replace("KPH", "km/h"));
        let start = usize::from(!scene.show_clutch);
        for index in start..3 {
            let height = scene.pedals[index].map_or(0.0, |value| 64.0 * value / 100.0);
            let x = 462.0 + (index - start) as f32 * 12.0;
            pixels |= self.bars[index].set([x, 74.0 - height, 9.0, height]);
        }
        let dot = scene
            .throttle_dot
            .map(|value| [448.0, 70.0 - 62.0 * value / 100.0]);
        pixels |= self.dot.set(dot.unwrap_or([0.0, 0.0]));
        pixels |= self.dot_opacity.set(if dot.is_some() { 1.0 } else { 0.0 });
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
        let baseline = if matches!(face, Face::Display) {
            self.style.fonts.display_baseline
        } else {
            0.0
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
    #[allow(clippy::too_many_arguments)] // Un texto centrado con su caja y su tinta.
    fn centred(
        &self,
        value: &LiveText,
        key: String,
        centre: f32,
        top: f32,
        width: f32,
        height: f32,
        face: Face,
        size: f32,
        weight: f32,
        tracking: f32,
        ink: Color,
    ) -> El {
        self.caption(
            value,
            key,
            centre - width / 2.0,
            top,
            width,
            height,
            face,
            size,
            weight,
            tracking,
            ink,
            Align::Center,
        )
    }
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
        .key("input-telemetry")
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
        );
    for (fraction, opacity) in GRID {
        root = root.child(el().size(PLOT.2, 1.0).fill(alpha(p.white, opacity)).pin(
            Some(PLOT.0),
            Some(PLOT.1 + fraction * PLOT.3 - 0.5),
            None,
            None,
        ));
    }
    let mut plot = el().key("plot").size(PLOT.2, PLOT.3).clip_rounded(0.0).pin(
        Some(PLOT.0),
        Some(PLOT.1),
        None,
        None,
    );
    for (index, segment) in state.segments.iter().enumerate() {
        let color = p.signal(segment.signal);
        plot = plot.child(
            canvas(
                Shape::new()
                    .fill(segment.fill(), alpha(color, 0.14))
                    .stroke_with(segment.points.clone(), false, 2.0, LineCap::Butt, color),
            )
            .key(format!("trace-{index}"))
            .size(PLOT.2, PLOT.3),
        );
    }
    root = root.child(plot);
    root = root.child(
        el().size(6.0, 6.0)
            .radius(3.0)
            .fill(p.white)
            .live_offset(&state.dot)
            .live_opacity(&state.dot_opacity),
    );
    root = root
        .child(state.caption(
            &state.seconds_text,
            "seconds".into(),
            16.0,
            60.0,
            120.0,
            14.0,
            Face::Mono,
            9.0,
            400.0,
            0.0,
            s.colors.column,
            Align::Start,
        ))
        .child(state.caption(
            &state.status,
            "status".into(),
            PLOT.0,
            34.0,
            PLOT.2,
            16.0,
            Face::Display,
            12.0,
            600.0,
            1.4,
            s.colors.muted,
            Align::Center,
        ));
    let start = usize::from(!state.show_clutch);
    for index in start..3 {
        let x = 462.0 + (index - start) as f32 * 12.0;
        root = root
            .child(
                el().size(9.0, 64.0)
                    .radius(4.0)
                    .fill(alpha(p.white, 0.08))
                    .pin(Some(x), Some(10.0), None, None),
            )
            .child(
                el().radius(4.0)
                    .live_rect(&state.bars[index])
                    .fill(p.signal(index)),
            );
    }
    let centre = if state.show_clutch { 550.0 } else { 544.0 };
    root = root
        .child(state.centred(
            &state.rpm,
            "rpm".into(),
            centre,
            10.0,
            120.0,
            10.0,
            Face::Mono,
            9.0,
            400.0,
            0.0,
            s.colors.muted,
        ))
        .child(state.centred(
            &state.gear,
            "gear".into(),
            centre,
            22.0,
            160.0,
            36.0,
            Face::Display,
            40.0,
            600.0,
            0.0,
            s.colors.text,
        ))
        .child(state.centred(
            &state.speed,
            "speed".into(),
            centre,
            60.0,
            160.0,
            14.0,
            Face::Mono,
            10.0,
            400.0,
            0.0,
            s.colors.muted,
        ));
    root
}
