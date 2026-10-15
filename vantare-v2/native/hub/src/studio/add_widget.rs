//! #1569: sin selección, el carril del inspector es el catálogo «Añadir widget».
//! El lienzo no cede ancho: el catálogo ocupa el mismo carril que el inspector.
use super::*;
use gpui::DragMoveEvent;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum Category {
    Race,
    Driving,
    Car,
    Track,
}

pub(super) const CATEGORIES: [(Option<Category>, &str); 5] = [
    (None, "Todos"),
    (Some(Category::Race), "Carrera"),
    (Some(Category::Driving), "Pilotaje"),
    (Some(Category::Car), "Coche"),
    (Some(Category::Track), "Pista"),
];

/// Orden del catálogo: por categoría y, dentro de ella, de lo general a lo concreto.
pub(super) const ORDER: [Kind; 19] = [
    Kind::Standings,
    Kind::Relative,
    Kind::MulticlassRelative,
    Kind::BroadcastTower,
    Kind::HeadToHead,
    Kind::FastestLap,
    Kind::SessionAlerts,
    Kind::RacingFlags,
    Kind::Delta,
    Kind::DeltaTrace,
    Kind::Pedals,
    Kind::PedalsTelemetry,
    Kind::InputTelemetry,
    Kind::Radar,
    Kind::CarDamageVisual,
    Kind::CarDamageNumbers,
    Kind::FuelStrategy,
    Kind::TrackMap,
    Kind::TrackWeather,
];

/// Base de cualquier carrera; solo se sugieren los que faltan y el plan permite.
const SUGGESTED: [Kind; 8] = [
    Kind::Standings,
    Kind::Relative,
    Kind::FuelStrategy,
    Kind::RacingFlags,
    Kind::Delta,
    Kind::Pedals,
    Kind::TrackMap,
    Kind::HeadToHead,
];

/// Para qué sirve, categoría y términos de búsqueda por uso.
pub(super) fn about(kind: Kind) -> (&'static str, Category, &'static str) {
    use Category::{Car, Driving, Race, Track};
    match kind {
        Kind::Standings => (
            "Clasificación completa con huecos por clase",
            Race,
            "clasificación posiciones tabla gaps",
        ),
        Kind::Relative => (
            "Quién va justo delante y detrás en pista",
            Race,
            "coches cerca diferencia",
        ),
        Kind::MulticlassRelative => (
            "Relative con el color de cada clase",
            Race,
            "clases hypercar gt3 tráfico",
        ),
        Kind::BroadcastTower => (
            "Torre compacta estilo retransmisión",
            Race,
            "tv stream retransmisión posiciones",
        ),
        Kind::HeadToHead => (
            "Tú contra un rival, vuelta a vuelta",
            Race,
            "rival duelo comparar tiempos",
        ),
        Kind::SessionAlerts => (
            "Cuenta atrás y cambios de sesión LMU; carreras marcadas del calendario",
            Race,
            "avisos sesión calendario cuenta atrás formación salida lmu",
        ),
        Kind::FastestLap => (
            "Mejor vuelta de la sesión y la tuya",
            Race,
            "récord tiempos vuelta",
        ),
        Kind::RacingFlags => (
            "Bandera activa, sector y motivo",
            Race,
            "amarilla azul safety car avisos",
        ),
        Kind::Delta => (
            "Ganas o pierdes contra tu mejor vuelta",
            Driving,
            "tiempos diferencia mejor vuelta",
        ),
        Kind::DeltaTrace => (
            "Dónde ganas y pierdes a lo largo de la vuelta",
            Driving,
            "tiempos gráfica sectores",
        ),
        Kind::Pedals => (
            "Acelerador, freno y embrague al instante",
            Driving,
            "acelerador freno embrague inputs",
        ),
        Kind::PedalsTelemetry => (
            "Trazas de acelerador y freno en el tiempo",
            Driving,
            "gráfica frenada inputs",
        ),
        Kind::InputTelemetry => (
            "Volante y pedales superpuestos",
            Driving,
            "volante dirección gráfica inputs",
        ),
        Kind::Radar => (
            "Coches a tu alrededor, vistos desde arriba",
            Driving,
            "proximidad lateral spotter",
        ),
        Kind::CarDamageVisual => ("Silueta con las zonas dañadas", Car, "golpes aerodinámica"),
        Kind::CarDamageNumbers => (
            "Daño por zona, en porcentaje",
            Car,
            "golpes suspensión motor",
        ),
        Kind::FuelStrategy => (
            "Combustible, consumo y vuelta de parada",
            Car,
            "combustible gasolina parada boxes estrategia",
        ),
        Kind::TrackMap => (
            "Trazado con todos los coches en vivo",
            Track,
            "mapa posiciones circuito",
        ),
        Kind::TrackWeather => (
            "Temperatura, lluvia y agarre",
            Track,
            "clima meteo lluvia temperatura",
        ),
    }
}

/// Minúsculas sin tildes: «telemetria» encuentra «Telemetría».
fn fold(text: &str) -> String {
    text.to_lowercase()
        .chars()
        .map(|c| match c {
            'á' | 'à' | 'ä' => 'a',
            'é' | 'è' | 'ë' => 'e',
            'í' | 'ì' | 'ï' => 'i',
            'ó' | 'ò' | 'ö' => 'o',
            'ú' | 'ù' | 'ü' => 'u',
            'ñ' => 'n',
            c => c,
        })
        .collect()
}

