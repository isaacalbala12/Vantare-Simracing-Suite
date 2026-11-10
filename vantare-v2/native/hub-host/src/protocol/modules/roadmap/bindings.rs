use std::fmt::Write as _;
// Bindings and Rust-serialized examples owned by this screen.
use crate::protocol::bindings::*;
use crate::protocol::*;
pub(crate) fn typescript() -> String {
    let mut text = String::new();
    declare::<crate::roadmap::RoadmapItem>(&mut text);
    declare::<crate::roadmap::RoadmapPublication>(&mut text);
    declare::<crate::roadmap::RoadmapView>(&mut text);
    declare_named::<super::Request>(&mut text, "RoadmapRequest");
    declare_named::<super::Reply>(&mut text, "RoadmapReply");

    append_roadmap_constants(&mut text);
    text
}
pub(crate) fn corpus() -> serde_json::Value {
    let mut host = Vec::<HostToUi>::new();
    let mut ui = Vec::<UiToHost>::new();
    ui.push(UiToHost::Request {
        id: 1,
        request: Request::RoadmapCached {},
    });
    ui.push(UiToHost::Request {
        id: 1,
        request: Request::RoadmapRefresh {},
    });
    host.extend(roadmap_reply_samples().into_iter().map(sample_response));
    serde_json::json!({"host":host,"ui":ui})
}
pub(crate) fn roadmap_reply_samples() -> [Reply; 2] {
    [
        Reply::RoadmapCached {
            value: crate::roadmap::RoadmapView {
                publication: None,
                stale: true,
            },
        },
        Reply::RoadmapRefresh {
            value: crate::roadmap::project(
                Some(
                    serde_json::from_str(include_str!(concat!(
                        env!("CARGO_MANIFEST_DIR"),
                        "/../../hub-web/fixtures/roadmap-publication.json"
                    )))
                    .expect("fixture"),
                ),
                false,
            )
            .expect("publication"),
        },
    ]
}
pub(crate) fn append_roadmap_constants(text: &mut String) {
    for (name, value) in [
        ("roadmapRefreshMs", crate::roadmap::REFRESH_MS.to_string()),
        ("roadmapMaxItems", crate::roadmap::MAX_ITEMS.to_string()),
        (
            "roadmapMaxDocumentBytes",
            crate::roadmap::MAX_DOCUMENT_BYTES.to_string(),
        ),
    ] {
        writeln!(text, "export const {name} = {value} as const;").expect("String write");
    }
}
