# App Review notes: MES Dim & Volume (iOS) (paste into App Review Information > Notes)

Screen recording: attached under App Review Information > Attachment (review-recording.mp4, starts on the home screen and launches the app). It was recorded in the iOS Simulator (iPhone 17 Pro, iOS 26.5): we do not have a spare physical iPhone. On a real iPhone the Volume tab also shows the system volume slider (MPVolumeView), which the Simulator hides because it has no audio route.

1. Purpose and audience
MES Dim & Volume is a small utility for adults and teens who find the iPhone's volume buttons too coarse (16 steps of about 6%, so music or a video at night jumps from too quiet to too loud) and the screen too bright at night. The app sets the media volume and the screen brightness in much smaller steps (1, 2, 3 or 5% per tap) and remembers the level. For "darker than the lowest brightness", which an app is not allowed to do over other apps, it gives a short tick-off guide to the iPhone's own Reduce White Point, Zoom Low Light filter and Accessibility Shortcut.

2. How to use the main features (no account, no sign-in, no sample files)
- Volume tab: pick how much each tap changes the volume (1/2/3/5%), then tap - and + ; or tap a Quick level (3, 8, 15, 25, 50%). On a device the system volume slider under the buttons moves with it, and the level stays when you go back to your music or video.
- Brightness tab: - and + in the same small steps, a slider, and a "Lowest brightness" button (UIScreen.brightness).
- Darker tab: step-by-step guide to the built-in iPhone settings that make the screen darker than the lowest brightness; "Open the Settings app" button; each step can be ticked as done.

3. External services
None. The app has no network code, no analytics, no ads, no payments, no AI services and no account. Settings are stored on the device only (UserDefaults). Privacy policy: https://mes.fm/privacy-policy#dim-volume

4. Regional differences
None. The app works the same in every region.

5. Regulated industries / third-party material
Not applicable.
