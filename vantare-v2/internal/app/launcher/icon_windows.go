//go:build windows

package launcher

import (
	"bytes"
	"encoding/base64"
	"fmt"
	"image"
	"image/png"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"syscall"
	"unsafe"
)

var (
	modShell32          = syscall.NewLazyDLL("shell32.dll")
	procExtractIconExW  = modShell32.NewProc("ExtractIconExW")
	procSHGetFileInfoW  = modShell32.NewProc("SHGetFileInfoW")
	procSHGetImageList  = modShell32.NewProc("SHGetImageList")
	modUser32           = syscall.NewLazyDLL("user32.dll")
	procDestroyIcon     = modUser32.NewProc("DestroyIcon")
	procGetIconInfo     = modUser32.NewProc("GetIconInfo")
	modGdi32            = syscall.NewLazyDLL("gdi32.dll")
	procDeleteObject    = modGdi32.NewProc("DeleteObject")
	procGetObjectW      = modGdi32.NewProc("GetObjectW")
	procGetDIBits       = modGdi32.NewProc("GetDIBits")
	procCreateCompatibleDC = modGdi32.NewProc("CreateCompatibleDC")
	procSelectObject    = modGdi32.NewProc("SelectObject")
	procGetDeviceCaps   = modGdi32.NewProc("GetDeviceCaps")
	procDeleteDC        = modGdi32.NewProc("DeleteDC")
)

// shFileInfo matches the Windows SHFILEINFOW layout used by SHGetFileInfoW.
type shFileInfo struct {
	hIcon        uintptr
	iIcon        int32
	dwAttributes uint32
	szDisplayName [260]uint16
	szTypeName    [260]uint16
}

// IImageList GUID for SHGetImageList.
var iidIImageList = syscall.GUID{
	Data1: 0x46EBB4FA, Data2: 0x2009, Data3: 0x4C39,
	Data4: [8]byte{0x8B, 0x2E, 0x2F, 0x2A, 0xCA, 0x6B, 0xAE, 0x36},
}
var iidIImageList2 = syscall.GUID{
	Data1: 0x192B9D83, Data2: 0x80FC, Data3: 0x4E64,
	Data4: [8]byte{0x8C, 0x30, 0x7C, 0x42, 0x35, 0xE4, 0x90, 0xA8},
}

const (
	shgfiSysIconIndex = 0x4000 // SHGFI_SYSICONINDEX
	shilJumbo         = 4      // SHIL_JUMBO (256x256)
	shilExtraLarge    = 2      // SHIL_EXTRALARGE (48x48)
	ildTransparent    = 0x1    // ILD_TRANSPARENT
)

type iconInfo struct {
	_fIcon    uint32
	xHotspot  uint32
	yHotspot  uint32
	hbmMask   uintptr
	hbmColor  uintptr
}

type bitmapInfoHeader struct {
	BiSize          uint32
	BiWidth         int32
	BiHeight        int32
	BiPlanes        uint16
	BiBitCount      uint16
	BiCompression   uint32
	BiSizeImage     uint32
	BiXPelsPerMeter int32
	BiYPelsPerMeter int32
	BiClrUsed       uint32
	BiClrImportant  uint32
}

// BITMAP matches the GDI BITMAP struct used by GetObjectW.
type bitMap struct {
	BmType       int32
	BmWidth      int32
	BmHeight     int32
	BmWidthBytes int32
	BmPlanes     uint16
	BmBitsPixel  uint16
	BmBits       uintptr
}

var iconCache = map[string][]byte{}
var iconCacheMu sync.Mutex

// GetAppIcon extracts the primary icon from an executable and returns it as PNG bytes.
// Results are cached in memory. Returns empty bytes if extraction fails.
func GetAppIcon(exePath string) []byte {
	if exePath == "" {
		return nil
	}

	iconCacheMu.Lock()
	if cached, ok := iconCache[exePath]; ok {
		iconCacheMu.Unlock()
		return cached
	}
	iconCacheMu.Unlock()

	icon, err := extractIconAsPNG(exePath)
	if err != nil || icon == nil {
		return nil
	}

	iconCacheMu.Lock()
	iconCache[exePath] = icon
	iconCacheMu.Unlock()
	return icon
}

