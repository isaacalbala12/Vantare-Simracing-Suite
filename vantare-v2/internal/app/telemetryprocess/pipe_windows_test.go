//go:build windows

package telemetryprocess

import (
	"context"
	"errors"
	"os"
	"strings"
	"testing"
	"time"

	"golang.org/x/sys/windows"
)

func TestLocalPipeHasSessionDACLAndSingleInstance(t *testing.T) {
	pipe, err := newLocalPipe()
	if err != nil {
		t.Fatal(err)
	}
	defer pipe.close()
	if !strings.HasPrefix(pipe.name, `\\.\pipe\vantare-telemetry-`) {
		t.Fatalf("unexpected pipe prefix: %q", pipe.name)
	}
	duplicate, err := createLocalPipe(pipe.name)
	if err == nil {
		_ = duplicate.close()
		t.Fatal("second server instance claimed the reserved pipe name")
	}
	descriptor, err := windows.GetSecurityInfo(pipe.handle, windows.SE_FILE_OBJECT, windows.DACL_SECURITY_INFORMATION)
	if err != nil {
		t.Fatal(err)
	}
	sid, err := currentLogonSID()
	if err != nil {
		t.Fatal(err)
	}
	sddl := descriptor.String()
	if !strings.Contains(sddl, sid) || strings.Contains(sddl, ";;;WD)") || strings.Contains(sddl, ";;;AN)") {
		t.Fatalf("pipe DACL does not restrict access to the logon session: %q", sddl)
	}
	var flags, instances uint32
	if err := windows.GetNamedPipeInfo(pipe.handle, &flags, nil, nil, &instances); err != nil {
		t.Fatal(err)
	}
	if flags&windows.PIPE_SERVER_END == 0 || instances != 1 {
		t.Fatalf("pipe info flags=%#x instances=%d", flags, instances)
	}
}

func TestLocalPipeRejectsUnexpectedClientPID(t *testing.T) {
	pipe, err := newLocalPipe()
	if err != nil {
		t.Fatal(err)
	}
	defer pipe.close()
	name, err := windows.UTF16PtrFromString(pipe.name)
	if err != nil {
		t.Fatal(err)
	}
	client, err := windows.CreateFile(name, windows.GENERIC_READ|windows.GENERIC_WRITE,
		0, nil, windows.OPEN_EXISTING, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	defer windows.CloseHandle(client)
	if err := pipe.acceptChild(context.Background(), uint32(os.Getpid())); err != nil {
		t.Fatalf("same-process client PID rejected: %v", err)
	}
	if err := pipe.verifyClientPID(uint32(os.Getpid() + 1)); err == nil {
		t.Fatal("unexpected client PID accepted")
	}
}

func TestLocalPipeAcceptHonorsDeadline(t *testing.T) {
	pipe, err := newLocalPipe()
	if err != nil {
		t.Fatal(err)
	}
	defer pipe.close()
	ctx, cancel := context.WithTimeout(context.Background(), 40*time.Millisecond)
	defer cancel()
	if err := pipe.acceptChild(ctx, uint32(os.Getpid())); !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("accept deadline = %v", err)
	}
}
