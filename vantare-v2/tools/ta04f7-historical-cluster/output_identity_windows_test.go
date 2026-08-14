//go:build windows

package main

import "testing"

func TestSamePathAcceptsEquivalentWindowsIdentity(t *testing.T) {
	dir := t.TempDir()
	if !samePath(dir, `\\?\`+dir) {
		t.Fatal("equivalent Windows directory identity rejected")
	}
}
