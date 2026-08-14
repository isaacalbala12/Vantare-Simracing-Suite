//go:build windows

package app

import "testing"

func TestRegistrationModifiersAlwaysDisableAutoRepeat(t *testing.T) {
	mods := registrationModifiers(MOD_CONTROL | MOD_SHIFT)
	if mods&MOD_NOREPEAT == 0 {
		t.Fatalf("registration modifiers=%#x, MOD_NOREPEAT missing", mods)
	}
	if mods&MOD_CONTROL == 0 || mods&MOD_SHIFT == 0 {
		t.Fatalf("registration modifiers=%#x, configured modifiers changed", mods)
	}
}
