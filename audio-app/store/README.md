# MES Audio app (fm.mes.audio): what is built and what is left

Built 2026-11-20 (Capacitor 8). The app wraps mes.fm/audio's editor in its phone "simple mode" (Record, Open, trim, Remove noise,
Enhance speech, compare, Save / Share), with the full editor one tap away. Native plugin `AudioNative`:
- Android: `RecService` = foreground service type microphone (MediaRecorder, AAC 48 kHz mono), so recording keeps going with the
  screen off; "Recording" notification. Save = Download/MES Audio (MediaStore); Share = system share sheet (FileProvider).
- iOS: AVAudioRecorder + `UIBackgroundModes: audio` (recording continues locked); Share = UIActivityViewController (incl. Save to
  Files, AirDrop); Save = UIDocumentPicker "Save to Files". `NSMicrophoneUsageDescription` set. Project is XcodeGen
  (`ios/App/project.yml`, run `xcodegen generate` after editing).
- Offline: DeepFilterNet ONNX model, onnxruntime-web, lamejs, mp4-muxer are bundled into www/ by build-www.py (cache in vendor-cache/).

## Rebuild
```
python3 ../build_tool_apps.py --only=audio --apply   # after changing the web editor (tool_apps_src/audio)
python3 build-www.py && npx cap sync
cd android && JAVA_HOME=~/Library/Java/JavaVirtualMachines/jbr-21.0.11/Contents/Home ./gradlew bundleRelease
   # -> android/app/build/outputs/bundle/release/app-release.aab (keystore ~/keystores/audio-release.jks, alias audio,
   #    passwords in android/keystore.properties, backup ~/keystores/audio-keystore.properties.bak)
cd ios/App && xcodebuild archive -project App.xcodeproj -scheme App -configuration Release -destination 'generic/platform=iOS' \
   -archivePath ../build/App.xcarchive CODE_SIGNING_ALLOWED=NO -skipMacroValidation
xcodebuild -exportArchive -archivePath ../build/App.xcarchive -exportOptionsPlist ../build/ExportOptions.plist \
   -exportPath ../build/export -allowProvisioningUpdates      # signingStyle automatic, destination upload
```
Bump versionCode / versionName in android/app/build.gradle and MARKETING_VERSION / CURRENT_PROJECT_VERSION in ios/App/project.yml.

## Store steps
Listing text: listing.md. Review notes: review-notes.md. Graphics: android/ (icon-512, feature-1024x500, phone-1..5 1080x2160),
ios/ (icon-1024, iphone-1..4 1320x2868, ipad-1..4 2064x2752).

App Store Connect:
1. New app: iOS, name "MES Audio Editor & Recorder", bundle id fm.mes.audio, SKU mes-audio, English (Canada? use English (U.S.)).
2. Upload the build (exportArchive with destination upload, or Transporter). Put the ASC app id into build-www.py `IOS_ID`.
3. Version 1.0: screenshots (6.9" iPhone + 13" iPad), description / keywords / URLs from listing.md, Music category, age rating
   (all None = 4+), App Privacy = "Data Not Collected", price Free, review notes, **App Store Version Release = Automatically release
   this version**, then Add for Review.

Google Play Console:
1. Create app "MES Audio Editor & Recorder", default English, App, Free.
2. App content: privacy policy URL, ads = No, data safety = no data collected, target audience 13+, content rating questionnaire,
   government / financial / health = No, advertising ID = No, **foreground service declaration (microphone)**.
3. Store listing: texts + graphics above. Category Music & Audio, contact contact@mes.fm.
4. Testing > Closed testing > track "Alpha": testers = Google Group mes-android-testers@googlegroups.com, feedback contact@mes.fm,
   all countries; upload android/app/build/outputs/bundle/release/app-release.aab; send for review in Publishing overview.

After it is in testing: add the app to mes.fm/mobile-apps.html (card) and mes.fm/main_js/android-testers.js (+ the tester note on
mes.fm/audio), and bump mes.fm/apps/latest.json after each Play release.
