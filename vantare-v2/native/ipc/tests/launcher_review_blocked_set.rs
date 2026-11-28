//! Qué rutas se bloquean (#2579), sin mirar el motivo. #2903 no puede cambiar
//! este conjunto: la tabla y las reglas de aquí también pasan con el código
//! anterior (nightly 3e8bd8fd3). Un cambio en este archivo cambia lo que se
//! bloquea.
//!
//! `\u{…}` a propósito: en el código fuente un homoglifo no se ve.

use vantare_ipc::launcher::review::{ReviewError, review_pages};

fn blocked(input: &mut serde_json::Value, path: &str) -> bool {
    input["steps"][0]["path"] = path.into();
    matches!(
        review_pages(&input.to_string()),
        Err(ReviewError::Blocked(_))
    )
}

fn one_step() -> serde_json::Value {
    serde_json::json!({
        "name": "QA", "startup": false, "hotkey": "", "firstDelay": 0, "retries": 0,
        "steps": [{"app": "QA", "path": "", "args": [], "steam": false, "delay": 0}]
    })
}

const GAMES: &str = "\u{418}\u{433}\u{440}\u{44b}";
const EXE: &str = "\u{435}\u{445}\u{435}";
/// Puntos y barras que imitan: bloquean en cualquier parte de la ruta.
const SIGNS: [char; 19] = [
    '\u{2024}', '\u{ff0e}', '\u{fe52}', '\u{a4f8}', '\u{701}', '\u{702}', '\u{660}', '\u{6f0}',
    '\u{2215}', '\u{2044}', '\u{29f5}', '\u{29f8}', '\u{29f9}', '\u{2216}', '\u{ff0f}', '\u{ff3c}',
    '\u{fe68}', '\u{2571}', '\u{2572}',
];
const DOTS: [char; 8] = [
    '\u{b7}', '\u{387}', '\u{2027}', '\u{22c5}', '\u{ff61}', '\u{3002}', '\u{30fb}', '\u{323}',
];

fn blocked_corpus() -> Vec<String> {
    let mut paths = Vec::new();
    for name in [
        "steam.\u{a4f0}\u{a4eb}\u{a4f0}".to_owned(),
        "steam.\u{13ac}\u{13a0}\u{13ac}".into(),
        "steam.\u{585}\u{57d}".into(),
        "steam.\u{ff45}\u{ff58}\u{ff45}".into(),
        "steam.\u{435}xe".into(),
        format!("steam.{EXE}\u{200b}\u{200b}\u{200b}"),
        format!("steam.{EXE}\u{fe0f}\u{fe0f}\u{fe0f}"),
        format!("steam.{EXE}\u{301}\u{301}\u{301}"),
        format!("steam.{EXE} \u{200b}"),
        format!("steam.{EXE} .\u{200b}"),
        format!("steam.{EXE}\u{3000}"),
        format!("steam.{EXE}\u{a0}"),
        format!("steam.{EXE} ."),
        "steam.exe\u{200b}".into(),
        "steam.ex e".into(),
        "game.caf\u{e9}".into(),
        "\u{438}\u{433}\u{440}\u{44b}.\u{440}\u{444}".into(),
        "app.appref-ms".into(),
        format!(".{EXE}"),
    ] {
        paths.push(format!("C:\\Games\\{name}"));
        paths.push(format!("C:/{GAMES}/{name}"));
    }
    for dot in DOTS {
        paths.push(format!("C:\\Program Files (x86)\\Steam\\steam{dot}exe"));
    }
    for sign in SIGNS {
        paths.push(format!("C:\\Games\\steam{sign}exe"));
        paths.push(format!("C:\\Games{sign}steam.exe"));
    }
    paths.extend([
        "C:\\Games\\steam".to_owned(),
        format!("C:\\Games\\{GAMES}"),
        format!("C:\\Games\\my.{EXE}\\steam"),
        format!("C:\\{GAMES}\\steam.{EXE}\\"),
        format!("C:\\{GAMES}\\steam.{EXE}\\.\\"),
        format!("C:\\{GAMES}\\{GAMES}"),
        format!("C:\\{GAMES}\\steam.{EXE} "),
        format!("C:\\{GAMES}\\steam.{EXE}."),
        format!("C:\\{GAMES}\\steam.{EXE}::$DATA"),
        format!("C:\\Games\\steam.{EXE} "),
        format!("C:\\Users\\\u{418}\u{432}\u{430}\u{43d}\\steam.{EXE}"),
        "C:\\Program Files (x86)\\Steam\\steam.\u{435}\u{445}\u{435}".into(),
        "C:\\Games\\steam.\u{415}\u{425}\u{415}".into(),
        "C:\\Games\\steam.e\u{445}e".into(),
        "C:\\Games\\steam.\u{4e7}xe".into(),
        "C:\\Games\\steam.exe\\".into(),
        "C:\\Games\\steam.".into(),
        "C:".into(),
        "C:\\".into(),
        "D:x".into(),
        "\\\\server\\share".into(),
        "\\\\server\\share\\".into(),
        "C:\\Games\u{2215}steam".into(),
        "C:\\\u{2024}\\steam.exe".into(),
        "C:\\Games\\\u{410}\u{421}\u{421}".into(),
        "C:\\\u{420}rogram\\app.appref-ms".into(),
        "C:\\Games\\\u{410}\u{421}\u{421}\\steam".into(),
        "C:\\Games\\obs\u{2010}studio".into(),
        "C:\\Games\\\u{43d}\u{430}\u{441}\u{442}\u{440}\u{43e}\u{439}\u{43a}\u{438}.\u{43a}\u{43e}\u{43d}\u{444}".into(),
        "C:\\Games\\\u{421}\u{435}\u{437}\u{43e}\u{43d} 1.\u{42d}\u{442}\u{430}\u{43f} 2".into(),
        "C:\\Games\\steam.exe ".into(),
        "C:\\Games\\steam.exe\u{a0}".into(),
        "C:\\Games\\steam\u{a0}".into(),
        "C:\\Games\\steam\u{3000}".into(),
        "C:\\Games\\steam.exe:stream".into(),
        "\\\\?\\C:\\Games\\steam.exe::$DATA".into(),
    ]);
    paths
}

