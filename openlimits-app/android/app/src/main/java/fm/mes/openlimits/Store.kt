package fm.mes.openlimits

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.drawable.Drawable
import android.provider.Settings as AndroidSettings
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import java.time.LocalDate
import java.time.ZoneId

/** The saved state (one JSON string in SharedPreferences), shared by the app, the gate and the service. */
object Store {
    private const val PREFS = "ol"
    private const val KEY = "state"
    private val flow = MutableStateFlow(State())
    private var loaded = false

    fun state(ctx: Context): StateFlow<State> { load(ctx); return flow }
    fun get(ctx: Context): State { load(ctx); return flow.value }

    @Synchronized
    private fun load(ctx: Context) {
        if (loaded) return
        val s = Logic.fromJson(ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, null))
        flow.value = if (s.since.isEmpty()) s.copy(since = today()) else s
        loaded = true
    }

    @Synchronized
    fun update(ctx: Context, f: (State) -> State) {
        load(ctx)
        var next = f(flow.value)
        val st = Logic.streak(next, LocalDate.now())
        if (st > next.bestStreak) next = next.copy(bestStreak = st)
        flow.value = next
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY, Logic.toJson(next)).apply()
    }

    /** Called by the service when another process (none today) might have written: re-read from disk. */
    @Synchronized
    fun reload(ctx: Context) { loaded = false; load(ctx) }

    fun today(): String = LocalDate.now().toString()
    fun dayStart(): Long = LocalDate.now().atStartOfDay(ZoneId.systemDefault()).toInstant().toEpochMilli()
}

/** One app you can put a limit on. */
data class Launchable(val pkg: String, val label: String)

object Apps {
    /** Apps with a launcher icon (what the person thinks of as "apps"), sorted by name, without this app. */
    fun launchable(ctx: Context): List<Launchable> {
        val pm = ctx.packageManager
        val i = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
        return pm.queryIntentActivities(i, 0)
            .map { Launchable(it.activityInfo.packageName, it.loadLabel(pm).toString()) }
            .filter { it.pkg != ctx.packageName }
            .distinctBy { it.pkg }
            .sortedBy { it.label.lowercase() }
    }

    fun icon(ctx: Context, pkg: String): Drawable? = try { ctx.packageManager.getApplicationIcon(pkg) } catch (e: PackageManager.NameNotFoundException) { null }

    fun label(ctx: Context, pkg: String): String = try {
        val pm = ctx.packageManager
        pm.getApplicationLabel(pm.getApplicationInfo(pkg, 0)).toString()
    } catch (e: Exception) { pkg }

    /** Is our accessibility service switched on? */
    fun serviceOn(ctx: Context): Boolean {
        val list = AndroidSettings.Secure.getString(ctx.contentResolver, AndroidSettings.Secure.ENABLED_ACCESSIBILITY_SERVICES) ?: return false
        val me = "${ctx.packageName}/${LimitService::class.java.name}"
        val short = "${ctx.packageName}/.${LimitService::class.java.simpleName}"
        return list.split(':').any { it.equals(me, true) || it.equals(short, true) }
    }

    /** Popular apps people limit, shown first in the picker when installed. */
    val POPULAR = listOf(
        "com.instagram.android", "com.zhiliaoapp.musically", "com.ss.android.ugc.trill", "com.google.android.youtube",
        "com.facebook.katana", "com.twitter.android", "com.reddit.frontpage", "com.snapchat.android",
        "com.pinterest", "com.netflix.mediaclient", "tv.twitch.android.app", "com.discord", "com.whatsapp",
        "org.telegram.messenger", "com.facebook.orca", "com.linkedin.android", "com.tumblr", "com.roblox.client",
    )
}
