package main

import (
	"fmt"

	"github.com/vantare/overlays/v2/internal/license"
)

func main() {
	fp, err := license.MachineFingerprint()
	if err != nil {
		panic(err)
	}
	fmt.Println(fp)
}