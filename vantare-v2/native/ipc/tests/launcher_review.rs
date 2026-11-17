use vantare_ipc::launcher::review::{
    ReviewError, authorization_current, can_trust, frame_pages, review_pages,
};

#[test]
fn supplied_opus_examples_match_the_display_exactly() {
    let examples: serde_json::Value =
        serde_json::from_str(include_str!("launcher_review_opus.json")).unwrap();
    for (name, expected_pages) in [
        ("corto", 1),
        ("largo", 2),
        ("argumentos", 2),
        ("invisibles", 1),
        ("sin-pasos", 1),
    ] {
        let pages = review_pages(&examples[name]["input"].to_string()).unwrap();
        assert_eq!(pages.len(), expected_pages, "{name}");
        assert_eq!(
            serde_json::to_value(&pages).unwrap(),
            examples[name]["pages"],
            "{name}"
        );
        assert_eq!(can_trust(&pages), name != "sin-pasos");
    }
}

#[test]
fn refuses_to_truncate_arguments_routes_or_steps() {
    let examples: serde_json::Value =
        serde_json::from_str(include_str!("launcher_review_opus.json")).unwrap();
    let mut input = examples["corto"]["input"].clone();
    for length in [201, 1056] {
        input["steps"][0]["args"] = serde_json::json!(["-EncodedCommand", "a".repeat(length)]);
        assert_eq!(review_pages(&input.to_string()), Err(ReviewError::TooLong));
    }
    input = examples["corto"]["input"].clone();
    input["steps"][0]["path"] = serde_json::json!("x".repeat(261));
    assert_eq!(review_pages(&input.to_string()), Err(ReviewError::TooLong));
    input = examples["corto"]["input"].clone();
    let step = input["steps"][0].clone();
    input["steps"] = serde_json::json!(vec![step; 100]);
    assert_eq!(review_pages(&input.to_string()), Err(ReviewError::TooLong));
}

#[test]
fn frame_separates_page_boundaries_and_authorization_has_an_exact_deadline() {
    assert_ne!(
        frame_pages(&["ab".into(), "c".into()]),
        frame_pages(&["a".into(), "bc".into()])
    );
    assert!(authorization_current(1_000, 11_000));
    assert!(!authorization_current(1_000, 11_001));
    assert!(!authorization_current(1_000, 999));
}

#[test]
fn discloses_invisible_unicode_in_every_requested_group() {
    let examples: serde_json::Value =
        serde_json::from_str(include_str!("launcher_review_opus.json")).unwrap();
    let groups: &[(&str, &[(u32, u32)])] = &[
        (
            "Unicode spaces",
            &[
                (0xa0, 0xa0),
                (0x2000, 0x200a),
                (0x202f, 0x202f),
                (0x205f, 0x205f),
                (0x3000, 0x3000),
            ],
        ),
        ("blank Braille", &[(0x2800, 0x2800)]),
        (
            "Hangul fillers",
            &[(0x3164, 0x3164), (0x115f, 0x1160), (0xffa0, 0xffa0)],
        ),
        ("combining grapheme joiner", &[(0x34f, 0x34f)]),
        ("variation selectors", &[(0xfe00, 0xfe0f), (0x180b, 0x180d)]),
        ("tags", &[(0xe0000, 0xe007f)]),
        ("interlinear annotations", &[(0xfff9, 0xfffb)]),
    ];
    let mut input = examples["corto"]["input"].clone();
    for (group, ranges) in groups {
        for &(first, last) in *ranges {
            for code in first..=last {
                let invisible = char::from_u32(code).unwrap();
                input["steps"][0]["args"] = serde_json::json!([format!("x{invisible}y")]);
                let pages = review_pages(&input.to_string()).unwrap().join("\n");
                assert!(pages.contains("Atención:"), "{group}: U+{code:04X}");
                assert!(
                    pages.contains(&format!("x[U+{code:04X}]y")),
                    "{group}: U+{code:04X}"
                );
                assert!(!pages.contains(invisible), "{group}: U+{code:04X}");
            }
        }
    }
}
