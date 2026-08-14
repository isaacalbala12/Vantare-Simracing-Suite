package main

import (
	"bytes"
	"testing"
)

func TestCLISyntheticNeverConstructsBackend(t *testing.T) {
	var out, err bytes.Buffer
	called := false
	code := runCLIWithDeps(nil, &out, &err, func(string) Backend { called = true; return nil })
	if code != 0 || called || err.Len() != 0 || out.Len() == 0 {
		t.Fatalf("code=%d called=%v stderr=%q", code, called, err.String())
	}
}
