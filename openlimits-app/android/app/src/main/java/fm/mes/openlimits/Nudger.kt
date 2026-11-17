package fm.mes.openlimits

import android.content.Context
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.media.MediaRecorder
import android.os.Build
import android.os.Bundle
import android.speech.tts.TextToSpeech
import java.io.File

/**
 * Nudge sounds: the phone's text-to-speech voice reading the message, or a recording the person made in the app.
 * Played when the pause / locked screen shows. Volume is a share of the media volume.
 * Recordings are files in the app's own storage: nudge/default.m4a and nudge/<package>.m4a. Nothing leaves the phone.
 */
object Nudger {
    private var tts: TextToSpeech? = null
    private var ttsReady = false
    private var pending: Pair<String, Float>? = null
    private var player: MediaPlayer? = null
    private var recorder: MediaRecorder? = null
    private const val MAX_REC_MS = 15_000

    private val attrs: AudioAttributes = AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build()

    /** Recording file for one app (pkg) or the default (null). */
    fun recFile(ctx: Context, pkg: String?): File {
        val dir = File(ctx.filesDir, "nudge").apply { mkdirs() }
        return File(dir, if (pkg == null) "default.m4a" else "$pkg.m4a")
    }

    fun hasRec(ctx: Context, pkg: String?): Boolean = recFile(ctx, pkg).let { it.exists() && it.length() > 0 }

    /** Play whatever nudge sound [rule] has, for the gate that just showed. */
    fun forGate(ctx: Context, pkg: String) {
        val s = Store.get(ctx)
        val rule = s.apps.firstOrNull { it.pkg == pkg } ?: return
        val day = Store.today()
        val locked = Logic.left(s, day, rule) <= 0
        val snd = Logic.nudgeSound(s, rule, locked)
        val vol = s.settings.vol / 100f
        if (snd == Sound.OFF || vol <= 0f) return
        val text = Logic.nudgeText(s, day, rule)
        if (snd == Sound.REC) {
            // The app's own recording, else the default recording, else read the text.
            val f = listOf(recFile(ctx, if (rule.sound == Sound.REC) rule.pkg else null), recFile(ctx, null)).firstOrNull { it.exists() && it.length() > 0 }
            if (f != null) { playFile(ctx, f, vol); return }
        }
        if (text != null) speak(ctx, text, vol)
    }

    fun speak(ctx: Context, text: String, vol: Float) {
        stop()
        val t = tts
        if (t != null && ttsReady) { say(t, text, vol); return }
        pending = text to vol
        if (t == null) tts = TextToSpeech(ctx.applicationContext) { status ->
            ttsReady = status == TextToSpeech.SUCCESS
            val p = pending; pending = null
            val tt = tts
            if (ttsReady && p != null && tt != null) say(tt, p.first, p.second)
        }
    }

    private fun say(t: TextToSpeech, text: String, vol: Float) {
        t.setAudioAttributes(attrs)
        t.setOnUtteranceProgressListener(object : android.speech.tts.UtteranceProgressListener() {
            override fun onStart(id: String?) { android.util.Log.d("OLNudge", "speak start") }
            override fun onDone(id: String?) { android.util.Log.d("OLNudge", "speak done") }
            @Deprecated("") override fun onError(id: String?) { android.util.Log.d("OLNudge", "speak error") }
            override fun onError(id: String?, code: Int) { android.util.Log.d("OLNudge", "speak error $code") }
        })
        val b = Bundle().apply { putFloat(TextToSpeech.Engine.KEY_PARAM_VOLUME, vol.coerceIn(0f, 1f)) }
        t.speak(text, TextToSpeech.QUEUE_FLUSH, b, "nudge")
    }

    fun playFile(ctx: Context, f: File, vol: Float) {
        stop()
        try {
            player = MediaPlayer().apply {
                setAudioAttributes(attrs)
                setDataSource(f.absolutePath)
                setVolume(vol, vol)
                setOnCompletionListener { it.release(); if (player === it) player = null }
                prepare()
                start()
                android.util.Log.d("OLNudge", "play ${f.name} ${duration}ms")
            }
        } catch (_: Exception) { player = null }
    }

    fun stop() {
        try { player?.stop() } catch (_: Exception) {}
        player?.release(); player = null
        try { tts?.stop() } catch (_: Exception) {}
    }

    // ---- recording (needs the RECORD_AUDIO permission, asked in the app) ----
    val recording: Boolean get() = recorder != null

    /** Start recording into [f] (stops by itself after 15 seconds; [onAutoStop] is called then). */
    fun startRec(ctx: Context, f: File, onAutoStop: () -> Unit): Boolean {
        stop(); stopRec()
        val tmp = File(f.parentFile, f.name + ".part")
        return try {
            val r = if (Build.VERSION.SDK_INT >= 31) MediaRecorder(ctx) else @Suppress("DEPRECATION") MediaRecorder()
            r.setAudioSource(MediaRecorder.AudioSource.MIC)
            r.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
            r.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
            r.setAudioEncodingBitRate(96_000)
            r.setAudioSamplingRate(44_100)
            r.setMaxDuration(MAX_REC_MS)
            r.setOutputFile(tmp.absolutePath)
            r.setOnInfoListener { _, what, _ -> if (what == MediaRecorder.MEDIA_RECORDER_INFO_MAX_DURATION_REACHED) { stopRec(); onAutoStop() } }
            r.prepare(); r.start()
            recorder = r; recTarget = f; recTmp = tmp
            true
        } catch (_: Exception) { recorder = null; tmp.delete(); false }
    }

    private var recTarget: File? = null
    private var recTmp: File? = null

    /** Stop recording; the new file replaces the old one only if something was recorded. */
    fun stopRec() {
        val r = recorder ?: return
        recorder = null
        val ok = try { r.stop(); true } catch (_: Exception) { false }
        r.release()
        val tmp = recTmp; val target = recTarget
        if (tmp != null && target != null) { if (ok && tmp.length() > 0) tmp.renameTo(target) else tmp.delete() }
        recTmp = null; recTarget = null
    }
}
