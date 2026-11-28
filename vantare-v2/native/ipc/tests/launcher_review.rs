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

fn corto() -> serde_json::Value {
    let examples: serde_json::Value =
        serde_json::from_str(include_str!("launcher_review_opus.json")).unwrap();
    examples["corto"]["input"].clone()
}

fn shown(input: &serde_json::Value) -> String {
    review_pages(&input.to_string()).unwrap().join("\n")
}

const NOTICE: &str = "Atención: letras de otro alfabeto";

#[test]
fn marks_a_confusable_inside_a_latin_word_in_every_field() {
    // «е» y «О» cirílicas, «ο» griega: se parecen a la «e» y la «o» latinas.
    for (field, value, marked) in [
        ("name", "St\u{435}am", "St[U+0435]am"),
        ("hotkey", "Ctrl + L\u{41e}L", "Ctrl + L[U+041E]L"),
    ] {
        let mut input = corto();
        input[field] = value.into();
        let pages = shown(&input);
        assert!(pages.contains(marked), "{field}");
        assert!(pages.contains(NOTICE), "{field}");
        assert!(!pages.contains(['\u{435}', '\u{41e}']), "{field}");
    }
    for (field, value, marked) in [
        ("app", "St\u{435}am", "St[U+0435]am"),
        ("path", "C:\Games\g\u{3bf}me\game.exe", "g[U+03BF]me"),
    ] {
        let mut input = corto();
        input["steps"][0][field] = value.into();
        let pages = shown(&input);
        assert!(pages.contains(marked), "{field}");
        assert!(pages.contains(NOTICE), "{field}");
    }
    let mut input = corto();
    input["steps"][0]["args"] = serde_json::json!(["-launch=g\u{43e}\u{43e}d"]);
    let pages = shown(&input);
    assert!(pages.contains("-launch=g[U+043E][U+043E]d"));
    assert!(pages.contains(NOTICE));
}

#[test]
fn leaves_words_in_other_alphabets_alone() {
    for path in [
        "C:\Juegos\\u{418}\u{433}\u{440}\u{430}\juego.exe",
        "C:\\u{3a0}\u{3b1}\u{3b9}\u{3c7}\u{3bd}\u{3af}\u{3b4}\u{3b9}\a.exe",
        "C:\Users\Jos\u{e9}\caf\u{e9}.exe",
        // Separadores: la palabra cirílica no se mezcla con la latina.
        "C:\\u{418}\u{433}\u{440}\u{430}\game.exe",
        "C:\\u{418}\u{433}\u{440}\u{430}-game\\u{418}\u{433}\u{440}\u{430} game.exe",
    ] {
        let mut input = corto();
        input["steps"][0]["path"] = path.into();
        let pages = shown(&input);
        assert!(pages.contains(path), "{path}");
        assert!(!pages.contains(NOTICE), "{path}");
        assert!(!pages.contains("[U+"), "{path}");
    }
}

#[test]
fn a_word_made_only_of_confusables_is_a_known_limit_and_is_not_marked() {
    // «арр» toda cirílica (а, р, р). Seguimiento si la raíz lo pide (#2579).
    let mut input = corto();
    input["steps"][0]["path"] = "C:\\u{430}\u{440}\u{440}\a.exe".into();
    let pages = shown(&input);
    assert!(pages.contains("\u{430}\u{440}\u{440}"));
    assert!(!pages.contains(NOTICE));
}

#[test]
fn confusables_and_invisibles_are_both_announced() {
    let mut input = corto();
    input["steps"][0]["app"] = "St\u{435}am\u{200b}".into();
    let pages = shown(&input);
    assert!(pages.contains("caracteres invisibles"));
    assert!(pages.contains(NOTICE));
    assert!(pages.contains("St[U+0435]am[U+200B]"));
}

#[test]
fn a_mixed_word_never_inherits_the_trust_of_the_clean_profile() {
    let clean = review_pages(&corto().to_string()).unwrap();
    let mut forged = corto();
    forged["steps"][0]["path"] = "C:\Program Files (x86)\St\u{435}am\steam.exe".into();
    let forged = review_pages(&forged.to_string()).unwrap();
    assert!(can_trust(&forged));
    assert_ne!(frame_pages(&clean), frame_pages(&forged));
    // Sin palabras mixtas la revisión no cambia ni un byte (los ejemplos de Opus
    // lo comprueban en exacto): una palabra cirílica entera sale tal cual.
    let mut cyrillic = corto();
    cyrillic["steps"][0]["path"] = "C:\Program Files (x86)\\u{418}\u{433}\u{440}\u{430}\steam.exe".into();
    let plain = review_pages(&cyrillic.to_string()).unwrap();
    assert_eq!(
        plain[0].replace("\u{418}\u{433}\u{440}\u{430}", "Steam"),
        clean[0]
    );
}