// GetAppIconBase64 returns the icon as a base64 data URI string for <img src>.
func GetAppIconBase64(exePath string) string {
	icon := GetAppIcon(exePath)
	if icon == nil {
		return ""
	}
	return "data:image/png;base64," + base64.StdEncoding.EncodeToString(icon)
}

func extractIconAsPNG(exePath string) ([]byte, error) {
	pathPtr, err := syscall.UTF16PtrFromString(exePath)
	if err != nil {
		return nil, err
	}

	// Extract the first icon (index 0, count 1).
	var hIcons [1]uintptr
	n, _, _ := procExtractIconExW.Call(
		uintptr(unsafe.Pointer(pathPtr)),
		0,
		uintptr(unsafe.Pointer(&hIcons[0])),
		0,
		1,
	)
	if n == 0 || hIcons[0] == 0 {
		return nil, fmt.Errorf("no icon found in %s", exePath)
	}
	hIcon := hIcons[0]
	defer procDestroyIcon.Call(uintptr(hIcon))
	return hIconToPNG(hIcon)
}

// hIconToPNG converts a GDI HICON into PNG bytes at the icon's native
// resolution (reads the actual bitmap dimensions via GetObjectW). This avoids
// cropping on larger icons and keeps crisp quality.
func hIconToPNG(hIcon uintptr) ([]byte, error) {
	var info iconInfo
	ret, _, _ := procGetIconInfo.Call(hIcon, uintptr(unsafe.Pointer(&info)))
	if ret == 0 {
		return nil, fmt.Errorf("GetIconInfo failed")
	}
	defer func() {
		if info.hbmMask != 0 {
			procDeleteObject.Call(info.hbmMask)
		}
		if info.hbmColor != 0 {
			procDeleteObject.Call(info.hbmColor)
		}
	}()

	const BI_RGB = 0
	const DIB_RGB_COLORS = 0
	useMask := info.hbmColor == 0

	hbm := info.hbmColor
	if useMask {
		hbm = info.hbmMask
	}

	// Read the actual bitmap dimensions via GetObjectW.
	var bm bitMap
	if r, _, _ := procGetObjectW.Call(hbm, unsafe.Sizeof(bm), uintptr(unsafe.Pointer(&bm))); r == 0 {
		// Fallback to 32x32 if we can't read dimensions.
		bm.BmWidth = 32
		bm.BmHeight = 32
	}
	width := bm.BmWidth
	height := bm.BmHeight

	// When using the mask bitmap, the icon is (width x height/2) for the XOR
	// image + AND mask, each row being 4-byte aligned. We only render the top
	// half (the XOR color image).
	readHeight := height
	if useMask {
		readHeight = height / 2
	}

	hdc, _, _ := procCreateCompatibleDC.Call(0)
	if hdc == 0 {
		return nil, fmt.Errorf("CreateCompatibleDC failed")
	}
	defer procDeleteDC.Call(hdc)

	procSelectObject.Call(hdc, hbm)

	bmi := bitmapInfoHeader{
		BiSize:        uint32(unsafe.Sizeof(bitmapInfoHeader{})),
		BiWidth:       width,
		BiHeight:      -readHeight,
		BiPlanes:      1,
		BiBitCount:    32,
		BiCompression: BI_RGB,
	}

	buf := make([]byte, int(width)*int(readHeight)*4)

	ret, _, _ = procGetDIBits.Call(
		hdc,
		hbm,
		0,
		uintptr(readHeight),
		uintptr(unsafe.Pointer(&buf[0])),
		uintptr(unsafe.Pointer(&bmi)),
		DIB_RGB_COLORS,
	)
	if ret == 0 {
		return nil, fmt.Errorf("GetDIBits failed")
	}

	// Convert BGRA to RGBA.
	for i := 0; i < len(buf); i += 4 {
		buf[i], buf[i+2] = buf[i+2], buf[i]
	}

	img := image.NewRGBA(image.Rect(0, 0, int(width), int(readHeight)))
	copy(img.Pix, buf)

	// When the icon lacks an alpha channel (hbmColor == 0, rare for modern
	// apps), the mask bitmap contains XOR + AND planes. Proper AND-plane
	// parsing requires a separate GetDIBits call with BiBitCount=1, but modern
	// icons always have hbmColor so this code path is almost never reached.
	// We skip AND-mask derivation; the resulting PNG may have a wrong background
	// for legacy 16-color icons — acceptable as these are not in our catalog.

	var pngBuf bytes.Buffer
	if err := png.Encode(&pngBuf, img); err != nil {
		return nil, err
	}
	return pngBuf.Bytes(), nil
}

