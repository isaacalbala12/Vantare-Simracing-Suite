//go:build windows

package launcher

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"image"
	"image/draw"
	"image/png"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"syscall"
	"time"
	"unsafe"
)

var (
	modShell32             = syscall.NewLazyDLL("shell32.dll")
	procExtractIconExW     = modShell32.NewProc("ExtractIconExW")
	procSHGetFileInfoW     = modShell32.NewProc("SHGetFileInfoW")
	procSHGetImageList     = modShell32.NewProc("SHGetImageList")
	modUser32              = syscall.NewLazyDLL("user32.dll")
	procDestroyIcon        = modUser32.NewProc("DestroyIcon")
	procGetIconInfo        = modUser32.NewProc("GetIconInfo")
	modGdi32               = syscall.NewLazyDLL("gdi32.dll")
	procDeleteObject       = modGdi32.NewProc("DeleteObject")
	procGetObjectW         = modGdi32.NewProc("GetObjectW")
	procGetDIBits          = modGdi32.NewProc("GetDIBits")
	procCreateCompatibleDC = modGdi32.NewProc("CreateCompatibleDC")
	procSelectObject       = modGdi32.NewProc("SelectObject")
	procGetDeviceCaps      = modGdi32.NewProc("GetDeviceCaps")
	procDeleteDC           = modGdi32.NewProc("DeleteDC")
)

// shFileInfo matches the Windows SHFILEINFOW layout used by SHGetFileInfoW.
type shFileInfo struct {
	hIcon         uintptr
	iIcon         int32
	dwAttributes  uint32
	szDisplayName [260]uint16
	szTypeName    [260]uint16
}

// IImageList GUID for SHGetImageList.
var iidIImageList = syscall.GUID{
	Data1: 0x46EB5926, Data2: 0x582E, Data3: 0x4017,
	Data4: [8]byte{0x9F, 0xDF, 0xE8, 0x99, 0x8D, 0xAA, 0x09, 0x50},
}
var iidIImageList2 = syscall.GUID{
	Data1: 0x192B9D83, Data2: 0x50FC, Data3: 0x457B,
	Data4: [8]byte{0x90, 0xA0, 0x2B, 0x82, 0xA8, 0xB5, 0xDA, 0xE1},
}

const (
	shgfiSysIconIndex = 0x4000 // SHGFI_SYSICONINDEX
	shilJumbo         = 4      // SHIL_JUMBO (256x256)
	shilExtraLarge    = 2      // SHIL_EXTRALARGE (48x48)
	ildTransparent    = 0x1    // ILD_TRANSPARENT
)

