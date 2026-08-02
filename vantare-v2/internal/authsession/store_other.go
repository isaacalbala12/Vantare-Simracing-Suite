//go:build !windows

package authsession

import "errors"

var errUnsupported = errors.New("protected auth session storage is only supported on Windows")

type Store struct{}

func NewStore(string) *Store { return &Store{} }

func (*Store) Save(Session) error     { return errUnsupported }
func (*Store) Load() (Session, error) { return Session{}, ErrNotFound }
func (*Store) Delete() error          { return nil }
