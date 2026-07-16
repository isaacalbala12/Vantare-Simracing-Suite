package lmu

import (
	"encoding/binary"
	"math"
	"testing"
)

func TestDecodeWheels_KelvinConversion(t *testing.T) {
	// 300 Kelvin = 26.85 Celsius
	buf := make([]byte, 4000)
	binary.LittleEndian.PutUint64(buf[WheelArrayBaseOffset+WheelBrakeTemp:], math.Float64bits(300.0))
	wheels := DecodeWheels(buf, 0)
	if wheels[0].BrakeTemp < 26 || wheels[0].BrakeTemp > 27 {
		t.Errorf("expected ~26.85°C for 300K, got %f", wheels[0].BrakeTemp)
	}
}

func TestDecodeWheels_AllFourWheels(t *testing.T) {
	buf := make([]byte, 4000)
	// Write distinct brake temps for each wheel: 310K, 320K, 330K, 340K
	for i := 0; i < 4; i++ {
		off := WheelArrayBaseOffset + i*WheelStride + WheelBrakeTemp
		binary.LittleEndian.PutUint64(buf[off:], math.Float64bits(310.0+float64(i*10)))
	}
	wheels := DecodeWheels(buf, 0)
	if wheels[0].BrakeTemp < 36 || wheels[0].BrakeTemp > 37 {
		t.Errorf("wheel 0: expected ~36.85°C (310K), got %f", wheels[0].BrakeTemp)
	}
	if wheels[1].BrakeTemp < 46 || wheels[1].BrakeTemp > 47 {
		t.Errorf("wheel 1: expected ~46.85°C (320K), got %f", wheels[1].BrakeTemp)
	}
	if wheels[2].BrakeTemp < 56 || wheels[2].BrakeTemp > 57 {
		t.Errorf("wheel 2: expected ~56.85°C (330K), got %f", wheels[2].BrakeTemp)
	}
	if wheels[3].BrakeTemp < 66 || wheels[3].BrakeTemp > 67 {
		t.Errorf("wheel 3: expected ~66.85°C (340K), got %f", wheels[3].BrakeTemp)
	}
}

func TestDecodeWheels_FullDecode(t *testing.T) {
	buf := make([]byte, 4000)
	base := WheelArrayBaseOffset

	// Populate all fields for wheel 0
	binary.LittleEndian.PutUint64(buf[base+WheelBrakeTemp:], math.Float64bits(300.0))
	binary.LittleEndian.PutUint64(buf[base+WheelTempL:], math.Float64bits(310.0))
	binary.LittleEndian.PutUint64(buf[base+WheelTempC:], math.Float64bits(320.0))
	binary.LittleEndian.PutUint64(buf[base+WheelTempR:], math.Float64bits(330.0))
	binary.LittleEndian.PutUint64(buf[base+WheelPressure:], math.Float64bits(210.0))
	binary.LittleEndian.PutUint64(buf[base+WheelWear:], math.Float64bits(0.35))
	binary.LittleEndian.PutUint64(buf[base+WheelGripFract:], math.Float64bits(0.12))
	buf[base+WheelSurfaceType] = 1 // wet
	buf[base+WheelFlat] = 0
	buf[base+WheelDetached] = 1

	wheels := DecodeWheels(buf, 0)
	w := wheels[0]

	if w.SurfaceType != 1 {
		t.Errorf("SurfaceType = %d, want 1 (wet)", w.SurfaceType)
	}
	if w.Flat {
		t.Errorf("Flat = true, want false")
	}
	if !w.Detached {
		t.Errorf("Detached = false, want true")
	}
	if w.Wear < 0.34 || w.Wear > 0.36 {
		t.Errorf("Wear = %f, want ~0.35", w.Wear)
	}
	if w.Pressure < 209 || w.Pressure > 211 {
		t.Errorf("Pressure = %f, want ~210.0", w.Pressure)
	}
	if w.TempLeft < 36 || w.TempLeft > 37 {
		t.Errorf("TempLeft = %f, want ~36.85°C (310K)", w.TempLeft)
	}
	if w.TempCenter < 46 || w.TempCenter > 47 {
		t.Errorf("TempCenter = %f, want ~46.85°C (320K)", w.TempCenter)
	}
	if w.TempRight < 56 || w.TempRight > 57 {
		t.Errorf("TempRight = %f, want ~56.85°C (330K)", w.TempRight)
	}
}

func TestDecodeWheels_BufferTooSmall(t *testing.T) {
	buf := make([]byte, 100)
	wheels := DecodeWheels(buf, 0)
	// Should not panic. Temperature fields read 0.0 which kelvinToCelsius
	// converts to -273.15. Pressure/Wear/GripFract are zero.
	for i, w := range wheels {
		if w.Pressure != 0 || w.Wear != 0 || w.GripFract != 0 {
			t.Errorf("wheel[%d]: expected zero Pressure/Wear/GripFract for tiny buffer, got %+v", i, w)
		}
		if w.SurfaceType != 0 || w.Flat || w.Detached {
			t.Errorf("wheel[%d]: expected zero SurfaceType/Flat/Detached for tiny buffer", i)
		}
	}
}

func TestDecodeWheels_TelemetryBaseOffset(t *testing.T) {
	buf := make([]byte, 6000)
	// Write wheel data at offset 2000 + WheelArrayBaseOffset
	off := 2000 + WheelArrayBaseOffset + WheelBrakeTemp
	binary.LittleEndian.PutUint64(buf[off:], math.Float64bits(350.0)) // 350K = 76.85°C

	wheels := DecodeWheels(buf, 2000)
	if wheels[0].BrakeTemp < 76 || wheels[0].BrakeTemp > 77 {
		t.Errorf("expected ~76.85°C for 350K with base offset, got %f", wheels[0].BrakeTemp)
	}
}

func TestKelvinToCelsius_Negative(t *testing.T) {
	if c := kelvinToCelsius(-100); c != 0 {
		t.Errorf("kelvinToCelsius(-100) = %f, want 0", c)
	}
}

func TestKelvinToCelsius_Zero(t *testing.T) {
	if c := kelvinToCelsius(0); c != 0 {
		t.Errorf("kelvinToCelsius(0) = %f, want 0 (no data sentinel)", c)
	}
}

func TestKelvinToCelsius_Normal(t *testing.T) {
	if c := kelvinToCelsius(300); c < 26.8 || c > 26.9 {
		t.Errorf("kelvinToCelsius(300) = %f, want ~26.85", c)
	}
}
