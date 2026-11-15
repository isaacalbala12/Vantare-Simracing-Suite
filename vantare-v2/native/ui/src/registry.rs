// Una línea por widget; la macro solo genera módulos y despacho de enums.
// Cada módulo define `Widget::{new, size, ingest, frame, animating}`.
macro_rules! widgets {
    ($($kind:ident => $module:ident: $name:literal),+ $(,)?) => {
        $(pub mod $module;)+

        pub(crate) enum Widget { $($kind(Box<$module::Widget>)),+ }

        impl Widget {
            pub(crate) fn new(settings: &Settings, prefs: vantare_domain::format::Preferences) -> Self {
                match settings { $(Settings::$kind(settings) => Self::$kind(Box::new($module::Widget::new(settings, prefs)))),+ }
            }

            #[cfg(feature = "paint-stats")]
            pub(crate) fn kind(&self) -> Kind {
                match self { $(Self::$kind(_) => Kind::$kind),+ }
            }

            pub(crate) fn size(&self) -> (f32, f32) {
                match self { $(Self::$kind(widget) => widget.size()),+ }
            }

            pub(crate) fn ingest(&mut self, snapshot: &vantare_domain::Snapshot, prefs: vantare_domain::format::Preferences) -> bool {
                match self { $(Self::$kind(widget) => widget.ingest(snapshot, prefs)),+ }
            }

            pub(crate) fn frame(&mut self, prefs: vantare_domain::format::Preferences, reduced: bool) -> (crate::app::Paint, crate::app::Wake) {
                match self { $(Self::$kind(widget) => widget.frame(prefs, reduced)),+ }
            }

            #[cfg(feature = "parity-capture")]
            pub(crate) fn animating(&self) -> bool {
                match self { $(Self::$kind(widget) => widget.animating()),+ }
            }
        }
    }
}

vantare_domain::widget_catalog!(widgets);
