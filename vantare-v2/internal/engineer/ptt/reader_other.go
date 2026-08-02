//go:build !windows

package ptt

import "context"

type unsupportedReader struct{}

func NewPlatformReader(uintptr) Reader {
	return unsupportedReader{}
}

func (unsupportedReader) Read(context.Context, Binding) (DeviceSample, error) {
	return DeviceSample{}, ErrUnsupportedDevice
}

func platformCapabilities() []Capability {
	return []Capability{
		{DeviceKind: DeviceKeyboard, Transport: "platform", Status: CapabilityUnsupported, Detail: "ENG-14 input adapters require Windows"},
		{DeviceKind: DeviceGamepad, Transport: "platform", Status: CapabilityUnsupported, Detail: "ENG-14 input adapters require Windows"},
		{DeviceKind: DeviceHID, Transport: "platform", Status: CapabilityUnsupported, Detail: "ENG-14 input adapters require Windows"},
	}
}

var _ Reader = unsupportedReader{}
