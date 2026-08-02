//go:build !windows

package protectedstore

type Store struct{}

func New(string) *Store              { return &Store{} }
func (*Store) Save([]byte) error     { return ErrUnsupported }
func (*Store) Load() ([]byte, error) { return nil, ErrNotFound }
func (*Store) Delete() error         { return nil }
