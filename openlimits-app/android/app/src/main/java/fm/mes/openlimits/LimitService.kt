package fm.mes.openlimits

import android.accessibilityservice.AccessibilityService
import android.content.Intent
import android.os.Handler
import android.os.Looper
import android.view.accessibility.AccessibilityEvent
import android.widget.Toast

/**
 * Watches which app is on screen (window changes only, never the content) and, when an app with a limit
 * comes to the front, shows the pause screen or the locked screen.
 */
class LimitService : AccessibilityService() {
    private var current: String? = null
    private var launchable: Set<String> = emptySet()
    private var homes: Set<String> = emptySet()
    private var listedAt = 0L
    private val main = Handler(Looper.getMainLooper())

    override fun onServiceConnected() {
        super.onServiceConnected()
        instance = this
        refreshLists()
    }

    override fun onDestroy() {
        if (instance === this) instance = null
        super.onDestroy()
    }

    override fun onInterrupt() {}

    private fun refreshLists() {
        launchable = Apps.launchable(this).map { it.pkg }.toSet()
        val home = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME)
        homes = packageManager.queryIntentActivities(home, 0).map { it.activityInfo.packageName }.toSet()
        listedAt = System.currentTimeMillis()
    }

    override fun onAccessibilityEvent(e: AccessibilityEvent?) {
        if (e == null || e.eventType != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) return
        val pkg = e.packageName?.toString() ?: return
        if (pkg == packageName) return // our own pause screen / app
        val now = System.currentTimeMillis()
        if (now - listedAt > 10 * 60_000L) refreshLists()
        // Only real app switches count: keyboards, system dialogs and pop-ups are not apps.
        if (pkg !in launchable && pkg !in homes && Store.get(this).apps.none { it.pkg == pkg }) return
        if (pkg == current) return
        val prev = current
        current = pkg
        if (prev != null) leftAt[prev] = now
        onEnter(pkg, now)
    }

    private fun onEnter(pkg: String, now: Long) {
        val s = Store.get(this)
        val rule = s.apps.firstOrNull { it.pkg == pkg } ?: return
        // The gate's "Open" lets the app through once.
        if ((allowUntil.remove(pkg) ?: 0L) >= now) return
        val day = Store.today()
        when (Logic.decide(s, rule, day, Store.dayStart(), now, leftAt[pkg], openedAt[pkg])) {
            Gate.ALLOW -> {}
            Gate.PAUSE -> if (Logic.silent(s, day, rule)) {
                countOpen(pkg, null, false)
                val left = Logic.left(Store.get(this), day, rule)
                if (left <= 1) main.post { Toast.makeText(this, if (left == 1) "1 open of ${rule.label} left today" else "That was your last open of ${rule.label} today", Toast.LENGTH_LONG).show() }
            } else showGate(pkg)
            Gate.LOCKED -> showGate(pkg)
        }
    }

    private fun showGate(pkg: String) {
        // Forget that the app is on screen: if it comes back without the gate's "Open" (e.g. from Recents), gate it again.
        current = null
        val i = Intent(this, GateActivity::class.java)
            .putExtra(GateActivity.EXTRA_PKG, pkg)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK or Intent.FLAG_ACTIVITY_NO_ANIMATION)
        startActivity(i)
    }

    companion object {
        @Volatile var instance: LimitService? = null
        /** pkg -> when the person last left it. */
        val leftAt = mutableMapOf<String, Long>()
        /** pkg -> last counted open. */
        val openedAt = mutableMapOf<String, Long>()
        /** pkg -> the gate just let it through until this time. */
        val allowUntil = mutableMapOf<String, Long>()

        fun countOpen(ctx: android.content.Context, pkg: String, reason: String?, extra: Boolean) {
            val now = System.currentTimeMillis()
            Store.update(ctx) { Logic.addOpen(it, Store.today(), pkg, reason, extra) }
            openedAt[pkg] = now
            leftAt.remove(pkg)
        }

        /** The gate opened the app: don't gate it again while it comes to the front. */
        fun letThrough(pkg: String) {
            allowUntil[pkg] = System.currentTimeMillis() + 8_000L
        }

        /** The person said "Not now": the app counts as left now. */
        fun dismissed(pkg: String) {
            val svc = instance
            if (svc?.current == pkg) svc.current = null
            openedAt.remove(pkg)
        }
    }

    private fun countOpen(pkg: String, reason: String?, extra: Boolean) = Companion.countOpen(this, pkg, reason, extra)
}
