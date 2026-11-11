//! Visual editor limits/catalogs of the frozen Hub, separate from service document limits.
pub const NAME_MAX: usize = 32;
pub const DESCRIPTION_MAX: usize = 160;
pub const FAVORITE_MAX: usize = 48;
pub const SIMULATORS: &[(&str,&str)] = &[

    ("lmu", "Le Mans Ultimate"),
    ("iracing", "iRacing"),
    ("acc", "Assetto Corsa Competizione"),
    ("ac-evo", "Assetto Corsa EVO"),
    ("ac", "Assetto Corsa"),
    ("ams2", "Automobilista 2"),
    ("rf2", "rFactor 2"),
    ("r3e", "RaceRoom"),
    ("f1", "EA SPORTS F1"),
    ("gt7", "Gran Turismo 7"),
];
pub const COUNTRIES: &[(&str,&str)] = &[

    ("DE", "Alemania"),
    ("AR", "Argentina"),
    ("AU", "Australia"),
    ("AT", "Austria"),
    ("BE", "Bélgica"),
    ("BR", "Brasil"),
    ("BG", "Bulgaria"),
    ("CA", "Canadá"),
    ("CL", "Chile"),
    ("CN", "China"),
    ("CO", "Colombia"),
    ("KR", "Corea del Sur"),
    ("HR", "Croacia"),
    ("DK", "Dinamarca"),
    ("SK", "Eslovaquia"),
    ("SI", "Eslovenia"),
    ("ES", "España"),
    ("US", "Estados Unidos"),
    ("EE", "Estonia"),
    ("FI", "Finlandia"),
    ("FR", "Francia"),
    ("GR", "Grecia"),
    ("HU", "Hungría"),
    ("IN", "India"),
    ("ID", "Indonesia"),
    ("IE", "Irlanda"),
    ("IT", "Italia"),
    ("JP", "Japón"),
    ("LV", "Letonia"),
    ("LT", "Lituania"),
    ("LU", "Luxemburgo"),
    ("MX", "México"),
    ("MC", "Mónaco"),
    ("NO", "Noruega"),
    ("NZ", "Nueva Zelanda"),
    ("NL", "Países Bajos"),
    ("PE", "Perú"),
    ("PL", "Polonia"),
    ("PT", "Portugal"),
    ("GB", "Reino Unido"),
    ("CZ", "República Checa"),
    ("RO", "Rumanía"),
    ("SE", "Suecia"),
    ("CH", "Suiza"),
    ("TH", "Tailandia"),
    ("TR", "Turquía"),
    ("UA", "Ucrania"),
    ("UY", "Uruguay"),
];
#[cfg(test)]
mod tests {
    use super::*;
    const FROZEN: &str = include_str!("../../../hub/src/pilot.rs");
    fn catalog(name: &str) -> Vec<&'static str> {
        let declaration = format!("pub const {name}:");
        let initializer = FROZEN.split_once(&declaration).expect("catalog").1.split_once("= &[").expect("initializer").1;
        let body = initializer.split_once("];").expect("end").0;
        assert!(!body.contains("\\\""), "escaped literals require an updated parity reader");
        body.split('"').enumerate().filter_map(|(index,value)| (index % 2 == 1).then_some(value)).collect()
    }
    #[test]
    fn visual_catalogs_and_limits_match_the_frozen_editor_without_linking_gpui() {
        for (name, own) in [("SIMULATORS",SIMULATORS),("COUNTRIES",COUNTRIES)] {
            let strings:Vec<_> = own.iter().flat_map(|(id,label)| [*id,*label]).collect();
            assert_eq!(catalog(name),strings);
        }
        let compact:String = FROZEN.chars().filter(|c| !c.is_whitespace()).collect();
        for (name,value) in [("NAME_MAX",NAME_MAX),("DESCRIPTION_MAX",DESCRIPTION_MAX),("FAVORITE_MAX",FAVORITE_MAX)] {
            let declaration=format!("pubconst{name}:usize=");
            let observed=compact.split_once(&declaration).expect("limit").1.split(';').next().expect("value").parse::<usize>().expect("integer");
            assert_eq!(observed,value);
        }
    }
}
