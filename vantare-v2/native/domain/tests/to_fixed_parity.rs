//! Frozen JavaScript text parity through the widget projection interfaces.
use vantare_domain::{Player, Quality, Snapshot, SourceState, delta, delta_trace, format};

#[test]
fn delta_projections_match_node_at_decimal_boundaries() {
    let cases: &[(u64, usize, &str)] = &include!("../testdata/to_fixed_node.rs");
    for &(bits, decimals, expected) in cases {
        if decimals != 3 {
            continue;
        }
        let value = f64::from_bits(bits);
        let mut snapshot = Snapshot::default();
        snapshot.state.source_state = SourceState::Live;
        snapshot.state.player = Some(Player {
            delta_best_s: Quality::Reliable(value),
            ..Player::default()
        });
        let signed = if value > 0.0 {
            format!("+{expected}")
        } else {
            expected.into()
        };
        assert_eq!(
            delta::project(&snapshot, format::Preferences::default()).delta_text(),
            signed,
            "delta {value:?}"
        );
        let trace = if value >= 0.0 {
            format!("+{expected}")
        } else {
            expected.into()
        };
        assert_eq!(
            delta_trace::project(&snapshot, format::Preferences::default()).current_text,
            trace,
            "trace {value:?}"
        );
    }
}
