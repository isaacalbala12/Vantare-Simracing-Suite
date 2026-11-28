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

// #2579: letras y signos que imitan a los latinos. Los textos usan escapes
// `\u{…}` a propósito: en el código fuente un homoglifo no se ve.

fn corto() -> serde_json::Value {
    let examples: serde_json::Value =
        serde_json::from_str(include_str!("launcher_review_opus.json")).expect("ejemplos de Opus");
    examples["corto"]["input"].clone()
}

fn shown(input: &serde_json::Value) -> String {
    review_pages(&input.to_string())
        .expect("la revisión se construye")
        .join("\n")
}

fn input_with_path(path: &str) -> serde_json::Value {
    let mut input = corto();
    input["steps"][0]["path"] = path.into();
    input
}

fn with_path(path: &str) -> String {
    shown(&input_with_path(path))
}

/// La línea completa del aviso, con sus saltos de línea.
const NOTICE: &str =
    "\nAtención: letras o signos que imitan a los normales, marcados así: [U+…].\n";

#[test]
fn the_lookalike_notice_is_one_page_line() {
    let pages = with_path("C:\\Games\\St\u{435}am\\steam.exe");
    let line = pages
        .lines()
        .find(|line| line.starts_with("Atención: letras"))
        .expect("aviso");
    assert_eq!(format!("\n{line}\n"), NOTICE);
    assert!(line.chars().count() <= 76, "{line}");
}

