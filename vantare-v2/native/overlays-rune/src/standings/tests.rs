use super::layout::*;
use crate::vantare::Style;
use vantare_domain::{format::{Language, Preferences}, widget_settings::standings::{Settings, vantare_template}};
fn options(name: &str) -> Options {
    Options::from_settings(&Settings { columns: Some(vantare_template(name)), row_count: 8, ..Settings::default() })
}
fn photos() -> Vec<vantare_domain::Snapshot> {
    // Byte ranges of the unmodified GPUI catalogue snapshots (DTO validation below).
    let source = include_str!("../../../ui/fixtures/standings-vantare.scene.json");
    RANGES.iter().map(|&(a,b)| vantare_ipc::snapshot_from_json(&source[a..b]).expect("fixture GPUI DTO v11")).collect()
}
const RANGES: &[(usize,usize)] = &[(305, 29385), (29463, 58544), (58613, 87717), (87783, 116863), (116922, 146001), (146079, 175162), (175235, 203008)];
#[test]
fn gpui_catalogue_widths_and_fixed_height() {
    let style = Style::compiled();
    for (name, expected) in [("compact",340.0),("standard",520.0),("expanded",900.0)] {
        for mode in [Mode::PlayerClass, Mode::AllClasses, Mode::Multiclass] {
            let mut o=options(name); o.mode=mode;
            let empty=plan(None,&o,&style);
            assert_eq!(empty.width,expected);
            for photo in photos() {
                let board=vantare_domain::standings::project(&photo,Preferences::default());
                let p=plan(Some(&board),&o,&style);
                assert_eq!((p.width,p.height),(empty.width,empty.height));
                assert!(p.content <= p.height);
            }
        }
    }
}
#[test]
fn gpui_catalogue_rows_and_cells_in_both_languages() {
    for language in [Language::Es,Language::En] {
        let board=vantare_domain::standings::project(&photos()[0],Preferences {language,..Preferences::default()});
        let o=options("expanded");
        assert_eq!(rows(&board,&o),(0..7).map(|r|(0,r)).collect::<Vec<_>>());
        let p=plan(Some(&board),&o,&Style::compiled());
        assert_eq!(p.gaps[0][2],"+3.802");
        assert_eq!(driver_text(&board.groups[0].rows[0],&o),"Lotterer");
        assert_eq!(vehicle_detail(&board.groups[0].rows[2],&o.cols)," · Ferrari 499P");
        assert_eq!(header_clock("8:42"),"08:42");
        let mut all=o.clone(); all.mode=Mode::AllClasses;
        assert_eq!(rows(&board,&all),[(0,0),(0,1),(0,2),(0,3),(0,4),(0,5),(0,6),(1,0)]);
        let mut tail=board.clone();
        for group in &mut tail.groups {for row in &mut group.rows {std::sync::Arc::make_mut(row).is_player=false;}}
        std::sync::Arc::make_mut(&mut tail.groups[2].rows[3]).is_player=true;
        assert_eq!(rows(&tail,&all),[(0,0),(0,1),(0,2),(0,3),(0,4),(2,2),(2,3),(2,4)]);
    }
}
