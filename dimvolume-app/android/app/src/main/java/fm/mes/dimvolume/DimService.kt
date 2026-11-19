package fm.mes.dimvolume

import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ServiceInfo
import android.graphics.PixelFormat
import android.media.AudioManager
import android.media.audiofx.AudioEffect
import android.media.audiofx.DynamicsProcessing
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.provider.Settings
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.RemoteViews

/**
 * Foreground service: keeps the dim overlay on screen and the fine-volume effect alive,
 * and shows the notification with the -/+ buttons.
 */
class DimService : Service() {
    companion object {
        const val CH = "dv"
        const val ID = 7
        const val A_APPLY = "fm.mes.dimvolume.APPLY"
        const val A_DIM_UP = "fm.mes.dimvolume.DIM_UP"
        const val A_DIM_DOWN = "fm.mes.dimvolume.DIM_DOWN"
        const val A_DIM_TOGGLE = "fm.mes.dimvolume.DIM_TOGGLE"
        const val A_VOL_UP = "fm.mes.dimvolume.VOL_UP"
        const val A_VOL_DOWN = "fm.mes.dimvolume.VOL_DOWN"
        const val A_STOP = "fm.mes.dimvolume.STOP"

        fun send(c: Context, action: String = A_APPLY) {
            val i = Intent(c, DimService::class.java).setAction(action)
            if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(i) else c.startService(i)
        }
        fun stop(c: Context) { c.stopService(Intent(c, DimService::class.java)) }
        fun canOverlay(c: Context) = Settings.canDrawOverlays(c)
    }

