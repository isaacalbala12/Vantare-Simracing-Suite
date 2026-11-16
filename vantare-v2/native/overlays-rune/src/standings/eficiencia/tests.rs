use super::{model::*, style::Style, Visual};
use std::sync::Arc;
use vantare_domain::{Snapshot, SourceState, format::Preferences, standings, widget_settings::{columns::ColumnSetting, standings::Settings}};
fn photo() -> Snapshot {
    vantare_ipc::snapshot_from_json(include_str!("../../../../ui/fixtures/standings.snapshot.json")).expect("fixture GPUI Eficiencia DTO v11")
}
fn content() -> ContentPlan {
    ContentPlan::new(Arc::new(standings::project(&photo(), Preferences::default())), String::new(), 0)
}
fn column(metric: Metric, preset: Preset) -> Column {
    Column { metric, preset, align: None, name_mode: NameMode::Full, max_chars: 16 }
}
#[test]
fn gpui_signature_reference_widths_heights_and_integrated_header() {
    let mut c = Config::reference(); c.fit(10);
    assert_eq!((c.width,c.height),(440.0,364.0));
    let p = plan(&c,&content());
    assert_eq!(p.widths,[30.0,30.0,200.0,92.0,88.0]);
    assert_eq!(p.identity_span,3); assert!(!p.external_header);
    assert_eq!((p.head_row,p.table_top,p.visible_rows),(43.0,0.0,10));
    assert_eq!(p.row_tops, [0.0,30.0,60.0,90.0,120.0,150.0,180.0,210.0,240.0,270.0]);
}
#[test]
fn gpui_column_minima_presets_and_driver_name_branches_are_literal() {
    for (metric,minimum) in [(Metric::Position,30.0),(Metric::DriverNumber,30.0),(Metric::Gap,86.0),(Metric::Interval,76.0),(Metric::LastLap,76.0),(Metric::BestLap,76.0),(Metric::Pit,32.0),(Metric::CurrentLap,48.0),(Metric::VehicleClass,54.0)] {
        for (preset,extra) in [(Preset::Xs,0.0),(Preset::Sm,0.0),(Preset::Md,6.0),(Preset::Lg,12.0),(Preset::Auto,0.0)] { assert_eq!(column_width(&column(metric,preset)),minimum+extra); }
    }
    for (mode,plain,broadcast) in [(NameMode::Full,188.0,208.0),(NameMode::Initial,140.0,160.0),(NameMode::Surname,124.0,144.0),(NameMode::Truncate,158.0,158.0)] {
        let mut c=column(Metric::DriverName,Preset::Auto);c.name_mode=mode;
        assert_eq!(column_width_for(&c,false),plain);assert_eq!(column_width_for(&c,true),broadcast);
        if mode==NameMode::Truncate { c.max_chars=1; assert_eq!(column_width(&c),96.0);c.max_chars=128;assert_eq!(column_width(&c),188.0); }
    }
    assert_eq!(identity_span(&[column(Metric::DriverName,Preset::Lg)]),0);
    assert_eq!(identity_span(&[column(Metric::VehicleClass,Preset::Xs),column(Metric::DriverName,Preset::Xs)]),2);
}
#[test]
fn gpui_broadcast_hidden_header_brand_and_footer_reservations() {
    let mut c=Config::reference();c.broadcast=true;c.fit(10);
    assert_eq!((c.width,c.height),(460.0,392.0)); let p=plan(&c,&content());
    assert!(p.external_header); assert_eq!((p.loose_header,p.head_row,p.table_header),(46.0,24.0,24.0));
    c.broadcast=false;c.show_session_header=false;c.brand_visible=Some(true);c.fit(10);
    assert_eq!(c.height,372.0);let p=plan(&c,&content());assert_eq!((p.brand_band,p.table_top,p.head_row),(22.0,22.0,28.0));
    c.show_session_footer=false;c.fit(10); assert_eq!(c.height,350.0);assert_eq!(c.footer_height(),0.0);
    c.show_session_footer=true;c.footer_slots=vec!["track".into()];c.footer_rows=2;assert_eq!(c.footer_height(),43.0);
}
#[test]
fn gpui_settings_column_contract_and_default_last_lap_match_the_real_config() {
    let settings=Settings { row_count:10, ..Settings::eficiencia() };
    let c=Config::from_settings(&settings);
    assert_eq!(c.row_count,10);assert!(c.columns.iter().any(|c|c.metric==Metric::LastLap));assert!(!c.columns.iter().any(|c|matches!(c.metric,Metric::Pit|Metric::BestLap)));
    let mut settings=settings;
    settings.columns=Some(vec![ColumnSetting { metric_id:"carNumber".into(),width_preset:"lg".into(),..ColumnSetting::default() },ColumnSetting { metric_id:"currentLap".into(),..ColumnSetting::default() },ColumnSetting { metric_id:"unknown".into(),..ColumnSetting::default() },ColumnSetting { metric_id:"gap".into(),enabled:false,..ColumnSetting::default() }]);
    let c=Config::from_settings(&settings);assert_eq!(c.columns.len(),2);assert_eq!(c.columns[0].metric,Metric::DriverNumber);assert_eq!(c.columns[0].preset,Preset::Lg);assert_eq!(c.columns[1].metric,Metric::CurrentLap);
}
#[test]
fn gpui_pit_rail_only_adds_thirty_four_pixels_when_enabled() {
    let settings=Settings { row_count:10, ..Settings::eficiencia() };
    let mut v=Visual::new(&settings);
    assert_eq!(v.size(),(440.0,364.0));
    let c=Arc::make_mut(&mut v.config);c.columns.push(column(Metric::Pit,Preset::Auto));c.fit(10);
    v.plan=Arc::new(plan(&v.config,&content()));
    assert_eq!(v.size(),(474.0,364.0));
    let style=Style::compiled();assert_eq!(style.geometry.pit_rail_width,34.0);assert_eq!(style.geometry.pit_badge_height,26.0);assert_eq!(style.geometry.pit_radius,3.0);assert_eq!(style.geometry.pit_glow_blur*2.0,8.0);assert_eq!(style.opacity.pit_glow,0.22);
}
#[test]
fn gpui_multiclass_bands_reserve_unique_classes_and_keep_literal_row_tops() {
    let mut next=content();let all=next.rows.clone();
    next.rows=["hypercar","lmp2","gte"].iter().flat_map(|class|all.iter().filter(move|r|r.class.as_ref()==*class).take(2).cloned()).collect();
    assert_eq!(next.rows.len(),6);
    let settings=Settings { row_count:6,classification_mode:"multiclass".into(),..Settings::eficiencia() };
    let mut v=Visual::new(&settings);assert!(v.ingest(Arc::new(next)));
    assert_eq!(v.size(),(440.0,328.0));assert_eq!(v.plan.visible_rows,6);
    assert_eq!(v.plan.row_tops,[28.0,58.0,116.0,146.0,204.0,234.0]);
    assert_eq!(v.plan.class_bands,[(0.0,"hypercar".into()),(88.0,"lmp2".into()),(176.0,"gte".into())]);
}
#[test]
fn gpui_unavailable_stale_metadata_and_reserved_rows_keep_the_geometry() {
    let mut v=Visual::new(&Settings { row_count:10,..Settings::eficiencia() });
    let first=Arc::new(content());assert!(v.ingest(first.clone()));let identity=Arc::as_ptr(&v.plan);
    let mut next=(*first).clone();next.sequence=999;assert!(!v.ingest(Arc::new(next)));assert_eq!(identity,Arc::as_ptr(&v.plan));
    for source in [SourceState::Waiting,SourceState::Stale,SourceState::Lost] {
        let mut photo=photo();photo.state.source_state=source;
        let next=ContentPlan::new(Arc::new(standings::project(&photo,Preferences::default())),String::new(),0);
        let expected=if source==SourceState::Stale { Status::Stale } else { Status::Disconnected };
        assert_eq!(next.status,expected);v.ingest(Arc::new(next));assert_eq!(v.size(),(440.0,364.0));
        assert_eq!(v.plan.external_header,source!=SourceState::Stale);
    }
}
#[test]
fn gpui_spanish_and_english_labels_are_not_rephrased() {
    for (language,gap,lap,best,track) in [(vantare_domain::format::Language::Es,"AL LÍDER","VUELTA","MEJOR V.","PISTA"),(vantare_domain::format::Language::En,"TO LEADER","LAP","BEST LAP","TRACK")] {
        let l=labels(language);assert_eq!(l.metric(Metric::Gap,false),gap);assert_eq!(l.metric(Metric::CurrentLap,false),lap);assert_eq!(l.metric(Metric::BestLap,false),best);assert_eq!(l.info(InfoMetric::Track),track);
    }
}