fn allowed_corpus() -> Vec<String> {
    vec![
        // Sin ruta no es «bloqueado»: es «no disponible».
        String::new(),
        format!("C:\\{GAMES}\\game.exe"),
        "C:\\Games\\caf\u{e9}.v2\\x.exe".into(),
        "C:\\\u{ff30}\u{ff23}\u{30b2}\u{30fc}\u{30e0}\\a.exe".into(),
        format!("C:\\Games\\my.{EXE}\\x.exe"),
        format!("C:\\Games\\my.{EXE}\\x.y.exe"),
        "C:/Games/my.folder/x.tar.gz".into(),
        "C:\\Games\\.exe".into(),
        "C:\\\u{30b2}\u{30fc}\u{30e0}\\\u{30b2}\u{30fc}\u{30e0}\u{30fb}\u{30e9}\u{30f3}\u{30c1}\u{30e3}\u{30fc}.exe".into(),
        "C:\\Games\\steam.exe".into(),
        "C:/Games/steam.exe".into(),
        "\\\\?\\C:\\Games\\steam.exe".into(),
        "//?/C:/Games/steam.exe".into(),
        "\\\\.\\D:\\Games\\steam.exe".into(),
        "D:steam.exe".into(),
        "Games\\steam.exe".into(),
        "\\\\server\\share\\steam.exe".into(),
        "C:\\\u{421}\u{421}\u{421}\u{420}.exe".into(),
        "C:\\\u{415}\u{445}\u{43e}.exe".into(),
        "C:\\\u{39f}\u{3a7}\u{399}.bat".into(),
        "C:\\Games\\\u{a4e2}\u{a4d4}\u{a4f0}\u{a4ee}\u{a4df}.exe".into(),
        "C:\\Games\\\u{585}\u{57d}\\x.exe".into(),
        "C:\\Games\\\u{37f}ava\\x.exe".into(),
        "C:\\Games\\St\u{ff45}am\u{30fc}\\steam.exe".into(),
        "C:\\M\u{4e7}tor.exe".into(),
        "C:\\Program Files (x86)\\St\u{435}am\\steam.exe".into(),
    ]
}

#[test]
fn the_corpus_of_issue_2579_blocks_exactly_the_same_paths() {
    let mut input = one_step();
    for path in blocked_corpus() {
        assert!(blocked(&mut input, &path), "debe bloquear: {path:?}");
    }
    for path in allowed_corpus() {
        assert!(!blocked(&mut input, &path), "no debe bloquear: {path:?}");
    }
}

#[test]
fn one_character_blocks_only_by_the_closed_rules() {
    // Cada carácter de los bloques con puntos, letras que imitan e invisibles,
    // en cuatro sitios de la ruta. La regla de cada sitio es la de #2579.
    let mut input = one_step();
    let ranges = [
        0..=0x33ff,
        0xa000..=0xabff,
        0xfe00..=0xffff,
        0x1d400..=0x1d7ff,
        0xe0000..=0xe007f,
    ];
    for c in ranges.into_iter().flatten().filter_map(char::from_u32) {
        let sign = SIGNS.contains(&c) || c == ':';
        for (path, expected) in [
            // Sin punto ASCII no hay extensión.
            (format!("C:\\Games\\steam{c}exe"), c != '.'),
            // En una carpeta o en el nombre, con «.exe», solo los signos y «:».
            (format!("C:\\Games{c}x\\steam.exe"), sign),
            (format!("C:\\Games\\a{c}b.exe"), sign),
            // Al final, la extensión deja de ser ASCII alfanumérica.
            (
                format!("C:\\Games\\steam.exe{c}"),
                !c.is_ascii_alphanumeric(),
            ),
        ] {
            assert_eq!(blocked(&mut input, &path), expected, "{path:?}");
        }
    }
}
