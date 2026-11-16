use super::layout::*;
use crate::vantare::Style;
use vantare_domain::{
    format::{Language, Preferences},
    widget_settings::standings::{Settings, vantare_template},
};
fn options(name: &str) -> Options {
    Options::from_settings(&Settings {
        columns: Some(vantare_template(name)),
        row_count: 8,
        ..Settings::default()
    })
}
fn photos() -> Vec<vantare_domain::Snapshot> {
    // Byte ranges of the unmodified GPUI catalogue snapshots (DTO validation below).
    let source =
        include_str!("../../../ui/fixtures/standings-vantare.scene.json").replace("\r\n", "\n");
    RANGES
        .iter()
        .map(|&(a, b)| {
            vantare_ipc::snapshot_from_json(&source[a..b]).expect("fixture GPUI DTO v11")
        })
        .collect()
}
const RANGES: &[(usize, usize)] = &[
    (305, 29385),
    (29463, 58544),
    (58613, 87717),
    (87783, 116863),
    (116922, 146001),
    (146079, 175162),
    (175235, 203008),
];
#[test]
fn gpui_catalogue_widths_and_fixed_height() {
    let style = Style::compiled();
    for (name, expected) in [("compact", 340.0), ("standard", 520.0), ("expanded", 900.0)] {
        for mode in [Mode::PlayerClass, Mode::AllClasses, Mode::Multiclass] {
            let mut o = options(name);
            o.mode = mode;
            let empty = plan(None, &o, &style);
            assert_eq!(empty.width, expected);
            for photo in photos() {
                let board = vantare_domain::standings::project(&photo, Preferences::default());
                let p = plan(Some(&board), &o, &style);
                assert_eq!((p.width, p.height), (empty.width, empty.height));
                assert!(p.content <= p.height);
            }
        }
    }
}
#[test]
fn gpui_catalogue_rows_and_cells_in_both_languages() {
    for language in [Language::Es, Language::En] {
        let board = vantare_domain::standings::project(
            &photos()[0],
            Preferences {
                language,
                ..Preferences::default()
            },
        );
        let o = options("expanded");
        assert_eq!(rows(&board, &o), (0..7).map(|r| (0, r)).collect::<Vec<_>>());
        let p = plan(Some(&board), &o, &Style::compiled());
        assert_eq!(p.gaps[0][2], "+3.802");
        assert_eq!(driver_text(&board.groups[0].rows[0], &o), "A. Lotterer");
        assert_eq!(
            vehicle_detail(&board.groups[0].rows[2], &o.cols),
            " · Ferrari 499P"
        );
        assert_eq!(header_clock("8:42"), "08:42");
        let mut all = o.clone();
        all.mode = Mode::AllClasses;
        assert_eq!(
            rows(&board, &all),
            [
                (0, 0),
                (0, 1),
                (0, 2),
                (0, 3),
                (0, 4),
                (0, 5),
                (0, 6),
                (1, 0)
            ]
        );
        let mut tail = board.clone();
        for group in &mut tail.groups {
            for row in &mut group.rows {
                std::sync::Arc::make_mut(row).is_player = false;
            }
        }
        std::sync::Arc::make_mut(&mut tail.groups[2].rows[3]).is_player = true;
        assert_eq!(
            rows(&tail, &all),
            [
                (0, 0),
                (0, 1),
                (0, 2),
                (0, 3),
                (0, 4),
                (2, 2),
                (2, 3),
                (2, 4)
            ]
        );
    }
}

#[test]
fn gpui_column_boxes_keep_position_gap_dot_and_numeric_sector_widths() {
    let style = Style::compiled();
    let compact = options("compact");
    let (columns, width) = compact.layout(&style, compact.driver_max(&style));
    assert_eq!(width, 340.0);
    assert_eq!(
        columns
            .iter()
            .map(|p| (p.kind, p.x, p.width))
            .collect::<Vec<_>>(),
        [
            (Kind::Number, 40.0, 51.0),
            (Kind::Driver, 101.0, 155.0),
            (Kind::Gap, 266.0, 62.0)
        ]
    );
    assert_eq!(options("standard").driver_max(&style), 343.0);
    let mut qualifying = options("expanded");
    qualifying
        .cols
        .order
        .retain(|k| !matches!(k, Kind::Gained | Kind::Last));
    assert!(qualifying.numeric_sectors());
    let (columns, width) = qualifying.layout(&style, qualifying.driver_max(&style));
    assert_eq!(width, 900.0);
    assert_eq!(
        columns
            .iter()
            .find(|c| c.kind == Kind::Sectors)
            .unwrap()
            .width,
        206.0
    );
    let mut standard = options("standard");
    standard.cols.order = vec![Kind::Driver, Kind::Pit, Kind::Best, Kind::Gap];
    let (columns, width) = standard.layout(&style, standard.driver_max(&style));
    assert_eq!(width, 520.0);
    assert_eq!(
        columns.iter().find(|c| c.kind == Kind::Pit).unwrap().width,
        56.0
    );
    standard.cols.order.retain(|k| *k != Kind::Pit);
    assert!(standard.layout(&style, standard.driver_max(&style)).1 <= 520.0);
}
#[test]
fn gpui_fixed_box_and_contextual_item_positions() {
    let style = Style::compiled();
    for (name, height) in [("compact", 289.0), ("standard", 289.0), ("expanded", 307.0)] {
        let mut o = options(name);
        assert_eq!(fixed_height(&o, &style), height);
        o.mode = Mode::Multiclass;
        assert_eq!(fixed_height(&o, &style), height + 90.0);
    }
    let o = options("standard");
    for (index, photo) in photos().iter().enumerate() {
        let b = vantare_domain::standings::project(photo, Preferences::default());
        let p = plan(Some(&b), &o, &style);
        let header = p.items.iter().find(|(_, i)| *i == Item::Header).unwrap().0;
        assert_eq!(header, if (1..=3).contains(&index) { 31.0 } else { 11.0 });
        if index == 1 {
            assert!(p.items.contains(&(227.0, Item::Footer(Footer::Frozen))));
        }
        if index == 4 {
            assert!(p.items.contains(&(207.0, Item::Footer(Footer::Pits))));
        }
        if index == 5 {
            assert_eq!(
                p.items
                    .iter()
                    .filter(|(_, i)| matches!(i, Item::Skeleton(_)))
                    .count(),
                5
            );
        }
        if index == 6 {
            assert!(
                p.items
                    .iter()
                    .any(|(_, i)| *i == Item::Footer(Footer::Spectator))
            );
        }
    }
}
#[test]
fn gpui_qualifying_labels_and_clock_formats() {
    use vantare_domain::{Quality, SessionKind};
    for language in [Language::Es, Language::En] {
        let mut photo = photos().remove(0);
        photo.state.session.kind = Quality::Reliable(SessionKind::Qualifying);
        let b = vantare_domain::standings::project(
            &photo,
            Preferences {
                language,
                ..Preferences::default()
            },
        );
        let p = plan(Some(&b), &options("expanded"), &Style::compiled());
        assert_eq!(p.gaps[0][0], "Pole");
        assert_eq!(p.sector_times[0][0], ["1:10.200", "1:08.000", "1:09.000"]);
        assert_eq!(header_clock("0:05"), "00:05");
        assert_eq!(header_clock("1:08:42"), "1:08:42");
        let mut row = (*b.groups[0].rows[0]).clone();
        row.classification_gap_s = Some(0.265);
        assert_eq!(gap_text(&b, &row), "+0.265");
        row.classification_gap_s = None;
        assert_eq!(gap_text(&b, &row), "—");
    }
}
