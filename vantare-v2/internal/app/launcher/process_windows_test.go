//go:build windows

package launcher

import (
	"context"
	"os"
	"testing"
)

func TestProcessInspectorReadsActualExecutable(t *testing.T) {
	executable, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	info, ok := DefaultProcessInspector().Find(context.Background(), ProcessIdentity{
		PID: os.Getpid(), ExecutablePath: `C:\not-the-current-process.exe`,
	})
	if !ok || NormalizeExecutablePath(info.ExecutablePath) != NormalizeExecutablePath(executable) {
		t.Fatalf("inspector must return the real path, got %+v (ok=%v)", info, ok)
	}
	if info.CreationTime == 0 {
		t.Fatal("inspector must return the real process creation time")
	}
	if ProcessIsReady(ProcessIdentity{PID: os.Getpid(), ExecutablePath: `C:\not-the-current-process.exe`}, info) {
		t.Fatal("inspector accepted an unrelated executable")
	}
}