type iconInfo struct {
	_fIcon   uint32
	xHotspot uint32
	yHotspot uint32
	hbmMask  uintptr
	hbmColor uintptr
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

// appIconCache holds the resolved icon bytes keyed by id|exePath. The icon
// pipeline has several expensive, uncached stages (shortcut COM resolution,
// the shell image list, PNG encoding), so every snapshot currently re-runs
// them all. This cache makes repeated snapshots O(1). It is invalidated by
// resetShortcutIndex, exactly when discovery resets the shortcut index.
var appIconCache = struct {
	sync.Mutex
	items map[string][]byte
}{}

// ---------------------------------------------------------------------------
// Disk cache (icons + shortcut index). A fresh process pays the full COM
// pipeline once; later sessions load the validated entries instead of
// re-walking the Start Menu and re-extracting icons. Every entry is validated
// by file existence + mtime + size, and a manual rescan (resetShortcutIndex)
// drops the whole file, so a reinstall or new shortcut is always picked up.
// ---------------------------------------------------------------------------

// iconDiskCacheFileOverride is injectable from tests; empty means the default
// UserCacheDir location.
var iconDiskCacheFileOverride string

const (
	// v2: las entradas de la v1 se escribieron cuando la resolución podía caer
	// en las rutas de 32 px (`SHGFI_LARGEICON`, `ExtractIconExW`). Como la
	// caché solo se invalida por mtime del ejecutable, esos iconos borrosos
	// sobrevivían indefinidamente aunque el extractor ya sabía sacar 256 px.
	// Subir la versión los tira de una vez.
	iconDiskCacheVersion   = 2
	iconDiskCacheMaxIcons  = 50
	iconDiskIndexFreshness = 15 * time.Minute

	// Lado mínimo aceptable de un icono. Por debajo de esto la losa de 39 px a
	// DPR 2 (78 px físicos) tendría que ampliar la imagen y se ve borrosa, así
	// que se sigue buscando en las rutas siguientes antes de conformarse.
	iconMinPreferredSize = 64
)

type iconDiskEntry struct {
	Path    string `json:"path"`
	MtimeMs int64  `json:"mtimeMs"`
	Size    int64  `json:"size"`
	IconB64 string `json:"iconB64"`
}

type shortcutDiskEntry struct {
	LnkPath string `json:"lnkPath"`
	MtimeMs int64  `json:"mtimeMs"`
}

type iconDiskCache struct {
	Version   int                          `json:"version"`
	Icons     map[string]iconDiskEntry     `json:"icons"`
	Shortcuts map[string]shortcutDiskEntry `json:"shortcuts"`
	SavedAt   time.Time                    `json:"savedAt"`
}

var (
	iconDiskMu     sync.Mutex
	iconDiskLoaded bool
	iconDiskData   iconDiskCache
)

func iconDiskCachePath() string {
	if iconDiskCacheFileOverride != "" {
		return iconDiskCacheFileOverride
	}
	base, err := os.UserCacheDir()
	if err != nil {
		return ""
	}
	return filepath.Join(base, "vantare", "launcher", "icons-cache-v2.json")
}

func loadIconDiskCache() *iconDiskCache {
	iconDiskMu.Lock()
	defer iconDiskMu.Unlock()
	return loadIconDiskCacheLocked()
}

// loadIconDiskCacheLocked loads the cache; the caller must hold iconDiskMu.
func loadIconDiskCacheLocked() *iconDiskCache {
	if iconDiskLoaded {
		return &iconDiskData
	}
	iconDiskLoaded = true
	// Los mapas se crean antes de cualquier salida temprana: sin fichero (una
	// instalación nueva) `loadIconDiskCacheLocked` devolvía la estructura con
	// los mapas a nil y el primer `saveIconToDisk` reventaba con «assignment to
	// entry in nil map», matando la goroutine de extracción durante el escaneo.
	if iconDiskData.Icons == nil {
		iconDiskData.Icons = map[string]iconDiskEntry{}
	}
	if iconDiskData.Shortcuts == nil {
		iconDiskData.Shortcuts = map[string]shortcutDiskEntry{}
	}
	path := iconDiskCachePath()
	if path == "" {
		return &iconDiskData
	}
	// El fichero de la v1 ya no lo lee nadie: se borra en el primer arranque
	// para no dejar megas de iconos de 32 px ocupando la caché del usuario.
	if iconDiskCacheFileOverride == "" {
		_ = os.Remove(filepath.Join(filepath.Dir(path), "icons-cache-v1.json"))
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return &iconDiskData
	}
	var cache iconDiskCache
	if json.Unmarshal(data, &cache) != nil || cache.Version != iconDiskCacheVersion {
		return &iconDiskData
	}
	if cache.Icons == nil {
		cache.Icons = map[string]iconDiskEntry{}
	}
	if cache.Shortcuts == nil {
		cache.Shortcuts = map[string]shortcutDiskEntry{}
	}
	iconDiskData = cache
	return &iconDiskData
}

func persistIconDiskCache() {
	iconDiskMu.Lock()
	defer iconDiskMu.Unlock()
	path := iconDiskCachePath()
	if path == "" {
		return
	}
	iconDiskData.Version = iconDiskCacheVersion
	iconDiskData.SavedAt = time.Now()
	data, err := json.Marshal(&iconDiskData)
	if err != nil {
		return
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o644); err != nil {
		return
	}
	_ = os.Rename(tmp, path)
}

// clearIconDiskCache drops the on-disk cache and marks the in-memory copy
// empty. resetShortcutIndex calls this so a manual rescan sees fresh data.
func clearIconDiskCache() {
	iconDiskMu.Lock()
	iconDiskLoaded = true
	iconDiskData = iconDiskCache{
		Icons:     map[string]iconDiskEntry{},
		Shortcuts: map[string]shortcutDiskEntry{},
	}
	path := iconDiskCachePath()
	iconDiskMu.Unlock()
	if path != "" {
		_ = os.Remove(path)
	}
}

func fileFingerprint(path string) (mtimeMs int64, size int64, ok bool) {
	info, err := os.Stat(path)
	if err != nil {
		return 0, 0, false
	}
	return info.ModTime().UnixMilli(), info.Size(), true
}

func iconDiskKey(path string) string {
	return strings.ToLower(filepath.Clean(path))
}

func loadIconFromDisk(exePath string) []byte {
	if exePath == "" {
		return nil
	}
	iconDiskMu.Lock()
	defer iconDiskMu.Unlock()
	cache := loadIconDiskCacheLocked()
	if len(cache.Icons) == 0 {
		return nil
	}
	mtimeMs, size, ok := fileFingerprint(exePath)
	if !ok {
		return nil
	}
	entry, found := cache.Icons[iconDiskKey(exePath)]
	if !found || entry.Path != exePath || entry.MtimeMs != mtimeMs || entry.Size != size {
		return nil
	}
	b, err := base64.StdEncoding.DecodeString(entry.IconB64)
	if err != nil || len(b) == 0 {
		return nil
	}
	return b
}

func saveIconToDisk(exePath string, icon []byte) {
	if exePath == "" || len(icon) == 0 {
		return
	}
	iconDiskMu.Lock()
	defer iconDiskMu.Unlock()
	cache := loadIconDiskCacheLocked()
	if len(cache.Icons) >= iconDiskCacheMaxIcons {
		return
	}
	mtimeMs, size, ok := fileFingerprint(exePath)
	if !ok {
		return
	}
	cache.Icons[iconDiskKey(exePath)] = iconDiskEntry{
		Path:    exePath,
		MtimeMs: mtimeMs,
		Size:    size,
		IconB64: base64.StdEncoding.EncodeToString(icon),
	}
}

// FlushIconDiskCache writes the accumulated icon and shortcut index entries to
// disk. The scan calls it once, after resolving every icon, instead of writing
// the file after every single resolution (which cost more than it saved).
func FlushIconDiskCache() {
	persistIconDiskCache()
}

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
	return extractIconAsPNGAtIndex(exePath, 0)
}

