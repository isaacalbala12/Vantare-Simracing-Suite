//! Opt-in, local timings. Never log request bodies, identities or credentials.
use std::{
    fs::{self, OpenOptions},
    io::Write,
    time::{SystemTime, UNIX_EPOCH},
};

const LOG_LIMIT: u64 = 1024 * 1024;

fn trace_enabled(filter: &str) -> bool {
    admin_level(filter) == Some("trace")
}

fn admin_level(filter: &str) -> Option<&str> {
    filter
        .split(',')
        .filter_map(|directive| directive.trim().strip_prefix("vantare_admin="))
        .next_back()
}

fn timing_enabled(filter: Option<&str>, event: &str) -> bool {
    filter.is_some_and(|filter| {
        if matches!(
            event,
            "request_to_render"
                | "render_tree"
                | "render_to_frame"
                | "hover_to_frame"
                | "scroll_to_frame"
        ) {
            trace_enabled(filter)
        } else {
            matches!(admin_level(filter), Some("info" | "debug" | "trace"))
        }
    })
}

pub(crate) fn render_enabled() -> bool {
    std::env::var("RUST_LOG").is_ok_and(|value| trace_enabled(&value))
}

pub(crate) fn record(event: &str, elapsed_us: u128, outcome: &str) {
    let filter = std::env::var("RUST_LOG").ok();
    if !timing_enabled(filter.as_deref(), event) {
        return;
    }
    let Ok(root) = vantare_services::app::default_root() else {
        return;
    };
    record_at(&root, filter.as_deref(), event, elapsed_us, outcome);
}

fn record_at(
    root: &std::path::Path,
    filter: Option<&str>,
    event: &str,
    elapsed_us: u128,
    outcome: &str,
) {
    if !timing_enabled(filter, event) {
        return;
    }
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |t| t.as_secs());
    let line = format!("{stamp} event={event} elapsed_us={elapsed_us} outcome={outcome}\n");
    if line.len() as u64 > LOG_LIMIT {
        return;
    }
    let path = root.join("admin-timings.log");
    let size = match fs::metadata(&path) {
        Ok(metadata) => metadata.len(),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => 0,
        Err(_) => return,
    };
    if size.saturating_add(line.len() as u64) > LOG_LIMIT {
        let backup = root.join("admin-timings.log.1");
        match fs::remove_file(&backup) {
            Ok(()) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(_) => return,
        }
        if fs::rename(&path, backup).is_err() {
            return;
        }
    }
    let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) else {
        return;
    };
    // Best effort diagnostics: logging failure must never interrupt administration.
    let _ = file.write_all(line.as_bytes());
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn isa1548_warn_and_debug_do_not_write_render_timings() {
        let root = std::env::temp_dir().join(format!(
            "admin-timing-{}",
            vantare_services::random_id().expect("test id")
        ));
        std::fs::create_dir(&root).expect("root");
        for filter in [None, Some("warn"), Some("vantare_admin=warn")] {
            record_at(&root, filter, "request_to_render", 1, "ui");
            record_at(&root, filter, "restore", 1, "ok");
            assert!(!root.join("admin-timings.log").exists());
        }
        record_at(&root, Some("vantare_admin=info"), "restore", 1, "ok");
        assert!(
            std::fs::read_to_string(root.join("admin-timings.log"))
                .expect("service timing")
                .contains("event=restore")
        );
        std::fs::remove_file(root.join("admin-timings.log")).expect("reset fixture");
        record_at(
            &root,
            Some("vantare_admin=debug"),
            "request_to_render",
            1,
            "ui",
        );
        assert!(!root.join("admin-timings.log").exists());
        record_at(
            &root,
            Some("vantare_admin=trace"),
            "request_to_render",
            1,
            "ui",
        );
        assert!(root.join("admin-timings.log").exists());
        std::fs::remove_dir_all(root).expect("cleanup");
    }

    #[test]
    fn isa1548_trace_timings_keep_only_one_bounded_backup() {
        let root = std::env::temp_dir().join(format!(
            "admin-rotation-{}",
            vantare_services::random_id().expect("test id")
        ));
        std::fs::create_dir(&root).expect("root");
        for _ in 0..2 {
            std::fs::write(root.join("admin-timings.log"), vec![b'x'; 1024 * 1024])
                .expect("full log");
            record_at(
                &root,
                Some("vantare_admin=trace"),
                "request_to_render",
                1,
                "ui",
            );
            assert!(
                std::fs::metadata(root.join("admin-timings.log"))
                    .expect("log")
                    .len()
                    < 1024 * 1024
            );
            assert_eq!(
                std::fs::metadata(root.join("admin-timings.log.1"))
                    .expect("rotated log")
                    .len(),
                1024 * 1024
            );
        }
        std::fs::remove_dir_all(root).expect("cleanup");
    }
}
