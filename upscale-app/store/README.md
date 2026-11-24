# MES Upscale app (fm.mes.upscale): what is built and what is left

Built 2026-11-24 (Capacitor 8, shell copied from audio-app). Wraps mes.fm/upscale's upscaler (tool_apps_src/upscale). build-www.py
pulls the live tool block + js/upscale.js and patches it (asserted string replacements): bundled onnxruntime-web 1.22.0 + both
Real-ESRGAN ONNX models (www/models, www/vendor, gitignored and rebuilt from mes.fm/upscale/models + vendor-cache/), download() ->
native save sheet, "Download all (ZIP)" -> save every result to Photos, no Edit / photo-editor hand-off.
Native plugin `AppSave` (saveBegin / saveChunk / saveEnd): iOS saves images to Photos (PHPhotoLibrary add-only,
NSPhotoLibraryAddUsageDescription), Files picker or share sheet; Android saves to Pictures/MES Upscale (MediaStore), Downloads or share.
iOS needs native.js's fetch status-0 fix for the app's own files (model loader). iPhone only (TARGETED_DEVICE_FAMILY 1).

Engines: WebGPU first, else wasm (one thread). Checked 2026-11-24: iOS 26.5 simulator upscaled the sample and saved to Photos;
Android 17 emulator WebView exposes navigator.gpu but no adapter, so it ran on the CPU (works, slower).

## Rebuild
python3 ../build_tool_apps.py --only=upscale --apply   # after changing the web upscaler
python3 build-www.py && npx cap sync
cd android && JAVA_HOME=~/Library/Java/JavaVirtualMachines/jbr-21.0.11/Contents/Home ./gradlew bundleRelease
   # keystore ~/keystores/upscale-release.jks alias upscale, passwords in android/keystore.properties (+ ~/keystores/upscale-keystore.properties.bak)
cd ios/App && xcodegen generate && xcodebuild archive -project App.xcodeproj -scheme App -configuration Release -destination 'generic/platform=iOS' \
   -archivePath ../build/App.xcarchive CODE_SIGNING_ALLOWED=NO -skipMacroValidation
xcodebuild -exportArchive -archivePath ../build/App.xcarchive -exportOptionsPlist ../build/ExportOptions.plist -exportPath ../build/export -allowProvisioningUpdates
Bump versionCode / versionName (android/app/build.gradle) and MARKETING_VERSION / CURRENT_PROJECT_VERSION (ios/App/project.yml).

## Store state (2026-11-24)
- App Store Connect: "MES Upscale: AI Photo Enhancer", id 6838918132, SKU mes-upscale. 1.0 build 1 submitted 2026-11-24: Waiting for Review,
  automatic release, free, 174 countries (China mainland left out), Photo & Video / Graphics & Design, Data Not Collected, 4+.
- Google Play: app id 4973342163992438662. Listing, all app-content declarations, closed testing Alpha (mes-android-testers group,
  178 countries) release 1.0 (code 1) sent for review 2026-11-24. Join link https://play.google.com/apps/testing/fm.mes.upscale
- Left: after approval add the links (mobile-apps.html card, android-testers.js, APP_STORE in build_tool_apps.py, installs lib I.APPS,
  mes.fm/apps/latest.json after Play releases).
