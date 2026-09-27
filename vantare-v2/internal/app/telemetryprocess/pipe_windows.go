//go:build windows

package telemetryprocess

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"runtime"
	"time"
	"unsafe"

	"golang.org/x/sys/windows"
)

const pipeBufferBytes = 64 << 10
const pipeAcceptTimeout = 2 * time.Second
const pipeNamePrefix = `\\.\pipe\vantare-telemetry-`

type localPipe struct {
	name   string
	nonce  [16]byte
	handle windows.Handle
}

func currentLogonSID() (string, error) {
	groups, err := windows.GetCurrentProcessToken().GetTokenGroups()
	if err != nil {
		return "", fmt.Errorf("read telemetry host token groups: %w", err)
	}
	for _, group := range groups.AllGroups() {
		if group.Attributes&windows.SE_GROUP_LOGON_ID == windows.SE_GROUP_LOGON_ID {
			return group.Sid.String(), nil
		}
	}
	return "", errors.New("telemetry host has no logon session SID")
}

func newLocalPipe() (*localPipe, error) {
	var nonce [16]byte
	if _, err := rand.Read(nonce[:]); err != nil {
		return nil, fmt.Errorf("generate telemetry pipe name: %w", err)
	}
	name := pipeNamePrefix + hex.EncodeToString(nonce[:])
	return createLocalPipe(name)
}

func createLocalPipe(name string) (*localPipe, error) {
	if len(name) != len(pipeNamePrefix)+32 || name[:len(pipeNamePrefix)] != pipeNamePrefix {
		return nil, errors.New("invalid telemetry pipe name")
	}
	decoded, err := hex.DecodeString(name[len(pipeNamePrefix):])
	if err != nil || len(decoded) != 16 {
		return nil, errors.New("invalid telemetry pipe nonce")
	}
	var nonce [16]byte
	copy(nonce[:], decoded)
	sid, err := currentLogonSID()
	if err != nil {
		return nil, err
	}
	// Protected DACL: only processes from this interactive logon session may
	// connect. Client PID is checked separately after connection.
	descriptor, err := windows.SecurityDescriptorFromString("D:P(A;;GRGW;;;" + sid + ")")
	if err != nil {
		return nil, fmt.Errorf("create telemetry pipe descriptor: %w", err)
	}
	attributes := windows.SecurityAttributes{
		Length:             uint32(unsafe.Sizeof(windows.SecurityAttributes{})),
		SecurityDescriptor: descriptor,
		InheritHandle:      0,
	}
	path, err := windows.UTF16PtrFromString(name)
	if err != nil {
		return nil, fmt.Errorf("encode telemetry pipe name: %w", err)
	}
	handle, err := windows.CreateNamedPipe(path,
		windows.PIPE_ACCESS_DUPLEX|windows.FILE_FLAG_FIRST_PIPE_INSTANCE|windows.FILE_FLAG_OVERLAPPED,
		windows.PIPE_TYPE_BYTE|windows.PIPE_READMODE_BYTE|windows.PIPE_WAIT|windows.PIPE_REJECT_REMOTE_CLIENTS,
		1, pipeBufferBytes, pipeBufferBytes, 0, &attributes)
	runtime.KeepAlive(descriptor)
	if err != nil {
		return nil, fmt.Errorf("create telemetry pipe: %w", err)
	}
	return &localPipe{name: name, nonce: nonce, handle: handle}, nil
}

func (pipe *localPipe) verifyClientPID(expected uint32) error {
	var actual uint32
	if err := windows.GetNamedPipeClientProcessId(pipe.handle, &actual); err != nil {
		return fmt.Errorf("read telemetry pipe client PID: %w", err)
	}
	if actual != expected {
		return errors.New("telemetry pipe client is not the launched child")
	}
	return nil
}

// acceptChild waits for one local connection and rejects every PID except the
// process launched for this pipe. The overlapped operation is always reaped
// before its stack storage or event handle is released.
func (pipe *localPipe) acceptChild(ctx context.Context, expected uint32) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	bounded, cancel := context.WithTimeout(ctx, pipeAcceptTimeout)
	defer cancel()
	event, err := windows.CreateEvent(nil, 1, 0, nil)
	if err != nil {
		return fmt.Errorf("create telemetry pipe connect event: %w", err)
	}
	defer windows.CloseHandle(event)
	overlapped := windows.Overlapped{HEvent: event}
	err = windows.ConnectNamedPipe(pipe.handle, &overlapped)
	switch {
	case err == nil, errors.Is(err, windows.ERROR_PIPE_CONNECTED):
		return pipe.verifyClientPID(expected)
	case !errors.Is(err, windows.ERROR_IO_PENDING):
		return fmt.Errorf("connect telemetry pipe: %w", err)
	}
	for {
		if err := bounded.Err(); err != nil {
			_ = windows.CancelIoEx(pipe.handle, &overlapped)
			_, _ = windows.WaitForSingleObject(event, uint32(pipeAcceptTimeout.Milliseconds()))
			var transferred uint32
			_ = windows.GetOverlappedResult(pipe.handle, &overlapped, &transferred, true)
			return fmt.Errorf("connect telemetry pipe: %w", err)
		}
		result, err := windows.WaitForSingleObject(event, 10)
		if err != nil {
			_ = windows.CancelIoEx(pipe.handle, &overlapped)
			var transferred uint32
			_ = windows.GetOverlappedResult(pipe.handle, &overlapped, &transferred, true)
			return fmt.Errorf("wait for telemetry pipe client: %w", err)
		}
		if result == windows.WAIT_OBJECT_0 {
			var transferred uint32
			if err := windows.GetOverlappedResult(pipe.handle, &overlapped, &transferred, false); err != nil {
				return fmt.Errorf("complete telemetry pipe connection: %w", err)
			}
			return pipe.verifyClientPID(expected)
		}
		if result != uint32(windows.WAIT_TIMEOUT) {
			_ = windows.CancelIoEx(pipe.handle, &overlapped)
			var transferred uint32
			_ = windows.GetOverlappedResult(pipe.handle, &overlapped, &transferred, true)
			return errors.New("unexpected telemetry pipe wait result")
		}
	}
}

func (pipe *localPipe) close() error {
	return windows.CloseHandle(pipe.handle)
}
