use super::*;
use serde_json::json;
use std::path::PathBuf;

struct Root(PathBuf);
impl Root {
    fn new() -> Self {
        let base = std::env::var_os("VANTARE_HUB_QA_ROOT")
            .map_or_else(std::env::temp_dir, PathBuf::from);
        std::fs::create_dir_all(&base).unwrap();
        let path = base.join(format!("calendar-history-{}", vantare_services::random_id().unwrap()));
        std::fs::create_dir(&path).unwrap();
        Self(path)
    }
    fn state(&self) -> State { State::new(self.0.clone()) }
    fn seed(&self, bytes: &[u8]) { std::fs::write(self.0.join("calendar-history.json"), bytes).unwrap(); }
}
impl Drop for Root {
    fn drop(&mut self) { let _ = std::fs::remove_dir_all(&self.0); }
}
fn sample() -> serde_json::Value {
    json!({"weeks":[{"from":1791244800i64,"until":1791849600i64,"seenAt":1791187200i64,"tracks":[{"seriesId":"weekly-wec-weekly","name":"WEC Weekly","track":"Sebring"}]}]})
}

#[test]
fn history_load_does_not_create_or_rewrite_gpui_documents() {
    let root=Root::new();
    assert_eq!(root.state().history(), CalendarHistoryView::default());
    assert!(!root.0.join("calendar-history.json").exists());
    let mut value=sample();
    value["future"]=json!({"preserve":true});
    value["weeks"][0]["tracks"][0]["future"]=json!(1);
    let bytes=serde_json::to_vec_pretty(&value).unwrap();
    root.seed(&bytes);
    let view=root.state().history();
    assert!(!view.invalid_cache);
    assert_eq!(view.weeks[0].tracks[0].track,"Sebring");
    assert_eq!(std::fs::read(root.0.join("calendar-history.json")).unwrap(),bytes);
    assert!(serde_json::to_vec(&view).unwrap().len()<=DOCUMENT_LIMIT);
}

#[test]
fn invalid_history_is_visible_and_preserved_then_recoverable() {
    let root=Root::new();
    for bytes in [b"{broken".to_vec(),vec![b' ';DOCUMENT_LIMIT+1]] {
        root.seed(&bytes);
        assert!(root.state().history().invalid_cache);
        assert_eq!(std::fs::read(root.0.join("calendar-history.json")).unwrap(),bytes);
    }
    root.seed(&serde_json::to_vec(&sample()).unwrap());
    assert!(!root.state().history().invalid_cache);
}

#[test]
fn history_rejects_invalid_limits_identifiers_and_dates_without_partial_projection() {
    let source=sample();
    let mut cases=vec![];
    let mut value=source.clone(); value["weeks"]=json!(vec![source["weeks"][0].clone();HISTORY_WEEKS_LIMIT+1]); cases.push(value);
    let mut value=source.clone(); value["weeks"][0]["tracks"]=json!(vec![source["weeks"][0]["tracks"][0].clone();SERIES_LIMIT+1]); cases.push(value);
    for (key,bad) in [("from",json!(-1)),("until",json!(0)),("seenAt",json!(TIMESTAMP_LIMIT+1))] {
        let mut value=source.clone(); value["weeks"][0][key]=bad; cases.push(value);
    }
    for bad in [" ".to_owned(),"\u{feff}".to_owned(),"x".repeat(TEXT_LIMIT+1),"bad\0id".to_owned()] {
        let mut value=source.clone(); value["weeks"][0]["tracks"][0]["seriesId"]=json!(bad); cases.push(value);
    }
    let mut value=source.clone(); value["weeks"]=json!([source["weeks"][0].clone(),source["weeks"][0].clone()]); cases.push(value);
    let mut value=source.clone(); value["weeks"][0]["tracks"]=json!([source["weeks"][0]["tracks"][0].clone(),source["weeks"][0]["tracks"][0].clone()]); cases.push(value);
    for value in cases { assert!(parse(&serde_json::to_vec(&value).unwrap()).is_none()); }
}

#[cfg(windows)]
#[test]
fn history_rejects_a_symbolic_link_without_reading_its_target() {
    let root=Root::new();
    let target=root.0.join("target.json");
    std::fs::write(&target,serde_json::to_vec(&sample()).unwrap()).unwrap();
    if let Err(error)=std::os::windows::fs::symlink_file(&target,root.0.join("calendar-history.json")) {
        eprintln!("QA symlink test skipped: privilege unavailable ({:?})",error.kind());
        return;
    }
    assert!(root.state().history().invalid_cache);
    assert!(target.exists());
}
