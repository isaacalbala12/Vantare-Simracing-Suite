//go:build windows

package launcher

import (
	"context"
	"os"
	"testing"
)

func TestFindRunningByExecutableUsesRealPath(t *testing.T) {
	executable, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	matches, err := FindRunningByExecutable(context.Background(), executable)
	if err != nil {
		t.Fatal(err)
	}
	foundSelf := false
	for _, info := range matches {
		if NormalizeExecutablePath(info.ExecutablePath) != NormalizeExecutablePath(executable) {
			t.Fatalf("discovery returned another executable: %+v", info)
		}
		if info.PID == os.Getpid() && info.CreationTime != 0 {
			foundSelf = true
		}
	}
	if !foundSelf {
		t.Fatal("discovery did not find the current process with its creation time")
	}
	other, err := FindRunningByExecutable(context.Background(), `C:\not-the-current-program.exe`)
	if err != nil || len(other) != 0 {
		t.Fatalf("unrelated path must not match: %+v, %v", other, err)
	}
}
