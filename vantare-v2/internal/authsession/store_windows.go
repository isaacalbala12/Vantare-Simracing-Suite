//go:build windows

package authsession

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

// Store persists Supabase session material in Windows Credential Manager for
// the current Windows user. Tokens never live in a normal config file.
type Store struct {
	target string
}

func NewStore(target string) *Store {
	return &Store{target: target}
}

func (s *Store) Save(session Session) error {
	data, err := marshal(session)
	if err != nil {
		return err
	}
	if len(data) > maxCredentialBlobBytes {
		return fmt.Errorf("protected auth session exceeds Windows credential limit")
	}
	target, err := windows.UTF16PtrFromString(s.target)
	if err != nil {
		return fmt.Errorf("encoding credential target: %w", err)
	}
	cred := credential{
		Type:               credentialTypeGeneric,
		TargetName:         target,
		CredentialBlobSize: uint32(len(data)),
		Persist:            credentialPersistLocalUser,
	}
	if len(data) > 0 {
		cred.CredentialBlob = &data[0]
	}
	r1, _, callErr := procCredWrite.Call(uintptr(unsafe.Pointer(&cred)), 0)
	if r1 == 0 {
		return fmt.Errorf("writing protected auth session: %w", callErr)
	}
	return nil
}

func (s *Store) Load() (Session, error) {
	target, err := windows.UTF16PtrFromString(s.target)
	if err != nil {
		return Session{}, fmt.Errorf("encoding credential target: %w", err)
	}
	var cred *credential
	r1, _, callErr := procCredRead.Call(
		uintptr(unsafe.Pointer(target)),
		credentialTypeGeneric,
		0,
		uintptr(unsafe.Pointer(&cred)),
	)
	if r1 == 0 {
		if errors.Is(callErr, syscall.ERROR_NOT_FOUND) {
			return Session{}, ErrNotFound
		}
		return Session{}, fmt.Errorf("reading protected auth session: %w", callErr)
	}
	if cred == nil {
		return Session{}, fmt.Errorf("%w: Windows credential blob is empty", ErrInvalidSession)
	}
	defer procCredFree.Call(uintptr(unsafe.Pointer(cred)))
	copyData, err := copyCredentialBlob(cred)
	if err != nil {
		return Session{}, err
	}
	return unmarshal(copyData)
}

func copyCredentialBlob(cred *credential) ([]byte, error) {
	if cred == nil || cred.CredentialBlobSize == 0 || cred.CredentialBlob == nil {
		return nil, fmt.Errorf("%w: Windows credential blob is empty", ErrInvalidSession)
	}
	data := unsafe.Slice(cred.CredentialBlob, int(cred.CredentialBlobSize))
	return append([]byte(nil), data...), nil
}

func (s *Store) Delete() error {
	target, err := windows.UTF16PtrFromString(s.target)
	if err != nil {
		return fmt.Errorf("encoding credential target: %w", err)
	}
	r1, _, callErr := procCredDelete.Call(
		uintptr(unsafe.Pointer(target)),
		credentialTypeGeneric,
		0,
	)
	if r1 == 0 && !errors.Is(callErr, syscall.ERROR_NOT_FOUND) {
		return fmt.Errorf("deleting protected auth session: %w", callErr)
	}
	return nil
}