// getIconViaSHGetFileInfo returns the icon Windows displays for a file (the
// same one Explorer shows), including for shortcuts (.lnk). This is more
// reliable than ExtractIconExW for shortcuts whose target executable lacks an
// embedded icon.
func getIconViaSHGetFileInfo(path string) ([]byte, error) {
	pathPtr, err := syscall.UTF16PtrFromString(path)
	if err != nil {
		return nil, err
	}
	var fi shFileInfo
	ret, _, _ := procSHGetFileInfoW.Call(
		uintptr(unsafe.Pointer(pathPtr)),
		0, // dwFileAttributes (unused)
		uintptr(unsafe.Pointer(&fi)),
		unsafe.Sizeof(fi),
		0x100, // SHGFI_ICON | SHGFI_LARGEICON
	)
	if ret == 0 || fi.hIcon == 0 {
		return nil, fmt.Errorf("SHGetFileInfo failed for %s", path)
	}
	defer procDestroyIcon.Call(fi.hIcon)
	return hIconToPNG(fi.hIcon)
}

// ---------------------------------------------------------------------------
// Shortcut (.lnk) icon resolution
//
// Some apps (Electron / custom installers) do not expose a standard embedded
// icon on their main executable, so ExtractIconExW returns nothing. Windows
// shows the real icon via the desktop shortcut, whose icon location is stored
// explicitly. We resolve the shortcut target with IShellLink and extract its
// icon, which is exactly what Windows displays on the desktop.
// ---------------------------------------------------------------------------

var (
	modOle32             = syscall.NewLazyDLL("ole32.dll")
	procCoInitializeEx   = modOle32.NewProc("CoInitializeEx")
	procCoUninitialize   = modOle32.NewProc("CoUninitialize")
	procCoCreateInstance = modOle32.NewProc("CoCreateInstance")
)

var (
	clsidShellLink = syscall.GUID{Data1: 0x00021401, Data2: 0x0000, Data3: 0x0000, Data4: [8]byte{0xC0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x46}}
	iidIShellLinkW = syscall.GUID{Data1: 0x000214F9, Data2: 0x0000, Data3: 0x0000, Data4: [8]byte{0xC0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x46}}
	iidIPersistFile = syscall.GUID{Data1: 0x0000010B, Data2: 0x0000, Data3: 0x0000, Data4: [8]byte{0xC0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x46}}
)

// lnkMu serialises COM usage. Icon extraction is cached and not perf-critical,
// so a single global lock is acceptable and avoids per-thread apartment issues.
var lnkMu sync.Mutex

// vfunc returns the i-th slot of an object's vtable.
func vfunc(p uintptr, index int) uintptr {
	up := unsafe.Pointer(p)
	vtablePtr := *(*unsafe.Pointer)(up)
	slotPtr := unsafe.Add(vtablePtr, uintptr(index)*unsafe.Sizeof(uintptr(0)))
	return *(*uintptr)(slotPtr)
}

