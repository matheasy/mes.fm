#!/bin/sh
# Build and upload Open Limits to App Store Connect (bump CURRENT_PROJECT_VERSION in project.yml first).
# The team has no registered devices, so Xcode can't sign the archive itself. Instead: archive unsigned, ad-hoc sign
# every bundle WITH its entitlements (an unsigned archive has none, and the export would drop Family Controls and the
# App Group), then let -exportArchive -allowProvisioningUpdates cloud-sign it for the App Store and upload.
set -e
cd "$(dirname "$0")"
xcodegen generate
rm -rf build/OpenLimits.xcarchive build/upload
mkdir -p build
xcodebuild archive -project OpenLimits.xcodeproj -scheme OpenLimits -configuration Release -destination 'generic/platform=iOS' \
  -archivePath build/OpenLimits.xcarchive CODE_SIGNING_ALLOWED=NO -quiet
A=build/OpenLimits.xcarchive/Products/Applications/OpenLimits.app
for x in "$A"/PlugIns/*.appex; do codesign -f -s - --entitlements Extension.entitlements "$x"; done
codesign -f -s - --entitlements App/OpenLimits.entitlements "$A"
cat > build/ExportUpload.plist <<P
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>destination</key><string>${DEST:-upload}</string>
<key>method</key><string>app-store-connect</string>
<key>signingStyle</key><string>automatic</string>
<key>teamID</key><string>BS5YQPDA5X</string>
<key>uploadSymbols</key><true/>
</dict></plist>
P
xcodebuild -exportArchive -archivePath build/OpenLimits.xcarchive -exportPath build/upload -exportOptionsPlist build/ExportUpload.plist -allowProvisioningUpdates
