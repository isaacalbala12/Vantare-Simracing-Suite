// Una línea por widget; la macro solo genera módulos y despacho de enums.
// Cada módulo define `Widget::{new, size, ingest, frame, animating}`.
macro_rules! widgets {
    ($($kind:ident => $module:ident: $name:literal),+ $(,)?) => {
        $(pub mod $module;)+

        #[derive(Clone, Copy, Debug, PartialEq, Eq)]
        pub enum Kind { $($kind),+ }

        impl Kind {
            pub const ALL: &'static [Self] = &[$(Self::$kind),+];

            pub fn name(self) -> &'static str {
                match self { $(Self::$kind => $name),+ }
            }
        }

        impl std::str::FromStr for Kind {
            type Err = ();

            fn from_str(name: &str) -> Result<Self, Self::Err> {
                match name { $($name => Ok(Self::$kind)),+, _ => Err(()) }
            }
        }

        pub(crate) enum Widget { $($kind(Box<$module::Widget>)),+ }

        impl Widget {
            pub(crate) fn new(kind: Kind, prefs: vantare_domain::format::Preferences) -> Self {
                match kind { $(Kind::$kind => Self::$kind(Box::new($module::Widget::new(prefs)))),+ }
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

            pub(crate) fn frame(&mut self, prefs: vantare_domain::format::Preferences) -> (crate::app::Paint, crate::app::Wake) {
                match self { $(Self::$kind(widget) => widget.frame(prefs)),+ }
            }

            #[cfg(feature = "parity-capture")]
            pub(crate) fn animating(&self) -> bool {
                match self { $(Self::$kind(widget) => widget.animating()),+ }
            }
        }
    }
}

widgets! {
    Standings => standings: "standings",
    Radar => radar: "radar",
    Pedals => pedals: "pedals",
}