func comRelease(p uintptr) {
	syscall.Syscall(vfunc(p, 2), 1, p, 0, 0)
}

func coCreateInstance(clsid, iid *syscall.GUID) (uintptr, bool) {
	var out uintptr
	ret, _, _ := procCoCreateInstance.Call(
		uintptr(unsafe.Pointer(clsid)),
		0,
		1, // CLSCTX_INPROC_SERVER
		uintptr(unsafe.Pointer(iid)),
		uintptr(unsafe.Pointer(&out)),
	)
	return out, ret == 0
}

func queryInterface(p uintptr, iid *syscall.GUID) (uintptr, bool) {
	var out uintptr
	ret, _, _ := syscall.Syscall(vfunc(p, 0), 3, p, uintptr(unsafe.Pointer(iid)), uintptr(unsafe.Pointer(&out)))
	return out, ret == 0
}

// resolveLnkTarget returns the filesystem path a .lnk shortcut points to, or ""
// if it cannot be resolved. Uses IShellLinkW + IPersistFile (COM).
func resolveLnkTarget(lnkPath string) string {
	lnkMu.Lock()
	defer lnkMu.Unlock()

	ret, _, _ := procCoInitializeEx.Call(0, 0x2) // COINIT_APARTMENTTHREADED
	if ret == 0 || ret == 1 {                     // S_OK or S_FALSE
		defer procCoUninitialize.Call()
	}

	sl, ok := coCreateInstance(&clsidShellLink, &iidIShellLinkW)
	if !ok || sl == 0 {
		return ""
	}
	defer comRelease(sl)

	pf, ok := queryInterface(sl, &iidIPersistFile)
	if !ok || pf == 0 {
		return ""
	}
	defer comRelease(pf)

	pathPtr, err := syscall.UTF16PtrFromString(lnkPath)
	if err != nil {
		return ""
	}
	// IPersistFile::Load(this, pszFileName, dwMode)
	if r, _, _ := syscall.Syscall(vfunc(pf, 5), 3, pf, uintptr(unsafe.Pointer(pathPtr)), 0); r != 0 {
		return ""
	}

	buf := make([]uint16, 260)
	// IShellLinkW::GetPath(this, pszFile, cchMax, pfd, fFlags)
	if r, _, _ := syscall.Syscall6(vfunc(sl, 3), 5, sl, uintptr(unsafe.Pointer(&buf[0])), 260, 0, 0, 0); r != 0 {
		return ""
	}
	return syscall.UTF16ToString(buf)
}

// shortcutSearchDirs returns folders where an app shortcut is likely to live.
func shortcutSearchDirs() []string {
	var dirs []string
	if v := os.Getenv("USERPROFILE"); v != "" {
		dirs = append(dirs, filepath.Join(v, "Desktop"))
	}
	if v := os.Getenv("PUBLIC"); v != "" {
		dirs = append(dirs, filepath.Join(v, "Desktop"))
	}
	if v := os.Getenv("APPDATA"); v != "" {
		dirs = append(dirs, filepath.Join(v, "Microsoft", "Windows", "Start Menu", "Programs"))
	}
	if v := os.Getenv("PROGRAMDATA"); v != "" {
		dirs = append(dirs, filepath.Join(v, "Microsoft", "Windows", "Start Menu", "Programs"))
	}
	return dirs
}

// findDesktopShortcut locates a .lnk whose target executable matches one of the
// candidate names (case-insensitive). Returns the .lnk path or "".
func findDesktopShortcut(candidateExes []string) string {
	if len(candidateExes) == 0 {
		return ""
	}
	lower := make([]string, len(candidateExes))
	for i, c := range candidateExes {
		lower[i] = strings.ToLower(c)
	}
	for _, dir := range shortcutSearchDirs() {
		entries, err := os.ReadDir(dir)
		if err != nil {
			continue
		}
		for _, e := range entries {
			if e.IsDir() {
				continue
			}
			if !strings.HasSuffix(strings.ToLower(e.Name()), ".lnk") {
				continue
			}
			target := resolveLnkTarget(filepath.Join(dir, e.Name()))
			if target == "" {
				continue
			}
			base := strings.ToLower(filepath.Base(target))
			for _, c := range lower {
				if base == c {
					return filepath.Join(dir, e.Name())
				}
			}
		}
	}
	return ""
}

