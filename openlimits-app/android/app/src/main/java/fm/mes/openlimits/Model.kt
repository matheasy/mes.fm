package fm.mes.openlimits

import org.json.JSONObject
import java.time.LocalDate

/** One app with a daily open limit. */
data class AppRule(
    val pkg: String,
    val label: String,
    val limit: Int,
    val on: Boolean = true,
)

/** Opens of one app on one day. */
data class DayApp(
    val opens: Int = 0,
    /** Emergency opens after the limit was used up. */
    val extra: Int = 0,
    /** Why it was opened: reason id -> count. */
    val reasons: Map<String, Int> = emptyMap(),
)

data class Settings(
    /** Seconds to wait on the pause screen before "Open" can be pressed (0 = no wait). */
    val pause: Int = 5,
    /** Coming back to an app within this many minutes is the same open. */
    val grace: Int = 3,
    /** Ask "why are you opening it?" on the pause screen. */
    val ask: Boolean = true,
    /** Strict mode: no emergency opens, loosening a limit needs a wait. */
    val strict: Boolean = false,
)

data class State(
    val apps: List<AppRule> = emptyList(),
    val settings: Settings = Settings(),
    /** "2026-11-07" -> pkg -> opens that day. */
    val days: Map<String, Map<String, DayApp>> = emptyMap(),
    /** First day the app was used (streaks never count days before it). */
    val since: String = "",
    val bestStreak: Int = 0,
    /** The privacy notice for the accessibility service was agreed to. */
    val agreed: Boolean = false,
)

val REASONS = listOf(
    "reply" to "Reply to someone",
    "post" to "Post something",
    "look" to "Look something up",
    "bored" to "Just bored",
)

/** What the service should do when a limited app comes to the front. */
enum class Gate { ALLOW, PAUSE, LOCKED }

object Logic {
    fun dayKey(d: LocalDate): String = d.toString()

    fun opens(s: State, day: String, pkg: String): DayApp = s.days[day]?.get(pkg) ?: DayApp()

    fun left(s: State, day: String, rule: AppRule): Int = (rule.limit - opens(s, day, rule.pkg).opens).coerceAtLeast(0)

    /**
     * Decide what happens when [rule]'s app comes to the front at [now] (ms).
     * [leftAt] = when the person last left this app (null = not this session), [openedAt] = last counted open.
     * Coming back within the grace minutes after a counted open today is the same open.
     */
    fun decide(s: State, rule: AppRule, day: String, dayStart: Long, now: Long, leftAt: Long?, openedAt: Long?): Gate {
        if (!rule.on) return Gate.ALLOW
        if (openedAt != null && openedAt >= dayStart && leftAt != null && now - leftAt <= s.settings.grace * 60_000L) return Gate.ALLOW
        return if (left(s, day, rule) > 0) Gate.PAUSE else Gate.LOCKED
    }

    /** Can the pause screen be skipped (no wait, no question, and not the last open)? Then the open is counted silently. */
    fun silent(s: State, day: String, rule: AppRule): Boolean =
        s.settings.pause == 0 && !s.settings.ask && left(s, day, rule) > 1

    fun addOpen(s: State, day: String, pkg: String, reason: String?, extra: Boolean): State {
        val today = s.days[day].orEmpty()
        val cur = today[pkg] ?: DayApp()
        val reasons = if (reason == null) cur.reasons else cur.reasons + (reason to ((cur.reasons[reason] ?: 0) + 1))
        val next = if (extra) cur.copy(extra = cur.extra + 1, reasons = reasons) else cur.copy(opens = cur.opens + 1, reasons = reasons)
        val days = s.days + (day to (today + (pkg to next)))
        return s.copy(days = prune(days, day))
    }

    /** Keep 120 days of history. */
    fun prune(days: Map<String, Map<String, DayApp>>, today: String): Map<String, Map<String, DayApp>> {
        val cut = LocalDate.parse(today).minusDays(120).toString()
        return days.filterKeys { it >= cut }
    }

    /** A day is kept when no app went over its limit and no emergency open was used. */
    fun dayKept(s: State, day: String): Boolean {
        val d = s.days[day] ?: return true
        return s.apps.none { r -> val o = d[r.pkg] ?: return@none false; o.extra > 0 || o.opens > r.limit }
    }

