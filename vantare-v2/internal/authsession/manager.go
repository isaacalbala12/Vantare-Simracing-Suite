package authsession

import (
	"errors"
	"fmt"
	"sync"
)

var ErrUntrustedRotation = errors.New("auth session rotation requires a trusted session")

type protectedStore interface {
	Save(Session) error
	Load() (Session, error)
	Delete() error
}

// Manager enforces the session-fixation boundary around protected storage.
// Only a backend-validated session or a credential restored from the OS can
// authorize later token rotations.
type Manager struct {
	mu      sync.Mutex
	store   protectedStore
	trusted bool
}

func NewManager(store protectedStore) *Manager {
	return &Manager{store: store}
}

func (m *Manager) AcceptValidated(session Session) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if err := session.validate(); err != nil {
		return err
	}
	if err := m.store.Save(session); err != nil {
		return err
	}
	m.trusted = true
	return nil
}

func (m *Manager) Restore() (Session, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	session, err := m.store.Load()
	if err != nil {
		m.trusted = false
		if errors.Is(err, ErrInvalidSession) {
			if deleteErr := m.store.Delete(); deleteErr != nil {
				return Session{}, fmt.Errorf("delete invalid protected auth session: %w", errors.Join(err, deleteErr))
			}
			return Session{}, fmt.Errorf("%w: %v", ErrInvalidStoredSessionRemoved, err)
		}
		return Session{}, err
	}
	if err := session.validate(); err != nil {
		m.trusted = false
		if deleteErr := m.store.Delete(); deleteErr != nil {
			return Session{}, fmt.Errorf("delete invalid protected auth session: %w", errors.Join(err, deleteErr))
		}
		return Session{}, fmt.Errorf("%w: %v", ErrInvalidStoredSessionRemoved, err)
	}
	m.trusted = true
	return session, nil
}

func (m *Manager) Rotate(session Session) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if !m.trusted {
		return ErrUntrustedRotation
	}
	if err := session.validate(); err != nil {
		return err
	}
	return m.store.Save(session)
}

func (m *Manager) Clear() error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.trusted = false
	return m.store.Delete()
}
