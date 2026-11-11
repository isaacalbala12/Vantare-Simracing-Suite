use crate::protocol::bindings::{constants, declare, sample_response};
use crate::protocol::{Reply, Request, UiToHost};
pub(crate) fn typescript() -> String {
    let mut text = String::new();
    declare::<crate::calendar::CalendarRecurrence>(&mut text);
    declare::<crate::calendar::CalendarPhase>(&mut text);
    declare::<crate::calendar::CalendarClass>(&mut text);
    declare::<crate::calendar::CalendarSeries>(&mut text);
    declare::<crate::calendar::CalendarSchedule>(&mut text);
    declare::<crate::calendar::CalendarView>(&mut text);

    constants!(
        &mut text,
        "calendarDocumentLimit",
        crate::calendar::DOCUMENT_LIMIT
    );
    constants!(
        &mut text,
        "calendarSeriesLimit",
        crate::calendar::SERIES_LIMIT
    );
    constants!(
        &mut text,
        "calendarStartsLimit",
        crate::calendar::STARTS_LIMIT
    );
    constants!(&mut text, "calendarDateLimit", crate::calendar::DATE_LIMIT);
    constants!(&mut text, "calendarTextLimit", crate::calendar::TEXT_LIMIT);
    constants!(&mut text, "calendarListLimit", crate::calendar::LIST_LIMIT);
    constants!(
        &mut text,
        "calendarMinuteLimit",
        crate::calendar::MINUTE_LIMIT
    );
    constants!(
        &mut text,
        "calendarTimestampLimit",
        crate::calendar::TIMESTAMP_LIMIT
    );
    constants!(&mut text, "calendarWeekdays", crate::calendar::WEEKDAYS);
    text
}
pub(crate) fn corpus() -> serde_json::Value {
    let host = vec![
        sample_response(Reply::CalendarLoad {
            value: Box::default(),
        }),
        sample_response(Reply::CalendarRefresh {
            value: Box::new(crate::calendar::CalendarView {
                official: Some(
                    crate::calendar::CalendarSchedule::parse(include_bytes!(concat!(
                        env!("CARGO_MANIFEST_DIR"),
                        "/../hub/reference/fixtures/calendar-lmu-2026-10-06.json"
                    )))
                    .expect("public QA schedule"),
                ),
                ..Default::default()
            }),
        }),
    ];
    let ui = vec![
        UiToHost::Request {
            id: 1,
            request: Request::CalendarLoad {},
        },
        UiToHost::Request {
            id: 1,
            request: Request::CalendarRefresh {},
        },
    ];
    serde_json::json!({"host":host,"ui":ui})
}
