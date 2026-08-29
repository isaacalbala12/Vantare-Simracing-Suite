//go:build !windows

package sensor

import "context"

type WindowsHostSampler struct{}

func NewHostSampler(string) *WindowsHostSampler { return &WindowsHostSampler{} }
func (*WindowsHostSampler) Sample(context.Context) (HostSample, error) {
	return HostSample{}, ErrUnavailable
}