#[test]
fn marks_a_lookalike_in_every_field() {
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
        ("\u{2212}applaunch", "[U+2212]applaunch"),
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

fn assert_marked(attacks: &[(String, &str)]) {
    for (path, marked) in attacks {
        let pages = with_path(path);
        assert!(pages.contains(marked), "{marked}: {pages}");
        assert!(pages.contains(NOTICE), "{marked}");
        assert!(!pages.contains(path.as_str()), "{marked}");
    }
}

#[test]
fn marks_lookalikes_mixed_with_latin_in_a_word() {
    assert_marked(&[
        // (B) mezcla con latín dentro de una palabra.
        (
            "C:\\Program Files (x86)\\St\u{435}am\\steam.exe".to_owned(),
            "St[U+0435]am\\steam.exe",
        ),
        (
            "C:\\Program Files\\obs-studi\u{43e}\\bin\\obs64.exe".into(),
            "obs-studi[U+043E]\\bin",
        ),
        ("C:\\Games\\\u{405}team\\x.exe".into(), "\\[U+0405]team\\"),
        (
            "C:\\Users\\isaac\\Sp\u{3bf}tify\\Spotify.exe".into(),
            "Sp[U+03BF]tify\\",
        ),
        ("C:\\Games\\\u{39a}art.exe".into(), "[U+039A]art.exe"),
        ("C:\\Games\\Spot\u{131}fy.exe".into(), "Spot[U+0131]fy.exe"),
        (
            "C:\\Games\\\u{ff53}\u{ff54}\u{ff45}\u{ff41}\u{ff4d}\\x.exe".into(),
            "[U+FF53][U+FF54][U+FF45][U+FF41][U+FF4D]\\",
        ),
        ("C:\\Games\\\u{1d69c}team.exe".into(), "[U+1D69C]team.exe"),
        (
            "C:\\Games\\st\u{435}\u{200d}am.exe".into(),
            "st[U+0435][U+200D]am.exe",
        ),
        (
            "C:\\Games\\obs\u{ff16}\u{ff14}.exe".into(),
            "obs[U+FF16][U+FF14].exe",
        ),
        (
            "C:\\Games\\\u{3bc}Torrent.exe".into(),
            "[U+03BC]Torrent.exe",
        ),
        // Letras de riesgo que no están en la lista de pares.
        ("C:\\Games\\St\u{3b5}am.exe".into(), "St[U+03B5]am.exe"),
        ("C:\\Games\\Ope\u{43f}.exe".into(), "Ope[U+043F].exe"),
        ("C:\\Games\\Sp\u{1f40}tify.exe".into(), "Sp[U+1F40]tify.exe"),
        ("C:\\Games\\\u{570}ello.exe".into(), "[U+0570]ello.exe"),
        ("C:\\Games\\\u{13aa}pp.exe".into(), "[U+13AA]pp.exe"),
        ("C:\\Games\\\u{a4e2}team.exe".into(), "[U+A4E2]team.exe"),
        (
            "C:\\Games\\Lo\u{261}itech.exe".into(),
            "Lo[U+0261]itech.exe",
        ),
        (
            "C:\\Games\\\u{212a}eyboard.exe".into(),
            "[U+212A]eyboard.exe",
        ),
        (
            "C:\\Games\\\u{216c}ogitech.exe".into(),
            "[U+216C]ogitech.exe",
        ),
        (
            "C:\\Games\\\u{1c0}auncher.exe".into(),
            "[U+01C0]auncher.exe",
        ),
        ("C:\\Games\\St\u{1d07}am.exe".into(), "St[U+1D07]am.exe"),
        // Signos que imitan a los ASCII y no bloquean.
        (
            "C:\\Games\\obs\u{2010}studio\\x.exe".into(),
            "obs[U+2010]studio\\",
        ),
        (
            "C:\\Games\\obs\u{2011}studio\\x.exe".into(),
            "obs[U+2011]studio\\",
        ),
    ]);
}

#[test]
fn marks_lookalike_forms_and_whole_lookalike_words_in_a_latin_path() {
    let ivan = "\u{418}\u{432}\u{430}\u{43d}";
    let skype = "\u{405}\u{3ba}\u{443}\u{440}\u{435}";
    let skype_marked = "[U+0405][U+03BA][U+0443][U+0440][U+0435]";
    assert_marked(&[
        // Formas precompuestas (NFC) y descompuestas (NFD).
        (
            "C:\\Games\\M\u{4e7}torsport.exe".into(),
            "M[U+04E7]torsport.exe",
        ),
        (
            "C:\\Games\\M\u{43e}\u{308}torsport.exe".into(),
            "M[U+043E][U+0308]torsport.exe",
        ),
        ("C:\\Games\\Sp\u{3cc}tify.exe".into(), "Sp[U+03CC]tify.exe"),
        (
            format!("C:\\Users\\{ivan}\\St\u{301}\u{435}\u{301}am.exe"),
            "St\u{301}[U+0435][U+0301]am.exe",
        ),
        // (C) segmento hecho solo de letras de la lista en una ruta latina.
        (
            format!("C:\\Program Files (x86)\\Microsoft\\{skype}\\run.exe"),
            skype_marked,
        ),
        (
            "C:\\Steam\\steamapps\\common\\\u{410}\u{421}\u{421}\\acc.exe".into(),
            "common\\[U+0410][U+0421][U+0421]\\",
        ),
        (
            "C:\\Users\\Public\\\u{41e}\u{412}\u{405}\\obs64.exe".into(),
            "Public\\[U+041E][U+0412][U+0405]\\",
        ),
        (
            "C:\\Games\\Game_\u{410}\u{420}\u{420}\\run.exe".into(),
            "Game_[U+0410][U+0420][U+0420]\\",
        ),
        // Dos alfabetos de la lista en una palabra, aunque haya letras propias.
        (format!("C:\\Users\\{ivan}\\{skype}\\a.exe"), skype_marked),
    ]);
}

#[test]
fn leaves_names_written_in_their_own_alphabet_alone() {
    let legit = [
        // Ruso: muchas palabras corrientes son solo letras de la lista.
        "C:\\\u{418}\u{433}\u{440}\u{44b}\\\u{445}\u{43e}\u{440}.exe",
        "C:\\Users\\\u{41e}\u{43b}\u{435}\u{433}\\\u{441}\u{43e}\u{43a}.bat",
        "C:\\\u{418}\u{433}\u{440}\u{44b}\\\u{43a}\u{430}\u{43a}.exe",
        "C:\\\u{418}\u{433}\u{440}\u{44b}\\\u{432}\u{441}\u{435}",
        "C:\\Users\\\u{418}\u{432}\u{430}\u{43d}\\\u{421}\u{421}\u{421}\u{420}.exe",
        "C:\\\u{422}\u{435}\u{441}\u{442} \u{438}\u{433}\u{440}\u{44b}\\\u{43e}\u{43d}\u{430}.exe",
        "C:\\Users\\\u{421}\u{435}\u{440}\u{433}\u{435}\u{439}\\\u{420}\u{41e}\u{421}\u{421}\u{418}\u{42f}.bat",
        "C:\\Users\\\u{418}\u{432}\u{430}\u{43d}\\\u{41a}\u{430}\u{441}\u{43f}\u{435}\u{440}\u{441}\u{43a}\u{438}\u{439}\\avp.exe",
        // Ucraniano y búlgaro.
        "C:\\\u{41a}\u{438}\u{457}\u{432}\\\u{406}\u{433}\u{440}\u{438}\\\u{433}\u{440}\u{430}.exe",
        "C:\\\u{407}\u{436}\u{430}\u{43a}.bat",
        "C:\\\u{418}\u{433}\u{440}\u{438}\\\u{421}\u{44a}\u{441}\u{442}\u{435}\u{437}\u{430}\u{43d}\u{438}\u{435}.exe",
        // Griego.
        "C:\\\u{3a0}\u{3b1}\u{3b9}\u{3c7}\u{3bd}\u{3af}\u{3b4}\u{3b9}.exe",
        "C:\\\u{391}\u{3b3}\u{3ce}\u{3bd}\u{3b1}\u{3c2}\\a.exe",
        // Mezcla legítima separada: cada palabra en su alfabeto.
        "C:\\\u{418}\u{433}\u{440}\u{430}\\game.exe",
        "C:\\\u{418}\u{433}\u{440}\u{430}_v2.exe",
        "C:\\\u{418}\u{433}\u{440}\u{430}-2024.bat",
        // Carpetas con punto y «extensión» no ASCII: solo cuenta el último segmento.
        "C:\\\u{418}\u{433}\u{440}\u{44b}\\\u{438}\u{433}\u{440}\u{44b}.\u{440}\u{444}\\run.exe",
        "C:\\\u{418}\u{433}\u{440}\u{44b}\\\u{43d}\u{430}\u{441}\u{442}\u{440}\u{43e}\u{439}\u{43a}\u{438}.\u{43a}\u{43e}\u{43d}\u{444}\\run.exe",
        "C:\\\u{418}\u{433}\u{440}\u{44b}\\\u{421}\u{435}\u{437}\u{43e}\u{43d} 1.\u{42d}\u{442}\u{430}\u{43f} 2\\run.exe",
        "C:\\\u{30b2}\u{30fc}\u{30e0}\\ver1.\u{30b2}\u{30fc}\u{30e0}\\run.exe",
        "C:\\Users\\Jos\u{e9}\\caf\u{e9}.v2\\x.exe",
        "C:\\Users\\Jos\u{e9}\\caf\u{e9}.caf\u{e9}\\x.exe",
        // Latín con tildes (NFC y NFD), turco, japonés, «µ» (micro).
        "C:\\Users\\Jose\u{301}\\Fa\u{e7}ade.exe",
        "C:\\\u{d1}and\u{fa}\\M\u{f6}torsport.exe",
        "C:\\Users\\I\u{15f}\u{131}k\\a.exe",
        "C:\\\u{30b2}\u{30fc}\u{30e0}\\\u{30ec}\u{30fc}\u{30b9}.exe",
        "C:\\PC\u{30b2}\u{30fc}\u{30e0}\\run.exe",
        "C:\\\u{b5}Torrent\\a.exe",
    ];
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
    // Un punto fuera de la ruta no es una extensión: «Игры.рас» no se marca.
    input["steps"][0]["app"] = "\u{418}\u{433}\u{440}\u{44b}.\u{440}\u{430}\u{441}".into();
    let pages = shown(&input);
    assert!(!pages.contains("[U+") && !pages.contains(NOTICE), "{pages}");
}

#[test]
fn a_whole_lookalike_name_in_a_latin_path_is_marked() {
    // Consecuencia aceptada por la raíz: se ven idénticos a CCCP, Exo y OXI.
    for (path, marked) in [
        (
            "C:\\\u{421}\u{421}\u{421}\u{420}.exe",
            "[U+0421][U+0421][U+0421][U+0420].exe",
        ),
        (
            "C:\\\u{415}\u{445}\u{43e}.exe",
            "[U+0415][U+0445][U+043E].exe",
        ),
        (
            "C:\\\u{39f}\u{3a7}\u{399}.bat",
            "[U+039F][U+03A7][U+0399].bat",
        ),
    ] {
        let pages = with_path(path);
        assert!(pages.contains(marked) && pages.contains(NOTICE), "{pages}");
    }
}

fn assert_blocked(path: &str) {
    let input = input_with_path(path);
    assert_eq!(
        review_pages(&input.to_string()),
        Err(ReviewError::Blocked),
        "{path}"
    );
}

#[test]
fn a_program_extension_that_is_not_ascii_blocks_the_review() {
    // Regla de la raíz: extensión del último segmento con algo que no es ASCII
    // alfanumérico. Casos medidos por el revisor, con y sin letras propias.
    let games = "\u{418}\u{433}\u{440}\u{44b}";
    let exe = "\u{435}\u{445}\u{435}";
    for name in [
        "steam.\u{a4f0}\u{a4eb}\u{a4f0}".to_owned(),
        "steam.\u{13ac}\u{13a0}\u{13ac}".into(),
        "steam.\u{585}\u{57d}".into(),
        "steam.\u{ff45}\u{ff58}\u{ff45}".into(),
        "steam.\u{435}xe".into(),
        format!("steam.{exe}\u{200b}\u{200b}\u{200b}"),
        format!("steam.{exe}\u{fe0f}\u{fe0f}\u{fe0f}"),
        format!("steam.{exe}\u{301}\u{301}\u{301}"),
        format!("steam.{exe} \u{200b}"),
        format!("steam.{exe} .\u{200b}"),
        format!("steam.{exe}\u{3000}"),
        format!("steam.{exe}\u{a0}"),
        format!("steam.{exe} ."),
        "steam.exe\u{200b}".into(),
        "steam.ex e".into(),
        ".\u{435}\u{445}\u{435}".into(),
        "game.caf\u{e9}".into(),
        "\u{438}\u{433}\u{440}\u{44b}.\u{440}\u{444}".into(),
    ] {
        assert_blocked(&format!("C:\\Games\\{name}"));
        assert_blocked(&format!("C:/{games}/{name}"));
    }
    // Sin falsos bloqueos: extensión ASCII, carpetas no ASCII o con punto, punto
    // inicial y programa sin extensión.
    for path in [
        format!("C:\\{games}\\game.exe"),
        "C:\\Games\\caf\u{e9}.v2\\x.exe".into(),
        "C:\\\u{ff30}\u{ff23}\u{30b2}\u{30fc}\u{30e0}\\a.exe".into(),
        format!("C:\\Games\\my.{exe}\\x.exe"),
        format!("C:\\Games\\my.{exe}\\steam"),
        "C:/Games/my.folder/x.tar.gz".into(),
        "C:\\Games\\.exe".into(),
        "C:\\Games\\steam".into(),
        format!("C:\\Games\\{games}"),
    ] {
        let pages = review_pages(&input_with_path(&path).to_string()).expect("no bloquea");
        assert!(can_trust(&pages), "{path}");
    }
}

#[test]
fn letters_outside_the_pair_list_still_count_as_lookalikes() {
    // B2: lisu y cherokee se confunden siempre; las armenias, «Ӏ», «Ꙇ» y «Ϳ»
    // están en la lista. Ninguna es «propia», así que no apagan la regla C.
    for (path, marked) in [
        (
            "C:\\Program Files (x86)\\\u{a4e2}\u{a4d4}\u{a4f0}\u{a4ee}\u{a4df}\\steam.exe",
            "[U+A4E2][U+A4D4][U+A4F0][U+A4EE][U+A4DF]",
        ),
        (
            "C:\\Program Files (x86)\\\u{13da}\u{13a2}\u{13ac}\u{13aa}\u{13b7}\\steam.exe",
            "[U+13DA][U+13A2][U+13AC][U+13AA][U+13B7]",
        ),
        (
            "C:\\Games\\\u{a4e2}\u{a4d4}\u{a4f0}\u{a4ee}\u{a4df}.exe",
            "[U+A4E2][U+A4D4][U+A4F0][U+A4EE][U+A4DF].exe",
        ),
        (
            "C:\\Games\\\u{585}\u{57d}\\x.exe",
            "[U+0585][U+057D]\\x.exe",
        ),
        (
            "C:\\Games\\\u{410}\u{421}\u{421} \u{4c0}\\\u{430}\u{441}\u{441}.exe",
            "[U+0410][U+0421][U+0421] [U+04C0]\\[U+0430][U+0441][U+0441].exe",
        ),
        (
            "C:\\Games\\\u{4c0}\u{410}\u{421}\u{421}\\x.exe",
            "[U+04C0][U+0410][U+0421][U+0421]",
        ),
        (
            "C:\\Games\\\u{a646}\u{410}\u{421}\u{421}\\x.exe",
            "[U+A646][U+0410][U+0421][U+0421]",
        ),
        ("C:\\Games\\\u{37f}ava\\x.exe", "[U+037F]ava"),
        // N-b: con una letra ASCII, una kana no esconde el ancho completo.
        (
            "C:\\Games\\St\u{ff45}am\u{30fc}\\steam.exe",
            "St[U+FF45]am\u{30fc}",
        ),
    ] {
        let pages = with_path(path);
        assert!(pages.contains(marked) && pages.contains(NOTICE), "{pages}");
    }
}

#[test]
fn a_disguised_program_path_blocks_the_review() {
    let ivan = "\u{418}\u{432}\u{430}\u{43d}";
    let mut blocked = vec![
        "C:\\Program Files (x86)\\Steam\\steam.\u{435}\u{445}\u{435}".to_owned(),
        format!("C:\\Users\\{ivan}\\steam.\u{435}\u{445}\u{435}"),
        "C:\\Games\\steam.\u{415}\u{425}\u{415}".into(),
        "C:\\Games\\steam.e\u{445}e".into(),
        "C:\\Games\\steam.\u{ff45}\u{ff58}\u{ff45}".into(),
        "C:\\Games\\steam.\u{4e7}xe".into(),
    ];
    for sign in [
        '\u{2024}', '\u{ff0e}', '\u{fe52}', '\u{a4f8}', '\u{701}', '\u{702}', '\u{2215}',
        '\u{2044}', '\u{29f5}', '\u{29f8}', '\u{29f9}', '\u{2216}', '\u{ff0f}', '\u{ff3c}',
        '\u{fe68}', '\u{660}', '\u{6f0}', '\u{2571}', '\u{2572}',
    ] {
        blocked.push(format!("C:\\Games\\steam{sign}exe"));
        blocked.push(format!("C:\\Games{sign}steam.exe"));
    }
    for path in &blocked {
        let input = input_with_path(path);
        assert_eq!(
            review_pages(&input.to_string()),
            Err(ReviewError::Blocked),
            "{path}"
        );
        // En otro paso que no sea el primero, también.
        let mut later = corto();
        later["steps"][2]["path"] = path.as_str().into();
        assert_eq!(
            review_pages(&later.to_string()),
            Err(ReviewError::Blocked),
            "{path}"
        );
    }
}

#[test]
fn lookalike_signs_outside_the_program_path_only_mark() {
    let mut input = corto();
    input["steps"][0]["args"] = serde_json::json!(["--log=a\u{2024}txt"]);
    input["steps"][0]["app"] = "Steam\u{ff0f}Big".into();
    let pages = review_pages(&input.to_string()).expect("solo marca");
    assert!(can_trust(&pages));
    let pages = pages.join("\n");
    assert!(pages.contains("--log=a[U+2024]txt") && pages.contains("Steam[U+FF0F]Big"));
    assert!(pages.contains(NOTICE));
    // Un punto ASCII en la misma posición no bloquea ni marca.
    let clean = with_path("C:\\Games\\steam.exe");
    assert!(!clean.contains("[U+") && !clean.contains(NOTICE));
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
    // Sin letras propias en la ruta, «ЁХО» precompuesta cuenta como de la lista.
    let ivan = "\u{418}\u{432}\u{430}\u{43d}";
    for path in [
        "C:\\Games\\\u{401}\u{425}\u{41e}\\x.exe".to_owned(),
        "C:\\Games\\\u{415}\u{308}\u{425}\u{41e}\\x.exe".to_owned(),
    ] {
        assert!(with_path(&path).contains(NOTICE), "{path}");
        let own = path.replace("Games", ivan);
        assert!(!with_path(&own).contains(NOTICE), "{own}");
    }
}

#[test]
fn labels_are_cut_without_splitting_a_mark() {
    let mut input = corto();
    input["name"] = format!("{}\u{435}bc", "a".repeat(57)).into();
    let pages = shown(&input);
    assert!(pages.contains(&format!("«{}…»", "a".repeat(57))), "{pages}");
    assert!(!pages.contains("[U+04"), "{pages}");
    assert!(pages.contains(NOTICE));
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
    let clean = review_pages(&corto().to_string()).expect("limpio");
    let forged = input_with_path("C:\\Program Files (x86)\\St\u{435}am\\steam.exe");
    let forged = review_pages(&forged.to_string()).expect("solo marca");
    assert!(can_trust(&forged));
    assert_ne!(frame_pages(&clean), frame_pages(&forged));
    // Una palabra entera en cirílico, con letras propias, sale tal cual.
    let cyrillic = "\u{418}\u{433}\u{440}\u{430}";
    let own = input_with_path(&format!("C:\\Program Files (x86)\\{cyrillic}\\steam.exe"));
    let own = review_pages(&own.to_string()).expect("limpio");
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
        "\\=/,;\" \u{3000}\u{2028}\u{2024}".repeat(5_000),
    ];
    for name in weird {
        let mut input = corto();
        input["name"] = name.into();
        let message = input.to_string();
        let result = review_pages(&message);
        assert!(message.len() > 64 * 1024 || result.is_ok(), "{result:?}");
    }
    for path in [
        ".".repeat(250),
        "\\.".repeat(125),
        format!("a.{}", "\u{301}".repeat(250)),
    ] {
        let message = input_with_path(&path).to_string();
        let result = review_pages(&message);
        assert!(
            result.is_ok() || matches!(result, Err(ReviewError::TooLong | ReviewError::Blocked)),
            "{result:?}"
        );
    }
}

