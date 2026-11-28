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

// #2579: letras de otros alfabetos que se parecen a las latinas. Los textos
// usan escapes `\u{…}` a propósito: en el código fuente un homoglifo no se ve.

fn corto() -> serde_json::Value {
    let examples: serde_json::Value =
        serde_json::from_str(include_str!("launcher_review_opus.json")).unwrap();
    examples["corto"]["input"].clone()
}

fn shown(input: &serde_json::Value) -> String {
    review_pages(&input.to_string()).unwrap().join("\n")
}

fn with_path(path: &str) -> String {
    let mut input = corto();
    input["steps"][0]["path"] = path.into();
    shown(&input)
}

const NOTICE: &str = "Atención: contiene letras que imitan a las latinas";

#[test]
fn marks_a_lookalike_letter_in_every_field() {
    let top = [
        (
            "name",
            "Creador de C\u{43e}ntenido",
            "Creador de C[U+043E]ntenido",
        ),
        ("hotkey", "Ctrl + \u{410}lt + L", "Ctrl + [U+0410]lt + L"),
    ];
    let step = [
        ("app", "St\u{435}am", "St[U+0435]am"),
        ("path", "C:\\Games\\g\u{3bf}me\\game.exe", "g[U+03BF]me"),
    ];
    let args = [
        ("-\u{430}pplaunch", "-[U+0430]pplaunch"),
        ("--profile=g\u{43e}\u{43e}d", "--profile=g[U+043E][U+043E]d"),
    ];
    let mut cases = Vec::new();
    for (field, value, marked) in top {
        let mut input = corto();
        input[field] = value.into();
        cases.push((field, input, value, marked));
    }
    for (field, value, marked) in step {
        let mut input = corto();
        input["steps"][0][field] = value.into();
        cases.push((field, input, value, marked));
    }
    for (value, marked) in args {
        let mut input = corto();
        input["steps"][1]["args"] = serde_json::json!(["--minimize-to-tray", value]);
        cases.push(("args", input, value, marked));
    }
    for (field, input, value, marked) in cases {
        let pages = shown(&input);
        assert!(pages.contains(marked), "{field}: {pages}");
        assert!(pages.contains(NOTICE), "{field}");
        assert!(!pages.contains(value), "{field}");
    }
}

#[test]
fn marks_the_corpus_of_lookalike_attacks() {
    let attacks = [
        // (A) extensión no ASCII.
        (
            "C:\\Program Files (x86)\\Steam\\steam.\u{435}\u{445}\u{435}",
            "steam.[U+0435][U+0445][U+0435]",
        ),
        (
            "C:\\Games\\steam.\u{415}\u{425}\u{415}",
            "steam.[U+0415][U+0425][U+0415]",
        ),
        // (B) mezcla dentro de una palabra.
        (
            "C:\\Program Files (x86)\\St\u{435}am\\steam.exe",
            "St[U+0435]am\\steam.exe",
        ),
        (
            "C:\\Program Files\\obs-studi\u{43e}\\bin\\obs64.exe",
            "obs-studi[U+043E]\\bin",
        ),
        ("C:\\Games\\\u{405}team\\x.exe", "\\[U+0405]team\\"),
        (
            "C:\\Users\\isaac\\Sp\u{3bf}tify\\Spotify.exe",
            "Sp[U+03BF]tify\\",
        ),
        ("C:\\Games\\\u{39a}art.exe", "[U+039A]art.exe"),
        ("C:\\Games\\Spot\u{131}fy.exe", "Spot[U+0131]fy.exe"),
        (
            "C:\\Games\\\u{ff53}\u{ff54}\u{ff45}\u{ff41}\u{ff4d}.exe",
            "[U+FF53][U+FF54][U+FF45][U+FF41][U+FF4D].exe",
        ),
        ("C:\\Games\\\u{1d69c}team.exe", "[U+1D69C]team.exe"),
        (
            "C:\\Games\\st\u{435}\u{200d}am.exe",
            "st[U+0435][U+200D]am.exe",
        ),
        (
            "C:\\Games\\St\u{301}\u{435}\u{301}am.exe",
            "St\u{301}[U+0435][U+0301]am.exe",
        ),
        // Formas precompuestas (NFC) y descompuestas (NFD).
        ("C:\\Games\\M\u{4e7}torsport.exe", "M[U+04E7]torsport.exe"),
        (
            "C:\\Games\\M\u{43e}\u{308}torsport.exe",
            "M[U+043E][U+0308]torsport.exe",
        ),
        ("C:\\Games\\Sp\u{3cc}tify.exe", "Sp[U+03CC]tify.exe"),
        // (C) palabra solo de letras de la lista junto a latín en el segmento.
        (
            "C:\\Games\\Game_\u{410}\u{420}\u{420}\\run.exe",
            "Game_[U+0410][U+0420][U+0420]\\",
        ),
        (
            "C:\\Games\\game-\u{435}\u{445}\u{435}\\x.exe",
            "game-[U+0435][U+0445][U+0435]\\",
        ),
    ];
    assert!(attacks.len() >= 15);
    for (path, marked) in attacks {
        let pages = with_path(path);
        assert!(pages.contains(marked), "{marked}: {pages}");
        assert!(pages.contains(NOTICE), "{marked}");
        assert!(!pages.contains(path), "{marked}");
    }
}

