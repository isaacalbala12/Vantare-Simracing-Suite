use super::*;

fn fields(actual: &Value, expected: &Value, path: &str) {
    match expected {
        Value::Object(map) => {
            for (key, v) in map {
                fields(&actual[key], v, &format!("{path}/{key}"));
            }
        }
        Value::Array(values) => {
            assert_eq!(
                actual.as_array().map(Vec::len),
                Some(values.len()),
                "{path}"
            );
            for (i, v) in values.iter().enumerate() {
                fields(&actual[i], v, &format!("{path}/{i}"));
            }
        }
        Value::Number(v) => {
            let e = v.as_f64().expect("number");
            let a = actual.as_f64().unwrap_or(f64::NAN);
            assert!(
                (a - e).abs() <= a.abs().max(e.abs()).max(1.0) * 1e-10,
                "{path}: {a} != {e}"
            );
        }
        _ => assert_eq!(actual, expected, "{path}"),
    }
}
fn semantic_decision(mut value: Value) -> Value {
    for key in ["pitStops", "stints"] {
        if value[key].is_null() {
            value[key] = json!([]);
        }
    }
    value
}
fn parity_cases(data: &str) {
    let cases: Vec<Value> = serde_json::from_str(data).expect("Go cases");
    let mut failed = Vec::new();
    for case in &cases {
        let outcome = std::panic::catch_unwind(|| parity_case(case));
        if outcome.is_err() {
            failed.push(case["name"].clone());
        }
    }
    eprintln!(
        "ORACLE cases={} equal={} different={}",
        cases.len(),
        cases.len() - failed.len(),
        failed.len()
    );
    assert!(failed.is_empty(), "Go differences: {failed:?}");
}
fn parity_case(case: &Value) {
    let name = case["name"].as_str().expect("name");
    let input: Input = serde_json::from_value(case["input"].clone()).expect("input");
    if case["decision"].is_object() {
        let decision: DecisionVector =
            serde_json::from_value(case["decision"].clone()).expect("decision");
        let actual = if case["initial"].is_array() {
            replay_decision_v2_with_resources(
                &input,
                &decision,
                case["initial"][0].as_f64().expect("fuel"),
                case["initial"][1].as_f64().expect("VE"),
            )
        } else {
            replay_decision_v2(&input, &decision)
        };
        if case["error"].is_string() {
            assert!(actual.is_err(), "{name}: expected error");
            return;
        }
        let a =
            serde_json::to_value(actual.unwrap_or_else(|e| panic!("{name}: {e}"))).expect("replay");
        let e = &case["replay"];
        assert_eq!(a["feasible"], e["feasible"], "{name}/feasible");
        fields(&a["evaluation"], &e["evaluation"], name);
        fields(
            &a["stints"],
            &e.get("stints")
                .filter(|v| !v.is_null())
                .cloned()
                .unwrap_or_else(|| json!([])),
            name,
        );
        if e["feasible"] == true {
            fields(&a["reserve"], &e["reserve"], name);
            fields(&a["finalLapStartSeconds"], &e["finalLapStartSeconds"], name);
            fields(
                &semantic_decision(a["decision"].clone()),
                &semantic_decision(e["decision"].clone()),
                name,
            );
        } else {
            fields(&a["reasons"][0]["code"], &e["reasons"][0]["code"], name);
        }
    } else {
        let actual = solve_v2_without_deadline(&input);
        if case["error"].is_string() {
            assert!(actual.is_err(), "{name}: expected error");
            return;
        }
        let a = actual.unwrap_or_else(|e| panic!("{name}: {e}"));
        if a.certificate.status == OptimalityStatus::NotProven {
            assert_eq!(
                a.certificate.reason.as_deref(),
                Some("automatic_initial_load_optimality_not_proven"),
                "{name}: exhausted"
            );
            assert!(
                a.certificate
                    .proof
                    .as_ref()
                    .expect("proof")
                    .search_completed,
                "{name}"
            );
            assert!(
                a.certificate
                    .proof
                    .as_ref()
                    .expect("proof")
                    .lower_bound_seconds
                    .is_none(),
                "{name}"
            );
        }
        let e = &case["result"];
        assert_eq!(a.result.feasible, e["feasible"], "{name}/feasible");
        if a.result.feasible {
            fields(&json!(a.result.expected), &e["expected"], name);
            fields(&json!(a.result.reserve), &e["reserve"], name);
            fields(&json!(a.result.worst_case), &e["worstCase"], name);
            if let Some(variants) = e["variants"].as_array() {
                let mut actual = json!(a.result.variants);
                let mut expected = json!(variants);
                for values in [&mut actual, &mut expected] {
                    for v in values.as_array_mut().expect("variants") {
                        v["decision"] = semantic_decision(v["decision"].clone());
                    }
                }
                fields(&actual, &expected, name);
            }
            if !e["resolvedInputs"].is_null() {
                fields(&json!(a.result.resolved_inputs), &e["resolvedInputs"], name);
            }
            fields(
                &semantic_decision(json!(a.result.best)),
                &semantic_decision(e["best"].clone()),
                name,
            );
        }
    }
}
#[test]
fn go_resource_and_replay_parity() {
    parity_cases(include_str!("../../testdata/oracle/solver-resources.json"));
}

