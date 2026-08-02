package authsession

import (
	"errors"
	"testing"
)

type memoryProtectedStore struct {
	session     Session
	loadErr     error
	deleteErr   error
	saveCalls   int
	deleteCalls int
}

func (s *memoryProtectedStore) Save(session Session) error {
	s.saveCalls++
	s.session = session
	return nil
}

func (s *memoryProtectedStore) Load() (Session, error) {
	return s.session, s.loadErr
}

func (s *memoryProtectedStore) Delete() error {
	s.deleteCalls++
	s.session = Session{}
	return s.deleteErr
}

func TestManagerRejectsSessionFixationBeforeValidation(t *testing.T) {
	store := &memoryProtectedStore{}
	manager := NewManager(store)
	err := manager.Rotate(Session{AccessToken: "attacker-access", RefreshToken: "attacker-refresh"})
	if !errors.Is(err, ErrUntrustedRotation) {
		t.Fatalf("Rotate error = %v, want ErrUntrustedRotation", err)
	}
	if store.saveCalls != 0 {
		t.Fatalf("untrusted rotation wrote %d sessions, want 0", store.saveCalls)
	}
}

func TestManagerAllowsRotationAfterBackendValidation(t *testing.T) {
	store := &memoryProtectedStore{}
	manager := NewManager(store)
	if err := manager.AcceptValidated(Session{AccessToken: "accepted", RefreshToken: "accepted-refresh"}); err != nil {
		t.Fatal(err)
	}
	rotated := Session{AccessToken: "rotated", RefreshToken: "rotated-refresh"}
	if err := manager.Rotate(rotated); err != nil {
		t.Fatal(err)
	}
	if store.session != rotated {
		t.Fatalf("stored session = %+v, want %+v", store.session, rotated)
	}
}

func TestManagerRestoresTrustAcrossRestart(t *testing.T) {
	stored := Session{AccessToken: "stored", RefreshToken: "stored-refresh"}
	store := &memoryProtectedStore{session: stored}
	manager := NewManager(store)
	got, err := manager.Restore()
	if err != nil || got != stored {
		t.Fatalf("Restore = %+v, %v", got, err)
	}
	if err := manager.Rotate(Session{AccessToken: "fresh", RefreshToken: "fresh-refresh"}); err != nil {
		t.Fatalf("rotation after restart failed: %v", err)
	}
}

func TestManagerLogoutRevokesTrustEvenWhenDeleteFailsOffline(t *testing.T) {
	store := &memoryProtectedStore{deleteErr: errors.New("credential backend offline")}
	manager := NewManager(store)
	if err := manager.AcceptValidated(Session{AccessToken: "accepted", RefreshToken: "accepted-refresh"}); err != nil {
		t.Fatal(err)
	}
	if err := manager.Clear(); err == nil {
		t.Fatal("Clear succeeded, want the storage error")
	}
	if store.deleteCalls != 1 {
		t.Fatalf("delete calls = %d, want 1", store.deleteCalls)
	}
	if err := manager.Rotate(Session{AccessToken: "late", RefreshToken: "late-refresh"}); !errors.Is(err, ErrUntrustedRotation) {
		t.Fatalf("late rotation error = %v, want ErrUntrustedRotation", err)
	}
}