#[test]
fn leaves_names_written_in_their_own_alphabet_alone() {
    let legit = [
        // Ruso: muchas palabras corrientes son solo letras de la lista.
        "C:\\\u{418}\u{433}\u{440}\u{44b}\\\u{445}\u{43e}\u{440}.exe",
        "C:\\Users\\\u{41e}\u{43b}\u{435}\u{433}\\\u{441}\u{43e}\u{43a}.bat",
        "C:\\\u{418}\u{433}\u{440}\u{44b}\\\u{43a}\u{430}\u{43a}.exe",
        "C:\\\u{418}\u{433}\u{440}\u{44b}\\\u{432}\u{441}\u{435}",
        "C:\\\u{421}\u{421}\u{421}\u{420}.exe",
        "C:\\\u{422}\u{435}\u{441}\u{442} \u{438}\u{433}\u{440}\u{44b}\\\u{43e}\u{43d}\u{430}.exe",
        "C:\\Users\\\u{421}\u{435}\u{440}\u{433}\u{435}\u{439}\\\u{420}\u{41e}\u{421}\u{421}\u{418}\u{42f}.bat",
        // Ucraniano y búlgaro.
        "C:\\\u{41a}\u{438}\u{457}\u{432}\\\u{406}\u{433}\u{440}\u{438}\\\u{433}\u{440}\u{430}.exe",
        "C:\\\u{407}\u{436}\u{430}\u{43a}.bat",
        "C:\\\u{418}\u{433}\u{440}\u{438}\\\u{421}\u{44a}\u{441}\u{442}\u{435}\u{437}\u{430}\u{43d}\u{438}\u{435}.exe",
        "C:\\\u{415}\u{445}\u{43e}.exe",
        // Griego.
        "C:\\\u{3a0}\u{3b1}\u{3b9}\u{3c7}\u{3bd}\u{3af}\u{3b4}\u{3b9}.exe",
        "C:\\\u{39f}\u{3a7}\u{399}.bat",
        "C:\\\u{39a}\u{3bf}\u{3ba}\u{3cc}.exe",
        "C:\\\u{391}\u{3b3}\u{3ce}\u{3bd}\u{3b1}\u{3c2}\\a.exe",
        // Mezcla legítima separada: cada palabra en su alfabeto.
        "C:\\\u{418}\u{433}\u{440}\u{430}\\game.exe",
        "C:\\\u{418}\u{433}\u{440}\u{430}_v2.exe",
        "C:\\\u{418}\u{433}\u{440}\u{430}-2024.bat",
        // Latín con tildes (NFC y NFD), japonés.
        "C:\\Users\\Jos\u{e9}\\caf\u{e9}.exe",
        "C:\\Users\\Jose\u{301}\\Fa\u{e7}ade.exe",
        "C:\\\u{d1}and\u{fa}\\M\u{f6}torsport.exe",
        "C:\\\u{30b2}\u{30fc}\u{30e0}\\\u{30ec}\u{30fc}\u{30b9}.exe",
    ];
    assert!(legit.len() >= 15);
    for path in legit {
        let pages = with_path(path);
        assert!(pages.contains(path), "{path}");
        assert!(!pages.contains(NOTICE), "{path}");
        assert!(!pages.contains("[U+"), "{path}");
    }
    let mut input = corto();
    input["steps"][0]["args"] =
        serde_json::json!(["--\u{438}\u{43c}\u{44f}=\u{445}\u{43e}\u{440}"]);
    input["name"] = "\u{418}\u{433}\u{440}\u{44b} \u{445}\u{43e}\u{440}".into();
    let pages = shown(&input);
    assert!(!pages.contains("[U+") && !pages.contains(NOTICE), "{pages}");
}

