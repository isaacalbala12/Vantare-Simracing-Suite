package authsession

import (
	"errors"
	"fmt"
	"sync"
	"testing"
	"time"
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
	if s.deleteErr == nil {
		s.session = Session{}
	}
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
	if store.session.AccessToken == "" {
		t.Fatal("test store erased the credential despite reporting a delete failure")
	}
	if err := manager.Rotate(Session{AccessToken: "late", RefreshToken: "late-refresh"}); !errors.Is(err, ErrUntrustedRotation) {
		t.Fatalf("late rotation error = %v, want ErrUntrustedRotation", err)
	}
}

type synchronizedStore struct {
	mu            sync.Mutex
	session       Session
	saveStarted   chan struct{}
	allowSave     chan struct{}
	deleteStarted chan struct{}
	allowDelete   chan struct{}
}

func (s *synchronizedStore) Save(session Session) error {
	if s.saveStarted != nil {
		close(s.saveStarted)
		<-s.allowSave
	}
	s.mu.Lock()
	s.session = session
	s.mu.Unlock()
	return nil
}

func (s *synchronizedStore) Load() (Session, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.session, nil
}

func (s *synchronizedStore) Delete() error {
	if s.deleteStarted != nil {
		close(s.deleteStarted)
		<-s.allowDelete
	}
	s.mu.Lock()
	s.session = Session{}
	s.mu.Unlock()
	return nil
}

func TestManagerClearCannotBeOvertakenByInFlightRotation(t *testing.T) {
	store := &synchronizedStore{session: Session{AccessToken: "old", RefreshToken: "old-refresh"}}
	manager := NewManager(store)
	if _, err := manager.Restore(); err != nil {
		t.Fatal(err)
	}
	store.saveStarted = make(chan struct{})
	store.allowSave = make(chan struct{})
	rotateDone := make(chan error, 1)
	go func() {
		rotateDone <- manager.Rotate(Session{AccessToken: "rotated", RefreshToken: "rotated-refresh"})
	}()
	<-store.saveStarted

	clearDone := make(chan error, 1)
	go func() { clearDone <- manager.Clear() }()
	select {
	case err := <-clearDone:
		if err != nil {
			t.Fatal(err)
		}
		close(store.allowSave)
		if err := <-rotateDone; err != nil {
			t.Fatal(err)
		}
		if stored, _ := store.Load(); stored != (Session{}) {
			t.Fatalf("credential resurrected by a rotation that outlived Clear: %+v", stored)
		}
		return
	case <-time.After(50 * time.Millisecond):
		// Clear is correctly serialized behind the in-flight save.
	}
	close(store.allowSave)
	if err := <-rotateDone; err != nil {
		t.Fatal(err)
	}
	if err := <-clearDone; err != nil {
		t.Fatal(err)
	}
	if stored, _ := store.Load(); stored != (Session{}) {
		t.Fatalf("credential resurrected after Clear: %+v", stored)
	}
}

func TestManagerRotationCannotOvertakeInFlightClear(t *testing.T) {
	store := &synchronizedStore{session: Session{AccessToken: "old", RefreshToken: "old-refresh"}}
	manager := NewManager(store)
	if _, err := manager.Restore(); err != nil {
		t.Fatal(err)
	}
	store.deleteStarted = make(chan struct{})
	store.allowDelete = make(chan struct{})
	clearDone := make(chan error, 1)
	go func() { clearDone <- manager.Clear() }()
	<-store.deleteStarted

	rotateDone := make(chan error, 1)
	go func() {
		rotateDone <- manager.Rotate(Session{AccessToken: "late", RefreshToken: "late-refresh"})
	}()
	close(store.allowDelete)
	if err := <-clearDone; err != nil {
		t.Fatal(err)
	}
	if err := <-rotateDone; !errors.Is(err, ErrUntrustedRotation) {
		t.Fatalf("late rotation error = %v, want ErrUntrustedRotation", err)
	}
	if stored, _ := store.Load(); stored != (Session{}) {
		t.Fatalf("credential resurrected after Clear: %+v", stored)
	}
}

func TestManagerDeletesCorruptProtectedSession(t *testing.T) {
	store := &memoryProtectedStore{loadErr: fmt.Errorf("%w: malformed JSON", ErrInvalidSession)}
	manager := NewManager(store)
	_, err := manager.Restore()
	if !errors.Is(err, ErrInvalidStoredSessionRemoved) {
		t.Fatalf("Restore error = %v, want ErrInvalidStoredSessionRemoved", err)
	}
	if store.deleteCalls != 1 {
		t.Fatalf("delete calls = %d, want 1", store.deleteCalls)
	}
}
