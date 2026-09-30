//go:build !windows

package launcher

import "context"

func FindRunningByExecutable(context.Context, string) ([]ProcessInfo, error) {
	return nil, ErrUnsupported
}
