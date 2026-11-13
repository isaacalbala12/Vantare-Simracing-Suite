//! Solo IPC y reproducción: no enlaza GPUI ni Rune.
use std::path::Path;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    eprintln!(concat!(
        "VANTARE_COUNT_BUILD;sha=",
        env!("VANTARE_COUNT_SHA"),
        ";dirty=",
        env!("VANTARE_COUNT_DIRTY"),
        ";rust=",
        env!("VANTARE_COUNT_RUST"),
        ";profile=",
        env!("VANTARE_COUNT_PROFILE"),
        ";opt-level=",
        env!("VANTARE_COUNT_OPT_LEVEL"),
        ";debug=",
        env!("VANTARE_COUNT_DEBUG"),
        ";lto=false;codegen-units=16;medir-latencia=true"
    ));
    let args: Vec<_> = std::env::args_os().skip(1).collect();
    let stress = args.len() == 4 && args[3] == "--cada-foto";
    if args.len() != 3 && !stress {
        return Err("uso: contador <vantare-core.exe> <corpus.tar.gz> <directorio nuevo> [--cada-foto: estres separado]".into());
    }
    let core = Path::new(&args[0]).canonicalize()?;
    let corpus = Path::new(&args[1]).canonicalize()?;
    let output = Path::new(&args[2]);
    std::fs::create_dir(output)?;
    let output = output.canonicalize()?;
    let session = vantare_profiling::latency::Session::open(&output.join("received.csv"))?;
    let pipe = format!("vantare-rune-count-{}", std::process::id());
    let trusted = core.clone();
    let mut subscriber = vantare_ipc::Subscriber::connect_requested(
        &pipe,
        if stress {
            vantare_ipc::Demand::all()
        } else {
            vantare_ipc::relative_measurement_demand()
        },
        move |peer| peer.is_image(&trusted),
    )?;
    let mut child = Command::new(&core)
        .arg("--replay")
        .arg(corpus)
        .arg("--pipe")
        .arg(pipe)
        .env("VANTARE_LATENCY_FILE", output.join("origin.csv"))
        .env("VANTARE_REPLAY_WAIT_SUBSCRIBER", "1")
        .env("VANTARE_NATIVE_DATA_ROOT", output.join("datos-aislados"))
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::from(std::fs::File::create(output.join("core.log"))?))
        .spawn()?;
    let deadline = Instant::now() + Duration::from_secs(65);
    let mut consumed = 0_u64;
    let mut last = 0_u64;
    let observed = (|| -> Result<(), Box<dyn std::error::Error>> {
        while Instant::now() < deadline {
            if let Some(snapshot) = subscriber.next(Duration::from_millis(20)) {
                consumed += 1;
                last = snapshot.sequence;
            }
            if let Some(status) = child.try_wait()? {
                return Err(format!("núcleo terminado antes del cierre: {status}").into());
            }
        }
        Ok(())
    })();
    drop(child.stdin.take());
    let shutdown = Instant::now() + Duration::from_secs(30);
    let status = loop {
        if let Some(status) = child.try_wait()? {
            break status;
        }
        if Instant::now() >= shutdown {
            child.kill()?;
            child.wait()?;
            return Err("núcleo no terminó ordenadamente; ronda inválida".into());
        }
        std::thread::sleep(Duration::from_millis(20));
    };
    drop(subscriber);
    session.finish()?;
    observed?;
    if !status.success() {
        return Err(format!("núcleo: {status}").into());
    }
    std::fs::write(
        output.join("consumed.txt"),
        format!("consumed={consumed}\nlast_sequence={last}\n"),
    )?;
    // El cruce compara las identidades completas, no solo el contador final.
    let origins = identities(
        &std::fs::read_to_string(output.join("origin.csv"))?,
        "origin",
    )?;
    let sent = identities(&std::fs::read_to_string(output.join("origin.csv"))?, "sent")?;
    let received = identities(
        &std::fs::read_to_string(output.join("received.csv"))?,
        "received",
    )?;
    validate_delivery(&origins, &sent, &received)?;
    std::fs::write(
        output.join("VALIDA.txt"),
        format!(
            "{} fotos enviadas por pipe y recibidas; {} publicaciones de origen; modo {}\n",
            sent.len(),
            origins.len(),
            if stress {
                "estres-cada-foto"
            } else {
                "relative-33ms"
            }
        ),
    )?;
    Ok(())
}

