//! Señales de la presentación: ni geometría ni datos del simulador.
use crate::{Demand, Signal};

pub fn signals(interval_ms: u16, signals: &[Signal]) -> Demand {
    let mut demand = Demand::default();
    for &signal in signals {
        demand.request(signal, interval_ms);
    }
    demand
}

pub fn information(demand: &mut Demand, id: &str, slots: bool) {
    use Signal::{
        LapCount, LapTimes, LapsRemaining, Positions, SessionClock, SessionInfo, TrackName, Weather,
    };
    let signal = match id {
        "trackTemperature" | "airTemperature" | "ambient" | "wind" | "rain" | "wetness" => Weather,
        "track" if slots => Weather,
        "track" => TrackName,
        "estimatedLaps" => LapsRemaining,
        "totalLaps" => SessionInfo,
        "remaining" | "time" => SessionClock,
        "lap" => LapCount,
        "position" => Positions,
        "lastLap" | "bestLap" => LapTimes,
        _ => return,
    };
    demand.request(signal, 250);
}

use vantare_domain::widget_settings::{
    Settings, broadcast_tower, car_damage_numbers, car_damage_visual, delta, delta_trace,
    fastest_lap, fuel_strategy, head_to_head, input_telemetry, multiclass_relative, pedals,
    pedals_telemetry, racing_flags, radar, relative, session_alerts, standings, track_map,
    track_weather,
};
pub trait SettingsDemand {
    fn demand(&self) -> crate::Demand;
}

impl SettingsDemand for pedals::Settings {
    #[allow(clippy::unused_self)] // Contrato común de demanda por renderer.
    fn demand(&self) -> crate::Demand {
        use crate::Signal::{Clutch, Pedals, PitStatus, Powertrain};
        signals(16, &[Pedals, Clutch, Powertrain, PitStatus])
    }
}

impl SettingsDemand for radar::Settings {
    #[allow(clippy::unused_self)] // Contrato común de demanda por renderer.
    fn demand(&self) -> crate::Demand {
        use crate::Signal::{LapCount, LapProgress, Spatial, TrackLength, Velocity};
        signals(33, &[Spatial, Velocity, LapCount, LapProgress, TrackLength])
    }
}

impl SettingsDemand for broadcast_tower::Settings {
    fn demand(&self) -> crate::Demand {
        use crate::Signal::{
            ClassGaps, Flags, Gaps, LapCount, LapTimes, PitStatus, Positions, SessionClock,
            SessionInfo, Weather,
        };
        let mut demand = signals(
            250,
            &[
                SessionInfo,
                SessionClock,
                Positions,
                LapTimes,
                Gaps,
                ClassGaps,
                PitStatus,
                Flags,
                LapCount,
            ],
        );
        if self.show_weather {
            demand.request(Weather, 500);
        }
        demand
    }
}

impl SettingsDemand for car_damage_numbers::Settings {
    #[allow(clippy::unused_self)] // Contrato común de demanda por renderer.
    fn demand(&self) -> crate::Demand {
        use crate::Signal::Damage;
        signals(500, &[Damage])
    }
}

impl SettingsDemand for car_damage_visual::Settings {
    #[allow(clippy::unused_self)] // Contrato común de demanda por renderer.
    fn demand(&self) -> crate::Demand {
        use crate::Signal::Damage;
        signals(500, &[Damage])
    }
}

impl SettingsDemand for delta::Settings {
    fn demand(&self) -> crate::Demand {
        use crate::Signal::{Cars, Flags, LapProgress, PitStatus, Positions, Sectors};
        use crate::Signal::{Delta, LapCount, LapTimes};
        signals(
            16,
            &[
                Delta,
                LapTimes,
                LapCount,
                Cars,
                Positions,
                Sectors,
                LapProgress,
                PitStatus,
                Flags,
            ],
        )
    }
}

