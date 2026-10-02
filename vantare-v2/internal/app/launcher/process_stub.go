//go:build !windows

package launcher

import "context"

func (systemProcessInspector) Find(context.Context, ProcessIdentity) (ProcessInfo, bool) {
	return ProcessInfo{}, false
}

func terminateVerifiedProcess(context.Context, ProcessIdentity) error { return ErrUnsupported }
