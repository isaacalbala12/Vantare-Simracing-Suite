use super::*;
#[test]
fn every_close_reason_pair_only_advances_and_never_repeats_a_forced_close() {
    use protocol::CloseReason::{ControlEof, Live, Restart, Window};
    let reasons = [Window, Restart, Live, ControlEof];
    // Columns: Window, Restart, Live, EOF; rows are the pending reason.
    let advances = [
        [false, true, true, true],
        [false, false, true, true],
        [false, false, false, false],
        [false, false, false, false],
    ];
    for (row, previous) in reasons.iter().copied().enumerate() {
        for (column, next) in reasons.iter().copied().enumerate() {
            let fixture = Fixture::new();
            let mut session = fixture.session();
            let started = Instant::now();
            session.closing = Some((previous, started));
            let mut pipe = Pipe::new(Vec::new());
            session.request_close(&mut pipe, next).unwrap();
            let expected = advances[row][column];
            assert_eq!(
                session_effects::close_can_advance(Some(previous), next),
                expected,
                "{previous:?} -> {next:?}"
            );
            if expected {
                pipe.set_position(0);
                let message: HostToUi = frame::Reader::default().next(&mut pipe).unwrap().unwrap();
                assert_eq!(message, HostToUi::CloseRequested { reason: next });
                assert_eq!(session.closing.map(|(reason, _)| reason), Some(next));
            } else {
                assert!(pipe.get_ref().is_empty(), "{previous:?} -> {next:?}");
                assert_eq!(session.closing, Some((previous, started)));
            }
            let before = session.closing;
            let length = pipe.get_ref().len();
            session.request_close(&mut pipe, next).unwrap();
            assert_eq!(
                session.closing, before,
                "a repeated request cannot reset the deadline"
            );
            assert_eq!(
                pipe.get_ref().len(),
                length,
                "a repeated request cannot send another event"
            );
        }
    }
    for next in reasons {
        assert!(session_effects::close_can_advance(None, next));
    }
}