#[test]
fn go_physical_tyre_parity() {
    parity_cases(include_str!("../../testdata/oracle/solver-tyres.json"));
}

#[test]
fn go_driver_limits_and_timed_parity() {
    parity_cases(include_str!("../../testdata/oracle/solver-drivers.json"));
}

#[test]
fn go_weather_parity() {
    parity_cases(include_str!("../../testdata/oracle/solver-weather.json"));
}

#[test]
fn go_minimax_weather_scenarios_parity() {
    let cases: Vec<Value> =
        serde_json::from_str(include_str!("../../testdata/oracle/solver-scenarios.json"))
            .expect("scenarios");
    for case in cases {
        let input: Input = serde_json::from_value(case["input"].clone()).expect("input");
        let set: WeatherScenarioSet = serde_json::from_value(case["set"].clone()).expect("set");
        let name = case["name"].as_str().expect("name");
        let actual =
            solve_weather_scenarios(&input, &set).unwrap_or_else(|e| panic!("{name}: {e}"));
        let mut a = serde_json::to_value(actual).expect("scenario result");
        let mut e = case["scenarios"].clone();
        a["robust"]["decision"] = semantic_decision(a["robust"]["decision"].clone());
        e["robust"]["decision"] = semantic_decision(e["robust"]["decision"].clone());
        fields(&a["robust"], &e["robust"], name);
        fields(&a["thresholdSensitivity"], &e["thresholdSensitivity"], name);
        let plans = e["plans"].as_array().expect("plans");
        assert_eq!(a["plans"].as_array().map(Vec::len), Some(plans.len()));
        for (i, plan) in plans.iter().enumerate() {
            fields(&a["plans"][i]["timeline"], &plan["timeline"], name);
            fields(
                &a["plans"][i]["result"]["result"]["expected"],
                &plan["result"]["expected"],
                name,
            );
        }
    }
}

#[test]
fn go_projection_precedence_parity() {
    parity_cases(include_str!("../../testdata/oracle/solver-projection.json"));
}

#[test]
fn go_mixed_dimensions_and_editor_parity() {
    parity_cases(include_str!("../../testdata/oracle/solver-extended.json"));
}

