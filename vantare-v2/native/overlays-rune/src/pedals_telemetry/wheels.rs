//! Wheel artwork: the same files GPUI paints. The name→file match mirrors
//! `native/ui/src/pedals_telemetry/wheels.rs` (shape only; the id list is
//! `vantare_domain::pedals_telemetry::WHEELS`). `include_bytes!` takes the
//! files from `ui/`, never a copy.
pub(super) fn svg(wheel: &str) -> &'static [u8] {
    match wheel {
        "alpine-a424" => include_bytes!("../../../ui/src/pedals_telemetry/wheels/alpine-a424.svg"),
        "aston-martin-valkyrie" => {
            include_bytes!("../../../ui/src/pedals_telemetry/wheels/aston-martin-valkyrie.svg")
        }
        "bmw-m-hybrid-v8-pre-le-mans" => {
            include_bytes!(
                "../../../ui/src/pedals_telemetry/wheels/bmw-m-hybrid-v8-pre-le-mans.svg"
            )
        }
        "bmw-m-hybrid-v8" => {
            include_bytes!("../../../ui/src/pedals_telemetry/wheels/bmw-m-hybrid-v8.svg")
        }
        "cadillac-v-series-r" => {
            include_bytes!("../../../ui/src/pedals_telemetry/wheels/cadillac-v-series-r.svg")
        }
        "ferrari-499p" => {
            include_bytes!("../../../ui/src/pedals_telemetry/wheels/ferrari-499p.svg")
        }
        "genesis-gmr-001" => {
            include_bytes!("../../../ui/src/pedals_telemetry/wheels/genesis-gmr-001.svg")
        }
        "glickenhaus-scg007" => {
            include_bytes!("../../../ui/src/pedals_telemetry/wheels/glickenhaus-scg007.svg")
        }
        "isotta-fraschini-tipo6" => {
            include_bytes!("../../../ui/src/pedals_telemetry/wheels/isotta-fraschini-tipo6.svg")
        }
        "lamborghini-sc63" => {
            include_bytes!("../../../ui/src/pedals_telemetry/wheels/lamborghini-sc63.svg")
        }
        "peugeot-9x8" => include_bytes!("../../../ui/src/pedals_telemetry/wheels/peugeot-9x8.svg"),
        "peugeot-9x8-2024" => {
            include_bytes!("../../../ui/src/pedals_telemetry/wheels/peugeot-9x8-2024.svg")
        }
        "porsche-963" => include_bytes!("../../../ui/src/pedals_telemetry/wheels/porsche-963.svg"),
        "toyota-gr010" | "toyota-tr010" => {
            include_bytes!("../../../ui/src/pedals_telemetry/wheels/toyota-gr010.svg")
        }
        "vanwall-vandervell-680" => {
            include_bytes!("../../../ui/src/pedals_telemetry/wheels/vanwall-vandervell-680.svg")
        }
        "aston-martin-vantage-gt3" => {
            include_bytes!("../../../ui/src/pedals_telemetry/wheels/aston-martin-vantage-gt3.svg")
        }
        "bmw-m4-gt3" => include_bytes!("../../../ui/src/pedals_telemetry/wheels/bmw-m4-gt3.svg"),
        "corvette-z06-gt3" => {
            include_bytes!("../../../ui/src/pedals_telemetry/wheels/corvette-z06-gt3.svg")
        }
        "ferrari-296-gt3" => {
            include_bytes!("../../../ui/src/pedals_telemetry/wheels/ferrari-296-gt3.svg")
        }
        "ford-mustang-gt3" => {
            include_bytes!("../../../ui/src/pedals_telemetry/wheels/ford-mustang-gt3.svg")
        }
        "lamborghini-huracan-gt3" => {
            include_bytes!("../../../ui/src/pedals_telemetry/wheels/lamborghini-huracan-gt3.svg")
        }
        "lexus-rc-f-gt3" => {
            include_bytes!("../../../ui/src/pedals_telemetry/wheels/lexus-rc-f-gt3.svg")
        }
        "mclaren-720s-gt3" => {
            include_bytes!("../../../ui/src/pedals_telemetry/wheels/mclaren-720s-gt3.svg")
        }
        "mercedes-amg-gt3" => {
            include_bytes!("../../../ui/src/pedals_telemetry/wheels/mercedes-amg-gt3.svg")
        }
        "porsche-911-gt3-r" => {
            include_bytes!("../../../ui/src/pedals_telemetry/wheels/porsche-911-gt3-r.svg")
        }
        "oreca-07" => include_bytes!("../../../ui/src/pedals_telemetry/wheels/oreca-07.svg"),
        "adess-ad25" => include_bytes!("../../../ui/src/pedals_telemetry/wheels/adess-ad25.svg"),
        "duqueine-d09" => {
            include_bytes!("../../../ui/src/pedals_telemetry/wheels/duqueine-d09.svg")
        }
        "ginetta-g61-lt-p3-evo" => {
            include_bytes!("../../../ui/src/pedals_telemetry/wheels/ginetta-g61-lt-p3-evo.svg")
        }
        "ligier-js-p325" => {
            include_bytes!("../../../ui/src/pedals_telemetry/wheels/ligier-js-p325.svg")
        }
        _ => include_bytes!("../../../ui/src/pedals_telemetry/wheel.svg"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_domain_wheel_resolves_to_the_same_ui_file() {
        for id in vantare_domain::pedals_telemetry::WHEELS {
            let svg = std::str::from_utf8(svg(id)).expect("SVG UTF-8");
            assert!(svg.contains("<svg"), "{id} no es un SVG");
        }
        assert_eq!(
            svg("generic"),
            &include_bytes!("../../../ui/src/pedals_telemetry/wheel.svg")[..]
        );
        assert_eq!(
            svg("ferrari-499p"),
            &include_bytes!("../../../ui/src/pedals_telemetry/wheels/ferrari-499p.svg")[..]
        );
        assert_eq!(
            svg("toyota-tr010"),
            &include_bytes!("../../../ui/src/pedals_telemetry/wheels/toyota-gr010.svg")[..]
        );
    }
}
