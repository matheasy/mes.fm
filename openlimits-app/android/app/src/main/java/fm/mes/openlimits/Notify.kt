package fm.mes.openlimits

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Typeface
import android.graphics.drawable.Icon
import android.os.Build
import android.provider.Settings as AndroidSettings

/**
 * Notifications:
 *  - after each counted open: "Instagram: 3/8 opens used" (quiet, disappears after a few seconds),
 *    or "WARNING: 3 opens left of Instagram" (pops up) once the warning number is reached;
 *  - the status-bar counter: an always-there notification whose status-bar icon is the number of opens left
 *    (the app with the fewest left), with every app's "3/8" in the notification shade.
 * All of it can be switched off in the app's Settings (and per channel in Android's notification settings).
 */
object Notify {
    private const val CH_OPEN = "opens"
    private const val CH_WARN = "warnings"
    private const val CH_BAR = "counter"
    private const val BAR_ID = 1
    private const val OPEN_BASE = 100

    fun channels(ctx: Context) {
        val nm = ctx.getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(NotificationChannel(CH_OPEN, "Each open", NotificationManager.IMPORTANCE_LOW).apply {
            description = "A quiet note each time you open an app with a limit: 3/8 opens used"
            setShowBadge(false)
        })
        nm.createNotificationChannel(NotificationChannel(CH_WARN, "Few opens left", NotificationManager.IMPORTANCE_HIGH).apply {
            description = "Pops up when only a few opens of an app are left, or the last one is used"
        })
        nm.createNotificationChannel(NotificationChannel(CH_BAR, "Status bar counter", NotificationManager.IMPORTANCE_LOW).apply {
            description = "Shows how many opens are left in the status bar"
            setShowBadge(false)
            setSound(null, null)
        })
    }

    fun allowed(ctx: Context): Boolean = ctx.getSystemService(NotificationManager::class.java).areNotificationsEnabled()

    private fun openAppPi(ctx: Context): PendingIntent =
        PendingIntent.getActivity(ctx, 0, Intent(ctx, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)

    /** Called after an open was counted. */
    fun afterOpen(ctx: Context, pkg: String, extra: Boolean) {
        val s = Store.get(ctx)
        val rule = s.apps.firstOrNull { it.pkg == pkg } ?: return
        val day = Store.today()
        if (s.settings.notify || extra) {
            val (title, body, warn) = Logic.openMessage(s, day, rule, extra)
            if (allowed(ctx)) try {
                channels(ctx)
                val b = Notification.Builder(ctx, if (warn) CH_WARN else CH_OPEN)
                    .setSmallIcon(numberIcon(Logic.left(s, day, rule)))
                    .setContentTitle(title).setContentText(body)
                    .setContentIntent(openAppPi(ctx)).setAutoCancel(true)
                    .setColor(0xFF4338CA.toInt()).setCategory(Notification.CATEGORY_STATUS)
                    .setTimeoutAfter(if (warn) 30_000L else 8_000L)
                ctx.getSystemService(NotificationManager::class.java).notify(OPEN_BASE + (pkg.hashCode() and 0xFFF), b.build())
            } catch (_: Exception) {}
        }
        updateBar(ctx)
    }

    /** Puts the status-bar counter up, refreshes it, or takes it away (setting off / no limits). */
    fun updateBar(ctx: Context) {
        val nm = ctx.getSystemService(NotificationManager::class.java)
        val s = Store.get(ctx)
        val day = Store.today()
        val sum = if (s.settings.bar) Logic.barSummary(s, day) else null
        if (sum == null || !allowed(ctx)) { nm.cancel(BAR_ID); return }
        try {
            channels(ctx)
            val left = Logic.fewestLeft(s, day) ?: 0
            val b = Notification.Builder(ctx, CH_BAR)
                .setSmallIcon(numberIcon(left))
                .setContentTitle(sum.first).setContentText(sum.second)
                .setStyle(Notification.BigTextStyle().bigText(sum.second.replace(" · ", "\n")))
                .setContentIntent(openAppPi(ctx)).setOngoing(true).setOnlyAlertOnce(true).setShowWhen(false)
                .setColor(0xFF4338CA.toInt()).setCategory(Notification.CATEGORY_STATUS)
                .setVisibility(Notification.VISIBILITY_PUBLIC)
            nm.notify(BAR_ID, b.build())
        } catch (_: Exception) {}
    }

    /** A status-bar icon that is just a number (Android draws it white like every status-bar icon). */
    fun numberIcon(n: Int): Icon {
        val size = 96
        val bmp = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
        val c = Canvas(bmp)
        val text = if (n > 99) "99" else n.toString()
        val p = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = android.graphics.Color.WHITE
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            textAlign = Paint.Align.CENTER
            textSize = if (text.length == 1) 92f else 72f
        }
        val y = size / 2f - (p.descent() + p.ascent()) / 2f
        c.drawText(text, size / 2f, y, p)
        return Icon.createWithBitmap(bmp)
    }

    /** Android's notification settings for this app (to turn a kind of notification off or make it louder). */
    fun openSettings(ctx: Context) {
        val i = Intent(AndroidSettings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(AndroidSettings.EXTRA_APP_PACKAGE, ctx.packageName)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        try { ctx.startActivity(i) } catch (_: Exception) {}
    }

    val needsPermission: Boolean get() = Build.VERSION.SDK_INT >= 33
}