fn base_extended_input() -> Input {
    let cases: Vec<Value> =
        serde_json::from_str(include_str!("../../testdata/oracle/solver-resources.json"))
            .expect("fixture");
    let mut input: Input = serde_json::from_value(cases[0]["input"].clone()).expect("input");
    input.extra.remove("fuelWeight");
    input
        .extra
        .insert("baseLapClimateBucket".into(), json!("dry"));
    input
}
#[test]
fn proof_distinguishes_exhaustion_infeasibility_and_cancellation() {
    let mut input = base_extended_input();
    let complete = solve_v2(&input).expect("solve");
    assert_eq!(complete.certificate.status, OptimalityStatus::Proven);
    let proof = complete.certificate.proof.expect("proof");
    assert!(proof.search_completed);
    assert_eq!(proof.lower_bound_seconds, complete.cost_seconds);
    assert_eq!(proof.absolute_gap_seconds, Some(0.0));
    input.budget.max_candidates = 1;
    let partial = solve_v2(&input).expect("partial");
    assert_eq!(partial.certificate.status, OptimalityStatus::NotProven);
    assert_eq!(
        partial.certificate.reason.as_deref(),
        Some("candidate_budget_exhausted")
    );
    let proof = partial.certificate.proof.expect("partial proof");
    assert!(!proof.search_completed);
    assert!(proof.lower_bound_seconds.is_none());
    assert!(solve(&input).is_err());
    input.budget.max_candidates = 10_000_000;
    input.budget.max_iterations = 1;
    let partial = solve_v2(&input).expect("iterations");
    assert_eq!(partial.certificate.status, OptimalityStatus::NotProven);
    assert_eq!(
        partial.certificate.reason.as_deref(),
        Some("iteration_budget_exhausted")
    );
    input.budget.max_iterations = 100_000_000;
    input.fuel_capacity_liters.value = 0.5;
    input.fuel_per_lap_liters.value = 1.0;
    let none = solve_v2(&input).expect("no solution");
    assert_eq!(none.certificate.status, OptimalityStatus::NoSolution);
    assert!(!none.result.feasible);
    assert!(
        none.certificate
            .proof
            .expect("infeasibility proof")
            .search_completed
    );
    let cancel = AtomicBool::new(true);
    assert_eq!(
        solve_v2_cancellable(&input, &cancel)
            .expect_err("cancel")
            .as_str(),
        "cancelled"
    );
}
#[test]
fn automatic_fuel_weight_load_never_claims_a_false_optimum() {
    let cases: Vec<Value> =
        serde_json::from_str(include_str!("../../testdata/oracle/solver-optimality.json"))
            .expect("fixture");
    let input: Input = serde_json::from_value(cases[0]["input"].clone()).expect("input");
    let decision: DecisionVector =
        serde_json::from_value(cases[1]["decision"].clone()).expect("decision");
    let better = replay_decision_v2(&input, &decision).expect("fixed replay");
    assert!(better.feasible);
    assert!(
        better.evaluation.total_seconds
            < cases[0]["result"]["expected"]["totalSeconds"]
                .as_f64()
                .expect("Go cost")
    );
    let result = solve_v2(&input).expect("result");
    assert_eq!(result.certificate.status, OptimalityStatus::NotProven);
    assert_eq!(
        result.certificate.reason.as_deref(),
        Some("automatic_initial_load_optimality_not_proven")
    );
    let proof = result.certificate.proof.expect("proof");
    assert!(proof.search_completed);
    assert!(proof.lower_bound_seconds.is_none());
    assert!(proof.absolute_gap_seconds.is_none());
}
#[test]
fn service_grid_budget_matches_go_policy_without_changing_the_input() {
    let mut input = base_extended_input();
    input.fuel_capacity_liters.value = 100.0;
    input.discretization.fuel_liters = 0.1;
    input.budget.p95_millis = 10;
    let (effective, requested) = budget::effective(&input);
    assert!((requested.fuel_liters - 0.1).abs() < 1e-12);
    assert!((effective.discretization.fuel_liters - 12.8).abs() < 1e-12);
    assert!((input.discretization.fuel_liters - 0.1).abs() < 1e-12);
    input.discretization.ve_percent = 0.0;
    input.budget.p95_millis = 1;
    let (effective, requested) = budget::effective(&input);
    assert!((requested.ve_percent - 1.0).abs() < 1e-12);
    assert!((effective.discretization.fuel_liters - 25.6).abs() < 1e-12);
}

#[test]
fn extended_solver_oracle_has_reviewed_hashes() {
    use sha2::{Digest, Sha256};
    let bytes = include_bytes!("../../testdata/oracle/solver-manifest.json");
    assert_eq!(
        format!("{:x}", Sha256::digest(bytes)),
        "904bde8971bf841da81c7a28349badda8a4b0d8295290118e5e10cd5180e3b42"
    );
    let manifest: Value = serde_json::from_slice(bytes).expect("manifest");
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("testdata/oracle");
    for (name, entry) in manifest["files"].as_object().expect("files") {
        let data = std::fs::read(root.join(name)).expect("fixture");
        assert_eq!(
            format!("{:x}", Sha256::digest(&data)),
            entry["sha256"].as_str().expect("sha"),
            "{name}"
        );
        let cases: Vec<Value> = serde_json::from_slice(&data).expect("cases");
        assert_eq!(
            cases.len() as u64,
            entry["cases"].as_u64().expect("count"),
            "{name}"
        );
    }
}

#[test]
fn go_optimality_counterexample_result_and_fixed_replay_parity() {
    parity_cases(include_str!("../../testdata/oracle/solver-optimality.json"));
}

#[test]
fn go_projection_weather_and_service_boundary_parity() {
    parity_cases(include_str!("../../testdata/oracle/solver-boundaries.json"));
}

#[test]
fn empty_base_climate_bucket_uses_go_default_dry() {
    let cases: Vec<Value> =
        serde_json::from_str(include_str!("../../testdata/oracle/solver-projection.json"))
            .expect("fixture");
    let case = cases
        .iter()
        .find(|c| c["name"] == "projection-base-dry")
        .expect("dry case");
    let mut input: Input = serde_json::from_value(case["input"].clone()).expect("input");
    input.extra.insert("baseLapClimateBucket".into(), json!(""));
    let actual = solve_v2(&input).expect("default bucket");
    fields(
        &json!(actual.result.expected),
        &case["result"]["expected"],
        "empty bucket",
    );
}
