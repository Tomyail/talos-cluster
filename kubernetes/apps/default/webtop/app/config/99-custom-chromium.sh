#!/bin/bash
echo "Initializing custom Chromium scripts..."
mkdir -p /config/.config/autostart
cat << 'EOF' > /config/custom-chromium-wrapper.sh
#!/bin/bash
exec >> /config/chrome-wrapper.log 2>&1
# Clean up abandoned lock files from previous pod runs
rm -f "$HOME/remote-profile/SingletonLock"
/usr/bin/chromium \
  --remote-debugging-port=9222 \
  --remote-debugging-address=0.0.0.0 \
  --user-data-dir=$HOME/remote-profile \
  --no-sandbox
EOF
chmod +x /config/custom-chromium-wrapper.sh
cat << 'EOF' > /config/.config/autostart/custom-chromium.desktop
[Desktop Entry]
Type=Application
Name=Custom Chromium
Exec=/config/custom-chromium-wrapper.sh
Hidden=false
NoDisplay=false
X-GNOME-Autostart-enabled=true
EOF

echo "Creating Desktop shortcut..."
mkdir -p /config/Desktop
cat << 'EOF' > /config/Desktop/custom-chromium.desktop
[Desktop Entry]
Version=1.0
Type=Application
Name=Custom Chromium
Comment=Launch Chromium with CDP exposed
Exec=/config/custom-chromium-wrapper.sh
Icon=chromium-browser
Terminal=false
StartupNotify=false
EOF
chmod +x /config/Desktop/custom-chromium.desktop