impl SettingsDemand for delta_trace::Settings {
    #[allow(clippy::unused_self)] // Contrato común de demanda por renderer.
    fn demand(&self) -> crate::Demand {
        use crate::Signal::{
            Cars, Delta, Flags, LapCount, LapProgress, LapTimes, PitStatus, Positions, Sectors,
            SessionInfo, TrackLength,
        };
        // La historia distingue pérdida real de fotos; no introducir huecos por cadencia.
        signals(
            0,
            &[
                Cars,
                Positions,
                PitStatus,
                Flags,
                Delta,
                LapTimes,
                LapCount,
                LapProgress,
                TrackLength,
                Sectors,
                SessionInfo,
            ],
        )
    }
}

impl SettingsDemand for fastest_lap::Settings {
    #[allow(clippy::unused_self)] // Contrato común de demanda por renderer.
    fn demand(&self) -> crate::Demand {
        use crate::Signal::{LapCount, LapTimes, SessionClock, SessionInfo, TrackName};
        signals(
            250,
            &[LapTimes, LapCount, TrackName, SessionInfo, SessionClock],
        )
    }
}

impl SettingsDemand for fuel_strategy::Settings {
    fn demand(&self) -> crate::Demand {
        use crate::Signal::{
            Cars, Flags, FuelEstimate, FuelLevel, LapCount, LapsRemaining, PitStatus, SessionInfo,
        };
        signals(
            250,
            &[
                FuelLevel,
                FuelEstimate,
                LapsRemaining,
                Cars,
                LapCount,
                PitStatus,
                SessionInfo,
                Flags,
            ],
        )
    }
}

impl SettingsDemand for head_to_head::Settings {
    fn demand(&self) -> crate::Demand {
        use crate::Signal::{LapTimes, Positions, Relative, Sectors, SessionInfo};
        let mut demand = signals(33, &[Positions, Relative, LapTimes, SessionInfo]);
        if self.show_sectors {
            demand.request(LapTimes, 250);
            demand.request(Sectors, 250);
        }
        demand
    }
}

impl SettingsDemand for input_telemetry::Settings {
    #[allow(clippy::unused_self)] // El estado de ausencia también depende de clutch, aunque su barra esté oculta.
    fn demand(&self) -> crate::Demand {
        use crate::Signal::{Clutch, Pedals, Powertrain};
        // La traza necesita observar cada revisión para detectar pérdidas reales.
        signals(0, &[Pedals, Clutch, Powertrain])
    }
}

impl SettingsDemand for multiclass_relative::Settings {
    #[allow(clippy::unused_self)] // Contrato común de demanda por renderer.
    fn demand(&self) -> crate::Demand {
        use crate::Signal::{Flags, LapTimes, PitStatus, Positions, Relative};
        signals(33, &[Positions, Relative, PitStatus, LapTimes, Flags])
    }
}

impl SettingsDemand for pedals_telemetry::Settings {
    #[allow(clippy::unused_self)] // El estado de ausencia también depende de clutch, aunque su barra esté oculta.
    fn demand(&self) -> crate::Demand {
        use crate::Signal::{Clutch, Pedals, Powertrain, Steering};
        signals(16, &[Pedals, Clutch, Steering, Powertrain])
    }
}

impl SettingsDemand for racing_flags::Settings {
    #[allow(clippy::unused_self)] // Contrato común de demanda por renderer.
    fn demand(&self) -> crate::Demand {
        // Identidad personal, posición de llegada y contexto de sesión.
        // Cars conserva jugador/IDs sin pedir sanciones numéricas ni inputs.
        use crate::Signal::{Cars, Flags, Positions, SessionInfo};
        signals(33, &[Cars, Flags, Positions, SessionInfo])
    }
}

impl SettingsDemand for relative::Settings {
    fn demand(&self) -> crate::Demand {
        use crate::Signal::{
            LapTimes, PitStatus, Positions, Relative, SessionClock, SessionInfo, TrackName, Weather,
        };
        let settings = self.normalized();
        let mut demand = signals(
            33,
            &[
                crate::Signal::Cars,
                Relative,
                Positions,
                PitStatus,
                SessionInfo,
                TrackName,
                crate::Signal::Flags,
                LapTimes,
            ],
        );
        if settings.columns.as_ref().is_none_or(|cols| {
            cols.iter()
                .any(|c| c.enabled && matches!(c.metric_id.as_str(), "bestLap" | "lastLap"))
        }) {
            demand.request(LapTimes, 250);
        }
        // Con estado stale, paint usa el pie común incluso con slots configurados.
        demand.request(SessionClock, 250);
        demand.request(Weather, 500);
        for id in &settings.footer_slots {
            information(&mut demand, id, true);
        }
        demand
    }
}

