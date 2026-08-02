//go:build windows

package ptt

import (
	"context"
	"fmt"
	"strconv"
	"strings"
	"unsafe"

	"golang.org/x/sys/windows"
)

const (
	keyDownMask       = 0x8000
	joyReturnButtons  = 0x80
	errorDeviceAbsent = 1167
)

var (
	user32DLL        = windows.NewLazySystemDLL("user32.dll")
	getAsyncKeyState = user32DLL.NewProc("GetAsyncKeyState")
	getForeground    = user32DLL.NewProc("GetForegroundWindow")
	xinputDLL        = windows.NewLazySystemDLL("xinput1_4.dll")
	xinputGetState   = xinputDLL.NewProc("XInputGetState")
	winmmDLL         = windows.NewLazySystemDLL("winmm.dll")
	joyGetPosEx      = winmmDLL.NewProc("joyGetPosEx")
)

type WindowsReader struct {
	TargetWindow uintptr
}

func NewPlatformReader(targetWindow uintptr) Reader {
	return &WindowsReader{TargetWindow: targetWindow}
}

func (reader *WindowsReader) Read(ctx context.Context, binding Binding) (DeviceSample, error) {
	if reader == nil || ctx == nil {
		return DeviceSample{}, ErrInvalidInput
	}
	if err := ctx.Err(); err != nil {
		return DeviceSample{}, err
	}
	normalized, err := NormalizeBinding(binding)
	if err != nil {
		return DeviceSample{}, err
	}
	focused := true
	if normalized.Scope == ScopeLocal {
		focused = reader.TargetWindow != 0 && foregroundWindow() == reader.TargetWindow
	}
	switch normalized.DeviceKind {
	case DeviceKeyboard:
		pressed, err := readKeyboard(normalized)
		return DeviceSample{Connected: err == nil, Pressed: pressed, Focused: focused}, err
	case DeviceGamepad:
		connected, pressed, err := readXInput(normalized)
		return DeviceSample{Connected: connected, Pressed: pressed, Focused: focused}, err
	case DeviceHID:
		connected, pressed, err := readJoystick(normalized)
		return DeviceSample{Connected: connected, Pressed: pressed, Focused: focused}, err
	default:
		return DeviceSample{}, ErrUnsupportedDevice
	}
}

func platformCapabilities() []Capability {
	return []Capability{
		{DeviceKind: DeviceKeyboard, Transport: "win32-keyboard", Status: CapabilityAvailable, Detail: "keyboard-0; key down and key up polling"},
		{DeviceKind: DeviceGamepad, Transport: "xinput", Status: CapabilityAvailable, Detail: "xinput-0 through xinput-3"},
		{DeviceKind: DeviceHID, Transport: "winmm-joystick", Status: CapabilityLimited, Detail: "joy-0 through joy-15; buttons 1 through 32"},
		{DeviceKind: DeviceHID, Transport: "raw-hid", Status: CapabilityUnsupported, Detail: "generic raw HID is not enabled in ENG-14"},
	}
}

func readKeyboard(binding Binding) (bool, error) {
	if binding.DeviceID != "keyboard-0" {
		return false, fmt.Errorf("%w: keyboard device %q", ErrUnsupportedDevice, binding.DeviceID)
	}
	virtualKey, ok := virtualKeyForControl(binding.Control)
	if !ok {
		return false, fmt.Errorf("%w: keyboard control %q", ErrInvalidControl, binding.Control)
	}
	state, _, _ := getAsyncKeyState.Call(uintptr(virtualKey))
	return uint16(state)&keyDownMask != 0, nil
}

func readXInput(binding Binding) (bool, bool, error) {
	index, ok := indexedDevice(binding.DeviceID, "xinput-", 3)
	if !ok {
		return false, false, fmt.Errorf("%w: gamepad device %q", ErrUnsupportedDevice, binding.DeviceID)
	}
	buttonMask, trigger, ok := xinputControl(binding.Control)
	if !ok {
		return false, false, fmt.Errorf("%w: gamepad control %q", ErrInvalidControl, binding.Control)
	}
	var state xinputState
	result, _, _ := xinputGetState.Call(uintptr(index), uintptr(unsafe.Pointer(&state)))
	if result == errorDeviceAbsent {
		return false, false, nil
	}
	if result != 0 {
		return false, false, fmt.Errorf("read XInput device %d: error %d", index, result)
	}
	if trigger == "left" {
		return true, state.Gamepad.LeftTrigger > 30, nil
	}
	if trigger == "right" {
		return true, state.Gamepad.RightTrigger > 30, nil
	}
	return true, state.Gamepad.Buttons&buttonMask != 0, nil
}

