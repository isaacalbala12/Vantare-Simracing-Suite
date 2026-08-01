// Package spatial contains product-neutral vehicle geometry.
package spatial

type Vector3 struct {
	X float64
	Y float64
	Z float64
}

// Position is a world-space position in meters.
type Position Vector3

// LocalVelocity is velocity in meters per second in the vehicle-local frame.
// The canonical LMU driver uses +X left, +Y up and +Z rearward.
type LocalVelocity Vector3

// Orientation contains the three stored rows of a right-handed orthonormal
// matrix. Its columns express the vehicle-local left, up and rearward axes in
// world space.
type Orientation struct {
	Row0 Vector3
	Row1 Vector3
	Row2 Vector3
}