impl SettingsDemand for session_alerts::Settings {
    fn demand(&self) -> crate::Demand {
        use crate::Signal::{SessionClock, SessionInfo};
        signals(250, &[SessionInfo, SessionClock])
    }
}

impl SettingsDemand for standings::Settings {
    fn demand(&self) -> crate::Demand {
        use crate::Signal::{
            ClassGaps, Flags, Gaps, LapCount, LapTimes, PitStatus, Positions, SessionClock,
            SessionInfo,
        };
        let settings = self.normalized();

        let mut demand = signals(
            250,
            &[
                crate::Signal::Cars,
                Positions,
                PitStatus,
                SessionInfo,
                SessionClock,
                Flags,
                Gaps,
                ClassGaps,
                LapCount,
                LapTimes,
                crate::Signal::Sectors,
                crate::Signal::Weather,
            ],
        );
        if settings.classification_mode == "multiclass" {
            demand.request(ClassGaps, 250);
        }
        if settings.show_session_header {
            demand.request(SessionClock, 250);
            demand.request(Flags, 250);
        }
        if settings.show_session_footer {
            let slots = settings
                .footer_slots
                .as_ref()
                .is_some_and(|slots| !slots.is_empty());
            let footer_ids = vec![
                settings.footer_first.clone(),
                settings.footer_second.clone(),
            ];
            let ids = if slots {
                settings.footer_slots.as_ref().expect("nonempty slots")
            } else {
                &footer_ids
            };
            for id in ids {
                information(&mut demand, id, slots);
                if id == "gap" {
                    demand.request(
                        if settings.class_scope != "all-classes"
                            || settings.classification_mode == "multiclass"
                        {
                            ClassGaps
                        } else {
                            Gaps
                        },
                        250,
                    );
                    demand.request(LapTimes, 250);
                }
            }
        }
        demand
    }
}

impl SettingsDemand for track_map::Settings {
    #[allow(clippy::unused_self)] // Contrato común de demanda por renderer.
    fn demand(&self) -> crate::Demand {
        use crate::Signal::{
            LapCount, Positions, SessionClock, SessionInfo, Spatial, TrackLength, TrackName,
        };
        signals(
            33,
            &[
                Spatial,
                TrackName,
                TrackLength,
                LapCount,
                SessionInfo,
                SessionClock,
                Positions,
            ],
        )
    }
}

impl SettingsDemand for track_weather::Settings {
    #[allow(clippy::unused_self)] // Contrato común de demanda por renderer.
    fn demand(&self) -> crate::Demand {
        use crate::Signal::{SessionClock, SessionInfo, Weather};
        signals(500, &[Weather, SessionInfo, SessionClock])
    }
}

impl SettingsDemand for Settings {
    fn demand(&self) -> crate::Demand {
        match self {
            Self::Standings(settings) => settings.demand(),
            Self::Radar(settings) => settings.demand(),
            Self::Pedals(settings) => settings.demand(),
            Self::Delta(settings) => settings.demand(),
            Self::CarDamageVisual(settings) => settings.demand(),
            Self::InputTelemetry(settings) => settings.demand(),
            Self::MulticlassRelative(settings) => settings.demand(),
            Self::BroadcastTower(settings) => settings.demand(),
            Self::DeltaTrace(settings) => settings.demand(),
            Self::TrackMap(settings) => settings.demand(),
            Self::TrackWeather(settings) => settings.demand(),
            Self::CarDamageNumbers(settings) => settings.demand(),
            Self::HeadToHead(settings) => settings.demand(),
            Self::FuelStrategy(settings) => settings.demand(),
            Self::PedalsTelemetry(settings) => settings.demand(),
            Self::Relative(settings) => settings.demand(),
            Self::RacingFlags(settings) => settings.demand(),
            Self::FastestLap(settings) => settings.demand(),
            Self::SessionAlerts(settings) => settings.demand(),
        }
    }
}
