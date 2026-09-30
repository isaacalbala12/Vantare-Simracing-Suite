//! Layout de `ksBroadcastingNetwork/BroadcastingNetworkProtocol.cs`, v4.
use std::io;

use super::bytes::{Reader, invalid};

pub(super) const MAX_CARS: usize = 104;

#[derive(Clone, Default)]
pub(super) struct Lap {
    pub(super) time: Option<f64>,
    pub(super) splits: Vec<Option<f64>>,
}

#[derive(Clone)]
pub(super) struct CarUpdate {
    pub(super) index: u16,
    pub(super) driver: u16,
    pub(super) driver_count: u8,
    pub(super) x: f64,
    pub(super) y: f64,
    pub(super) yaw: f64,
    pub(super) location: u8,
    pub(super) position: u16,
    pub(super) cup_position: u16,
    pub(super) spline: f64,
    pub(super) laps: u16,
    pub(super) best: Lap,
    pub(super) last: Lap,
    pub(super) current: Lap,
}

#[derive(Clone, PartialEq, Eq)]
pub(super) struct Entry {
    pub(super) index: u16,
    pub(super) number: i32,
    pub(super) cup: u8,
    pub(super) drivers: Vec<String>,
}

#[derive(Clone)]
pub(super) struct SessionUpdate {
    pub(super) event: u16,
    pub(super) index: u16,
    pub(super) kind: u8,
    pub(super) phase: u8,
    pub(super) elapsed: f64,
    pub(super) end: f64,
    pub(super) air_temperature_k: f64,
    pub(super) track_temperature_k: f64,
    pub(super) rain: f64,
    pub(super) wetness: f64,
}

pub(super) enum Message {
    Registration {
        id: i32,
        success: bool,
    },
    Session(SessionUpdate),
    Car(CarUpdate),
    List {
        connection: i32,
        indices: Vec<u16>,
    },
    Entry(Entry),
    Track {
        connection: i32,
        id: i32,
        name: String,
        meters: i32,
    },
    Event,
}

fn time(ms: i32) -> Option<f64> {
    (ms > 0 && ms != i32::MAX).then(|| f64::from(ms) / 1000.0)
}

fn lap(r: &mut Reader<'_>, current: bool) -> io::Result<Lap> {
    let ms = r.i32()?;
    let total = if current && ms == 0 {
        Some(0.0)
    } else {
        time(ms)
    };
    r.take(4)?; // carIndex, driverIndex
    let count = r.u8()?;
    if count > 3 {
        return Err(invalid("más de tres sectores en el protocolo ACC v4"));
    }
    let mut splits = Vec::new();
    for _ in 0..count {
        splits.push(time(r.i32()?));
    }
    splits.resize(3, None);
    r.take(4)?; // invalid, validForBest, outlap, inlap; no modelo común de validez.
    Ok(Lap {
        time: total,
        splits,
    })
}

pub(super) fn parse(bytes: &[u8]) -> io::Result<Message> {
    let r = &mut Reader(bytes);
    let message = match r.u8()? {
        1 => {
            let id = r.i32()?;
            let success = r.u8()? > 0;
            r.u8()?; // read-only (SDK: 0 = read-only); no comandos de control.
            r.text()?; // No imprimir mensajes que puedan contener credenciales.
            Message::Registration { id, success }
        }
        2 => read_session(r)?,
        3 => read_car(r)?,
        4 => {
            let connection = r.i32()?;
            let count = usize::from(r.u16()?);
            if count > MAX_CARS {
                return Err(invalid("parrilla ACC supera 104 coches"));
            }
            let mut indices = Vec::with_capacity(count);
            for _ in 0..count {
                let index = r.u16()?;
                if indices.contains(&index) {
                    return Err(invalid("carIndex duplicado"));
                }
                indices.push(index);
            }
            Message::List {
                connection,
                indices,
            }
        }
        5 => {
            let connection = r.i32()?;
            let name = r.text()?;
            let (id, meters) = (r.i32()?, r.i32()?);
            let sets = r.u8()?;
            for _ in 0..sets {
                r.text()?;
                let cameras = r.u8()?;
                for _ in 0..cameras {
                    r.text()?;
                }
            }
            let pages = r.u8()?;
            for _ in 0..pages {
                r.text()?;
            }
            Message::Track {
                connection,
                id,
                name,
                meters,
            }
        }
        6 => {
            let index = r.u16()?;
            r.u8()?; // car model
            r.text()?; // team
            let number = r.i32()?;
            let cup = r.u8()?;
            r.u8()?; // current driver: updates llevan el índice vigente.
            r.u16()?; // nationality
            let count = r.u8()?;
            let mut drivers = Vec::new();
            for _ in 0..count {
                let (first, last) = (r.text()?, r.text()?);
                r.text()?; // short name
                r.take(3)?; // category, nationality
                drivers.push(format!("{first} {last}").trim().to_owned());
            }
            Message::Entry(Entry {
                index,
                number,
                cup,
                drivers,
            })
        }
        7 => {
            r.u8()?;
            r.text()?;
            r.take(8)?;
            // Eventos puntuales no se convierten en banderas persistentes.
            Message::Event
        }
        _ => return Err(invalid("tipo UDP ACC desconocido")),
    };
    if !r.0.is_empty() {
        return Err(invalid("bytes sobrantes en datagrama ACC v4"));
    }
    Ok(message)
}

fn read_session(r: &mut Reader<'_>) -> io::Result<Message> {
    let (event, index, kind, phase) = (r.u16()?, r.u16()?, r.u8()?, r.u8()?);
    let (elapsed, end) = (r.f32()? / 1000.0, r.f32()? / 1000.0);
    r.i32()?; // focused car
    for _ in 0..3 {
        r.text()?;
    }
    if r.u8()? > 0 {
        r.take(8)?;
    } // replay clocks
    r.take(4)?; // time of day
    let air_temperature_k = f64::from(r.u8()?) + 273.15;
    let track_temperature_k = f64::from(r.u8()?) + 273.15;
    r.u8()?; // clouds, sin señal común
    // SDK Kunos v4: RainLevel/Wetness = byte / 10, fracciones, no porcentajes.
    let rain = f64::from(r.u8()?) / 10.0;
    let wetness = f64::from(r.u8()?) / 10.0;
    lap(r, false)?;
    Ok(Message::Session(SessionUpdate {
        event,
        index,
        kind,
        phase,
        elapsed,
        end,
        air_temperature_k,
        track_temperature_k,
        rain,
        wetness,
    }))
}

fn read_car(r: &mut Reader<'_>) -> io::Result<Message> {
    let index = r.u16()?;
    let driver = r.u16()?;
    let driver_count = r.u8()?;
    r.u8()?; // UDP gear: raw-2; jugador siempre desde physics (raw-1).
    let (x, y, yaw) = (r.f32()?, r.f32()?, r.f32()?);
    let location = r.u8()?;
    r.u16()?; // kmh: jugador desde physics, rivales sin Telemetry común.
    let (position, cup_position) = (r.u16()?, r.u16()?);
    r.u16()?; // trackPosition no es fiable.
    let (spline, laps) = (r.f32()?, r.u16()?);
    r.i32()?; // delta contra mejor sesión; NO delta contra mejor propia.
    Ok(Message::Car(CarUpdate {
        index,
        driver,
        driver_count,
        x,
        y,
        yaw,
        location,
        position,
        cup_position,
        spline,
        laps,
        best: lap(r, false)?,
        last: lap(r, false)?,
        current: lap(r, true)?,
    }))
}
