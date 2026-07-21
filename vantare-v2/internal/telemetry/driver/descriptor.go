package driver

// ID is the stable identifier of one compiled simulator driver.
type ID string

// Capability identifies one statically supported acquisition facility. It
// describes compiled support, not the health of a running driver.
type Capability string

// Descriptor is immutable catalog metadata copied by DriverManager on input
// and output. Priority is compared descending; ID breaks equal-priority ties.
type Descriptor struct {
	ID           ID
	Priority     int
	Capabilities []Capability
}