func readJoystick(binding Binding) (bool, bool, error) {
	index, ok := indexedDevice(binding.DeviceID, "joy-", 15)
	if !ok {
		return false, false, fmt.Errorf("%w: HID device %q; only joystick-compatible joy-N devices are supported", ErrUnsupportedDevice, binding.DeviceID)
	}
	button, ok := numberedControl(binding.Control, "button-", 1, 32)
	if !ok {
		return false, false, fmt.Errorf("%w: joystick control %q", ErrInvalidControl, binding.Control)
	}
	info := joyInfoEx{Size: uint32(unsafe.Sizeof(joyInfoEx{})), Flags: joyReturnButtons}
	result, _, _ := joyGetPosEx.Call(uintptr(index), uintptr(unsafe.Pointer(&info)))
	if result != 0 {
		return false, false, nil
	}
	return true, info.Buttons&(1<<uint(button-1)) != 0, nil
}

func foregroundWindow() uintptr {
	window, _, _ := getForeground.Call()
	return window
}

func indexedDevice(value, prefix string, maximum int) (int, bool) {
	if !strings.HasPrefix(value, prefix) {
		return 0, false
	}
	index, err := strconv.Atoi(strings.TrimPrefix(value, prefix))
	return index, err == nil && index >= 0 && index <= maximum
}

func numberedControl(value, prefix string, minimum, maximum int) (int, bool) {
	if !strings.HasPrefix(value, prefix) {
		return 0, false
	}
	number, err := strconv.Atoi(strings.TrimPrefix(value, prefix))
	return number, err == nil && number >= minimum && number <= maximum
}

func virtualKeyForControl(control string) (uint16, bool) {
	if strings.HasPrefix(control, "key-") && len(control) == len("key-a") {
		letter := control[len(control)-1]
		if letter >= 'a' && letter <= 'z' {
			return uint16(letter - 'a' + 'A'), true
		}
	}
	if strings.HasPrefix(control, "digit-") && len(control) == len("digit-0") {
		digit := control[len(control)-1]
		if digit >= '0' && digit <= '9' {
			return uint16(digit), true
		}
	}
	if function, ok := numberedControl(control, "f", 1, 24); ok {
		return uint16(0x70 + function - 1), true
	}
	key, ok := map[string]uint16{
		"backspace": 0x08, "tab": 0x09, "enter": 0x0D, "shift": 0x10,
		"ctrl": 0x11, "alt": 0x12, "pause": 0x13, "caps-lock": 0x14,
		"escape": 0x1B, "space": 0x20, "page-up": 0x21, "page-down": 0x22,
		"end": 0x23, "home": 0x24, "left": 0x25, "up": 0x26, "right": 0x27,
		"down": 0x28, "insert": 0x2D, "delete": 0x2E,
		"left-win": 0x5B, "right-win": 0x5C,
		"num-0": 0x60, "num-1": 0x61, "num-2": 0x62, "num-3": 0x63,
		"num-4": 0x64, "num-5": 0x65, "num-6": 0x66, "num-7": 0x67,
		"num-8": 0x68, "num-9": 0x69, "num-multiply": 0x6A, "num-add": 0x6B,
		"num-subtract": 0x6D, "num-decimal": 0x6E, "num-divide": 0x6F,
		"left-shift": 0xA0, "right-shift": 0xA1, "left-ctrl": 0xA2,
		"right-ctrl": 0xA3, "left-alt": 0xA4, "right-alt": 0xA5,
	}[control]
	return key, ok
}

func xinputControl(control string) (uint16, string, bool) {
	if control == "left-trigger" {
		return 0, "left", true
	}
	if control == "right-trigger" {
		return 0, "right", true
	}
	button, ok := map[string]uint16{
		"dpad-up": 0x0001, "dpad-down": 0x0002, "dpad-left": 0x0004, "dpad-right": 0x0008,
		"start": 0x0010, "back": 0x0020, "left-thumb": 0x0040, "right-thumb": 0x0080,
		"left-shoulder": 0x0100, "right-shoulder": 0x0200,
		"a": 0x1000, "b": 0x2000, "x": 0x4000, "y": 0x8000,
	}[control]
	return button, "", ok
}

type xinputState struct {
	PacketNumber uint32
	Gamepad      xinputGamepad
}

type xinputGamepad struct {
	Buttons      uint16
	LeftTrigger  uint8
	RightTrigger uint8
	ThumbLX      int16
	ThumbLY      int16
	ThumbRX      int16
	ThumbRY      int16
}

type joyInfoEx struct {
	Size, Flags                uint32
	X, Y, Z, R, U, V           uint32
	Buttons, ButtonNumber, POV uint32
	Reserved1, Reserved2       uint32
}

var _ Reader = (*WindowsReader)(nil)
