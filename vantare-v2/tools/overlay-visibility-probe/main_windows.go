// Read-only benchmark instrumentation. Never activates or changes a window.
package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"golang.org/x/sys/windows"
	"os"
	"syscall"
	"time"
	"unsafe"
)

var user32 = windows.NewLazySystemDLL("user32.dll")
var enumWindows = user32.NewProc("EnumWindows")
var foreground = user32.NewProc("GetForegroundWindow")
var windowPID = user32.NewProc("GetWindowThreadProcessId")
var visible = user32.NewProc("IsWindowVisible")
var iconic = user32.NewProc("IsIconic")
var windowRect = user32.NewProc("GetWindowRect")
var windowText = user32.NewProc("GetWindowTextW")
var windowStyle = user32.NewProc("GetWindowLongPtrW")
var metric = user32.NewProc("GetSystemMetrics")
var dwm = windows.NewLazySystemDLL("dwmapi.dll").NewProc("DwmGetWindowAttribute")

type rect struct{ Left, Top, Right, Bottom int32 }
type sample struct {
	At             time.Time `json:"at"`
	GameForeground bool      `json:"gameForeground"`
	OverlayVisible bool      `json:"overlayVisible"`
	Valid          bool      `json:"valid"`
}

func pid(hwnd uintptr) uint32 {
	var id uint32
	windowPID.Call(hwnd, uintptr(unsafe.Pointer(&id)))
	return id
}
func onScreen(r, screen rect) bool {
	return r.Right > r.Left && r.Bottom > r.Top && r.Left < screen.Right && r.Right > screen.Left && r.Top < screen.Bottom && r.Bottom > screen.Top
}

// This probe is single-threaded; one registered callback avoids leaking native
// callback slots on every sample (Windows cannot release NewCallback slots).
func newCapture(host, game uint32) func() sample {
	var scanScreen rect
	var scanVisible bool
	callback := syscall.NewCallback(func(hwnd, _ uintptr) uintptr {
		if pid(hwnd) != host {
			return 1
		}
		var title [64]uint16
		windowText.Call(hwnd, uintptr(unsafe.Pointer(&title[0])), uintptr(len(title)))
		if windows.UTF16ToString(title[:]) != "Vantare Overlay" {
			return 1
		}
		v, _, _ := visible.Call(hwnd)
		i, _, _ := iconic.Call(hwnd)
		var cloak uint32
		var r rect
		hr, _, _ := dwm.Call(hwnd, 14, uintptr(unsafe.Pointer(&cloak)), unsafe.Sizeof(cloak))
		ok, _, _ := windowRect.Call(hwnd, uintptr(unsafe.Pointer(&r)))
		style, _, _ := windowStyle.Call(hwnd, ^uintptr(19)) // GWL_EXSTYLE = -20
		scanVisible = v != 0 && i == 0 && hr == 0 && cloak == 0 && ok != 0 && style&8 != 0 && onScreen(r, scanScreen)
		return 0
	})

	return func() sample {
		s := sample{At: time.Now().UTC()}
		fg, _, _ := foreground.Call()
		s.GameForeground = fg != 0 && pid(fg) == game
		x, _, _ := metric.Call(76)
		y, _, _ := metric.Call(77)
		w, _, _ := metric.Call(78)
		h, _, _ := metric.Call(79)
		scanVisible = false
		scanScreen = rect{int32(x), int32(y), int32(x) + int32(w), int32(y) + int32(h)}
		enumWindows.Call(callback, 0)
		s.OverlayVisible = scanVisible
		s.Valid = s.GameForeground && s.OverlayVisible
		return s
	}
}
func main() {
	host := flag.Uint("host", 0, "Vantare PID")
	game := flag.Uint("game", 0, "game PID")
	stop := flag.String("stop", "", "stop marker")
	output := flag.String("output", "", "JSON evidence")
	once := flag.Bool("once", false, "single preflight")
	flag.Parse()
	if *host == 0 || *game == 0 {
		fmt.Fprintln(os.Stderr, "host/game required")
		os.Exit(2)
	}
	if *once {
		if err := json.NewEncoder(os.Stdout).Encode(newCapture(uint32(*host), uint32(*game))()); err != nil {
			os.Exit(2)
		}
		return
	}
	if *stop == "" || *output == "" {
		fmt.Fprintln(os.Stderr, "stop/output required")
		os.Exit(2)
	}
	samples := make([]sample, 0, 3000)
	capture := newCapture(uint32(*host), uint32(*game))
	deadline := time.Now().Add(5 * time.Minute)
	ticker := time.NewTicker(100 * time.Millisecond)
	defer ticker.Stop()
	for {
		samples = append(samples, capture())
		if _, err := os.Stat(*stop); err == nil || time.Now().After(deadline) {
			break
		}
		<-ticker.C
	}
	valid := len(samples) > 1
	for _, s := range samples {
		valid = valid && s.Valid
	}
	f, err := os.OpenFile(*output, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(2)
	}
	err = json.NewEncoder(f).Encode(struct {
		Valid   bool     `json:"valid"`
		Samples []sample `json:"samples"`
	}{valid, samples})
	closeErr := f.Close()
	if err != nil || closeErr != nil {
		fmt.Fprintln(os.Stderr, "cannot write evidence")
		os.Exit(2)
	}
}