fn validate_delivery(
    origin: &[(u64, u64)],
    sent: &[(u64, u64)],
    received: &[(u64, u64)],
) -> Result<(), Box<dyn std::error::Error>> {
    let origins: std::collections::BTreeSet<_> = origin.iter().copied().collect();
    if origin.is_empty()
        || sent.is_empty()
        || sent != received
        || sent.iter().any(|id| !origins.contains(id))
    {
        return Err(format!(
            "ronda invalida: {} publicaciones, {} enviadas por pipe, {} recibidas",
            origin.len(),
            sent.len(),
            received.len()
        )
        .into());
    }
    Ok(())
}

fn identities(text: &str, phase: &str) -> Result<Vec<(u64, u64)>, Box<dyn std::error::Error>> {
    let mut lines = text.lines();
    let header = lines.next().ok_or("traza vacía")?;
    if !header.starts_with("# latency-v1,frequency=") || !header.ends_with(",overflow=0") {
        return Err("reloj ausente o desbordamiento".into());
    }
    let hz: u64 = header
        .split(',')
        .nth(1)
        .ok_or("frecuencia ausente")?
        .strip_prefix("frequency=")
        .ok_or("frecuencia ausente")?
        .parse()?;
    if hz == 0 || lines.next() != Some("phase,qpc,epoch,sequence,window") {
        return Err("cabecera inválida".into());
    }
    let mut rows = Vec::new();
    let mut count = 0_usize;
    let mut footer = false;
    for line in lines {
        if let Some(value) = line.strip_prefix("# end,rows=") {
            if value.parse::<usize>()? != count || footer {
                return Err("pie inválido".into());
            }
            footer = true;
            continue;
        }
        if footer {
            return Err("datos después del pie".into());
        }
        let fields: Vec<_> = line.split(',').collect();
        if fields.len() != 5 || fields[1].parse::<u64>()? == 0 {
            return Err("fila inválida".into());
        }
        count += 1;
        if fields[0] == phase {
            rows.push((fields[2].parse()?, fields[3].parse()?));
        }
    }
    if !footer {
        return Err("traza incompleta".into());
    }
    if rows.windows(2).any(|pair| pair[1] <= pair[0]) {
        return Err("fotos repetidas o desordenadas".into());
    }
    Ok(rows)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cadence_omissions_are_not_loss_but_a_missing_sent_photo_is() {
        assert!(
            validate_delivery(
                &[(1, 1), (1, 2), (1, 3)],
                &[(1, 1), (1, 3)],
                &[(1, 1), (1, 3)]
            )
            .is_ok()
        );
        assert!(
            validate_delivery(&[(1, 1), (1, 2), (1, 3)], &[(1, 1), (1, 3)], &[(1, 3)]).is_err()
        );
        assert!(validate_delivery(&[(1, 1)], &[(1, 2)], &[(1, 2)]).is_err());
    }

    #[test]
    fn rejects_truncated_overflowing_and_duplicate_traces() {
        let trace = "# latency-v1,frequency=10000000,overflow=0\nphase,qpc,epoch,sequence,window\norigin,100,42,1,0\n# end,rows=1\n";
        assert_eq!(identities(trace, "origin").unwrap(), [(42, 1)]);
        for bad in [
            trace.replace("overflow=0", "overflow=1"),
            trace.replace("# end,rows=1\n", ""),
            trace.replace("rows=1", "rows=2"),
            trace.replace("# end,rows=1", "origin,200,42,1,0\n# end,rows=2"),
        ] {
            assert!(identities(&bad, "origin").is_err());
        }
    }
}
