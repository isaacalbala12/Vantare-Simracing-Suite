//go:build !ios

package main

// main es un stub para que `go build ./...` no falle en plataformas no-iOS.
// El paquete build/ios solo aporta un entrypoint real bajo el tag `ios`
// (main_ios.go / app_options_ios.go); sin este archivo, en Windows el paquete
// quedaba con un único fichero `app_options_default.go` (package main sin
// func main) y el linker emitía `runtime.main_main·f: function main is
// undeclared in the main package`. Este stub no se compila en el build iOS
// real y no altera el packaging.
func main() {}
