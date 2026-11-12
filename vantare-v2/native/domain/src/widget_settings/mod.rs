//! Pure persisted settings used by widgets and document editors.
pub const TABLE_SIZES: &[&str] = &[TABLE_SIZE_COMPACT, TABLE_SIZE_STANDARD, TABLE_SIZE_EXPANDED];
pub const FOOTER_KEYS: &[&str] = &[
    FOOTER_TIME,
    FOOTER_LAP,
    FOOTER_POSITION,
    FOOTER_GAP,
    FOOTER_BEST_LAP,
    FOOTER_LAST_LAP,
    FOOTER_TRACK,
    FOOTER_AMBIENT,
    FOOTER_WIND,
];
pub const FOOTER_ITEMS_MAX: usize = 9;
pub const TABLE_SIZE_COMPACT: &str = "compact";
pub const TABLE_SIZE_STANDARD: &str = "standard";
pub const TABLE_SIZE_EXPANDED: &str = "expanded";
pub const FOOTER_TIME: &str = "time";
pub const FOOTER_LAP: &str = "lap";
pub const FOOTER_POSITION: &str = "position";
pub const FOOTER_GAP: &str = "gap";
pub const FOOTER_BEST_LAP: &str = "bestLap";
pub const FOOTER_LAST_LAP: &str = "lastLap";
pub const FOOTER_TRACK: &str = "track";
pub const FOOTER_AMBIENT: &str = "ambient";
pub const FOOTER_WIND: &str = "wind";
pub mod columns;
pub mod delta;
pub mod fuel_strategy;
pub mod look;
pub mod pedals;
pub mod relative;
pub mod standings;
