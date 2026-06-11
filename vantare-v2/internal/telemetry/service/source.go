package service

type Source interface {
	Read() []byte
}

type FuncSource func() []byte

func (f FuncSource) Read() []byte { return f() }
