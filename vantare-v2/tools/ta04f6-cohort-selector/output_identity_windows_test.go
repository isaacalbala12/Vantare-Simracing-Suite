//go:build windows

package main

import "testing"

func TestSameAtomicPathAcceptsEquivalentWindowsIdentity(t *testing.T) {
	dir := t.TempDir()
	if !sameAtomicPathV1(dir, `\\?\`+dir) {
		t.Fatal("equivalent Windows directory identity rejected")
	}
}