#[test]
fn a_program_path_that_windows_would_trim_is_blocked() {
    // B1: Windows quita el espacio o el punto final y `::$DATA` abre el mismo
    // archivo, así que estas rutas ejecutarían `steam.ехе`.
    let games = "\u{418}\u{433}\u{440}\u{44b}";
    let exe = "\u{435}\u{445}\u{435}";
    for path in [
        format!("C:\\{games}\\steam.{exe} "),
        format!("C:\\{games}\\steam.{exe}."),
        format!("C:\\{games}\\steam.{exe}::$DATA"),
        format!("C:\\Games\\steam.{exe} "),
        "C:\\Games\\steam.exe ".to_owned(),
        "C:\\Games\\steam.exe.".into(),
        "C:\\Games\\steam.exe\u{a0}".into(),
        // Sin extensión, solo B1 los para: NBSP y U+3000 son blancos también.
        "C:\\Games\\steam\u{a0}".into(),
        "C:\\Games\\steam\u{3000}".into(),
        "C:\\Games\\steam.exe:stream".into(),
        "\\\\?\\C:\\Games\\steam.exe::$DATA".into(),
    ] {
        let input = input_with_path(&path);
        assert_eq!(
            review_pages(&input.to_string()),
            Err(ReviewError::Blocked),
            "{path}"
        );
    }
    // Unidad normal, ruta larga de Windows y ruta relativa: siguen limpias.
    for path in [
        "C:\\Games\\steam.exe",
        "C:/Games/steam.exe",
        "\\\\?\\C:\\Games\\steam.exe",
        "//?/C:/Games/steam.exe",
        "\\\\.\\D:\\Games\\steam.exe",
        "D:steam.exe",
        "Games\\steam.exe",
    ] {
        let pages = review_pages(&input_with_path(path).to_string()).expect("limpia");
        assert!(can_trust(&pages), "{path}");
    }
}

