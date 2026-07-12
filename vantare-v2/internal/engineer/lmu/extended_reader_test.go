package lmu

import (
	"encoding/binary"
	"math"
	"testing"
)

func TestExtendedReader_Read(t *testing.T) {
	buf := NewSyntheticExtendedBuffer()

	// Creamos un reader con el buffer prefabricado (sin abrir shared memory real).
	r := &ExtendedReader{
		data: buf,
	}

	data, err := r.Read()
	if err != nil {
		t.Fatalf("Read() returned error: %v", err)
	}

	// FuelMult.
	if data.FuelMult != 3 {
		t.Errorf("FuelMult = %d, want 3", data.FuelMult)
	}

	// TicksLastHistoryMsg.
	if data.TicksLastHistoryMsg != 1234567890 {
		t.Errorf("TicksLastHistoryMsg = %d, want 1234567890", data.TicksLastHistoryMsg)
	}

	// LastHistoryMessage.
	wantMsg := "Stop/Go Penalty: Cut Track"
	if data.LastHistoryMessage != wantMsg {
		t.Errorf("LastHistoryMessage = %q, want %q", data.LastHistoryMessage, wantMsg)
	}

	// PitSpeedLimit — tolerancia 0.01.
	got := data.PitSpeedLimit
	if math.Abs(float64(got-22.22)) > 0.01 {
		t.Errorf("PitSpeedLimit = %.2f, want 22.22", got)
	}
}

func TestExtendedReader_Read_FuelMultOff(t *testing.T) {
	buf := NewSyntheticExtendedBuffer()
	buf[mFuelMultOffset] = 0 // sin combustible

	r := &ExtendedReader{data: buf}
	data, err := r.Read()
	if err != nil {
		t.Fatalf("Read() returned error: %v", err)
	}
	if data.FuelMult != 0 {
		t.Errorf("FuelMult = %d, want 0", data.FuelMult)
	}
}

func TestExtendedReader_Read_EmptyHistoryMessage(t *testing.T) {
	buf := NewSyntheticExtendedBuffer()
	// Limpiar el mensaje de historial (todo ceros).
	for i := 0; i < LastHistoryMessageLength; i++ {
		buf[mLastHistoryMessageOffset+i] = 0
	}

	r := &ExtendedReader{data: buf}
	data, err := r.Read()
	if err != nil {
		t.Fatalf("Read() returned error: %v", err)
	}
	if data.LastHistoryMessage != "" {
		t.Errorf("LastHistoryMessage = %q, want empty string", data.LastHistoryMessage)
	}
}

func TestExtendedReader_Read_OilPressureWarning(t *testing.T) {
	buf := NewSyntheticExtendedBuffer()

	// Sin advertencia.
	r := &ExtendedReader{data: buf}
	data, err := r.Read()
	if err != nil {
		t.Fatalf("Read() returned error: %v", err)
	}
	if data.OilPressureWarning {
		t.Error("OilPressureWarning = true, want false (default)")
	}

	// Con advertencia activa.
	buf[OilPressureWarningOffset] = 1
	data, err = r.Read()
	if err != nil {
		t.Fatalf("Read() returned error: %v", err)
	}
	if !data.OilPressureWarning {
		t.Error("OilPressureWarning = false, want true")
	}
}

func TestExtendedReader_Read_PitSpeedLimitZero(t *testing.T) {
	buf := NewSyntheticExtendedBuffer()
	binary.LittleEndian.PutUint32(buf[mCurrentPitSpeedLimitOffset:], 0)

	r := &ExtendedReader{data: buf}
	data, err := r.Read()
	if err != nil {
		t.Fatalf("Read() returned error: %v", err)
	}
	if data.PitSpeedLimit != 0 {
		t.Errorf("PitSpeedLimit = %.2f, want 0", data.PitSpeedLimit)
	}
}

func TestExtendedReader_Read_NilBuffer(t *testing.T) {
	r := &ExtendedReader{data: nil}
	_, err := r.Read()
	if err == nil {
		t.Error("expected error for nil buffer, got nil")
	}
}

func TestExtendedReader_Read_BufferTooSmall(t *testing.T) {
	r := &ExtendedReader{data: make([]byte, 100)}
	data, err := r.Read()
	if err != nil {
		t.Fatalf("Read() returned error on small buffer: %v", err)
	}
	// Todos los campos deben ser zero sin panic.
	if data.FuelMult != 0 {
		t.Errorf("expected zero FuelMult, got %d", data.FuelMult)
	}
}

func TestExtendedReader_HistoryMessageLong(t *testing.T) {
	buf := NewSyntheticExtendedBuffer()
	// Mensaje de exactamente 128 bytes (sin terminacion nula).
	longMsg := ""
	for i := 0; i < LastHistoryMessageLength; i++ {
		longMsg += "A"
	}
	copy(buf[mLastHistoryMessageOffset:], longMsg)

	r := &ExtendedReader{data: buf}
	data, err := r.Read()
	if err != nil {
		t.Fatalf("Read() returned error: %v", err)
	}
	if len(data.LastHistoryMessage) != LastHistoryMessageLength {
		t.Errorf("LastHistoryMessage len = %d, want %d", len(data.LastHistoryMessage), LastHistoryMessageLength)
	}
}

func TestExtendedReader_Read_HistoryMessageStopGoVariants(t *testing.T) {
	cases := []struct {
		name    string
		message string
	}{
		{"CutTrack", "Stop/Go Penalty: Cut Track"},
		{"Speeding", "Stop/Go Penalty: Speeding In Pitlane"},
		{"FalseStart", "Stop/Go Penalty: False Start"},
		{"ExitingPitsUnderRed", "Stop/Go Penalty: Exiting Pits Under Red"},
		{"IllegalPass", "Stop/Go Penalty: Illegally Passed Before Green"},
		{"DriveThroughSpeeding", "Drive-Thru Penalty: Speeding In Pitlane"},
		{"WarningSlow", "Warning: Driving Too Slow"},
		{"Disqualified", "Disqualified: 4 Laps"},
		{"CrewReady", "Crew Is Ready For Pitstop"},
		{"Headlights", "Headlights Are Now Required"},
		{"WrongWay", "Wrong Way"},
		{"BlueFlag", "Blue Flag Warning: Move over soon or be penalized"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			buf := NewSyntheticExtendedBuffer()
			// Limpiar espacio.
			for i := 0; i < LastHistoryMessageLength; i++ {
				buf[mLastHistoryMessageOffset+i] = 0
			}
			copy(buf[mLastHistoryMessageOffset:], tc.message)

			r := &ExtendedReader{data: buf}
			data, err := r.Read()
			if err != nil {
				t.Fatalf("Read() returned error: %v", err)
			}
			if data.LastHistoryMessage != tc.message {
				t.Errorf("message = %q, want %q", data.LastHistoryMessage, tc.message)
			}
		})
	}
}

// TestExtendedReader_Read_DoesNotMutateBuffer verifica que Read() no modifique
// el buffer subyacente.
func TestExtendedReader_Read_DoesNotMutateBuffer(t *testing.T) {
	buf := NewSyntheticExtendedBuffer()
	before := make([]byte, len(buf))
	copy(before, buf)

	r := &ExtendedReader{data: buf}
	_, _ = r.Read()

	for i, b := range buf {
		if b != before[i] {
			t.Fatalf("buffer mutated at offset %d: %d != %d", i, b, before[i])
		}
	}
}
