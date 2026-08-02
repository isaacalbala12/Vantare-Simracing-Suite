package authsession

import (
	"errors"
	"sync/atomic"
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
	store   protectedStore
	trusted atomic.Bool
}

func NewManager(store protectedStore) *Manager {
	return &Manager{store: store}
}

func (m *Manager) AcceptValidated(session Session) error {
	if err := session.validate(); err != nil {
		return err
	}
	if err := m.store.Save(session); err != nil {
		return err
	}
	m.trusted.Store(true)
	return nil
}

func (m *Manager) Restore() (Session, error) {
	session, err := m.store.Load()
	if err != nil {
		m.trusted.Store(false)
		return Session{}, err
	}
	if err := session.validate(); err != nil {
		m.trusted.Store(false)
		return Session{}, err
	}
	m.trusted.Store(true)
	return session, nil
}

func (m *Manager) Rotate(session Session) error {
	if !m.trusted.Load() {
		return ErrUntrustedRotation
	}
	if err := session.validate(); err != nil {
		return err
	}
	return m.store.Save(session)
}

func (m *Manager) Clear() error {
	m.trusted.Store(false)
	return m.store.Delete()
}