    /** Days in a row kept, ending yesterday (today counts too once it is kept so far). */
    fun streak(s: State, today: LocalDate): Int {
        if (s.apps.isEmpty() || s.since.isEmpty()) return 0
        val since = LocalDate.parse(s.since)
        var n = 0
        var d = today.minusDays(1)
        while (!d.isBefore(since) && dayKept(s, dayKey(d))) { n++; d = d.minusDays(1) }
        if (dayKept(s, dayKey(today))) n++
        return n
    }

    /** Opens per day for the last [n] days (oldest first), all apps or one. */
    fun history(s: State, today: LocalDate, n: Int, pkg: String? = null): List<Pair<LocalDate, Int>> =
        (n - 1 downTo 0).map { back ->
            val d = today.minusDays(back.toLong())
            val m = s.days[dayKey(d)].orEmpty()
            d to (if (pkg == null) m.values.sumOf { it.opens + it.extra } else (m[pkg]?.let { it.opens + it.extra } ?: 0))
        }

    fun reasonTotals(s: State, today: LocalDate, n: Int): Map<String, Int> {
        val out = mutableMapOf<String, Int>()
        for (back in 0 until n) s.days[dayKey(today.minusDays(back.toLong()))]?.values?.forEach { a ->
            a.reasons.forEach { (k, v) -> out[k] = (out[k] ?: 0) + v }
        }
        return out
    }

    /** Is this change looser than before (needs the strict-mode wait)? */
    fun loosens(old: AppRule?, new: AppRule?): Boolean = when {
        old == null -> false
        new == null -> old.on
        else -> old.on && (!new.on || new.limit > old.limit)
    }

    // ---- JSON ----
    fun toJson(s: State): String {
        val o = JSONObject()
        o.put("v", 1)
        o.put("apps", org.json.JSONArray().apply {
            s.apps.forEach { put(JSONObject().put("p", it.pkg).put("l", it.label).put("n", it.limit).put("on", it.on)) }
        })
        o.put("set", JSONObject().put("pause", s.settings.pause).put("grace", s.settings.grace)
            .put("ask", s.settings.ask).put("strict", s.settings.strict))
        val days = JSONObject()
        s.days.forEach { (day, m) ->
            val dj = JSONObject()
            m.forEach { (pkg, a) ->
                val aj = JSONObject().put("o", a.opens)
                if (a.extra > 0) aj.put("x", a.extra)
                if (a.reasons.isNotEmpty()) aj.put("r", JSONObject(a.reasons as Map<*, *>))
                dj.put(pkg, aj)
            }
            days.put(day, dj)
        }
        o.put("days", days)
        o.put("since", s.since).put("best", s.bestStreak).put("agreed", s.agreed)
        return o.toString()
    }

    fun fromJson(text: String?): State {
        if (text.isNullOrBlank()) return State()
        return try {
            val o = JSONObject(text)
            val apps = mutableListOf<AppRule>()
            o.optJSONArray("apps")?.let { a ->
                for (i in 0 until a.length()) {
                    val j = a.getJSONObject(i)
                    apps += AppRule(j.getString("p"), j.optString("l", j.getString("p")), j.optInt("n", 5).coerceIn(1, 99), j.optBoolean("on", true))
                }
            }
            val sj = o.optJSONObject("set") ?: JSONObject()
            val settings = Settings(
                pause = sj.optInt("pause", 5).coerceIn(0, 60),
                grace = sj.optInt("grace", 3).coerceIn(0, 30),
                ask = sj.optBoolean("ask", true),
                strict = sj.optBoolean("strict", false),
            )
            val days = mutableMapOf<String, Map<String, DayApp>>()
            o.optJSONObject("days")?.let { dj ->
                dj.keys().forEach { day ->
                    val m = mutableMapOf<String, DayApp>()
                    val pj = dj.getJSONObject(day)
                    pj.keys().forEach { pkg ->
                        val aj = pj.getJSONObject(pkg)
                        val r = mutableMapOf<String, Int>()
                        aj.optJSONObject("r")?.let { rj -> rj.keys().forEach { k -> r[k] = rj.optInt(k) } }
                        m[pkg] = DayApp(aj.optInt("o"), aj.optInt("x"), r)
                    }
                    days[day] = m
                }
            }
            State(apps, settings, days, o.optString("since", ""), o.optInt("best", 0), o.optBoolean("agreed", false))
        } catch (e: Exception) {
            State()
        }
    }
}
