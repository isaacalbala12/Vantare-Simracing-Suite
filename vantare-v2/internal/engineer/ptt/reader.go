package ptt

import (
	"context"
	"errors"
)

var (
	ErrUnsupportedDevice = errors.New("engineer PTT device is not supported")
	ErrInvalidControl    = errors.New("engineer PTT control is invalid")
)

type DeviceSample struct {
	Connected bool
	Pressed   bool
	Focused   bool
}

type Reader interface {
	Read(context.Context, Binding) (DeviceSample, error)
}

type InputHandler interface {
	Handle(context.Context, Input) (Snapshot, error)
}

type CapabilityStatus string

const (
	CapabilityAvailable   CapabilityStatus = "available"
	CapabilityLimited     CapabilityStatus = "limited"
	CapabilityUnsupported CapabilityStatus = "unsupported"
)

type Capability struct {
	DeviceKind DeviceKind       `json:"device_kind"`
	Transport  string           `json:"transport"`
	Status     CapabilityStatus `json:"status"`
	Detail     string           `json:"detail"`
}

func PlatformCapabilities() []Capability {
	return platformCapabilities()
}