#[test]
fn precomposed_and_decomposed_forms_get_the_same_verdict() {
    for (path, lookalike) in [
        ("C:\\M\u{4e7}tor.exe", true),
        ("C:\\M\u{43e}\u{308}tor.exe", true),
        ("C:\\M\u{f6}tor.exe", false),
        ("C:\\Mo\u{308}tor.exe", false),
    ] {
        assert_eq!(with_path(path).contains(NOTICE), lookalike, "{path}");
    }
}

#[test]
fn lookalikes_and_invisibles_are_both_announced() {
    let mut input = corto();
    input["steps"][0]["app"] = "St\u{435}am\u{200b}".into();
    let pages = shown(&input);
    assert!(pages.contains("caracteres invisibles"));
    assert!(pages.contains(NOTICE));
    assert!(pages.contains("St[U+0435]am[U+200B]"));
}

#[test]
fn a_lookalike_never_inherits_the_trust_of_the_clean_profile() {
    let clean = review_pages(&corto().to_string()).unwrap();
    let mut forged = corto();
    forged["steps"][0]["path"] = "C:\\Program Files (x86)\\St\u{435}am\\steam.exe".into();
    let forged = review_pages(&forged.to_string()).unwrap();
    assert!(can_trust(&forged));
    assert_ne!(frame_pages(&clean), frame_pages(&forged));
    // Una palabra entera en cirílico sale tal cual, sin aviso ni marcas.
    let cyrillic = "\u{418}\u{433}\u{440}\u{430}";
    let mut own = corto();
    own["steps"][0]["path"] = format!("C:\\Program Files (x86)\\{cyrillic}\\steam.exe").into();
    let own = review_pages(&own.to_string()).unwrap();
    assert_eq!(own[0].replace(cyrillic, "Steam"), clean[0]);
}

#[test]
fn marks_count_against_the_page_budget() {
    let mut input = corto();
    input["steps"][0]["args"] = serde_json::json!([format!("x{}", "o".repeat(199))]);
    assert!(review_pages(&input.to_string()).is_ok());
    input["steps"][0]["args"] = serde_json::json!([format!("x{}", "\u{43e}".repeat(199))]);
    assert_eq!(review_pages(&input.to_string()), Err(ReviewError::TooLong));
}

#[test]
fn hostile_text_does_not_panic() {
    let weird = [
        "\u{301}".repeat(20_000),
        format!("x{}", "\u{43e}\u{308}".repeat(10_000)),
        ".".repeat(30_000),
        format!("a.{}", "\u{435}".repeat(20_000)),
        "\u{10ffff}\u{e000}\u{fffd}\u{1d400}\u{ff21}.\u{301}".repeat(3_000),
        "\\=/,;\" \u{3000}\u{2028}".repeat(5_000),
    ];
    for name in weird {
        let mut input = corto();
        input["name"] = name.into();
        let message = input.to_string();
        let result = review_pages(&message);
        assert!(message.len() > 64 * 1024 || result.is_ok(), "{result:?}");
    }
}
