# App Review notes (paste into App Store Connect > App Review Information > Notes)

MES Audio is a free voice recorder and audio editor by Math Easy Solutions (mes.fm). No account, no ads, no purchases, no sign-in.

Who it is for: anyone who records their voice (students, teachers, podcasters, video makers) and wants to remove background noise.

How to use it:
1. Tap Record and allow the microphone. Speak, then tap Stop. (Recording continues if the screen is locked or another app is opened;
   this is why the app uses the "audio" background mode. It stops when the user taps Stop.)
2. If you cannot speak near a noise source, open the menu (top right) > "Try a noisy test clip": speech with fan noise, hiss and hum.
3. Tap "Remove noise". The AI model (DeepFilterNet 3, MIT / Apache-2.0 licence) is built into the app and runs on the device.
4. Use Original / Cleaned / Noise only to compare, drag across the waveform and tap "Keep selection" or "Delete selection" to trim.
5. Tap "Share" (share sheet) or "Save to Files" (Files save dialog).
6. "Full editor" shows the multi-track editor with effects.

External services: none needed. The editor, model and encoders are bundled. Only if a user opens an unusual video format (AVI, MKV...)
the app downloads a free converter (ffmpeg, from cdn.jsdelivr.net). Links in the menu open mes.fm pages in the browser.

Microphone: used only while recording. Audio never leaves the device unless the user shares or saves a file.
No regional differences.
