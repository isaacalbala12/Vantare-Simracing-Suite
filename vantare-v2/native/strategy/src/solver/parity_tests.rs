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
    if let Some(pits) = value["pitStops"].as_array_mut() {
        for p in pits {
            p.as_object_mut().expect("pit").remove("pitBreakdown");
            p.as_object_mut().expect("pit").remove("pitCostInput");
        }
    }
    value
}
fn parity_cases(data: &str) {
    let cases: Vec<Value> = serde_json::from_str(data).expect("Go cases");
    for case in cases {
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
                continue;
            }
            let a = serde_json::to_value(actual.unwrap_or_else(|e| panic!("{name}: {e}")))
                .expect("replay");
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
            let actual = solve_v2(&input);
            if case["error"].is_string() {
                assert!(actual.is_err(), "{name}: expected error");
                continue;
            }
            let a = actual.unwrap_or_else(|e| panic!("{name}: {e}"));
            assert_ne!(
                a.certificate.status,
                OptimalityStatus::NotProven,
                "{name}: incomplete"
            );
            let e = &case["result"];
            assert_eq!(a.result.feasible, e["feasible"], "{name}/feasible");
            if a.result.feasible {
                fields(&json!(a.result.expected), &e["expected"], name);
                fields(&json!(a.result.reserve), &e["reserve"], name);
                fields(
                    &semantic_decision(json!(a.result.best)),
                    &semantic_decision(e["best"].clone()),
                    name,
                );
            }
        }
    }
}
#[test]
fn go_resource_and_replay_parity() {
    parity_cases(include_str!("../../testdata/oracle/solver-resources.json"));
}