// getIconHighRes returns a high-resolution (up to 256x256) icon for a file,
// using the system image list (SHGetImageList / SHIL_JUMBO). This is what
// Explorer displays and stays crisp when scaled down in the UI. Works for both
// executables and .lnk shortcuts.
func getIconHighRes(path string) ([]byte, error) {
	pathPtr, err := syscall.UTF16PtrFromString(path)
	if err != nil {
		return nil, err
	}
	// SHGetImageList creates an IImageList COM object, so the thread must be in
	// a COM apartment.
	ret, _, _ := procCoInitializeEx.Call(0, 0x2) // COINIT_APARTMENTTHREADED
	if ret == 0 || ret == 1 {
		defer procCoUninitialize.Call()
	}

	var fi shFileInfo
	ret, _, _ = procSHGetFileInfoW.Call(
		uintptr(unsafe.Pointer(pathPtr)),
		0, // dwFileAttributes
		uintptr(unsafe.Pointer(&fi)),
		unsafe.Sizeof(fi),
		shgfiSysIconIndex,
	)
	if ret == 0 {
		return nil, fmt.Errorf("SHGetFileInfo SYSICONINDEX failed for %s", path)
	}
	index := fi.iIcon

	for _, list := range []int{shilJumbo, shilExtraLarge} {
		for _, riid := range []syscall.GUID{iidIImageList, iidIImageList2} {
			var pIL uintptr
			r, _, _ := procSHGetImageList.Call(
				uintptr(list),
				uintptr(unsafe.Pointer(&riid)),
				uintptr(unsafe.Pointer(&pIL)),
			)
			if r != 0 || pIL == 0 {
				continue
			}
			// IImageList::Release on cleanup.
			defer comRelease(pIL)

			var hIcon uintptr
			// IImageList::GetIcon(this, iImage, uFlags, ppIcon)
			if gr, _, _ := syscall.Syscall6(vfunc(pIL, 3), 4, pIL, uintptr(index), uintptr(ildTransparent), uintptr(unsafe.Pointer(&hIcon)), 0, 0); gr != 0 {
				continue
			}
			if hIcon == 0 {
				continue
			}
			defer procDestroyIcon.Call(hIcon)
			return hIconToPNG(hIcon)
		}
	}
	return nil, fmt.Errorf("no high-res icon for %s", path)
}

// GetAppIconForApp extracts an app icon at the best available resolution.
// Priority: high-res from exe, high-res from .lnk shortcut, 32x32 from exe,
// 32x32 from .lnk shortcut.
func GetAppIconForApp(id, exePath string) []byte {
	if exePath != "" {
		if b, err := getIconHighRes(exePath); err == nil && b != nil {
			return b
		}
		if b, err := extractIconAsPNG(exePath); err == nil && b != nil {
			return b
		}
	}
	if known, ok := KnownAppsByID[id]; ok {
		if lnk := findDesktopShortcut(known.ExecutableNames); lnk != "" {
			if b, err := getIconHighRes(lnk); err == nil && b != nil {
				return b
			}
			if b, err := getIconViaSHGetFileInfo(lnk); err == nil && b != nil {
				return b
			}
		}
	}
	return nil
}

// GetAppIconForAppBase64 returns the app icon as a base64 data URI, or "".
func GetAppIconForAppBase64(id, exePath string) string {
	b := GetAppIconForApp(id, exePath)
	if b == nil {
		return ""
	}
	return "data:image/png;base64," + base64.StdEncoding.EncodeToString(b)
}
