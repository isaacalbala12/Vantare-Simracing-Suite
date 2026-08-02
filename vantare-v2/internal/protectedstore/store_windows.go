//go:build windows

package protectedstore

import (
	"errors"
	"fmt"
	"syscall"
	"unsafe"

	"golang.org/x/sys/windows"
)

const (
	credentialTypeGeneric      = 1
	credentialPersistLocalUser = 2
	maxCredentialBlobBytes     = 2560
)

var (
	advapi32       = windows.NewLazySystemDLL("advapi32.dll")
	procCredWrite  = advapi32.NewProc("CredWriteW")
	procCredRead   = advapi32.NewProc("CredReadW")
	procCredDelete = advapi32.NewProc("CredDeleteW")
	procCredFree   = advapi32.NewProc("CredFree")
)

type credential struct {
	Flags              uint32
	Type               uint32
	TargetName         *uint16
	Comment            *uint16
	LastWritten        windows.Filetime
	CredentialBlobSize uint32
	CredentialBlob     *byte
	Persist            uint32
	AttributeCount     uint32
	Attributes         uintptr
	TargetAlias        *uint16
	UserName           *uint16
}

// Store persists a small opaque value for the current Windows user.
type Store struct{ target string }

func New(target string) *Store { return &Store{target: target} }

func (s *Store) Save(data []byte) error {
	if len(data) == 0 || len(data) > maxCredentialBlobBytes {
		return fmt.Errorf("protected value must contain 1..%d bytes", maxCredentialBlobBytes)
	}
	target, err := windows.UTF16PtrFromString(s.target)
	if err != nil {
		return fmt.Errorf("encoding protected value target: %w", err)
	}
	cred := credential{
		Type:               credentialTypeGeneric,
		TargetName:         target,
		CredentialBlobSize: uint32(len(data)),
		CredentialBlob:     &data[0],
		Persist:            credentialPersistLocalUser,
	}
	r1, _, callErr := procCredWrite.Call(uintptr(unsafe.Pointer(&cred)), 0)
	if r1 == 0 {
		return fmt.Errorf("writing protected value: %w", callErr)
	}
	return nil
}

func (s *Store) Load() ([]byte, error) {
	target, err := windows.UTF16PtrFromString(s.target)
	if err != nil {
		return nil, fmt.Errorf("encoding protected value target: %w", err)
	}
	var cred *credential
	r1, _, callErr := procCredRead.Call(
		uintptr(unsafe.Pointer(target)), credentialTypeGeneric, 0,
		uintptr(unsafe.Pointer(&cred)),
	)
	if r1 == 0 {
		if errors.Is(callErr, syscall.ERROR_NOT_FOUND) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("reading protected value: %w", callErr)
	}
	if cred == nil {
		return nil, fmt.Errorf("protected value is empty")
	}
	defer procCredFree.Call(uintptr(unsafe.Pointer(cred)))
	if cred.CredentialBlobSize == 0 || cred.CredentialBlobSize > maxCredentialBlobBytes || cred.CredentialBlob == nil {
		return nil, fmt.Errorf("protected value is invalid")
	}
	data := unsafe.Slice(cred.CredentialBlob, int(cred.CredentialBlobSize))
	return append([]byte(nil), data...), nil
}

func (s *Store) Delete() error {
	target, err := windows.UTF16PtrFromString(s.target)
	if err != nil {
		return fmt.Errorf("encoding protected value target: %w", err)
	}
	r1, _, callErr := procCredDelete.Call(uintptr(unsafe.Pointer(target)), credentialTypeGeneric, 0)
	if r1 == 0 && !errors.Is(callErr, syscall.ERROR_NOT_FOUND) {
		return fmt.Errorf("deleting protected value: %w", callErr)
	}
	return nil
}
