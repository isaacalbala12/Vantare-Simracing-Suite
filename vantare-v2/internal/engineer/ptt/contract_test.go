package ptt

import (
	"errors"
	"reflect"
	"testing"
)

func TestNormalizeBindingAcceptsSupportedDeviceKinds(t *testing.T) {
	tests := []struct {
		name string
		in   Binding
		want Binding
	}{
		{
			name: "global keyboard",
			in:   Binding{DeviceKind: DeviceKeyboard, DeviceID: " Keyboard ", Control: " SPACE ", Scope: ScopeGlobal},
			want: Binding{DeviceKind: DeviceKeyboard, DeviceID: "keyboard", Control: "space", Scope: ScopeGlobal},
		},
		{
			name: "local xinput gamepad",
			in:   Binding{DeviceKind: DeviceGamepad, DeviceID: "XINPUT-2", Control: "RB", Scope: ScopeLocal},
			want: Binding{DeviceKind: DeviceGamepad, DeviceID: "xinput-2", Control: "rb", Scope: ScopeLocal},
		},
		{
			name: "global joystick compatible hid",
			in:   Binding{DeviceKind: DeviceHID, DeviceID: "JOY-4", Control: "BUTTON-12", Scope: ScopeGlobal},
			want: Binding{DeviceKind: DeviceHID, DeviceID: "joy-4", Control: "button-12", Scope: ScopeGlobal},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := NormalizeBinding(tt.in)
			if err != nil {
				t.Fatalf("NormalizeBinding() error = %v", err)
			}
			if got != tt.want {
				t.Fatalf("NormalizeBinding() = %+v, want %+v", got, tt.want)
			}
		})
	}
}

func TestNormalizeBindingRejectsUnsafeOrUnsupportedValues(t *testing.T) {
	tests := []struct {
		name string
		in   Binding
	}{
		{name: "unknown kind", in: Binding{DeviceKind: "wheel", DeviceID: "joy-0", Control: "button-1", Scope: ScopeGlobal}},
		{name: "unknown scope", in: Binding{DeviceKind: DeviceKeyboard, DeviceID: "keyboard", Control: "space", Scope: "sometimes"}},
		{name: "path is not an opaque id", in: Binding{DeviceKind: DeviceHID, DeviceID: `c:\users\isaac\device`, Control: "button-1", Scope: ScopeGlobal}},
		{name: "control characters", in: Binding{DeviceKind: DeviceKeyboard, DeviceID: "keyboard", Control: "space\n", Scope: ScopeGlobal}},
		{name: "empty device", in: Binding{DeviceKind: DeviceKeyboard, Control: "space", Scope: ScopeGlobal}},
		{name: "empty control", in: Binding{DeviceKind: DeviceKeyboard, DeviceID: "keyboard", Scope: ScopeGlobal}},
		{name: "too long", in: Binding{DeviceKind: DeviceKeyboard, DeviceID: "keyboard", Control: "abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzabcdefghijklm", Scope: ScopeGlobal}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if _, err := NormalizeBinding(tt.in); !errors.Is(err, ErrInvalidBinding) {
				t.Fatalf("NormalizeBinding() error = %v", err)
			}
		})
	}
}

func TestFindBindingConflictsIsDeterministicAndPhysical(t *testing.T) {
	desired := Binding{DeviceKind: DeviceGamepad, DeviceID: "xinput-0", Control: "rb", Scope: ScopeGlobal}
	assignments := []Assignment{
		{Name: "launcher", Binding: Binding{DeviceKind: DeviceKeyboard, DeviceID: "keyboard", Control: "space", Scope: ScopeGlobal}},
		{Name: "strategy radio", Binding: Binding{DeviceKind: DeviceGamepad, DeviceID: "XINPUT-0", Control: "RB", Scope: ScopeLocal}},
		{Name: "engineer radio", Binding: Binding{DeviceKind: DeviceGamepad, DeviceID: "xinput-0", Control: "rb", Scope: ScopeGlobal}},
	}
	want := []Conflict{{AssignmentName: "engineer radio"}, {AssignmentName: "strategy radio"}}
	got, err := FindBindingConflicts(desired, assignments)
	if err != nil {
		t.Fatalf("FindBindingConflicts() error = %v", err)
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("FindBindingConflicts() = %+v, want %+v", got, want)
	}
}

func TestFindBindingConflictsRejectsInvalidAssignment(t *testing.T) {
	_, err := FindBindingConflicts(
		Binding{DeviceKind: DeviceKeyboard, DeviceID: "keyboard", Control: "space", Scope: ScopeGlobal},
		[]Assignment{{Name: "bad", Binding: Binding{DeviceKind: DeviceKeyboard, DeviceID: "keyboard", Control: "", Scope: ScopeGlobal}}},
	)
	if !errors.Is(err, ErrInvalidBinding) {
		t.Fatalf("FindBindingConflicts() error = %v", err)
	}
}

func FuzzNormalizeBindingNeverEmitsUnsafeToken(f *testing.F) {
	for _, seed := range []string{"keyboard-0", " joy-12 ", "button-1", "../secret", "bad\nvalue", "á"} {
		f.Add(seed)
	}
	f.Fuzz(func(t *testing.T, value string) {
		binding, err := NormalizeBinding(Binding{
			DeviceKind: DeviceKeyboard,
			DeviceID:   value,
			Control:    "space",
			Scope:      ScopeGlobal,
		})
		if err != nil {
			return
		}
		if !validOpaqueToken(binding.DeviceID) || containsControl(binding.DeviceID) {
			t.Fatalf("NormalizeBinding(%q) emitted unsafe device id %q", value, binding.DeviceID)
		}
	})
}
