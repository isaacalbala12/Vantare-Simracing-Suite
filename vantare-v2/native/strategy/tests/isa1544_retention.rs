use std::sync::atomic::AtomicBool;
use vantare_strategy::{application, solver::Input};

// Run with VANTARE_STRATEGY_TRACE=1 and --nocapture to record actual retained
// states/items. Lack of a timed-race limit alone does not establish this P2.
#[test]
fn isa1544_lap_races_stop_at_retained_history_budget() {
    for laps in [240, 960] {
        let mut input: Input =
            serde_json::from_str(include_str!("../testdata/fuji-1450-input.json"))
                .expect("frozen input");
        input.extra.remove("raceDurationSeconds");
        input.race_laps = laps;
        input.budget.p95_millis = 20_000;
        input.budget.max_candidates = 100_000_000;
        input.budget.max_iterations = 1_000_000_000;
        let prepared = application::prepare_manual(input).expect("accepted lap race");
        eprintln!("#1544 lap race: {laps}");
        let outcome = application::calculate(
            &prepared,
            application::SourceStatus::Open,
            &AtomicBool::new(false),
        )
        .expect("bounded search");
        eprintln!("#1544 termination: {:?}", outcome.certificate.reason);
        assert_eq!(
            outcome.certificate.reason.as_deref(),
            Some("frontier_memory_budget_exhausted")
        );
        assert_eq!(
            outcome.certificate.status,
            vantare_strategy::solver::OptimalityStatus::NotProven
        );
        assert!(
            !outcome
                .certificate
                .proof
                .as_ref()
                .expect("proof")
                .search_completed
        );
        if let Some(decision) = &outcome.result.best {
            assert!(
                vantare_strategy::solver::replay_decision_v2(prepared.input(), decision)
                    .expect("replay retained incumbent")
                    .feasible
            );
        }
    }
}
