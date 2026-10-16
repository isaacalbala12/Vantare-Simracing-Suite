#!/bin/sh
# Instalación privada. No cambia el Hub ni copia su sesión.
set -eu
binary=${1:?Uso: instalar-macos.sh /ruta/al/vantare-admin [destino.app]}
destination=${2:-"$HOME/Applications/Vantare Gestión.app"}
[ -f "$binary" ] && [ -x "$binary" ] || { echo 'Falta el binario compilado.' >&2; exit 1; }
case "$destination" in /*.app) ;; *) echo 'El destino debe ser una ruta absoluta .app.' >&2; exit 1;; esac
mkdir -p "$destination/Contents/MacOS"
cp "$binary" "$destination/Contents/MacOS/vantare-admin"
cat > "$destination/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleExecutable</key><string>vantare-admin</string>
<key>CFBundleIdentifier</key><string>app.vantare.admin</string>
<key>CFBundleName</key><string>Vantare Gestión</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>NSHighResolutionCapable</key><true/>
<key>NSPrincipalClass</key><string>NSApplication</string>
</dict></plist>
PLIST
printf 'App privada preparada en %s\n' "$destination"

if [ "${3:-}" = "--desktop" ]; then
  shortcut="$HOME/Desktop/Vantare Gestión.app"
  if [ ! -e "$shortcut" ] && [ ! -L "$shortcut" ]; then ln -s "$destination" "$shortcut";
  elif [ -L "$shortcut" ] && [ "$(readlink "$shortcut")" = "$destination" ]; then :;
  else printf 'Se conserva el acceso que ya existe en %s\n' "$shortcut"; fi
fi
