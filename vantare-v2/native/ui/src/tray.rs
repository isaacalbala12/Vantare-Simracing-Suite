//! Icono de bandeja de los overlays (#1464). Los overlays no salen en la barra
//! de tareas; sin icono no se sabe que están abiertos ni cómo cerrarlos.
//!
//! Hilo propio con su ventana oculta y su bucle de mensajes: GPUI no ve nada
//! de esto. «Abrir Hub» se resuelve aquí; mostrar/ocultar y salir se envían al
//! host por canal. El `WM_CLOSE` con el que el launcher cierra los overlays
//! también llega a esta ventana y retira el icono.
use std::cell::RefCell;

use windows_sys::Win32::Foundation::{HWND, LPARAM, LRESULT, WPARAM};
use windows_sys::Win32::UI::Shell::{
    NIF_ICON, NIF_MESSAGE, NIF_TIP, NIM_ADD, NIM_DELETE, NOTIFYICONDATAW, Shell_NotifyIconW,
};
use windows_sys::Win32::UI::WindowsAndMessaging::{
    AppendMenuW, CreateIcon, CreatePopupMenu, CreateWindowExW, DefWindowProcW, DestroyMenu,
    DestroyWindow, DispatchMessageW, FindWindowW, GetCursorPos, GetMessageW, HICON,
    IDI_APPLICATION, LoadIconW, MF_STRING, MSG, PostQuitMessage, RegisterClassW, SW_RESTORE,
    SetForegroundWindow, ShowWindow, TPM_NONOTIFY, TPM_RETURNCMD, TrackPopupMenu, TranslateMessage,
    WM_APP, WM_CONTEXTMENU, WM_DESTROY, WM_LBUTTONUP, WM_RBUTTONUP, WNDCLASSW,
};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Action {
    Toggle,
    Quit,
}

const CALLBACK: u32 = WM_APP + 1;
const TOGGLE: usize = 1;
const HUB: usize = 2;
const QUIT: usize = 3;
const MENU: [(usize, &str); 3] = [
    (TOGGLE, "Mostrar/Ocultar overlays"),
    (HUB, "Abrir Hub"),
    (QUIT, "Salir de Vantare"),
];
/// Título de la ventana del Hub (`hub/src/shell.rs`): evita abrir un segundo Hub.
const HUB_TITLE: &str = "Vantare Hub — nativo";
const LOGO: &[u8] = include_bytes!("../assets/vantare-mark.png");

thread_local! {
    static ACTIONS: RefCell<Option<flume::Sender<Action>>> = const { RefCell::new(None) };
}

fn wide(text: &str) -> Vec<u16> {
    text.encode_utf16().chain(Some(0)).collect()
}

/// Arranca el icono; el hilo termina al cerrar su ventana.
pub fn spawn() -> std::io::Result<flume::Receiver<Action>> {
    let (send, receive) = flume::unbounded();
    std::thread::Builder::new()
        .name("overlays-tray".into())
        .spawn(move || {
            if let Err(error) = run(send) {
                eprintln!("icono de bandeja no disponible: {error}");
            }
        })?;
    Ok(receive)
}

fn run(send: flume::Sender<Action>) -> std::io::Result<()> {
    ACTIONS.with(|slot| *slot.borrow_mut() = Some(send));
    let class = wide("VantareOverlaysTray");
    let window_class = WNDCLASSW {
        lpfnWndProc: Some(procedure),
        lpszClassName: class.as_ptr(),
        // SAFETY: estructura C sin invariantes; el resto de campos admite cero.
        ..unsafe { std::mem::zeroed() }
    };
    // SAFETY: `window_class` y `class` viven durante la llamada; registrar dos
    // veces en el mismo proceso solo devuelve error y CreateWindowExW lo detecta.
    unsafe { RegisterClassW(&raw const window_class) };
    // Ventana normal nunca mostrada (no de solo mensajes): TrackPopupMenu
    // necesita poder ponerla en primer plano para cerrar el menú al salir de él.
    // SAFETY: clase registrada arriba; sin padre, menú ni datos de creación.
    let window = unsafe {
        CreateWindowExW(
            0,
            class.as_ptr(),
            class.as_ptr(),
            0,
            0,
            0,
            0,
            0,
            std::ptr::null_mut(),
            std::ptr::null_mut(),
            std::ptr::null_mut(),
            std::ptr::null(),
        )
    };
    if window.is_null() {
        return Err(std::io::Error::last_os_error());
    }
    let mut data = icon_data(window);
    data.uFlags = NIF_ICON | NIF_MESSAGE | NIF_TIP;
    data.uCallbackMessage = CALLBACK;
    data.hIcon = icon();
    for (slot, unit) in data
        .szTip
        .iter_mut()
        .zip(wide("Vantare · overlays activos"))
    {
        *slot = unit;
    }
    // SAFETY: `data` está inicializada con su tamaño y una ventana de este hilo.
    if unsafe { Shell_NotifyIconW(NIM_ADD, &raw const data) } == 0 {
        return Err(std::io::Error::other("Shell_NotifyIconW rechazó el icono"));
    }
    // SAFETY: MSG es una estructura C que GetMessageW rellena.
    let mut message: MSG = unsafe { std::mem::zeroed() };
    // SAFETY: bucle estándar del hilo dueño de `window`; 0 = WM_QUIT, -1 = error.
    while unsafe { GetMessageW(&raw mut message, std::ptr::null_mut(), 0, 0) } > 0 {
        // SAFETY: `message` lo acaba de rellenar GetMessageW.
        unsafe {
            TranslateMessage(&raw const message);
            DispatchMessageW(&raw const message);
        }
    }
    Ok(())
}

