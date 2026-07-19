// Package spatial contains canonical geometry values without assuming LMU axes or units.
package spatial

type Vector3 struct {
	X float64
	Y float64
	Z float64
}

type Orientation struct {
	Row0 Vector3
	Row1 Vector3
	Row2 Vector3
}
