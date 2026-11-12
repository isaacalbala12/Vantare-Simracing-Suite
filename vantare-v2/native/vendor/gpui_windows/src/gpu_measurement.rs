//! Asynchronous D3D11 timestamp queries. Diagnostic feature only; never flush
//! or wait for the GPU. Eight outstanding frames bound both memory and work.
use anyhow::{Context, Result};
use windows::{Win32::Graphics::Direct3D11::*, core::Interface};

struct Slot {
    disjoint: ID3D11Query,
    start: ID3D11Query,
    end: ID3D11Query,
    pending: Option<(u64, u64, u64, u64)>,
}

pub(crate) struct GpuMeasurement {
    slots: Vec<Slot>,
    sequence: u64,
}

pub(crate) fn enabled() -> bool {
    static ENABLED: std::sync::OnceLock<bool> = std::sync::OnceLock::new();
    *ENABLED.get_or_init(|| std::env::var("VANTARE_MEASUREMENT_GPU_TIMING").is_ok_and(|v| v == "1"))
}

fn query(device: &ID3D11Device, kind: D3D11_QUERY) -> Result<ID3D11Query> {
    let mut query = None;
    unsafe {
        device.CreateQuery(
            &D3D11_QUERY_DESC {
                Query: kind,
                MiscFlags: 0,
            },
            Some(&mut query),
        )?
    };
    query.context("D3D11 timestamp query missing")
}

fn read<T: Default>(context: &ID3D11DeviceContext, query: &ID3D11Query) -> Result<Option<T>> {
    let mut value = T::default();
    // The generated Result<()> wrapper treats S_FALSE as success. Preserve it:
    // its output buffer is undefined until S_OK, even when no error occurred.
    let status = unsafe {
        (context.vtable().GetData)(
            context.as_raw(),
            query.as_raw(),
            std::ptr::from_mut(&mut value).cast(),
            std::mem::size_of::<T>() as u32,
            D3D11_ASYNC_GETDATA_DONOTFLUSH.0 as u32,
        )
    };
    if status == windows::core::HRESULT(1) {
        return Ok(None);
    }
    status.ok()?;
    Ok(Some(value))
}

impl GpuMeasurement {
    pub(crate) fn new(device: &ID3D11Device) -> Result<Self> {
        let mut slots = Vec::with_capacity(8);
        for _ in 0..8 {
            slots.push(Slot {
                disjoint: query(device, D3D11_QUERY_TIMESTAMP_DISJOINT)?,
                start: query(device, D3D11_QUERY_TIMESTAMP)?,
                end: query(device, D3D11_QUERY_TIMESTAMP)?,
                pending: None,
            });
        }
        Ok(Self { slots, sequence: 0 })
    }

    pub(crate) fn begin(
        &mut self,
        context: &ID3D11DeviceContext,
        window: u64,
    ) -> Result<Option<usize>> {
        for slot in &mut self.slots {
            let Some((clock, end, hwnd, sequence)) = slot.pending else {
                continue;
            };
            let Some(timing) =
                read::<D3D11_QUERY_DATA_TIMESTAMP_DISJOINT>(context, &slot.disjoint)?
            else {
                continue;
            };
            let Some(start) = read::<u64>(context, &slot.start)? else {
                continue;
            };
            let Some(finish) = read::<u64>(context, &slot.end)? else {
                continue;
            };
            let duration = crate::profiling::gpu_duration_ns(
                start,
                finish,
                timing.Frequency,
                timing.Disjoint.as_bool(),
            );
            crate::profiling::record(crate::profiling::Event {
                kind: if duration.is_some() {
                    "gpu_frame"
                } else {
                    "gpu_disjoint"
                },
                label: "d3d11_render",
                clock,
                end,
                epoch: hwnd,
                sequence,
                value: duration.unwrap_or(0),
            });
            slot.pending = None;
        }
        let Some(index) = self.slots.iter().position(|slot| slot.pending.is_none()) else {
            crate::profiling::mark("gpu_skipped", "query_ring_full", window, 0, 0);
            return Ok(None);
        };
        self.sequence += 1;
        let slot = &mut self.slots[index];
        slot.pending = Some((
            crate::profiling::clock().unwrap_or(0),
            0,
            window,
            self.sequence,
        ));
        unsafe {
            context.Begin(&slot.disjoint);
            context.End(&slot.start);
        }
        Ok(Some(index))
    }

    pub(crate) fn end(&mut self, context: &ID3D11DeviceContext, index: usize) {
        let slot = &mut self.slots[index];
        unsafe {
            context.End(&slot.end);
            context.End(&slot.disjoint);
        }
        if let Some(pending) = &mut slot.pending {
            pending.1 = crate::profiling::clock().unwrap_or(0);
        }
    }
}
