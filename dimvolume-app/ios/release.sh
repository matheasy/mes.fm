#!/bin/sh
# Build and upload Dim & Volume to App Store Connect (bump CURRENT_PROJECT_VERSION in project.yml first).
# The team has no registered devices, so Xcode can't sign the archive itself. Instead: archive unsigned, ad-hoc sign
# the app, then let -exportArchive -allowProvisioningUpdates cloud-sign it for the App Store and upload.
set -e
cd "$(dirname "$0")"
xcodegen generate
rm -rf build/DimVolume.xcarchive build/upload
mkdir -p build
xcodebuild archive -project DimVolume.xcodeproj -scheme DimVolume -configuration Release -destination 'generic/platform=iOS' \
  -archivePath build/DimVolume.xcarchive CODE_SIGNING_ALLOWED=NO -quiet
A=build/DimVolume.xcarchive/Products/Applications/DimVolume.app
codesign -f -s - "$A"
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
xcodebuild -exportArchive -archivePath build/DimVolume.xcarchive -exportPath build/upload -exportOptionsPlist build/ExportUpload.plist -allowProvisioningUpdates
