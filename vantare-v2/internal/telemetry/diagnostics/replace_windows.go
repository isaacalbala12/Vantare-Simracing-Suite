//go:build windows

package diagnostics

import "golang.org/x/sys/windows"

func replaceDiagnosticAtomic(source, destination string) error {
	sourceUTF16, err := windows.UTF16PtrFromString(source)
	if err != nil {
		return err
	}
	destinationUTF16, err := windows.UTF16PtrFromString(destination)
	if err != nil {
		return err
	}
	return windows.MoveFileEx(
		sourceUTF16,
		destinationUTF16,
		windows.MOVEFILE_REPLACE_EXISTING|windows.MOVEFILE_WRITE_THROUGH,
	)
}

func syncDiagnosticDirectory(string) error {
	// MOVEFILE_WRITE_THROUGH flushes the rename operation on Windows.
	return nil
}