pub(super) fn matches(kind: Kind, query: &str) -> bool {
    let query = fold(query.trim());
    let (description, _, tags) = about(kind);
    query.is_empty() || fold(&format!("{} {description} {tags}", kind.label())).contains(&query)
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum GroupKind {
    Suggested,
    Plan,
    Locked,
}

#[derive(Debug, PartialEq, Eq)]
pub(super) struct Group {
    pub(super) kind: GroupKind,
    pub(super) kinds: Vec<Kind>,
}

/// Grupos visibles del catálogo: sugeridos (sin búsqueda ni categoría), los del
/// plan y los bloqueados. Una búsqueda sin coincidencias devuelve vacío.
pub(super) fn groups(
    query: &str,
    category: Option<Category>,
    locked: impl Fn(Kind) -> bool,
    placed: &[Kind],
) -> Vec<Group> {
    let visible: Vec<Kind> = ORDER
        .into_iter()
        .filter(|&kind| matches(kind, query) && category.is_none_or(|c| about(kind).1 == c))
        .collect();
    let suggested: Vec<Kind> = if query.trim().is_empty() && category.is_none() {
        SUGGESTED
            .into_iter()
            .filter(|&kind| !locked(kind) && !placed.contains(&kind))
            .take(2)
            .collect()
    } else {
        vec![]
    };
    let plan = visible
        .iter()
        .copied()
        .filter(|&kind| !locked(kind) && !suggested.contains(&kind))
        .collect();
    let blocked = visible
        .iter()
        .copied()
        .filter(|&kind| locked(kind))
        .collect();
    [
        (GroupKind::Suggested, suggested),
        (GroupKind::Plan, plan),
        (GroupKind::Locked, blocked),
    ]
    .into_iter()
    .filter(|(_, kinds)| !kinds.is_empty())
    .map(|(kind, kinds)| Group { kind, kinds })
    .collect()
}

/// Rejilla de dos columnas: (widget, fila, columna) en orden de pintado.
pub(super) fn grid(groups: &[Group]) -> Vec<(Kind, usize, usize)> {
    let mut cells = vec![];
    let mut row = 0;
    for group in groups {
        for (index, &kind) in group.kinds.iter().enumerate() {
            cells.push((kind, row + index / 2, index % 2));
        }
        row += group.kinds.len().div_ceil(2);
    }
    cells
}

/// Siguiente tarjeta con flechas; `None` al salir por arriba (vuelve al buscador).
pub(super) fn step(cells: &[(Kind, usize, usize)], from: Kind, key: &str) -> Option<Kind> {
    let &(_, row, column) = cells.iter().find(|cell| cell.0 == from)?;
    let candidates = cells.iter().filter(|&&(_, r, c)| match key {
        "left" => r == row && c + 1 == column,
        "right" => r == row && c == column + 1,
        "down" => r > row,
        "up" => r < row,
        _ => false,
    });
    candidates
        .min_by_key(|&&(_, r, c)| r.abs_diff(row) * 2 + c.abs_diff(column))
        .map(|cell| cell.0)
}

/// Rectángulo en coordenadas del lienzo: (x, y, ancho, alto).
pub(super) type Rect = (f32, f32, f32, f32);

/// Primer hueco libre de arriba abajo y de izquierda a derecha, con margen.
pub(super) fn free_spot(taken: &[Rect], size: (f32, f32), canvas: (f32, f32)) -> (f32, f32) {
    let margin = canvas.0 * 0.02;
    let step = canvas.0 * 0.01;
    let gap = 12.0;
    let mut y = margin;
    while y + size.1 <= canvas.1 - margin {
        let mut x = margin;
        while x + size.0 <= canvas.0 - margin {
            if !taken.iter().any(|r| {
                x < r.0 + r.2 + gap
                    && x + size.0 + gap > r.0
                    && y < r.1 + r.3 + gap
                    && y + size.1 + gap > r.1
            }) {
                return (x, y);
            }
            x += step;
        }
        y += step;
    }
    // ponytail: sin hueco → centro; escalonar si se llenan lienzos a menudo.
    (
        (canvas.0 - size.0).max(0.0) / 2.0,
        (canvas.1 - size.1).max(0.0) / 2.0,
    )
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub(super) struct Snap {
    pub(super) at: (f32, f32),
    pub(super) guides: (Option<f32>, Option<f32>),
}

/// Imán al centro del lienzo, sus márgenes y bordes/centros de otros widgets.
pub(super) fn snap(
    center: (f32, f32),
    size: (f32, f32),
    canvas: (f32, f32),
    others: &[Rect],
    threshold: f32,
) -> Snap {
    let margin = canvas.0 * 0.02;
    let axis = |pointer: f32, length: f32, total: f32, targets: Vec<f32>| {
        let start = (pointer - length / 2.0).clamp(0.0, (total - length).max(0.0));
        let mut best: Option<(f32, f32)> = None;
        for target in targets {
            for offset in [0.0, length / 2.0, length] {
                let delta = target - (start + offset);
                if delta.abs() < threshold && best.is_none_or(|(d, _)| delta.abs() < d.abs()) {
                    best = Some((delta, target));
                }
            }
        }
        best.map_or((start, None), |(delta, target)| {
            (start + delta, Some(target))
        })
    };
    let edges = |start: fn(&Rect) -> f32, length: fn(&Rect) -> f32| {
        others
            .iter()
            .flat_map(move |r| [start(r), start(r) + length(r), start(r) + length(r) / 2.0])
            .collect::<Vec<_>>()
    };
    let mut xs = vec![canvas.0 / 2.0, margin, canvas.0 - margin];
    xs.extend(edges(|r| r.0, |r| r.2));
    let mut ys = vec![canvas.1 / 2.0, margin, canvas.1 - margin];
    ys.extend(edges(|r| r.1, |r| r.3));
    let (x, gx) = axis(center.0, size.0, canvas.0, xs);
    let (y, gy) = axis(center.1, size.1, canvas.1, ys);
    Snap {
        at: (x, y),
        guides: (gx, gy),
    }
}

/// Valor de arrastre desde una tarjeta; la silueta se pinta en el lienzo.
#[derive(Clone, Copy)]
pub(super) struct CatalogDrag(pub(super) Kind);
struct NoDragImage;
impl Render for NoDragImage {
    fn render(&mut self, _: &mut Window, _: &mut Context<Self>) -> impl IntoElement {
        div()
    }
}

pub(super) struct CatalogPreview {
    kind: Kind,
    size: (f32, f32),
}

pub(super) struct Ghost {
    pub(super) kind: Kind,
    pub(super) snap: Snap,
    pub(super) overlay: Entity<Overlay>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum Toast {
    Added(Kind),
    Locked(Kind, &'static str),
}

/// Pide a la shell abrir los planes («Ver planes»). En la navegación beta
/// Licencias está oculta: el plan y la compra viven en Cuenta.
pub(crate) struct OpenPlans;
pub(crate) const PLANS: crate::Section = crate::Section::Account;
impl EventEmitter<OpenPlans> for Studio {}

const THUMB_H: f32 = 78.0;
const CARD_GAP: f32 = 10.0;
const LIST_PAD: f32 = 20.0;

/// Icono monocromo propio del widget (`assets/widgets/w-<kind>.svg`).
pub(super) fn widget_icon(kind: Kind, size: f32, color: u32) -> gpui::Svg {
    gpui::svg()
        .path(format!("icons/w-{}.svg", kind.name()))
        .size(px(size))
        .flex_none()
        .text_color(rgb(color))
}

type Access = crate::shell::navigation::Access;

/// Solo un acceso verificado puede ofrecer Pro: sin verificar, el candado no es comercial.
pub(super) fn sells_pro(access: Option<Access>) -> bool {
    access.is_none_or(|access| access.verified && !access.blocked)
}

pub(super) fn locked_title(access: Option<Access>) -> &'static str {
    if sells_pro(access) {
        "Con Vantare Pro"
    } else {
        "Pendiente de verificar acceso"
    }
}

pub(super) fn lock_badge(reason: &str) -> &'static str {
    if reason == "Incluida en Pro" {
        "Pro"
    } else {
        "Sin verificar"
    }
}

pub(super) fn locked_note(access: Option<Access>) -> String {
    let locked = ORDER
        .iter()
        .filter(|&&kind| widget_lock(access, kind).is_some())
        .count();
    let Some(access) = access.filter(|&access| sells_pro(Some(access))) else {
        return "Verifica tu acceso para añadir widgets.".into();
    };
    // Del catálogo real del plan: si cambia, el texto no miente.
    let included: Vec<&str> = ORDER
        .iter()
        .filter(|kind| access.catalog.allows_widget(kind.name()))
        .map(|kind| kind.label())
        .collect();
    let plan = match access.catalog {
        vantare_ipc::control::CatalogAccess::Free => "Tu plan Gratis",
        vantare_ipc::control::CatalogAccess::LaunchV1 => "Tu acceso de lanzamiento",
        vantare_ipc::control::CatalogAccess::Pro => "Tu plan Pro",
    };
    let what = match included.as_slice() {
        [one, two] => format!("{one} y {two}"),
        all => format!("{} widgets", all.len()),
    };
    format!("{plan} incluye {what}. Pro desbloquea los {locked} restantes.")
}

impl Studio {
    pub(super) fn show_catalog(&mut self, cx: &mut Context<Self>) {
        self.cancel_drag(cx);
        self.editor.selected = None;
        self.reset_fields();
        self.rebuild(cx);
    }

    fn catalog_query(&self, cx: &gpui::App) -> String {
        self.search.read(cx).value.clone()
    }

    pub(super) fn catalog_groups(&self, cx: &gpui::App) -> Vec<Group> {
        let placed: Vec<Kind> = self
            .editor
            .layout()
            .instances
            .iter()
            .map(|item| item.settings.kind())
            .collect();
        groups(
            &self.catalog_query(cx),
            CATEGORIES[self.catalog_category].0,
            |kind| widget_lock(self.access, kind).is_some(),
            &placed,
        )
    }

    /// Tamaño real de cada widget (renderer productivo con su ejemplo), para el
    /// rótulo, el hueco libre y la silueta. La tarjeta pinta su SVG.
    pub(super) fn ensure_catalog_previews(&mut self, cx: &mut Context<Self>) {
        if self.catalog_previews.is_empty() {
            for kind in ORDER {
                let size = self.catalog_overlay(kind, 1.0, cx).read(cx).wanted_size();
                self.catalog_previews.push(CatalogPreview { kind, size });
            }
        }
    }

    pub(super) fn catalog_overlay(
        &self,
        kind: Kind,
        scale: f32,
        cx: &mut Context<Self>,
    ) -> Entity<Overlay> {
        let settings = Editor::new_settings(kind);
        let mut overlay = Overlay::configured(&settings, self.preferences());
        let _ = overlay.set_preview_scale(scale);
        let snapshot =
            catalog::preview_snapshot(true, &self.examples, &self.snapshot, kind).clone();
        cx.new(|cx| {
            overlay.ingest(&snapshot, cx);
            overlay
        })
    }

    pub(super) fn catalog_size(&self, kind: Kind) -> Option<(f32, f32)> {
        self.catalog_previews
            .iter()
            .find(|preview| preview.kind == kind)
            .map(|preview| preview.size)
    }

    /// Widgets en coordenadas del lienzo. El hueco libre cuenta también los
    /// ocultos (al mostrarlos no deben solaparse); el imán, solo los visibles.
    fn taken(&self, hidden: bool, cx: &gpui::App) -> Vec<Rect> {
        self.frames
            .iter()
            .map(|(_, frame)| frame.read(cx))
            .filter(|frame| hidden || frame.item.visible)
            .map(|frame| {
                let (width, height) = frame.renderer.read(cx).painted_size();
                (
                    frame.item.x - self.monitor.0,
                    frame.item.y - self.monitor.1,
                    width * frame.content_scale,
                    height * frame.content_scale,
                )
            })
            .collect()
    }

    /// Clic = primer hueco libre; soltar = punto con imán. El nuevo queda seleccionado.
    pub(super) fn add_widget(
        &mut self,
        kind: Kind,
        at: Option<(f32, f32)>,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        // Un candado solo avisa: el foco sigue en la tarjeta.
        if self.insert_widget(kind, at, cx) {
            self.focus.focus(window, cx);
        }
    }

    pub(super) fn insert_widget(
        &mut self,
        kind: Kind,
        at: Option<(f32, f32)>,
        cx: &mut Context<Self>,
    ) -> bool {
        if let Some(reason) = widget_lock(self.access, kind) {
            self.show_toast(Toast::Locked(kind, reason), cx);
            return false;
        }
        self.ensure_catalog_previews(cx);
        let size = self.catalog_size(kind).unwrap_or((320.0, 200.0));
        let canvas = self.canvas_resolution();
        let (x, y) = at.unwrap_or_else(|| {
            free_spot(&self.taken(true, cx), size, (canvas.width, canvas.height))
        });
        let at = ((x + self.monitor.0).round(), (y + self.monitor.1).round());
        self.reset_fields();
        self.edit(|editor| editor.add_at(kind, at), cx);
        if self.status.is_ok() {
            if self.demo_profile.is_none() {
                vantare_ui::analytics::record(
                    cx,
                    &vantare_services::diagnostics::Usage::FeatureUsed {
                        feature: "widget_added".into(),
                    },
                );
            }
            self.show_toast(Toast::Added(kind), cx);
        }
        self.status.is_ok()
    }

    /// Escenas QA del catálogo; solo `parity-capture`.
    #[cfg(feature = "parity-capture")]
    pub(super) fn apply_catalog_capture(&mut self, cx: &mut Context<Self>) {
        let query = match capture_name().as_deref() {
            Some("studio-catalogo-busqueda") => "combustible",
            Some("studio-catalogo-sin-resultados") => "neumáticos",
            Some("studio-anadido") => {
                self.insert_widget(Kind::Pedals, None, cx);
                return;
            }
            _ => return,
        };
        self.search
            .update(cx, |search, cx| search.set_value(query.into(), cx));
    }

    pub(super) fn show_toast(&mut self, toast: Toast, cx: &mut Context<Self>) {
        self.toast = Some(toast);
        #[cfg(feature = "parity-capture")]
        if capture_name().is_some() {
            cx.notify();
            return; // La captura fija el aviso; el temporizador lo quitaría antes.
        }
        self.toast_task = Some(cx.spawn(async move |this, cx| {
            cx.background_executor()
                .timer(Duration::from_millis(4500))
                .await;
            let _ = this.update(cx, |this, cx| {
                if this.toast == Some(toast) {
                    this.toast = None;
                    cx.notify();
                }
            });
        }));
        cx.notify();
    }

    pub(super) fn toast_element(&self, cx: &mut Context<Self>) -> Option<gpui::Div> {
        let toast = self.toast?;
        let skin = orbit::skin(cx).clone();
        let link = |id: &'static str, label: &'static str, cx: &mut Context<Self>| {
            div()
                .id(id)
                .role(gpui::Role::Button)
                .tab_index(0)
                .h(px(28.0))
                .px(px(12.0))
                .flex()
                .items_center()
                .rounded_full()
                .cursor_pointer()
                .hover(move |s| s.bg(orbit::alpha(skin.hover)))
                .child(text(label, 13.0, 500, skin.accent_bright, cx))
        };
        let (icon, color, message) = match toast {
            Toast::Added(kind) => ("check", skin.ok, format!("{} añadido", kind.label())),
            Toast::Locked(kind, "Incluida en Pro") => (
                "lock",
                skin.text3,
                format!("{} está incluido en Vantare Pro", kind.label()),
            ),
            Toast::Locked(kind, reason) => {
                ("lock", skin.text3, format!("{}: {reason}", kind.label()))
            }
        };
        let mut pill = div()
            .id("studio-toast")
            .role(gpui::Role::Status)
            .aria_label(message.clone())
            .h(px(40.0))
            .pl(px(14.0))
            .pr(px(8.0))
            .flex()
            .items_center()
            .gap(px(10.0))
            .rounded_full()
            .bg(rgb(skin.el))
            .shadow(vec![
                orbit::kit_shadow(0xffff_ff14, 1.0, 0.0, 0.0, true),
                orbit::kit_shadow(0x0000_0073, 10.0, 26.0, 0.0, false),
            ])
            .child(orbit::icon(icon, 16.0, color))
            .child(text(message, 13.0, 400, skin.text1, cx).whitespace_nowrap());
        pill = match toast {
            Toast::Added(_) => pill
                .child(
                    link("studio-toast-undo", "Deshacer", cx).on_click(cx.listener(
                        |this, _, _, cx| {
                            this.toast = None;
                            this.history(false, cx);
                        },
                    )),
                )
                .child(orbit::keycap("Ctrl Z", cx).mr(px(4.0))),
            Toast::Locked(..) => pill.child(
                link("studio-toast-plans", "Ver planes", cx)
                    .on_click(cx.listener(|_, _, _, cx| cx.emit(OpenPlans))),
            ),
        };
        Some(
            div()
                .absolute()
                .left_0()
                .right_0()
                .bottom(px(24.0))
                .flex()
                .justify_center()
                .child(pill),
        )
    }

    pub(super) fn catalog_drag_move(
        &mut self,
        event: &DragMoveEvent<CatalogDrag>,
        _: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let kind = event.drag(cx).0;
        if !event.bounds.contains(&event.event.position) {
            if self.ghost.take().is_some() {
                cx.notify();
            }
            return;
        }
        self.ensure_catalog_previews(cx);
        let Some(size) = self.catalog_size(kind) else {
            return;
        };
        let scale = self.preview_scale();
        let canvas = self.canvas_resolution();
        let pointer = (
            f32::from(event.event.position.x - event.bounds.origin.x) / scale,
            f32::from(event.event.position.y - event.bounds.origin.y) / scale,
        );
        let snap = snap(
            pointer,
            size,
            (canvas.width, canvas.height),
            &self.taken(false, cx),
            7.0 / scale,
        );
        let overlay = match self.ghost.take() {
            Some(ghost) if ghost.kind == kind => ghost.overlay,
            _ => self.catalog_overlay(kind, scale, cx),
        };
        self.ghost = Some(Ghost {
            kind,
            snap,
            overlay,
        });
        cx.notify();
    }

    pub(super) fn catalog_drop(
        &mut self,
        drag: CatalogDrag,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        if self.drop_ghost(drag.0, cx) {
            self.focus.focus(window, cx);
        }
    }

    /// Soltar sin silueta (fuera del lienzo) no añade; con ella, en su punto con imán.
    pub(super) fn drop_ghost(&mut self, kind: Kind, cx: &mut Context<Self>) -> bool {
        match self.ghost.take() {
            Some(ghost) if ghost.kind == kind => self.insert_widget(kind, Some(ghost.snap.at), cx),
            _ => false,
        }
    }

    /// Intro en el buscador: el primer resultado que se puede añadir.
    pub(super) fn first_addable(&self, cx: &gpui::App) -> Option<Kind> {
        self.catalog_groups(cx)
            .into_iter()
            .filter(|group| group.kind != GroupKind::Locked)
            .flat_map(|group| group.kinds)
            .next()
    }

    /// Silueta a tamaño real y guías de ajuste, en píxeles del lienzo.
    pub(super) fn ghost_elements(&self, cx: &mut Context<Self>) -> Vec<gpui::AnyElement> {
        let Some(ghost) = &self.ghost else {
            return vec![];
        };
        let skin = orbit::skin(cx).clone();
        let scale = self.preview_scale();
        let size = self.catalog_size(ghost.kind).unwrap_or_default();
        let mut elements = vec![
            div()
                .absolute()
                .left(px(ghost.snap.at.0 * scale))
                .top(px(ghost.snap.at.1 * scale))
                .w(px(size.0 * scale))
                .h(px(size.1 * scale))
                .border_1()
                .border_dashed()
                .border_color(rgb(skin.accent_bright))
                .child(div().size_full().opacity(0.72).child(ghost.overlay.clone()))
                .child(
                    text(
                        format!("{} · {:.0} × {:.0}", ghost.kind.label(), size.0, size.1),
                        11.0,
                        500,
                        0x00ff_ffff,
                        cx,
                    )
                    .absolute()
                    // Pegada arriba, la etiqueta va dentro para no recortarse.
                    .top(px(if ghost.snap.at.1 * scale < 24.0 {
                        4.0
                    } else {
                        -24.0
                    }))
                    .left(px(-1.0))
                    .px(px(8.0))
                    .line_height(px(20.0))
                    .rounded(px(6.0))
                    .whitespace_nowrap()
                    .bg(rgb(orbit::carmine(cx))),
                )
                .into_any_element(),
        ];
        let line = |vertical: bool, at: f32| {
            let guide = div().absolute().bg(rgb(skin.accent_bright));
            if vertical {
                guide.left(px(at * scale)).top_0().bottom_0().w(px(1.0))
            } else {
                guide.top(px(at * scale)).left_0().right_0().h(px(1.0))
            }
            .into_any_element()
        };
        elements.extend(ghost.snap.guides.0.map(|x| line(true, x)));
        elements.extend(ghost.snap.guides.1.map(|y| line(false, y)));
        elements
    }

    fn focus_card(&self, kind: Kind, window: &mut Window, cx: &mut Context<Self>) {
        if let Some(index) = ORDER.iter().position(|candidate| *candidate == kind) {
            self.catalog_focus[index].focus(window, cx);
        }
    }

    fn card_key(
        &mut self,
        kind: Kind,
        event: &gpui::KeyDownEvent,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let key = event.keystroke.key.as_str();
        match key {
            "enter" | "space" => self.add_widget(kind, None, window, cx),
            "left" | "right" | "up" | "down" => {
                let cells = grid(&self.catalog_groups(cx));
                match step(&cells, kind, key) {
                    Some(next) => self.focus_card(next, window, cx),
                    None if key == "up" => self.search.read(cx).focus_handle().focus(window, cx),
                    None => {}
                }
            }
            _ => return,
        }
        cx.stop_propagation();
    }

    fn search_key(
        &mut self,
        event: &gpui::KeyDownEvent,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        match event.keystroke.key.as_str() {
            "down" => {
                if let Some(&(kind, ..)) = grid(&self.catalog_groups(cx)).first() {
                    self.focus_card(kind, window, cx);
                }
            }
            "enter" => {
                if let Some(kind) = self.first_addable(cx) {
                    self.add_widget(kind, None, window, cx);
                }
            }
            "escape" => {
                if self.catalog_query(cx).is_empty() {
                    self.focus.focus(window, cx);
                } else {
                    self.search
                        .update(cx, |search, cx| search.set_value(String::new(), cx));
                }
            }
            _ => return,
        }
        cx.stop_propagation();
    }

    pub(super) fn focus_catalog_search(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if self.editor.selected.is_some() {
            self.show_catalog(cx);
        }
        self.search.read(cx).focus_handle().focus(window, cx);
    }

    fn search_field(&self, cx: &mut Context<Self>) -> gpui::Div {
        let skin = orbit::skin(cx).clone();
        let empty = self.catalog_query(cx).is_empty();
        div()
            .relative()
            .h(px(38.0))
            .on_key_down(cx.listener(Self::search_key))
            .child(self.search.clone())
            .child(
                div()
                    .absolute()
                    .left(px(12.0))
                    .top_0()
                    .bottom_0()
                    .flex()
                    .items_center()
                    .gap(px(8.0))
                    .child(orbit::icon("search", 16.0, skin.cap))
                    .when(empty, |row| {
                        row.child(text("Buscar por nombre o uso…", 13.5, 400, skin.cap, cx))
                    }),
            )
            .child(
                div()
                    .absolute()
                    .right(px(8.0))
                    .top_0()
                    .bottom_0()
                    .flex()
                    .items_center()
                    .when(empty, |row| row.child(orbit::keycap("/", cx)))
                    .when(!empty, |row| {
                        row.child(
                            orbit::icon_button(
                                "studio-catalog-clear",
                                "x",
                                "Limpiar búsqueda",
                                24.0,
                                cx,
                            )
                            .on_click(cx.listener(
                                |this, _, window, cx| {
                                    this.search.update(cx, |search, cx| {
                                        search.set_value(String::new(), cx);
                                    });
                                    this.search.read(cx).focus_handle().focus(window, cx);
                                },
                            )),
                        )
                    }),
            )
    }

    fn category_chips(&self, cx: &mut Context<Self>) -> gpui::Stateful<gpui::Div> {
        let skin = orbit::skin(cx).clone();
        let query = self.catalog_query(cx);
        let mut row = div()
            .id("studio-catalog-categories")
            .role(gpui::Role::TabList)
            .flex()
            .flex_wrap()
            .gap(px(4.0));
        for (index, (category, label)) in CATEGORIES.into_iter().enumerate() {
            let count = ORDER
                .iter()
                .filter(|&&kind| {
                    matches(kind, &query) && category.is_none_or(|c| about(kind).1 == c)
                })
                .count();
            let active = index == self.catalog_category;
            let chip = div()
                .id(("studio-catalog-category", index))
                .role(gpui::Role::Tab)
                .aria_selected(active)
                .aria_label(format!("{label} · {count}"))
                .tab_index(0)
                .h(px(28.0))
                .px(px(6.0))
                .flex()
                .items_center()
                .gap(px(3.0))
                .rounded_full()
                .cursor_pointer()
                .child(text(
                    label,
                    12.0,
                    500,
                    if active { skin.text1 } else { skin.text3 },
                    cx,
                ))
                .child(text(
                    count.to_string(),
                    11.0,
                    400,
                    if active { skin.text3 } else { skin.cap },
                    cx,
                ))
                .on_click(cx.listener(move |this, _, _, cx| {
                    this.catalog_category = index;
                    cx.notify();
                }));
            row = row.child(if active {
                orbit::nav_active(chip, cx)
            } else {
                chip.border_1()
                    .border_color(orbit::alpha(skin.line2))
                    .hover(move |s| s.bg(orbit::alpha(skin.hover)))
            });
        }
        row
    }

    /// Miniatura fiel con insignia «En el diseño» o candado Pro.
    fn card_thumb(
        kind: Kind,
        lock: Option<&'static str>,
        placed: usize,
        cx: &gpui::App,
    ) -> gpui::Div {
        let skin = orbit::skin(cx).clone();
        let badge = |label: String, cx: &gpui::App| {
            div()
                .absolute()
                .top(px(6.0))
                .right(px(6.0))
                .h(px(16.0))
                .px(px(6.0))
                .flex()
                .items_center()
                .gap(px(4.0))
                .rounded_full()
                .bg(orbit::tint(0x000d_1016, 0.85))
                .border_1()
                .border_color(orbit::alpha(skin.line2))
                .child(text(label, 10.5, 600, skin.text2, cx))
        };
        div()
            .relative()
            .h(px(THUMB_H))
            .mx(px(6.0))
            .mt(px(6.0))
            .rounded(px(8.0))
            .overflow_hidden()
            .bg(linear_gradient(
                180.0,
                linear_color_stop(rgb(orbit::stage(cx).top), 0.0),
                linear_color_stop(rgb(orbit::stage(cx).base), 1.0),
            ))
            .flex()
            .items_center()
            .justify_center()
            .child(
                div()
                    .size_full()
                    .flex()
                    .items_center()
                    .justify_center()
                    .when(lock.is_some(), |thumb| thumb.opacity(0.42))
                    .child(
                        gpui::img(format!("widgets/{}.svg", kind.name()))
                            .w(px(THUMB_H * 2.0))
                            .h(px(THUMB_H)),
                    ),
            )
            .when_some(lock, |thumb, reason| {
                thumb.child(
                    badge(String::new(), cx)
                        .gap(px(0.0))
                        .child(orbit::icon("lock", 10.0, skin.text2).mr(px(4.0)))
                        .child(text(lock_badge(reason), 10.5, 600, skin.text2, cx)),
                )
            })
            .when(lock.is_none() && placed > 0, |thumb| {
                thumb.child(badge(
                    if placed > 1 {
                        format!("En el diseño ×{placed}")
                    } else {
                        "En el diseño".into()
                    },
                    cx,
                ))
            })
    }

    fn card_title(
        kind: Kind,
        locked: bool,
        preview: Option<&CatalogPreview>,
        cx: &gpui::App,
    ) -> gpui::Div {
        let skin = orbit::skin(cx);
        let lock = locked.then_some(());
        div()
            .flex()
            .items_center()
            .gap(px(6.0))
            .child(widget_icon(
                kind,
                14.0,
                if lock.is_some() {
                    skin.text3
                } else {
                    skin.accent_bright
                },
            ))
            .child(
                text(
                    kind.label(),
                    13.0,
                    600,
                    if lock.is_some() {
                        skin.text3
                    } else {
                        skin.text1
                    },
                    cx,
                )
                .flex_1()
                .min_w_0()
                .whitespace_nowrap()
                .overflow_hidden()
                .text_ellipsis(),
            )
            .when_some(preview.filter(|_| lock.is_none()), |row, preview| {
                row.child(orbit::mono_text(
                    format!("{:.0}×{:.0}", preview.size.0, preview.size.1),
                    11.0,
                    skin.cap,
                    cx,
                ))
            })
    }

    fn catalog_card(&self, kind: Kind, cx: &mut Context<Self>) -> gpui::Stateful<gpui::Div> {
        let skin = orbit::skin(cx).clone();
        let index = ORDER
            .iter()
            .position(|candidate| *candidate == kind)
            .unwrap_or(0);
        let lock = widget_lock(self.access, kind);
        let placed = self
            .editor
            .layout()
            .instances
            .iter()
            .filter(|item| item.settings.kind() == kind)
            .count();
        let preview = self
            .catalog_previews
            .iter()
            .find(|preview| preview.kind == kind);
        let (description, ..) = about(kind);
        let thumb = Self::card_thumb(kind, lock, placed, cx);
        let body = div()
            .px(px(10.0))
            .pt(px(8.0))
            .pb(px(10.0))
            .min_w_0()
            .child(Self::card_title(kind, lock.is_some(), preview, cx))
            .child(
                text(description, 12.0, 400, skin.text3, cx)
                    .mt(px(3.0))
                    .h(px(32.0))
                    .line_height(px(16.0))
                    .line_clamp(2),
            );
        let hover_ring = if lock.is_some() {
            orbit::alpha(skin.line3)
        } else {
            orbit::tint(orbit::carmine(cx), 0.5)
        };
        let card = div()
            .id(("studio-catalog-card", index))
            .role(gpui::Role::ListItem)
            .aria_label(match lock {
                Some(reason) => format!("{} · {reason}", kind.label()),
                None => format!("{} · arrastra al lienzo o pulsa para añadir", kind.label()),
            })
            .tab_index(0)
            .track_focus(&self.catalog_focus[index])
            .min_w_0()
            .flex()
            .flex_col()
            .rounded(px(skin.radius.md))
            .border_1()
            .border_color(orbit::alpha(skin.line1))
            .when(lock.is_none(), |card| card.bg(orbit::ramp(skin.neo, 180.0)))
            .cursor_pointer()
            .hover(move |s| s.border_color(hover_ring))
            .focus_visible(move |s| s.border_color(rgb(skin.accent)))
            .child(thumb)
            .child(body)
            .on_key_down(
                cx.listener(move |this, event, window, cx| this.card_key(kind, event, window, cx)),
            )
            .on_click(
                cx.listener(move |this, _, window, cx| this.add_widget(kind, None, window, cx)),
            );
        if lock.is_some() {
            card
        } else {
            card.on_drag(CatalogDrag(kind), |_, _, _, cx| cx.new(|_| NoDragImage))
        }
    }

    fn group_header(&self, group: &Group, cx: &mut Context<Self>) -> gpui::Div {
        let skin = orbit::skin(cx).clone();
        let empty = self.editor.layout().instances.is_empty();
        let pro = self
            .access
            .is_none_or(|access| access.catalog == vantare_ipc::control::CatalogAccess::Pro);
        let title = match group.kind {
            GroupKind::Suggested if empty => "Para empezar",
            GroupKind::Suggested => "Sugeridos para esta carrera",
            GroupKind::Plan if pro => "Todos los widgets",
            GroupKind::Plan => "En tu plan",
            GroupKind::Locked => locked_title(self.access),
        };
        div()
            .col_span_full()
            .mt(px(10.0))
            .flex()
            .items_center()
            .gap(px(8.0))
            .child(text(title, 12.0, 500, skin.cap, cx))
            .child(text(
                group.kinds.len().to_string(),
                12.0,
                500,
                skin.text3,
                cx,
            ))
            .when(
                group.kind == GroupKind::Locked && sells_pro(self.access),
                |row| {
                    row.child(div().flex_1()).child(
                        div()
                            .id("studio-catalog-plans")
                            .role(gpui::Role::Link)
                            .tab_index(0)
                            .cursor_pointer()
                            .child(text("Ver planes", 12.0, 500, skin.accent_bright, cx))
                            .on_click(cx.listener(|_, _, _, cx| cx.emit(OpenPlans))),
                    )
                },
            )
    }

    /// Sin coincidencias: sugerencias y «Limpiar búsqueda».
    fn no_results(query: &str, cx: &mut Context<Self>) -> gpui::Stateful<gpui::Div> {
        let skin = orbit::skin(cx).clone();
        let shown = query.trim().to_owned();
        div()
            .id("studio-catalog-no-results")
            .role(gpui::Role::Status)
            .col_span_full()
            .flex()
            .flex_col()
            .items_center()
            .gap(px(8.0))
            .py(px(28.0))
            .px(px(16.0))
            .child(
                div()
                    .size(px(44.0))
                    .rounded_full()
                    .flex()
                    .items_center()
                    .justify_center()
                    .bg(rgb(skin.l2))
                    .child(orbit::icon("search", 20.0, skin.text3)),
            )
            .child(
                text(
                    format!("Ningún widget coincide con «{shown}»"),
                    13.5,
                    600,
                    skin.text1,
                    cx,
                )
                .text_center(),
            )
            .child(
                text(
                    "Prueba con «tiempos», «combustible» o «posiciones».",
                    12.5,
                    400,
                    skin.text3,
                    cx,
                )
                .text_center(),
            )
            .child(
                orbit::small_button("studio-catalog-reset", "Limpiar búsqueda", cx).on_click(
                    cx.listener(|this, _, window, cx| {
                        this.catalog_category = 0;
                        this.search.update(cx, |search, cx| {
                            search.set_value(String::new(), cx);
                        });
                        this.search.read(cx).focus_handle().focus(window, cx);
                    }),
                ),
            )
    }

    fn catalog_list(&self, cx: &mut Context<Self>) -> gpui::Stateful<gpui::Div> {
        let skin = orbit::skin(cx).clone();
        let query = self.catalog_query(cx);
        let groups = self.catalog_groups(cx);
        let list = div()
            .id("studio-catalog-list")
            .role(gpui::Role::List)
            .aria_label("Catálogo de widgets")
            .flex_1()
            .min_h_0()
            .overflow_y_scroll()
            .px(px(LIST_PAD))
            .pt(px(4.0))
            .pb(px(16.0));
        let mut grid = div().grid().grid_cols(2).gap(px(CARD_GAP)).content_start();
        if self.editor.layout().instances.is_empty() && query.trim().is_empty() {
            grid = grid.child(
                div()
                    .col_span_full()
                    .px(px(14.0))
                    .py(px(12.0))
                    .rounded(px(skin.radius.md))
                    .border_1()
                    .border_color(orbit::tint(orbit::carmine(cx), 0.22))
                    .bg(linear_gradient(
                        180.0,
                        linear_color_stop(orbit::tint(orbit::carmine(cx), 0.10), 0.0),
                        linear_color_stop(orbit::tint(orbit::carmine(cx), 0.03), 1.0),
                    ))
                    .child(text("Tu diseño está vacío", 13.5, 600, skin.text1, cx).mb(px(2.0)))
                    .child(
                        text(
                            "Empieza por la base de cualquier carrera y añade el resto después.",
                            12.5,
                            400,
                            skin.text2,
                            cx,
                        )
                        .line_height(px(18.0)),
                    ),
            );
        }
        if groups.is_empty() {
            return list.child(grid.child(Self::no_results(&query, cx)));
        }
        for (index, group) in groups.iter().enumerate() {
            grid = grid.child(
                self.group_header(group, cx)
                    .when(index == 0, |header| header.mt(px(2.0))),
            );
            if group.kind == GroupKind::Locked {
                grid = grid.child(
                    text(locked_note(self.access), 12.0, 400, skin.text3, cx)
                        .col_span_full()
                        .mt(px(-4.0))
                        .line_height(px(17.0)),
                );
            }
            for &kind in &group.kinds {
                grid = grid.child(self.catalog_card(kind, cx));
            }
        }
        list.child(grid)
    }

    /// Carril sin selección: cabecera, buscador, categorías, tarjetas y atajos.
    pub(super) fn widget_catalog(&mut self, cx: &mut Context<Self>) -> gpui::Div {
        self.ensure_catalog_previews(cx);
        let skin = orbit::skin(cx).clone();
        let hint = |keys: &[&'static str], label: &'static str, cx: &gpui::App| {
            let mut row = div().flex().items_center().gap(px(2.0));
            for key in keys {
                row = row.child(orbit::keycap(*key, cx));
            }
            row.child(text(label, 11.5, 400, skin.cap, cx).ml(px(2.0)))
        };
        div()
            .relative()
            .h_full()
            .min_h_0()
            .min_w_0()
            .flex()
            .flex_col()
            .child(
                div()
                    .px(px(LIST_PAD))
                    .pt(px(18.0))
                    .pb(px(12.0))
                    .child(orbit::display("Añadir widget", 22.0, skin.text1, cx))
                    .child(
                        text(
                            "Arrastra al lienzo o haz clic para colocarlo en un hueco libre",
                            12.5,
                            400,
                            skin.text3,
                            cx,
                        )
                        .mt(px(4.0))
                        .line_height(px(17.0)),
                    ),
            )
            .child(
                div()
                    .px(px(LIST_PAD))
                    .pb(px(10.0))
                    .flex()
                    .flex_col()
                    .gap(px(10.0))
                    .child(self.search_field(cx))
                    .child(self.category_chips(cx)),
            )
            .child(self.catalog_list(cx))
            .child(
                div()
                    .flex_none()
                    .flex()
                    .flex_wrap()
                    .gap_x(px(14.0))
                    .gap_y(px(4.0))
                    .px(px(LIST_PAD))
                    .pt(px(10.0))
                    .pb(px(14.0))
                    .border_t_1()
                    .border_color(orbit::alpha(skin.line1))
                    .child(hint(&["/"], "buscar", cx))
                    .child(hint(&["↑", "↓", "←", "→"], "moverse", cx))
                    .child(hint(&["Intro"], "añadir", cx))
                    .child(hint(&["Ctrl Z"], "deshacer", cx)),
            )
    }
}

#[cfg(test)]
#[allow(clippy::float_cmp)] // Imán y márgenes devuelven valores exactos por construcción.
mod tests {
    use super::*;

    #[test]
    fn catalog_lists_every_registered_widget_once() {
        assert_eq!(ORDER.len(), Kind::ALL.len());
        assert!(Kind::ALL.iter().all(|kind| ORDER.contains(kind)));
    }

    #[test]
    fn search_matches_name_purpose_and_use_and_suggestions_skip_placed() {
        let found = |query| {
            groups(query, None, |_| false, &[])
                .into_iter()
                .flat_map(|group| group.kinds)
                .collect::<Vec<_>>()
        };
        assert_eq!(found("combustible"), [Kind::FuelStrategy]);
        assert_eq!(found("  RADAR "), [Kind::Radar]);
        assert!(
            found("vuelta rapida").contains(&Kind::FastestLap),
            "sin tildes"
        );
        assert!(found("TELEMETRIA").contains(&Kind::PedalsTelemetry));
        assert!(found("clasificacion").contains(&Kind::Standings));
        assert!(
            found("neumáticos").is_empty(),
            "sin resultados → estado vacío"
        );
        let shown = groups("", None, |_| false, &[Kind::Standings]);
        assert_eq!(shown[0].kind, GroupKind::Suggested);
        assert_eq!(shown[0].kinds, [Kind::Relative, Kind::FuelStrategy]);
        // Con categoría no hay sugeridos; solo los suyos.
        let car = groups("", Some(Category::Car), |_| false, &[]);
        assert_eq!(car.len(), 1);
        assert_eq!(
            car[0].kinds,
            [
                Kind::CarDamageVisual,
                Kind::CarDamageNumbers,
                Kind::FuelStrategy
            ]
        );
    }

    #[test]
    fn arrows_walk_the_two_column_grid_across_groups() {
        let shown = groups(
            "",
            None,
            |kind| kind != Kind::Standings && kind != Kind::Pedals,
            &[],
        );
        let cells = grid(&shown);
        // Sugeridos: Standings, Pedales · bloqueados: el resto, desde la fila siguiente.
        assert_eq!(cells[0], (Kind::Standings, 0, 0));
        assert_eq!(step(&cells, Kind::Standings, "right"), Some(Kind::Pedals));
        assert_eq!(step(&cells, Kind::Pedals, "right"), None);
        assert_eq!(step(&cells, Kind::Pedals, "down"), Some(cells[3].0));
        assert_eq!(
            step(&cells, Kind::Standings, "up"),
            None,
            "arriba vuelve al buscador"
        );
    }

    #[test]
    fn free_spot_avoids_widgets_and_falls_back_to_the_centre() {
        let canvas = (1920.0, 1080.0);
        let (x, y) = free_spot(&[], (300.0, 200.0), canvas);
        assert!(
            (x - 38.4).abs() < 0.01 && (y - 38.4).abs() < 0.01,
            "margen del 2 %"
        );
        let taken = [(38.4, 38.4, 400.0, 1000.0)];
        let (x, y) = free_spot(&taken, (300.0, 200.0), canvas);
        assert!(x >= 38.4 + 400.0 + 12.0 && (y - 38.4).abs() < 0.01);
        let full = [(0.0, 0.0, 1920.0, 1080.0)];
        assert_eq!(free_spot(&full, (300.0, 200.0), canvas), (810.0, 440.0));
    }

    #[test]
    fn snap_pulls_to_centre_and_edges_within_threshold_only() {
        let canvas = (1920.0, 1080.0);
        let size = (200.0, 100.0);
        let near = snap((963.0, 300.0), size, canvas, &[], 7.0);
        assert_eq!(
            near.at.0, 860.0,
            "centro del widget sobre el centro del lienzo"
        );
        assert_eq!(near.guides.0, Some(960.0));
        let other = [(1000.0, 500.0, 300.0, 100.0)];
        let edge = snap((1104.0, 700.0), size, canvas, &other, 7.0);
        assert_eq!(edge.at.0, 1000.0, "borde izquierdo con el de otro widget");
        let free = snap((500.0, 300.0), size, canvas, &[], 7.0);
        assert_eq!(
            free,
            Snap {
                at: (400.0, 250.0),
                guides: (None, None)
            }
        );
        let clamped = snap((-50.0, 2000.0), size, canvas, &[], 7.0);
        assert_eq!(clamped.at, (0.0, 980.0));
    }
}