func extractIconAsPNGAtIndex(exePath string, index int32) ([]byte, error) {
	pathPtr, err := syscall.UTF16PtrFromString(exePath)
	if err != nil {
		return nil, err
	}

	// Extract the first icon (index 0, count 1).
	var hIcons [1]uintptr
	n, _, _ := procExtractIconExW.Call(
		uintptr(unsafe.Pointer(pathPtr)),
		uintptr(index),
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
	clsidShellLink  = syscall.GUID{Data1: 0x00021401, Data2: 0x0000, Data3: 0x0000, Data4: [8]byte{0xC0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x46}}
	iidIShellLinkW  = syscall.GUID{Data1: 0x000214F9, Data2: 0x0000, Data3: 0x0000, Data4: [8]byte{0xC0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x46}}
	iidIPersistFile = syscall.GUID{Data1: 0x0000010B, Data2: 0x0000, Data3: 0x0000, Data4: [8]byte{0xC0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x46}}
)

// lnkMu serialises COM usage. Icon extraction is cached and not perf-critical,
// so a single global lock is acceptable and avoids per-thread apartment issues.
var lnkMu sync.Mutex

// shortcutIndexCache holds the shortcut index: target executable base name
// (lower-cased) to the .lnk that points at it. It is built by a single walk of
// shortcutSearchDirs and shared by every lookup, because resolving a .lnk is a
// COM call serialised by lnkMu and the search folders hold hundreds of them.
var shortcutIndexCache = struct {
	sync.Mutex
	items map[string]string
}{}

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

	// Locked because CoUninitialize has to run on the same thread that
	// initialised: a goroutine can otherwise be rescheduled in between, leaving
	// this thread in a single-threaded apartment forever. That is what broke
	// desktop notifications, which need the thread in a multi-threaded one.
	runtime.LockOSThread()
	defer runtime.UnlockOSThread()

	ret, _, _ := procCoInitializeEx.Call(0, 0x2) // COINIT_APARTMENTTHREADED
	if ret == 0 || ret == 1 {                    // S_OK or S_FALSE
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

// resolveLnkIconLocation returns the icon resource path and index explicitly
// stored by the shortcut. Reading this location avoids rendering the .lnk
// overlay and preserves custom shortcut artwork without using the shortcut
// itself as the rendered image.
func resolveLnkIconLocation(lnkPath string) (string, int32) {
	lnkMu.Lock()
	defer lnkMu.Unlock()

	// See resolveLnkTarget: the uninit must land on the thread that initialised.
	runtime.LockOSThread()
	defer runtime.UnlockOSThread()

	ret, _, _ := procCoInitializeEx.Call(0, 0x2)
	if ret == 0 || ret == 1 {
		defer procCoUninitialize.Call()
	}

	sl, ok := coCreateInstance(&clsidShellLink, &iidIShellLinkW)
	if !ok || sl == 0 {
		return "", 0
	}
	defer comRelease(sl)

	persist, ok := queryInterface(sl, &iidIPersistFile)
	if !ok || persist == 0 {
		return "", 0
	}
	defer comRelease(persist)

	pathPtr, err := syscall.UTF16PtrFromString(lnkPath)
	if err != nil {
		return "", 0
	}
	if r, _, _ := syscall.Syscall(vfunc(persist, 5), 3, persist, uintptr(unsafe.Pointer(pathPtr)), 0); r != 0 {
		return "", 0
	}

	buf := make([]uint16, 260)
	var index int32
	if r, _, _ := syscall.Syscall6(
		vfunc(sl, 16),
		4,
		sl,
		uintptr(unsafe.Pointer(&buf[0])),
		260,
		uintptr(unsafe.Pointer(&index)),
		0,
		0,
	); r != 0 {
		return "", 0
	}
	return syscall.UTF16ToString(buf), index
}

// shortcutSearchDir is a folder to scan for .lnk files together with how deep
// the scan may go below it.
type shortcutSearchDir struct {
	path     string
	maxDepth int
}

// shortcutSearchDirs returns folders where an app shortcut is likely to live,
// each with its own depth budget. Desktop shortcuts sit at the root, and a
// Desktop can be the root of an enormous synced tree, so it is not descended;
// Start Menu shortcuts nest one folder deep per vendor, which two levels cover.
func shortcutSearchDirs() []shortcutSearchDir {
	var dirs []shortcutSearchDir
	if v := os.Getenv("USERPROFILE"); v != "" {
		dirs = append(dirs, shortcutSearchDir{filepath.Join(v, "Desktop"), 0})
	}
	if v := os.Getenv("PUBLIC"); v != "" {
		dirs = append(dirs, shortcutSearchDir{filepath.Join(v, "Desktop"), 0})
	}
	if v := os.Getenv("APPDATA"); v != "" {
		dirs = append(dirs, shortcutSearchDir{filepath.Join(v, "Microsoft", "Windows", "Start Menu", "Programs"), 2})
	}
	if v := os.Getenv("PROGRAMDATA"); v != "" {
		dirs = append(dirs, shortcutSearchDir{filepath.Join(v, "Microsoft", "Windows", "Start Menu", "Programs"), 2})
	}
	return dirs
}

// resetShortcutIndex discards the shortcut index so the next lookup rebuilds
// it, and drops every cached icon so a rescan sees the current disk state
// (e.g. an app reinstalled with a different .lnk or embedded icon). Discovery
// calls this on every scan, which is what lets a rescan pick up apps installed
// since the process started.
func resetShortcutIndex() {
	shortcutIndexCache.Lock()
	shortcutIndexCache.items = nil
	shortcutIndexCache.Unlock()
	iconCacheMu.Lock()
	iconCache = map[string][]byte{}
	iconCacheMu.Unlock()
	appIconCache.Lock()
	appIconCache.items = nil
	appIconCache.Unlock()
	clearIconDiskCache()
}

// genericShortcutHints are executable base names too broad to act as shortcut
// hints: they match many unrelated .lnk files, and resolving every matched
// shortcut is a serialized COM round-trip that dominates the first scan.
var genericShortcutHints = map[string]struct{}{
	"app":    {},
	"update": {},
}

// shortcutNameHints returns the lower-cased fragments a catalogued app's
// shortcut file name is expected to contain: its display-name matchers plus its
// executable base names (except generic ones). Resolving a .lnk is a COM
// round-trip, and the search folders hold hundreds of them while the catalog
// only has a handful of apps, so the index resolves only the .lnk files whose
// own name matches a hint.
func shortcutNameHints() []string {
	var hints []string
	for _, known := range KnownApps {
		// steam-uri apps (e.g. LMU) resolve via the Steam library or registry;
		// their shortcut hints only match unrelated .lnk files and cost COM
		// round-trips during the index build, so they are skipped.
		if known.LaunchMethod == "steam-uri" {
			continue
		}
		for _, matcher := range known.DisplayNameMatchers {
			hints = append(hints, strings.ToLower(matcher))
		}
		for _, name := range known.ExecutableNames {
			base := strings.ToLower(strings.TrimSuffix(name, filepath.Ext(name)))
			if base == "" {
				continue
			}
			if _, generic := genericShortcutHints[base]; generic {
				continue
			}
			hints = append(hints, base)
		}
	}
	return hints
}

// shortcutIndex returns the target-executable to .lnk index, walking the search
// folders once and resolving each .lnk exactly once. Earlier folders win, so
// the Desktop keeps priority over the Start Menu as it did when each caller ran
// its own walk. A validated on-disk copy from a recent session is reused
// instead of re-walking; a manual rescan invalidates it.
func shortcutIndex() map[string]string {
	shortcutIndexCache.Lock()
	defer shortcutIndexCache.Unlock()
	if shortcutIndexCache.items != nil {
		return shortcutIndexCache.items
	}

	if cache := loadIconDiskCache(); len(cache.Shortcuts) > 0 && time.Since(cache.SavedAt) < iconDiskIndexFreshness {
		index := map[string]string{}
		allValid := true
		for base, entry := range cache.Shortcuts {
			mtimeMs, _, ok := fileFingerprint(entry.LnkPath)
			if !ok || mtimeMs != entry.MtimeMs {
				allValid = false
				break
			}
			index[base] = entry.LnkPath
		}
		if allValid {
			shortcutIndexCache.items = index
			return index
		}
	}

	index := buildShortcutIndex()
	iconDiskMu.Lock()
	cache := loadIconDiskCacheLocked()
	cache.Shortcuts = map[string]shortcutDiskEntry{}
	for base, lnk := range index {
		if mtimeMs, _, ok := fileFingerprint(lnk); ok {
			cache.Shortcuts[base] = shortcutDiskEntry{LnkPath: lnk, MtimeMs: mtimeMs}
		}
	}
	iconDiskMu.Unlock()
	shortcutIndexCache.items = index
	return index
}

// buildShortcutIndex walks the shortcut search folders and resolves every .lnk
// whose name matches a hint. It is the expensive path; shortcutIndex prefers
// the persisted copy when it is still valid.
func buildShortcutIndex() map[string]string {
	index := map[string]string{}
	hints := shortcutNameHints()
	for _, dir := range shortcutSearchDirs() {
		_ = filepath.WalkDir(dir.path, func(path string, entry os.DirEntry, err error) error {
			if err != nil {
				return nil
			}
			relative, relErr := filepath.Rel(dir.path, path)
			if relErr != nil {
				return nil
			}
			depth := strings.Count(relative, string(os.PathSeparator))
			if entry.IsDir() {
				// The root is depth 0 like its direct children, so it has to be
				// excluded explicitly or a zero budget would skip everything.
				if path != dir.path && depth >= dir.maxDepth {
					return filepath.SkipDir
				}
				return nil
			}
			if depth > dir.maxDepth || !strings.EqualFold(filepath.Ext(entry.Name()), ".lnk") {
				return nil
			}
			stem := strings.ToLower(strings.TrimSuffix(entry.Name(), filepath.Ext(entry.Name())))
			matched := false
			for _, hint := range hints {
				if strings.Contains(stem, hint) {
					matched = true
					break
				}
			}
			if !matched {
				return nil
			}
			target := resolveLnkTarget(path)
			if target == "" {
				return nil
			}
			base := strings.ToLower(filepath.Base(target))
			if _, seen := index[base]; !seen {
				index[base] = path
			}
			return nil
		})
	}
	shortcutIndexCache.items = index
	return index
}

// findDesktopShortcut locates a .lnk whose target executable matches one of the
// candidate names (case-insensitive). Returns the .lnk path or "".
func findDesktopShortcut(candidateExes []string) string {
	if len(candidateExes) == 0 {
		return ""
	}
	index := shortcutIndex()
	for _, candidate := range candidateExes {
		if path, ok := index[strings.ToLower(candidate)]; ok {
			return path
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
	// a COM apartment. Locked so the uninit lands on the same thread; see
	// resolveLnkTarget.
	runtime.LockOSThread()
	defer runtime.UnlockOSThread()

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
			// IImageList::GetIcon(this, iImage, uFlags, ppIcon) is vtable slot 10.
			if gr, _, _ := syscall.Syscall6(vfunc(pIL, 10), 4, pIL, uintptr(index), uintptr(ildTransparent), uintptr(unsafe.Pointer(&hIcon)), 0, 0); gr != 0 {
				continue
			}
			if hIcon == 0 {
				continue
			}
			defer procDestroyIcon.Call(hIcon)
			b, err := hIconToPNG(hIcon)
			if err != nil {
				continue
			}
			return trimIconCanvasPadding(b), nil
		}
	}
	return nil, fmt.Errorf("no high-res icon for %s", path)
}

// trimIconCanvasPadding recorta el relleno transparente de la esquina cuando
// SHIL_JUMBO devuelve un lienzo de 256 px con un icono pequeño dentro.
//
// Cuando el ejecutable no trae un icono de 256 px, la lista de imágenes del
// shell no lo amplía: coloca el de 32 px en la esquina superior izquierda de un
// lienzo de 256 y deja el resto transparente. El PNG resultante "mide" 256, así
// que pasaba todos los controles de resolución, pero al pintarlo con
// `object-fit: contain` en una losa de 39 px el logotipo real quedaba reducido
// a unos 5 px en una esquina: exactamente el "no están a máxima resolución" que
// se reportó. Aquí se recorta al contenido para que la losa lo reciba entero.
//
// Solo se recorta el caso claro (contenido pegado al origen y por debajo de la
// mitad del lienzo). Un icono con fondo opaco de borde a borde —lo normal— tiene
// la caja igual al lienzo y se devuelve intacto.
func trimIconCanvasPadding(data []byte) []byte {
	img, err := png.Decode(bytes.NewReader(data))
	if err != nil {
		return data
	}
	bounds := img.Bounds()
	size := bounds.Dx()
	if size != bounds.Dy() || size == 0 {
		return data
	}

	maxX, maxY := -1, -1
	for y := 0; y < size; y++ {
		for x := 0; x < size; x++ {
			if _, _, _, alpha := img.At(bounds.Min.X+x, bounds.Min.Y+y).RGBA(); alpha == 0 {
				continue
			}
			if x > maxX {
				maxX = x
			}
			if y > maxY {
				maxY = y
			}
		}
	}
	if maxX < 0 || maxY < 0 {
		return data
	}

	// Lado del contenido, cuadrado: el icono original lo era y recortar por el
	// lado mayor evita deformarlo.
	content := maxX + 1
	if maxY+1 > content {
		content = maxY + 1
	}
	if content*2 > size {
		return data
	}

	cropped := image.NewRGBA(image.Rect(0, 0, content, content))
	draw.Draw(cropped, cropped.Bounds(), img, bounds.Min, draw.Src)
	var buf bytes.Buffer
	if err := png.Encode(&buf, cropped); err != nil {
		return data
	}
	return buf.Bytes()
}

// GetAppIconForApp extracts an app icon at the best available resolution.
// A shortcut is used only for discovery: its explicit IconLocation is tried
// without the .lnk overlay, then its TargetPath is rendered through the
// Windows Shell image list, matching the taskbar identity.
//
// Results are cached by (id, exePath) in memory and persisted to disk (keyed
// by the executable path, validated by mtime/size) so a fresh process does
// not re-run the COM pipeline for icons that have not changed.
// resetShortcutIndex invalidates both caches on every rescan.
func GetAppIconForApp(id, exePath string) []byte {
	key := id + "\x00" + exePath
	appIconCache.Lock()
	if cached, ok := appIconCache.items[key]; ok {
		appIconCache.Unlock()
		return cached
	}
	appIconCache.Unlock()

	if b := loadIconFromDisk(exePath); b != nil {
		appIconCache.Lock()
		if appIconCache.items == nil {
			appIconCache.items = map[string][]byte{}
		}
		appIconCache.items[key] = b
		appIconCache.Unlock()
		return b
	}

	icon := resolveAppIcon(id, exePath)
	if icon == nil {
		return nil
	}
	appIconCache.Lock()
	if appIconCache.items == nil {
		appIconCache.items = map[string][]byte{}
	}
	appIconCache.items[key] = icon
	appIconCache.Unlock()
	saveIconToDisk(exePath, icon)
	return icon
}

// pngWidth devuelve el lado de un PNG leyendo solo la cabecera IHDR (offset 16,
// big endian). Decodificar la imagen entera solo para medirla costaría más que
// la propia extracción.
func pngWidth(data []byte) int {
	if len(data) < 24 || string(data[12:16]) != "IHDR" {
		return 0
	}
	return int(uint32(data[16])<<24 | uint32(data[17])<<16 | uint32(data[18])<<8 | uint32(data[19]))
}

// iconPick acumula el mejor icono visto mientras se recorren las rutas de
// extracción. Las rutas están ordenadas por fidelidad (el icono que el atajo
// declara manda sobre el genérico del ejecutable), pero varias de ellas solo
// saben devolver 32 px: aceptar la primera que responda dejaba iconos borrosos
// cuando una posterior tenía 256 px. Se acepta en cuanto una llega a
// `iconMinPreferredSize` y, si ninguna llega, se devuelve la mayor.
type iconPick struct {
	data  []byte
	width int
}

func (p *iconPick) offer(data []byte, err error) bool {
	if err != nil || len(data) == 0 {
		return false
	}
	width := pngWidth(data)
	if width > p.width {
		p.data, p.width = data, width
	}
	return p.width >= iconMinPreferredSize
}

// resolveSquirrelIconSource devuelve el fichero del que sacar el icono cuando
// el ejecutable detectado es el arrancador de Squirrel (`Update.exe`), o "".
//
// Discord (y cualquier app empaquetada con Squirrel) se registra con
// `…\Discord\Update.exe`: ese stub no lleva icono propio, así que el shell
// devolvía el icono genérico de aplicación de Windows y en la losa parecía que
// Discord "no salía". El icono de verdad está al lado, en el `app.ico` del
// instalador o en el ejecutable real de la versión instalada
// (`app-<version>\Discord.exe`). `Update.exe` sigue siendo el que se lanza: aquí
// solo se corrige de dónde se lee la imagen.
func resolveSquirrelIconSource(exePath string) string {
	if !strings.EqualFold(filepath.Base(exePath), "Update.exe") {
		return ""
	}
	root := filepath.Dir(exePath)
	if ico := filepath.Join(root, "app.ico"); fileExists(ico) {
		return ico
	}
	entries, err := os.ReadDir(root)
	if err != nil {
		return ""
	}
	// La carpeta `app-<version>` más alta por orden alfabético es la instalada;
	// Squirrel deja las anteriores hasta que las limpia.
	newest := ""
	for _, entry := range entries {
		if !entry.IsDir() || !strings.HasPrefix(strings.ToLower(entry.Name()), "app-") {
			continue
		}
		if entry.Name() > newest {
			newest = entry.Name()
		}
	}
	if newest == "" {
		return ""
	}
	dir := filepath.Join(root, newest)
	if ico := filepath.Join(dir, "app.ico"); fileExists(ico) {
		return ico
	}
	// El ejecutable real toma el nombre de la carpeta raíz (…\Discord\ ->
	// Discord.exe), que es como Squirrel nombra el paquete.
	if exe := filepath.Join(dir, filepath.Base(root)+".exe"); fileExists(exe) {
		return exe
	}
	return ""
}

func resolveAppIcon(id, exePath string) []byte {
	target := exePath
	shortcut := ""
	if known, ok := KnownAppsByID[id]; ok {
		shortcut = findDesktopShortcut(known.ExecutableNames)
	}

	var pick iconPick

	// Antes que nada: si el ejecutable es un stub de Squirrel, su icono real
	// está en la carpeta de la versión instalada. Va primero porque el stub sí
	// devuelve icono (el genérico de Windows) y ganaría por orden de llegada.
	if source := resolveSquirrelIconSource(target); source != "" {
		if pick.offer(getIconHighRes(source)) {
			return pick.data
		}
		if pick.offer(extractIconAsPNG(source)) {
			return pick.data
		}
	}

	if shortcut != "" {
		iconPath, iconIndex := resolveLnkIconLocation(shortcut)
		iconPath = strings.Trim(iconPath, `"`)
		if iconPath != "" {
			iconPath = os.ExpandEnv(iconPath)
			if !filepath.IsAbs(iconPath) {
				iconPath = filepath.Join(filepath.Dir(shortcut), iconPath)
			}
			if iconIndex == 0 {
				if pick.offer(getIconHighRes(iconPath)) {
					return pick.data
				}
				if pick.offer(getIconViaSHGetFileInfo(iconPath)) {
					return pick.data
				}
			}
			if pick.offer(extractIconAsPNGAtIndex(iconPath, iconIndex)) {
				return pick.data
			}
		}
	}

	if target == "" || !fileExists(target) {
		if shortcut != "" {
			if resolved := resolveLnkTarget(shortcut); resolved != "" && fileExists(resolved) {
				target = resolved
			}
		}
	}
	if target != "" {
		if pick.offer(getIconHighRes(target)) {
			return pick.data
		}
		if pick.offer(getIconViaSHGetFileInfo(target)) {
			return pick.data
		}
		if pick.offer(extractIconAsPNG(target)) {
			return pick.data
		}
	}
	return pick.data
}

// GetAppIconForAppBase64 returns the app icon as a base64 data URI, or "".
func GetAppIconForAppBase64(id, exePath string) string {
	b := GetAppIconForApp(id, exePath)
	if b == nil {
		return ""
	}
	return "data:image/png;base64," + base64.StdEncoding.EncodeToString(b)
}
