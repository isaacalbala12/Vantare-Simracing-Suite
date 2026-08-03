//go:build windows

package ptt

import (
	"context"
	"errors"
	"testing"
)

func TestVirtualKeyForControl(t *testing.T) {
	tests := []struct {
		control string
		want    uint16
		ok      bool
	}{
		{control: "key-a", want: 'A', ok: true},
		{control: "key-z", want: 'Z', ok: true},
		{control: "digit-7", want: '7', ok: true},
		{control: "f24", want: 0x87, ok: true},
		{control: "left-ctrl", want: 0xA2, ok: true},
		{control: "f25", ok: false},
		{control: "key-aa", ok: false},
	}
	for _, test := range tests {
		t.Run(test.control, func(t *testing.T) {
			got, ok := virtualKeyForControl(test.control)
			if got != test.want || ok != test.ok {
				t.Fatalf("virtualKeyForControl(%q) = %#x, %v; want %#x, %v", test.control, got, ok, test.want, test.ok)
			}
		})
	}
}

func TestWindowsReaderKeyboardAdapterIsCallable(t *testing.T) {
	reader := NewPlatformReader(0)
	binding := Binding{DeviceKind: DeviceKeyboard, DeviceID: "keyboard-0", Control: "f24", Scope: ScopeGlobal}
	sample, err := reader.Read(context.Background(), binding)
	if err != nil {
		t.Fatalf("Read(keyboard) error = %v", err)
	}
	if !sample.Connected || !sample.Focused {
		t.Fatalf("Read(keyboard) = %+v", sample)
	}
}

func TestWindowsReaderRejectsUnsupportedRawHID(t *testing.T) {
	reader := NewPlatformReader(0)
	binding := Binding{DeviceKind: DeviceHID, DeviceID: "raw-1234", Control: "button-1", Scope: ScopeGlobal}
	if _, err := reader.Read(context.Background(), binding); !errors.Is(err, ErrUnsupportedDevice) {
		t.Fatalf("Read(raw HID) error = %v", err)
	}
}

func TestPlatformCapabilitiesAreExplicit(t *testing.T) {
	capabilities := PlatformCapabilities()
	if len(capabilities) != 4 {
		t.Fatalf("PlatformCapabilities() length = %d", len(capabilities))
	}
	if capabilities[0].Status != CapabilityAvailable || capabilities[1].Status != CapabilityAvailable || capabilities[2].Status != CapabilityLimited || capabilities[3].Status != CapabilityUnsupported {
		t.Fatalf("PlatformCapabilities() = %+v", capabilities)
	}
}

func TestXInputAndJoystickControlParsing(t *testing.T) {
	if index, ok := indexedDevice("xinput-3", "xinput-", 3); !ok || index != 3 {
		t.Fatalf("indexedDevice(xinput-3) = %d, %v", index, ok)
	}
	if _, ok := indexedDevice("xinput-4", "xinput-", 3); ok {
		t.Fatal("indexedDevice accepted xinput-4")
	}
	if button, ok := numberedControl("button-32", "button-", 1, 32); !ok || button != 32 {
		t.Fatalf("numberedControl(button-32) = %d, %v", button, ok)
	}
	if _, ok := numberedControl("button-33", "button-", 1, 32); ok {
		t.Fatal("numberedControl accepted button-33")
	}
}
