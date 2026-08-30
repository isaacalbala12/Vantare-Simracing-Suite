//go:build windows

package sensor

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"testing"
	"time"
)

func TestPresentMonJobObjectKillsChildOnParentExit(t *testing.T) {
	if os.Getenv("GO_WANT_PRESENTMON_JOB_HELPER") == "1" {
		pidFile := os.Getenv("PRESENTMON_JOB_PID_FILE")
		process, reader, err := (execRunner{}).Start(context.Background(), "powershell.exe", []string{"-NoProfile", "-Command", "Start-Sleep -Seconds 60"})
		if err != nil {
			os.Exit(2)
		}
		_ = reader
		if err := os.WriteFile(pidFile, []byte(strconv.Itoa(process.PID())), 0o600); err != nil {
			os.Exit(3)
		}
		os.Exit(0)
	}

	pidFile := t.TempDir() + `\presentmon-child.pid`
	helper := exec.Command(os.Args[0], "-test.run=^TestPresentMonJobObjectKillsChildOnParentExit$")
	helper.Env = append(os.Environ(), "GO_WANT_PRESENTMON_JOB_HELPER=1", "PRESENTMON_JOB_PID_FILE="+pidFile)
	if output, err := helper.CombinedOutput(); err != nil {
		t.Fatalf("job helper: %v: %s", err, output)
	}
	rawPID, err := os.ReadFile(pidFile)
	if err != nil {
		t.Fatal(err)
	}
	childPID, err := strconv.Atoi(strings.TrimSpace(string(rawPID)))
	if err != nil {
		t.Fatal(err)
	}
	defer func() {
		if processIsAlive(childPID) {
			if process, findErr := os.FindProcess(childPID); findErr == nil {
				_ = process.Kill()
			}
		}
	}()

	deadline := time.Now().Add(3 * time.Second)
	for processIsAlive(childPID) && time.Now().Before(deadline) {
		time.Sleep(10 * time.Millisecond)
	}
	if processIsAlive(childPID) {
		t.Fatal(fmt.Sprintf("owned child PID %d survived parent os.Exit", childPID))
	}
}