fn icon_data(window: HWND) -> NOTIFYICONDATAW {
    NOTIFYICONDATAW {
        cbSize: u32::try_from(size_of::<NOTIFYICONDATAW>()).unwrap_or(u32::MAX),
        hWnd: window,
        uID: 1,
        // SAFETY: estructura C sin invariantes; el resto de campos admite cero.
        ..unsafe { std::mem::zeroed() }
    }
}

/// La marca Vantare a 32×32 (media de bloques 4×4); el icono genérico si falla.
fn icon() -> HICON {
    const SIDE: usize = 32;
    let decoded = (|| {
        let mut reader = png::Decoder::new(std::io::Cursor::new(LOGO))
            .read_info()
            .ok()?;
        let mut pixels = vec![0; reader.output_buffer_size()?];
        let info = reader.next_frame(&mut pixels).ok()?;
        (info.color_type == png::ColorType::Rgba && info.width == 128 && info.height == 128)
            .then_some(pixels)
    })();
    if let Some(pixels) = decoded {
        let mut bgra = Vec::with_capacity(SIDE * SIDE * 4);
        for y in 0..SIDE {
            for x in 0..SIDE {
                let mut sum = [0_u32; 4];
                for dy in 0..4 {
                    for dx in 0..4 {
                        let at = ((y * 4 + dy) * 128 + x * 4 + dx) * 4;
                        for (total, &value) in sum.iter_mut().zip(&pixels[at..at + 4]) {
                            *total += u32::from(value);
                        }
                    }
                }
                let [r, g, b, a] = sum.map(|total| u8::try_from(total / 16).unwrap_or(u8::MAX));
                bgra.extend([b, g, r, a]);
            }
        }
        let mask = [0_u8; SIDE * SIDE / 8];
        // SAFETY: XOR de 32 bpp (SIDE² × 4 bytes) y máscara AND de 1 bpp con
        // filas de 4 bytes (alineadas a WORD); ambos buffers viven en la llamada.
        let icon = unsafe {
            CreateIcon(
                std::ptr::null_mut(),
                SIDE as i32,
                SIDE as i32,
                1,
                32,
                mask.as_ptr(),
                bgra.as_ptr(),
            )
        };
        if !icon.is_null() {
            return icon;
        }
    }
    // SAFETY: icono de sistema compartido; no hace falta liberarlo.
    unsafe { LoadIconW(std::ptr::null_mut(), IDI_APPLICATION) }
}

fn send(action: Action) {
    ACTIONS.with(|slot| {
        if let Some(send) = &*slot.borrow() {
            let _sent = send.send(action); // El host puede haber terminado ya.
        }
    });
}

fn open_hub() {
    let title = wide(HUB_TITLE);
    // SAFETY: título terminado en cero válido durante la llamada.
    let hub = unsafe { FindWindowW(std::ptr::null(), title.as_ptr()) };
    if hub.is_null() {
        let spawned = std::env::current_exe().and_then(|exe| {
            std::process::Command::new(exe.with_file_name("vantare-hub.exe")).spawn()
        });
        if let Err(error) = spawned {
            eprintln!("abrir Hub: {error}");
        }
    } else {
        // SAFETY: HWND devuelto por FindWindowW; si se cerró entretanto, fallan sin efecto.
        unsafe {
            ShowWindow(hub, SW_RESTORE);
            SetForegroundWindow(hub);
        }
    }
}

fn show_menu(window: HWND) {
    // SAFETY: menú creado y destruido aquí; las cadenas viven durante AppendMenuW.
    unsafe {
        let menu = CreatePopupMenu();
        if menu.is_null() {
            return;
        }
        for (id, label) in MENU {
            let label = wide(label);
            AppendMenuW(menu, MF_STRING, id, label.as_ptr());
        }
        let mut cursor = std::mem::zeroed();
        GetCursorPos(&raw mut cursor);
        SetForegroundWindow(window);
        let chosen = TrackPopupMenu(
            menu,
            TPM_RETURNCMD | TPM_NONOTIFY,
            cursor.x,
            cursor.y,
            0,
            window,
            std::ptr::null(),
        );
        DestroyMenu(menu);
        match usize::try_from(chosen).unwrap_or(0) {
            TOGGLE => send(Action::Toggle),
            HUB => open_hub(),
            QUIT => {
                send(Action::Quit);
                DestroyWindow(window); // Retira el icono antes de que salga el proceso.
            }
            _ => {}
        }
    }
}

unsafe extern "system" fn procedure(
    window: HWND,
    message: u32,
    wparam: WPARAM,
    lparam: LPARAM,
) -> LRESULT {
    match message {
        CALLBACK => {
            // Versión 0 de NOTIFYICON: el evento del ratón llega en `lparam`.
            if matches!(
                u32::try_from(lparam).unwrap_or(0),
                WM_LBUTTONUP | WM_RBUTTONUP | WM_CONTEXTMENU
            ) {
                show_menu(window);
            }
            0
        }
        WM_DESTROY => {
            let data = icon_data(window);
            // SAFETY: mismo identificador (ventana, uID) con el que se añadió.
            unsafe {
                Shell_NotifyIconW(NIM_DELETE, &raw const data);
                PostQuitMessage(0);
            }
            0
        }
        // SAFETY: argumentos recibidos tal cual del sistema.
        _ => unsafe { DefWindowProcW(window, message, wparam, lparam) },
    }
}
