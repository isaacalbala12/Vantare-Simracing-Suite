//! `TrackMap` Eficiencia: trazado y coches comparten la misma proyección.
//! El modelo aún no tiene geometría de circuito ni estado de conexión. Sin
//! geometría explícita no se dibuja un circuito a partir del nombre o los coches.

use crate::format::{Language, Preferences};
use crate::{CarId, Quality, Snapshot};

const VIEWPORT: (f64, f64) = (320.0, 220.0);
const PADDING: f64 = 12.0;

/// Geometría externa en el mismo plano SI que `Car::pose` (metros).
/// No es telemetría; la escena de paridad la suministra explícitamente.
pub struct Geometry<'a> {
    pub track_name: &'a str,
    pub label: &'a str,
    pub points_m: &'a [(f64, f64)],
    pub synthetic: bool,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Point {
    pub x: f64,
    pub y: f64,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Marker {
    pub id: CarId,
    pub point: Point,
    pub is_player: bool,
    pub class_name: Option<String>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct ViewModel {
    pub outline: Vec<Point>,
    pub markers: Vec<Marker>,
    pub track_label: Option<String>,
    pub reference_text: Option<String>,
    pub empty_text: String,
}

/// El nombre debe coincidir exactamente (ignorando mayúsculas y espacios
/// exteriores). Nunca se elige un mapa parecido ni una geometría de reserva.
pub fn project_with_geometry(
    snapshot: &Snapshot,
    prefs: Preferences,
    geometry: Option<&Geometry<'_>>,
) -> ViewModel {
    let mut vm = ViewModel {
        outline: Vec::new(),
        markers: Vec::new(),
        track_label: None,
        reference_text: None,
        empty_text: match prefs.language {
            Language::Es => "PISTA SIN MAPA",
            Language::En => "TRACK NOT MAPPED",
        }
        .into(),
    };
    if matches!(
        snapshot.state.source_state,
        crate::SourceState::Waiting | crate::SourceState::Lost
    ) {
        vm.empty_text = match prefs.language {
            Language::Es => "SIN TELEMETRÍA",
            Language::En => "NO TELEMETRY",
        }
        .into();
        return vm;
    }
    let name = match &snapshot.state.session.track_name {
        Quality::Reliable(name) | Quality::Estimated(name) | Quality::Stale(name) => name,
        Quality::Unavailable => return vm,
    };
    let Some(geometry) = geometry
        .filter(|g| !name.trim().is_empty() && name.trim().eq_ignore_ascii_case(g.track_name))
    else {
        return vm;
    };
    let Some(projection) = projection(geometry.points_m) else {
        return vm;
    };
    // No conservar texto oculto: cambiar el idioma no repinta un mapa sin aviso.
    vm.empty_text.clear();
    vm.outline = geometry
        .points_m
        .iter()
        .map(|&(x, y)| {
            let point = projection.point(x, y);
            // El path productivo congela cada coordenada con toFixed(2).
            Point {
                x: (point.x * 100.0).round() / 100.0,
                y: (point.y * 100.0).round() / 100.0,
            }
        })
        .collect();
    vm.track_label = Some(geometry.label.into());
    if geometry.synthetic {
        vm.reference_text = Some(
            match prefs.language {
                Language::Es => "REFERENCIA",
                Language::En => "REFERENCE",
            }
            .into(),
        );
    }
    // Stale se conserva como en el productivo; ausente o no finito se omite.
    // Estimated no equivale a groundPosition fresh/stale en ese contrato.
    vm.markers = snapshot
        .state
        .cars
        .iter()
        .filter_map(|car| {
            let pose = match &car.pose {
                Quality::Reliable(pose) | Quality::Stale(pose) => pose,
                Quality::Estimated(_) | Quality::Unavailable => return None,
            };
            if !pose.x_m.is_finite() || !pose.y_m.is_finite() {
                return None;
            }
            let point = projection.point(pose.x_m, pose.y_m);
            if !point.x.is_finite() || !point.y.is_finite() {
                return None;
            }
            Some(Marker {
                id: car.id,
                point,
                is_player: snapshot.state.player.is_some_and(|p| p.car == car.id),
                class_name: car.class.as_ref().map(|class| class.name.clone()),
            })
        })
        .collect();
    vm
}

struct Projection {
    scale: f64,
    offset_x: f64,
    offset_y: f64,
}

impl Projection {
    fn point(&self, x: f64, y: f64) -> Point {
        Point {
            x: x * self.scale + self.offset_x,
            y: y * self.scale + self.offset_y,
        }
    }
}

fn projection(points: &[(f64, f64)]) -> Option<Projection> {
    if points.len() < 3 || points.iter().any(|(x, y)| !x.is_finite() || !y.is_finite()) {
        return None;
    }
    let (mut min_x, mut min_y) = (f64::INFINITY, f64::INFINITY);
    let (mut max_x, mut max_y) = (f64::NEG_INFINITY, f64::NEG_INFINITY);
    for &(x, y) in points {
        min_x = min_x.min(x);
        min_y = min_y.min(y);
        max_x = max_x.max(x);
        max_y = max_y.max(y);
    }
    let (span_x, span_y) = (max_x - min_x, max_y - min_y);
    let (width, height) = (VIEWPORT.0 - PADDING * 2.0, VIEWPORT.1 - PADDING * 2.0);
    let scale = (if span_x > 0.0 {
        width / span_x
    } else {
        f64::INFINITY
    })
    .min(if span_y > 0.0 {
        height / span_y
    } else {
        f64::INFINITY
    });
    let offset_x = PADDING + (width - span_x * scale) / 2.0 - min_x * scale;
    let offset_y = PADDING + (height - span_y * scale) / 2.0 - min_y * scale;
    (scale.is_finite() && scale > 0.0 && offset_x.is_finite() && offset_y.is_finite()).then_some(
        Projection {
            scale,
            offset_x,
            offset_y,
        },
    )
}

/// La recepción y las señales ajenas al mapa pueden cambiar o ser filtradas
/// por la demanda. La fuente, época, sesión y todos los coches con sus poses
/// deben seguir siendo los de la demo cerrada, nunca una partida live.
pub fn same_scene(reference: &Snapshot, snapshot: &Snapshot) -> bool {
    let a = &reference.state;
    let b = &snapshot.state;
    reference.epoch == snapshot.epoch
        && reference.origin.source == snapshot.origin.source
        && reference.origin.source_time == snapshot.origin.source_time
        && a.session.id == b.session.id
        && a.session.kind == b.session.kind
        && a.session.track_name == b.session.track_name
        && a.session.track_length_m == b.session.track_length_m
        && a.player.map(|p| p.car) == b.player.map(|p| p.car)
        && a.cars.len() == b.cars.len()
        && a.cars
            .iter()
            .zip(&b.cars)
            .all(|(x, y)| x.id == y.id && x.class == y.class && x.pose == y.pose)
}

/// Closed Le Mans design demo only; never a fallback for live telemetry.
#[rustfmt::skip]
pub const DEMO_LE_MANS_POINTS:&[(f64,f64)]=&[
(262.0000,58.0000),
(261.6230,57.3845),
(261.1940,56.6460),
(260.7160,55.7965),
(260.1920,54.8480),
(259.6250,53.8125),
(259.0180,52.7020),
(258.3740,51.5285),
(257.6960,50.3040),
(256.9870,49.0405),
(256.2500,47.7500),
(255.4880,46.4445),
(254.7040,45.1360),
(253.9010,43.8365),
(253.0820,42.5580),
(252.2500,41.3125),
(251.4080,40.1120),
(250.5590,38.9685),
(249.7060,37.8940),
(248.8520,36.9005),
(248.0000,36.0000),
(247.1378,35.1601),
(246.2520,34.3410),
(245.3442,33.5434),
(244.4160,32.7680),
(243.4688,32.0156),
(242.5040,31.2870),
(241.5232,30.5829),
(240.5280,29.9040),
(239.5198,29.2511),
(238.5000,28.6250),
(237.4703,28.0264),
(236.4320,27.4560),
(235.3867,26.9146),
(234.3360,26.4030),
(233.2812,25.9219),
(232.2240,25.4720),
(231.1658,25.0541),
(230.1080,24.6690),
(229.0523,24.3174),
(228.0000,24.0000),
(226.9356,23.7197),
(225.8450,23.4780),
(224.7319,23.2733),
(223.6000,23.1040),
(222.4531,22.9688),
(221.2950,22.8660),
(220.1294,22.7942),
(218.9600,22.7520),
(217.7906,22.7378),
(216.6250,22.7500),
(215.4669,22.7873),
(214.3200,22.8480),
(213.1881,22.9307),
(212.0750,23.0340),
(210.9844,23.1562),
(209.9200,23.2960),
(208.8856,23.4518),
(207.8850,23.6220),
(206.9219,23.8053),
(206.0000,24.0000),
(205.1171,24.2124),
(204.2670,24.4490),
(203.4474,24.7091),
(202.6560,24.9920),
(201.8906,25.2969),
(201.1490,25.6230),
(200.4289,25.9696),
(199.7280,26.3360),
(199.0441,26.7214),
(198.3750,27.1250),
(197.7184,27.5461),
(197.0720,27.9840),
(196.4336,28.4379),
(195.8010,28.9070),
(195.1719,29.3906),
(194.5440,29.8880),
(193.9151,30.3984),
(193.2830,30.9210),
(192.6454,31.4551),
(192.0000,32.0000),
(191.3644,32.5646),
(190.7550,33.1570),
(190.1681,33.7749),
(189.6000,34.4160),
(189.0469,35.0781),
(188.5050,35.7590),
(187.9706,36.4564),
(187.4400,37.1680),
(186.9094,37.8916),
(186.3750,38.6250),
(185.8331,39.3659),
(185.2800,40.1120),
(184.7119,40.8611),
(184.1250,41.6110),
(183.5156,42.3594),
(182.8800,43.1040),
(182.2144,43.8426),
(181.5150,44.5730),
(180.7781,45.2929),
(180.0000,46.0000),
(179.1947,46.6905),
(178.3780,47.3640),
(177.5482,48.0235),
(176.7040,48.6720),
(175.8438,49.3125),
(174.9660,49.9480),
(174.0693,50.5815),
(173.1520,51.2160),
(172.2127,51.8545),
(171.2500,52.5000),
(170.2622,53.1555),
(169.2480,53.8240),
(168.2057,54.5085),
(167.1340,55.2120),
(166.0312,55.9375),
(164.8960,56.6880),
(163.7268,57.4665),
(162.5220,58.2760),
(161.2802,59.1195),
(160.0000,60.0000),
(158.6517,60.9314),
(157.2140,61.9210),
(155.6972,62.9621),
(154.1120,64.0480),
(152.4688,65.1719),
(150.7780,66.3270),
(149.0503,67.5066),
(147.2960,68.7040),
(145.5257,69.9124),
(143.7500,71.1250),
(141.9792,72.3351),
(140.2240,73.5360),
(138.4948,74.7209),
(136.8020,75.8830),
(135.1562,77.0156),
(133.5680,78.1120),
(132.0478,79.1654),
(130.6060,80.1690),
(129.2533,81.1161),
(128.0000,82.0000),
(126.8271,82.8423),
(125.7070,83.6680),
(124.6374,84.4758),
(123.6160,85.2640),
(122.6406,86.0312),
(121.7090,86.7760),
(120.8189,87.4967),
(119.9680,88.1920),
(119.1541,88.8603),
(118.3750,89.5000),
(117.6284,90.1097),
(116.9120,90.6880),
(116.2236,91.2332),
(115.5610,91.7440),
(114.9219,92.2188),
(114.3040,92.6560),
(113.7051,93.0542),
(113.1230,93.4120),
(112.5554,93.7278),
(112.0000,94.0000),
(111.4910,94.1945),
(111.0580,94.2860),
(110.6920,94.2865),
(110.3840,94.2080),
(110.1250,94.0625),
(109.9060,93.8620),
(109.7180,93.6185),
(109.5520,93.3440),
(109.3990,93.0505),
(109.2500,92.7500),
(109.0960,92.4545),
(108.9280,92.1760),
(108.7370,91.9265),
(108.5140,91.7180),
(108.2500,91.5625),
(107.9360,91.4720),
(107.5630,91.4585),
(107.1220,91.5340),
(106.6040,91.7105),
(106.0000,92.0000),
(105.3206,92.3891),
(104.5850,92.8530),
(103.7969,93.3864),
(102.9600,93.9840),
(102.0781,94.6406),
(101.1550,95.3510),
(100.1944,96.1099),
(99.2000,96.9120),
(98.1756,97.7521),
(97.1250,98.6250),
(96.0519,99.5254),
(94.9600,100.4480),
(93.8531,101.3876),
(92.7350,102.3390),
(91.6094,103.2969),
(90.4800,104.2560),
(89.3506,105.2111),
(88.2250,106.1570),
(87.1069,107.0884),
(86.0000,108.0000),
(84.8689,108.9359),
(83.6810,109.9370),
(82.4446,110.9936),
(81.1680,112.0960),
(79.8594,113.2344),
(78.5270,114.3990),
(77.1791,115.5801),
(75.8240,116.7680),
(74.4699,117.9529),
(73.1250,119.1250),
(71.7976,120.2746),
(70.4960,121.3920),
(69.2284,122.4674),
(68.0030,123.4910),
(66.8281,124.4531),
(65.7120,125.3440),
(64.6629,126.1539),
(63.6890,126.8730),
(62.7986,127.4916),
(62.0000,128.0000),
(61.3057,128.3750),
(60.7160,128.6100),
(60.2203,128.7200),
(59.8080,128.7200),
(59.4688,128.6250),
(59.1920,128.4500),
(58.9672,128.2100),
(58.7840,127.9200),
(58.6317,127.5950),
(58.5000,127.2500),
(58.3783,126.9000),
(58.2560,126.5600),
(58.1228,126.2450),
(57.9680,125.9700),
(57.7812,125.7500),
(57.5520,125.6000),
(57.2698,125.5350),
(56.9240,125.5700),
(56.5042,125.7200),
(56.0000,126.0000),
(55.4232,126.3939),
(54.7960,126.8710),
(54.1227,127.4246),
(53.4080,128.0480),
(52.6562,128.7344),
(51.8720,129.4770),
(51.0598,130.2691),
(50.2240,131.1040),
(49.3693,131.9749),
(48.5000,132.8750),
(47.6208,133.7976),
(46.7360,134.7360),
(45.8503,135.6834),
(44.9680,136.6330),
(44.0938,137.5781),
(43.2320,138.5120),
(42.3873,139.4279),
(41.5640,140.3190),
(40.7668,141.1786),
(40.0000,142.0000),
(39.2335,142.8048),
(38.4380,143.6180),
(37.6195,144.4382),
(36.7840,145.2640),
(35.9375,146.0938),
(35.0860,146.9260),
(34.2355,147.7593),
(33.3920,148.5920),
(32.5615,149.4227),
(31.7500,150.2500),
(30.9635,151.0722),
(30.2080,151.8880),
(29.4895,152.6958),
(28.8140,153.4940),
(28.1875,154.2812),
(27.6160,155.0560),
(27.1055,155.8167),
(26.6620,156.5620),
(26.2915,157.2902),
(26.0000,158.0000),
(25.7725,158.6974),
(25.5900,159.3890),
(25.4525,160.0741),
(25.3600,160.7520),
(25.3125,161.4219),
(25.3100,162.0830),
(25.3525,162.7346),
(25.4400,163.3760),
(25.5725,164.0064),
(25.7500,164.6250),
(25.9725,165.2311),
(26.2400,165.8240),
(26.5525,166.4029),
(26.9100,166.9670),
(27.3125,167.5156),
(27.7600,168.0480),
(28.2525,168.5634),
(28.7900,169.0610),
(29.3725,169.5401),
(30.0000,170.0000),
(30.6796,170.4425),
(31.4170,170.8700),
(32.2099,171.2825),
(33.0560,171.6800),
(33.9531,172.0625),
(34.8990,172.4300),
(35.8914,172.7825),
(36.9280,173.1200),
(38.0066,173.4425),
(39.1250,173.7500),
(40.2809,174.0425),
(41.4720,174.3200),
(42.6961,174.5825),
(43.9510,174.8300),
(45.2344,175.0625),
(46.5440,175.2800),
(47.8776,175.4825),
(49.2330,175.6700),
(50.6079,175.8425),
(52.0000,176.0000),
(53.4316,176.1378),
(54.9230,176.2520),
(56.4689,176.3442),
(58.0640,176.4160),
(59.7031,176.4688),
(61.3810,176.5040),
(63.0924,176.5232),
(64.8320,176.5280),
(66.5946,176.5198),
(68.3750,176.5000),
(70.1679,176.4703),
(71.9680,176.4320),
(73.7701,176.3867),
(75.5690,176.3360),
(77.3594,176.2812),
(79.1360,176.2240),
(80.8936,176.1658),
(82.6270,176.1080),
(84.3309,176.0523),
(86.0000,176.0000),
(87.6594,175.9499),
(89.3350,175.8990),
(91.0231,175.8466),
(92.7200,175.7920),
(94.4219,175.7344),
(96.1250,175.6730),
(97.8256,175.6071),
(99.5200,175.5360),
(101.2044,175.4589),
(102.8750,175.3750),
(104.5281,175.2836),
(106.1600,175.1840),
(107.7669,175.0754),
(109.3450,174.9570),
(110.8906,174.8281),
(112.4000,174.6880),
(113.8694,174.5359),
(115.2950,174.3710),
(116.6731,174.1926),
(118.0000,174.0000),
(119.2850,173.7713),
(120.5400,173.4900),
(121.7650,173.1637),
(122.9600,172.8000),
(124.1250,172.4062),
(125.2600,171.9900),
(126.3650,171.5588),
(127.4400,171.1200),
(128.4850,170.6812),
(129.5000,170.2500),
(130.4850,169.8338),
(131.4400,169.4400),
(132.3650,169.0763),
(133.2600,168.7500),
(134.1250,168.4688),
(134.9600,168.2400),
(135.7650,168.0713),
(136.5400,167.9700),
(137.2850,167.9437),
(138.0000,168.0000),
(138.6731,168.1366),
(139.2950,168.3430),
(139.8694,168.6139),
(140.4000,168.9440),
(140.8906,169.3281),
(141.3450,169.7610),
(141.7669,170.2374),
(142.1600,170.7520),
(142.5281,171.2996),
(142.8750,171.8750),
(143.2044,172.4729),
(143.5200,173.0880),
(143.8256,173.7151),
(144.1250,174.3490),
(144.4219,174.9844),
(144.7200,175.6160),
(145.0231,176.2386),
(145.3350,176.8470),
(145.6594,177.4359),
(146.0000,178.0000),
(146.3356,178.5739),
(146.6450,179.1910),
(146.9319,179.8446),
(147.2000,180.5280),
(147.4531,181.2344),
(147.6950,181.9570),
(147.9294,182.6891),
(148.1600,183.4240),
(148.3906,184.1549),
(148.6250,184.8750),
(148.8669,185.5776),
(149.1200,186.2560),
(149.3881,186.9034),
(149.6750,187.5130),
(149.9844,188.0781),
(150.3200,188.5920),
(150.6856,189.0479),
(151.0850,189.4390),
(151.5219,189.7586),
(152.0000,190.0000),
(152.5171,190.1752),
(153.0670,190.3020),
(153.6474,190.3818),
(154.2560,190.4160),
(154.8906,190.4062),
(155.5490,190.3540),
(156.2289,190.2608),
(156.9280,190.1280),
(157.6441,189.9573),
(158.3750,189.7500),
(159.1184,189.5077),
(159.8720,189.2320),
(160.6336,188.9243),
(161.4010,188.5860),
(162.1719,188.2188),
(162.9440,187.8240),
(163.7151,187.4033),
(164.4830,186.9580),
(165.2454,186.4898),
(166.0000,186.0000),
(166.7549,185.4755),
(167.5190,184.9040),
(168.2916,184.2885),
(169.0720,183.6320),
(169.8594,182.9375),
(170.6530,182.2080),
(171.4521,181.4465),
(172.2560,180.6560),
(173.0639,179.8395),
(173.8750,179.0000),
(174.6886,178.1405),
(175.5040,177.2640),
(176.3204,176.3735),
(177.1370,175.4720),
(177.9531,174.5625),
(178.7680,173.6480),
(179.5809,172.7315),
(180.3910,171.8160),
(181.1976,170.9045),
(182.0000,170.0000),
(182.8024,169.0855),
(183.6090,168.1440),
(184.4191,167.1785),
(185.2320,166.1920),
(186.0469,165.1875),
(186.8630,164.1680),
(187.6796,163.1365),
(188.4960,162.0960),
(189.3114,161.0495),
(190.1250,160.0000),
(190.9361,158.9505),
(191.7440,157.9040),
(192.5479,156.8635),
(193.3470,155.8320),
(194.1406,154.8125),
(194.9280,153.8080),
(195.7084,152.8215),
(196.4810,151.8560),
(197.2451,150.9145),
(198.0000,150.0000),
(198.7451,149.1026),
(199.4810,148.2110),
(200.2084,147.3259),
(200.9280,146.4480),
(201.6406,145.5781),
(202.3470,144.7170),
(203.0479,143.8654),
(203.7440,143.0240),
(204.4361,142.1936),
(205.1250,141.3750),
(205.8114,140.5689),
(206.4960,139.7760),
(207.1796,138.9971),
(207.8630,138.2330),
(208.5469,137.4844),
(209.2320,136.7520),
(209.9191,136.0366),
(210.6090,135.3390),
(211.3024,134.6599),
(212.0000,134.0000),
(212.7024,133.3717),
(213.4090,132.7840),
(214.1191,132.2322),
(214.8320,131.7120),
(215.5469,131.2188),
(216.2630,130.7480),
(216.9796,130.2952),
(217.6960,129.8560),
(218.4114,129.4257),
(219.1250,129.0000),
(219.8361,128.5742),
(220.5440,128.1440),
(221.2479,127.7047),
(221.9470,127.2520),
(222.6406,126.7812),
(223.3280,126.2880),
(224.0084,125.7678),
(224.6810,125.2160),
(225.3451,124.6283),
(226.0000,124.0000),
(226.6428,123.3259),
(227.2720,122.6070),
(227.8893,121.8486),
(228.4960,121.0560),
(229.0938,120.2344),
(229.6840,119.3890),
(230.2682,118.5251),
(230.8480,117.6480),
(231.4248,116.7629),
(232.0000,115.8750),
(232.5753,114.9896),
(233.1520,114.1120),
(233.7317,113.2474),
(234.3160,112.4010),
(234.9062,111.5781),
(235.5040,110.7840),
(236.1108,110.0239),
(236.7280,109.3030),
(237.3572,108.6266),
(238.0000,108.0000),
(238.6596,107.4195),
(239.3370,106.8760),
(240.0299,106.3665),
(240.7360,105.8880),
(241.4531,105.4375),
(242.1790,105.0120),
(242.9114,104.6085),
(243.6480,104.2240),
(244.3866,103.8555),
(245.1250,103.5000),
(245.8609,103.1545),
(246.5920,102.8160),
(247.3161,102.4815),
(248.0310,102.1480),
(248.7344,101.8125),
(249.4240,101.4720),
(250.0976,101.1235),
(250.7530,100.7640),
(251.3879,100.3905),
(252.0000,100.0000),
(252.5950,99.6071),
(253.1800,99.2270),
(253.7550,98.8574),
(254.3200,98.4960),
(254.8750,98.1406),
(255.4200,97.7890),
(255.9550,97.4389),
(256.4800,97.0880),
(256.9950,96.7341),
(257.5000,96.3750),
(257.9950,96.0084),
(258.4800,95.6320),
(258.9550,95.2436),
(259.4200,94.8410),
(259.8750,94.4219),
(260.3200,93.9840),
(260.7550,93.5251),
(261.1800,93.0430),
(261.5950,92.5354),
(262.0000,92.0000),
(262.4045,91.4425),
(262.8160,90.8700),
(263.2315,90.2825),
(263.6480,89.6800),
(264.0625,89.0625),
(264.4720,88.4300),
(264.8735,87.7825),
(265.2640,87.1200),
(265.6405,86.4425),
(266.0000,85.7500),
(266.3395,85.0425),
(266.6560,84.3200),
(266.9465,83.5825),
(267.2080,82.8300),
(267.4375,82.0625),
(267.6320,81.2800),
(267.7885,80.4825),
(267.9040,79.6700),
(267.9755,78.8425),
(268.0000,78.0000),
(267.9636,77.1116),
(267.8590,76.1530),
(267.6929,75.1339),
(267.4720,74.0640),
(267.2031,72.9531),
(266.8930,71.8110),
(266.5484,70.6474),
(266.1760,69.4720),
(265.7826,68.2946),
(265.3750,67.1250),
(264.9599,65.9729),
(264.5440,64.8480),
(264.1341,63.7601),
(263.7370,62.7190),
(263.3594,61.7344),
(263.0080,60.8160),
(262.6896,59.9736),
(262.4110,59.2170),
(262.1789,58.5559),
(262.0000,58.0000),
];

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{Car, Class, ClassId, Player, Pose};

    const POINTS: &[(f64, f64)] = &[(0.0, 0.0), (100.0, 0.0), (100.0, 100.0)];

    fn geometry(points_m: &[(f64, f64)]) -> Geometry<'_> {
        Geometry {
            track_name: "test",
            label: "Test Circuit",
            points_m,
            synthetic: false,
        }
    }

    fn snapshot() -> Snapshot {
        let mut snapshot = Snapshot::default();
        snapshot.state.source_state = crate::SourceState::Live;
        snapshot.state.session.track_name = Quality::Reliable("test".into());
        snapshot
    }

    #[test]
    fn no_map_without_explicit_valid_geometry_and_matching_track() {
        for name in [
            Quality::Unavailable,
            Quality::Reliable(String::new()),
            Quality::Reliable("other".into()),
        ] {
            let mut snapshot = snapshot();
            snapshot.state.session.track_name = name;
            let vm =
                project_with_geometry(&snapshot, Preferences::default(), Some(&geometry(POINTS)));
            assert_eq!(vm.outline, [] as [crate::track_map::Point; 0]);
            assert_eq!(vm.markers, [] as [crate::track_map::Marker; 0]);
            assert!(vm.track_label.is_none());
        }
        let vm = project_with_geometry(&snapshot(), Preferences::default(), None);
        assert_eq!(vm.empty_text, "PISTA SIN MAPA");
        assert!(vm.outline.is_empty(), "un nombre no inventa un circuito");
        for points in [
            &[][..],
            &POINTS[..2],
            &[(1.0, 1.0); 3],
            &[(0.0, 0.0), (f64::NAN, 1.0), (1.0, 1.0)],
            &[(0.0, 0.0), (1.0, f64::INFINITY), (1.0, 1.0)],
            &[(-f64::MAX, 0.0), (f64::MAX, 0.0), (1.0, 1.0)],
        ] {
            assert_eq!(
                project_with_geometry(&snapshot(), Preferences::default(), Some(&geometry(points)))
                    .outline,
                [] as [crate::track_map::Point; 0]
            );
        }
    }

    #[test]
    fn outline_fits_uniformly_and_stale_track_keeps_the_map() {
        for name in [
            Quality::Reliable(" TEST ".into()),
            Quality::Estimated("test".into()),
            Quality::Stale("test".into()),
        ] {
            let mut snapshot = snapshot();
            snapshot.state.session.track_name = name;
            let vm =
                project_with_geometry(&snapshot, Preferences::default(), Some(&geometry(POINTS)));
            assert_eq!(
                vm.outline,
                [
                    Point { x: 62.0, y: 12.0 },
                    Point { x: 258.0, y: 12.0 },
                    Point { x: 258.0, y: 208.0 }
                ]
            );
            assert_eq!(vm.track_label.as_deref(), Some("Test Circuit"));
        }
        // Un eje sin extensión es válido; no lo es colapsar ambos.
        for points in [
            &[(0.0, 0.0), (1.0, 0.0), (2.0, 0.0)][..],
            &[(0.0, 0.0), (0.0, 1.0), (0.0, 2.0)],
        ] {
            assert_eq!(
                project_with_geometry(&snapshot(), Preferences::default(), Some(&geometry(points)))
                    .outline
                    .len(),
                3
            );
        }
    }

    #[test]
    fn marker_quality_identity_and_world_origin_are_preserved() {
        let pose = Pose {
            x_m: 0.0,
            y_m: 0.0,
            yaw_rad: f64::NAN,
        };
        for (quality, visible) in [
            (Quality::Reliable(pose), true),
            (Quality::Stale(pose), true),
            (Quality::Estimated(pose), false),
            (Quality::Unavailable, false),
            (
                Quality::Reliable(Pose {
                    x_m: f64::NAN,
                    ..pose
                }),
                false,
            ),
            (
                Quality::Stale(Pose {
                    y_m: f64::INFINITY,
                    ..pose
                }),
                false,
            ),
        ] {
            let mut snapshot = snapshot();
            snapshot.state.player = Some(Player {
                car: CarId(7),
                ..Player::default()
            });
            snapshot.state.cars.push(Car {
                id: CarId(7),
                pose: quality,
                class: Some(Class {
                    id: ClassId(2),
                    name: "LMP2".into(),
                }),
                ..Car::default()
            });
            let vm =
                project_with_geometry(&snapshot, Preferences::default(), Some(&geometry(POINTS)));
            assert_eq!(vm.markers.len(), usize::from(visible));
            if visible {
                let marker = &vm.markers[0];
                assert_eq!(marker.point, Point { x: 62.0, y: 12.0 });
                assert_eq!(marker.id, CarId(7));
                assert!(marker.is_player);
                assert_eq!(marker.class_name.as_deref(), Some("LMP2"));
                snapshot.state.player = None;
                snapshot.state.cars[0].class = None;
                let vm = project_with_geometry(
                    &snapshot,
                    Preferences::default(),
                    Some(&geometry(POINTS)),
                );
                assert!(!vm.markers[0].is_player);
                assert!(vm.markers[0].class_name.is_none());
            }
        }
    }

    #[test]
    fn labels_follow_language_and_synthetic_is_explicit() {
        for (language, empty, reference) in [
            (Language::Es, "SIN TELEMETRÍA", "REFERENCIA"),
            (Language::En, "NO TELEMETRY", "REFERENCE"),
        ] {
            let prefs = Preferences {
                language,
                ..Preferences::default()
            };
            assert_eq!(
                project_with_geometry(&Snapshot::default(), prefs, None).empty_text,
                empty
            );
            let mut geometry = geometry(POINTS);
            assert!(
                project_with_geometry(&snapshot(), prefs, Some(&geometry))
                    .reference_text
                    .is_none()
            );
            geometry.synthetic = true;
            assert_eq!(
                project_with_geometry(&snapshot(), prefs, Some(&geometry))
                    .reference_text
                    .as_deref(),
                Some(reference)
            );
        }
    }
}
