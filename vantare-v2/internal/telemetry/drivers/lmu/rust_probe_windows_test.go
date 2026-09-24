package lmu

import (
	"encoding/binary"
	"os"
	"path/filepath"
	"runtime"
	"syscall"
	"testing"
	"unicode/utf8"
	"unsafe"
)

// The Rust experiment is opt-in and never changes the production LMU reader.
// VANTARE_RUST_PROBE_DLL points to the cdylib built under spikes/isa-1379.
type rustCStringResult struct {
	Len   uint8
	Valid uint8
}

type rustCStringFrame struct {
	Count   uint32
	Results [1 + 3*104]rustCStringResult
}

var cStringProbeSink [1 + 3*104]string

func rustProbe(t testing.TB) *syscall.Proc {
	t.Helper()
	path := os.Getenv("VANTARE_RUST_PROBE_DLL")
	if path == "" {
		t.Skip("set VANTARE_RUST_PROBE_DLL to the ISA-1379 experimental DLL")
	}
	dll, err := syscall.LoadDLL(path)
	if err != nil {
		t.Fatal(err)
	}
	proc, err := dll.FindProc("vantare_lmu_cstrings")
	if err != nil {
		t.Fatal(err)
	}
	return proc
}

func runRustCStringProbe(proc *syscall.Proc, data []byte, frame *rustCStringFrame) uint32 {
	status, _, _ := proc.Call(
		uintptr(unsafe.Pointer(unsafe.SliceData(data))),
		uintptr(len(data)),
		uintptr(unsafe.Pointer(frame)),
	)
	runtime.KeepAlive(data)
	runtime.KeepAlive(frame)
	return uint32(status)
}

func cStringWindows(data []byte) [][]byte {
	count := int(int32(binary.LittleEndian.Uint32(data[1736:])))
	fields := make([][]byte, 0, 1+3*count)
	fields = append(fields, data[1632:1696])
	for row := 0; row < count; row++ {
		base := 2192 + row*584
		fields = append(fields, data[base+4:base+36], data[base+36:base+100], data[base+200:base+232])
	}
	return fields
}

func fixtureBytes(t testing.TB, name string) []byte {
	t.Helper()
	data, err := os.ReadFile(filepath.Join("..", "..", "..", "..", "testdata", name))
	if err != nil {
		t.Fatal(err)
	}
	if len(data) != ObjectOutSize {
		t.Fatalf("fixture size = %d, want %d", len(data), ObjectOutSize)
	}
	return data
}

func TestRustCStringProbeMatchesGoOnSanitizedLMUCaptures(t *testing.T) {
	proc := rustProbe(t)
	for _, name := range []string{
		"lmu-fixture.bin",
		"lmu-1.4-track-fixture.bin",
		"lmu-1.4.1.3-track-fixture.bin",
		"lmu-1.4.1.3-menu-fixture.bin",
	} {
		t.Run(name, func(t *testing.T) {
			data := fixtureBytes(t, name)
			var frame rustCStringFrame
			if status := runRustCStringProbe(proc, data, &frame); status != 0 {
				t.Fatalf("Rust status = %d", status)
			}
			fields := cStringWindows(data)
			if int(frame.Count) != len(fields) {
				t.Fatalf("field count = %d, want %d", frame.Count, len(fields))
			}
			for index, field := range fields {
				goValue, goValid := reasonableCString(field, true)
				optimizedValue, optimizedValid := reasonableCStringSingleConversion(field)
				rustResult := frame.Results[index]
				if goValue != optimizedValue || goValid != optimizedValid {
					t.Fatalf("field %d: Go control differs", index)
				}
				if goValid != (rustResult.Valid == 1) || (goValid && len(goValue) != int(rustResult.Len)) {
					t.Fatalf("field %d: validity/length mismatch", index)
				}
			}
		})
	}
}

func reasonableCStringSingleConversion(value []byte) (string, bool) {
	nul := -1
	for index, char := range value {
		if char == 0 {
			nul = index
			break
		}
	}
	if nul < 0 {
		return "", false
	}
	value = value[:nul]
	if !utf8.Valid(value) {
		return "", false
	}
	result := string(value)
	for _, char := range result {
		if char < 0x20 {
			return "", false
		}
	}
	return result, true
}

func BenchmarkLMUCStringsGo(b *testing.B) {
	data := fixtureBytes(b, "lmu-fixture.bin")
	fields := cStringWindows(data)
	b.ReportAllocs()
	for b.Loop() {
		for index, field := range fields {
			value, valid := reasonableCString(field, true)
			if valid {
				cStringProbeSink[index] = value
			} else {
				cStringProbeSink[index] = ""
			}
		}
	}
}

func BenchmarkLMUCStringsGoSingleConversion(b *testing.B) {
	data := fixtureBytes(b, "lmu-fixture.bin")
	fields := cStringWindows(data)
	b.ReportAllocs()
	for b.Loop() {
		for index, field := range fields {
			value, valid := reasonableCStringSingleConversion(field)
			if valid {
				cStringProbeSink[index] = value
			} else {
				cStringProbeSink[index] = ""
			}
		}
	}
}

func BenchmarkLMUCStringsRustFFI(b *testing.B) {
	proc := rustProbe(b)
	data := fixtureBytes(b, "lmu-fixture.bin")
	fields := cStringWindows(data)
	var frame rustCStringFrame
	b.ReportAllocs()
	for b.Loop() {
		if status := runRustCStringProbe(proc, data, &frame); status != 0 {
			b.Fatalf("Rust status = %d", status)
		}
		for index, field := range fields {
			if result := frame.Results[index]; result.Valid == 1 {
				cStringProbeSink[index] = string(field[:result.Len])
			} else {
				cStringProbeSink[index] = ""
			}
		}
	}
}