    private lateinit var wm: WindowManager
    private lateinit var am: AudioManager
    private var overlay: View? = null
    private val effects = HashMap<Int, DynamicsProcessing>()   // audio session -> effect (0 = whole output)
    private var lastAtten = 0f
    private var lastIndex = -1
    private val main = Handler(Looper.getMainLooper())

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        Store.load(this)
        wm = getSystemService(WINDOW_SERVICE) as WindowManager
        am = getSystemService(AUDIO_SERVICE) as AudioManager
        val f = IntentFilter().apply {
            addAction("android.media.VOLUME_CHANGED_ACTION")
            addAction(AudioEffect.ACTION_OPEN_AUDIO_EFFECT_CONTROL_SESSION)
            addAction(AudioEffect.ACTION_CLOSE_AUDIO_EFFECT_CONTROL_SESSION)
        }
        if (Build.VERSION.SDK_INT >= 33) registerReceiver(rx, f, RECEIVER_EXPORTED) else registerReceiver(rx, f)
    }

    /** Volume keys / other apps changed the system step: follow it (drop our in-between turn-down). */
    private val rx = object : BroadcastReceiver() {
        override fun onReceive(c: Context, i: Intent) {
            when (i.action) {
                "android.media.VOLUME_CHANGED_ACTION" -> {
                    if (i.getIntExtra("android.media.EXTRA_VOLUME_STREAM_TYPE", -1) != AudioManager.STREAM_MUSIC) return
                    val now = am.getStreamVolume(AudioManager.STREAM_MUSIC)
                    if (now != lastIndex) {
                        lastIndex = now
                        Store.fine.intValue = Model.fromIndex(now, Store.sub.intValue)
                        Store.save(c); setGain(0f); status(); notifyNow()
                    }
                }
                AudioEffect.ACTION_OPEN_AUDIO_EFFECT_CONTROL_SESSION -> {
                    val s = i.getIntExtra(AudioEffect.EXTRA_AUDIO_SESSION, 0)
                    if (s != 0 && Store.volOn.value) attach(s)
                }
                AudioEffect.ACTION_CLOSE_AUDIO_EFFECT_CONTROL_SESSION -> {
                    val s = i.getIntExtra(AudioEffect.EXTRA_AUDIO_SESSION, 0)
                    if (s != 0) effects.remove(s)?.release()
                }
            }
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startFg()
        when (intent?.action) {
            A_DIM_UP -> { Store.dimOn.value = true; Store.dim.intValue = (Store.dim.intValue + Store.stepPct.intValue).coerceAtMost(Model.MAX_DIM) }
            A_DIM_DOWN -> Store.dim.intValue = (Store.dim.intValue - Store.stepPct.intValue).coerceAtLeast(0)
            A_DIM_TOGGLE -> Store.dimOn.value = !Store.dimOn.value
            A_VOL_UP -> stepVol(+1)
            A_VOL_DOWN -> stepVol(-1)
            A_STOP -> { Store.dimOn.value = false; Store.volOn.value = false }
        }
        Store.save(this)
        applyDim()
        applyVol()
        TileDim.refresh(this)
        if (!Store.dimOn.value && !Store.volOn.value) { stopSelf(); return START_NOT_STICKY }
        notifyNow()
        return START_STICKY
    }

    override fun onDestroy() {
        unregisterReceiver(rx)
        removeOverlay()
        effects.values.forEach { runCatching { it.release() } }
        effects.clear()
        super.onDestroy()
    }

    // ---------- Dim ----------
    @SuppressLint("ClickableViewAccessibility")
    private fun applyDim() {
        if (!Store.dimOn.value || !canOverlay(this)) { removeOverlay(); return }
        val (rgb, a) = Model.overlay(Store.dim.intValue, Store.tintIdx.intValue, Store.tint.intValue)
        val v = overlay ?: View(this).also { overlay = it }
        v.setBackgroundColor(0xFF000000.toInt() or rgb)
        val p = (v.layoutParams as? WindowManager.LayoutParams) ?: params()
        p.alpha = a
        // The lowest backlight the phone allows, on top of the overlay.
        p.screenBrightness = if (Store.dimBrightness.value) 0.0f else WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE
        if (v.parent == null) runCatching { wm.addView(v, p) } else runCatching { wm.updateViewLayout(v, p) }
    }

    private fun params(): WindowManager.LayoutParams {
        val big = 4000   // taller than any screen, so the bars and cut-outs are covered too
        return WindowManager.LayoutParams(
            WindowManager.LayoutParams.MATCH_PARENT, big,
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE or WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
            PixelFormat.TRANSLUCENT,
        ).apply {
            gravity = Gravity.TOP or Gravity.START
            y = -400
            if (Build.VERSION.SDK_INT >= 28) layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
            if (Build.VERSION.SDK_INT >= 31) fitInsetsTypes = 0
        }
    }

    private fun removeOverlay() { overlay?.let { if (it.parent != null) runCatching { wm.removeView(it) } }; overlay = null }

    // ---------- Fine volume ----------
    private fun maxIndex() = am.getStreamMaxVolume(AudioManager.STREAM_MUSIC)

    private fun dbOf(i: Int): Float =
        if (Build.VERSION.SDK_INT >= 28) runCatching {
            am.getStreamVolumeDb(AudioManager.STREAM_MUSIC, i, android.media.AudioDeviceInfo.TYPE_BUILTIN_SPEAKER)
        }.getOrDefault(Model.defaultDb(i, maxIndex())).let { if (it.isNaN() || it < -90f) Model.defaultDb(i, maxIndex()) else it }
        else Model.defaultDb(i, maxIndex())

    private fun stepVol(d: Int) {
        Store.volOn.value = true
        val total = maxIndex() * Store.sub.intValue
        val cur = if (Store.fine.intValue < 0) Model.fromIndex(am.getStreamVolume(AudioManager.STREAM_MUSIC), Store.sub.intValue) else Store.fine.intValue
        Store.fine.intValue = (cur + d).coerceIn(0, total)
    }

    private fun applyVol() {
        if (!Store.volOn.value) { setGain(0f); effects.values.forEach { runCatching { it.release() } }; effects.clear(); status(); return }
        if (Store.fine.intValue < 0) Store.fine.intValue = Model.fromIndex(am.getStreamVolume(AudioManager.STREAM_MUSIC), Store.sub.intValue)
        val plan = Model.plan(Store.fine.intValue, Store.sub.intValue, maxIndex(), ::dbOf)
        if (Build.VERSION.SDK_INT >= 28 && effects[0] == null) attach(0)
        lastIndex = plan.index
        if (am.getStreamVolume(AudioManager.STREAM_MUSIC) != plan.index)
            runCatching { am.setStreamVolume(AudioManager.STREAM_MUSIC, plan.index, 0) }
        setGain(plan.attenDb)
        status(plan)
    }

    private fun attach(session: Int) {
        if (Build.VERSION.SDK_INT < 28 || effects.containsKey(session)) return
        try {
            val cfg = DynamicsProcessing.Config.Builder(DynamicsProcessing.VARIANT_FAVOR_FREQUENCY_RESOLUTION, 2,
                false, 0, false, 0, false, 0, false).build()
            val dp = DynamicsProcessing(Int.MAX_VALUE, session, cfg)
            dp.setInputGainAllChannelsTo(lastAtten)
            dp.enabled = true
            effects[session] = dp
            if (session == 0) Store.effectOk.value = true
        } catch (t: Throwable) {
            if (session == 0) Store.effectOk.value = false
        }
    }

    private fun setGain(db: Float) {
        lastAtten = db
        effects.values.forEach { runCatching { it.setInputGainAllChannelsTo(db) } }
    }

    private fun status(plan: Model.Plan? = null) {
        val m = maxIndex()
        Store.volStatus.value = if (!Store.volOn.value) "" else {
            val p = plan ?: Model.plan(Store.fine.intValue, Store.sub.intValue, m, ::dbOf)
            val off = if (p.attenDb < 0f) ", turned down ${-p.attenDb} dB" else ""
            "System step ${p.index} of $m$off"
        }
    }

    // ---------- Notification ----------
    private fun startFg() {
        val nm = getSystemService(NotificationManager::class.java)
        if (Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel(CH) == null)
            nm.createNotificationChannel(NotificationChannel(CH, getString(R.string.channel), NotificationManager.IMPORTANCE_LOW).apply {
                setShowBadge(false); description = getString(R.string.channel_desc)
            })
        val n = build()
        if (Build.VERSION.SDK_INT >= 34) startForeground(ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
        else startForeground(ID, n)
    }

    private fun notifyNow() { getSystemService(NotificationManager::class.java).notify(ID, build()) }

    private fun pi(action: String, code: Int) = PendingIntent.getService(this, code,
        Intent(this, DimService::class.java).setAction(action), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)

    private fun build(): Notification {
        val rv = RemoteViews(packageName, R.layout.notif)
        val dimTxt = if (Store.dimOn.value) "Dim ${Store.dim.intValue}%" else "Dim off"
        rv.setTextViewText(R.id.n_dim, dimTxt)
        val m = am.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
        val fine = if (Store.fine.intValue < 0) Model.fromIndex(am.getStreamVolume(AudioManager.STREAM_MUSIC), Store.sub.intValue) else Store.fine.intValue
        rv.setTextViewText(R.id.n_vol, if (Store.volOn.value) "Vol ${Model.label(fine, Store.sub.intValue, m)}" else "Vol")
        rv.setOnClickPendingIntent(R.id.n_dim, pi(A_DIM_TOGGLE, 1))
        rv.setOnClickPendingIntent(R.id.n_dim_down, pi(A_DIM_DOWN, 2))
        rv.setOnClickPendingIntent(R.id.n_dim_up, pi(A_DIM_UP, 3))
        rv.setOnClickPendingIntent(R.id.n_vol_down, pi(A_VOL_DOWN, 4))
        rv.setOnClickPendingIntent(R.id.n_vol_up, pi(A_VOL_UP, 5))
        rv.setOnClickPendingIntent(R.id.n_stop, pi(A_STOP, 6))
        val open = PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE)
        val b = if (Build.VERSION.SDK_INT >= 26) Notification.Builder(this, CH) else @Suppress("DEPRECATION") Notification.Builder(this)
        return b.setSmallIcon(R.drawable.ic_stat)
            .setContentTitle(getString(R.string.app_name))
            .setContentText("$dimTxt · ${(Store.volStatus.value).ifEmpty { "fine volume off" }}")
            .setStyle(Notification.DecoratedCustomViewStyle())
            .setCustomContentView(rv)
            .setCustomBigContentView(rv)
            .setContentIntent(open)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setCategory(Notification.CATEGORY_SERVICE)
            .build()
    }

}