#[test]
fn lookalike_words_are_judged_against_their_own_alphabet() {
    // N1: una letra propia de OTRO alfabeto (katakana «ー», CJK «一») no apaga
    // la regla del texto latino para una palabra cirílica.
    let acc = "\u{410}\u{421}\u{421}";
    let acc_marked = "[U+0410][U+0421][U+0421]";
    for path in [
        format!("C:\\Steam\\common\\{acc}\u{30fc}2024\\acc.exe"),
        format!("C:\\Games\\{acc} \u{4e00} 2024\\acc.exe"),
    ] {
        let pages = with_path(&path);
        assert!(
            pages.contains(acc_marked) && pages.contains(NOTICE),
            "{pages}"
        );
    }
    // N3 y dígitos: el ancho completo junto a kana o CJK y los números de estilo
    // latino no se marcan. Una extensión no cruza «\» ni «/».
    for path in [
        "C:\\\u{ff30}\u{ff23}\u{30b2}\u{30fc}\u{30e0}\\x.exe",
        "C:\\\u{7b2c}\u{ff12}\u{7ae0}\\x.exe",
        "C:\\\u{418}\u{433}\u{440}\u{430}\u{ff12}\\x.exe",
        "C:\\Games\\F1 \u{2153}\\x.exe",
        "C:/\u{418}\u{433}\u{440}\u{44b}/x.\u{435}\u{445}/ru",
        "C:\\\u{418}\u{433}\u{440}\u{44b}\\x.\u{435}\u{445}\\ru",
    ] {
        let pages = with_path(path);
        assert!(pages.contains(path), "{path}");
        assert!(!pages.contains("[U+") && !pages.contains(NOTICE), "{path}");
    }
    // Junto a latín, el ancho completo sí se marca.
    assert!(with_path("C:\\Games\\obs\u{ff16}\u{ff14}.exe").contains("obs[U+FF16][U+FF14]"));
}
