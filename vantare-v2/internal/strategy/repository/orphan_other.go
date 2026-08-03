//go:build !windows

package repository

import "os"

func isSafeOrphanRegular(path string) (bool, error) {
	info, err := os.Lstat(path)
	if err != nil {
		return false, err
	}
	return info.Mode().IsRegular() && info.Mode()&os.ModeSymlink == 0, nil
}
