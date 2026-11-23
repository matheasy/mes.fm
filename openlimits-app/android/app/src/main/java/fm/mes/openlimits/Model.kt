package fm.mes.openlimits

import org.json.JSONObject
import java.time.LocalDate

/** One app with a daily open limit. */
data class AppRule(
    val pkg: String,
    val label: String,
    val limit: Int,
    val on: Boolean = true,
    /** Own nudge message for this app ("" = use the default message). */
    val msg: String = "",
    /** Sound for this app: -1 = same as the default, else Sound.OFF / SPEAK / REC. */
    val sound: Int = -1,
    /** true = [limit] opens per week (Monday to Sunday) instead of per day. */
    val weekly: Boolean = false,
)

/** Opens of one app on one day. */
data class DayApp(
    val opens: Int = 0,
    /** Emergency opens after the limit was used up. */
    val extra: Int = 0,
    /** Why it was opened: reason id -> count. */
    val reasons: Map<String, Int> = emptyMap(),
    /** Opens earned that day by solving maths problems (they raise the allowance and keep the streak). */
    val earned: Int = 0,
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
    /** Notification each time a limited app is opened ("3 of 8 opens used"). */
    val notify: Boolean = true,
    /** Warn (pop-up notification) when this many opens or fewer are left (0 = never). */
    val warnAt: Int = 3,
    /** Keep an "opens left today" counter in the status bar. */
    val bar: Boolean = true,
    /** Nudge messages on: show the message on the pause / locked screen and in the open notification. */
    val nudge: Boolean = true,
    /** The default nudge message ("" = none). {app} and {left} are filled in. */
    val msg: String = "",
    /** Default nudge sound: Sound.OFF / SPEAK / REC. */
    val sound: Int = Sound.OFF,
    /** Nudge sound volume, 0-100 (of the media volume). */
    val vol: Int = 80,
    /** Play the nudge sound only when the app is locked (else on every pause screen too). */
    val soundLockedOnly: Boolean = false,
    /** Solve to unlock: Maths.OFF / WHEN_LOCKED (solve to earn one more open) / EVERY_OPEN (solve before every open). */
    val mathMode: Int = Maths.WHEN_LOCKED,
    /** How hard the problems are, 1-5 (see Maths.LEVELS). */
    val mathLevel: Int = 2,
    /** Problems in a row for one unlock. */
    val mathCount: Int = 3,
    /** Most opens one app can earn with maths per day (0 = no limit). */
    val mathMax: Int = 3,
)

/** Solve-to-unlock maths problems. Answers are whole numbers, never negative. */
object Maths {
    const val OFF = 0
    const val WHEN_LOCKED = 1
    const val EVERY_OPEN = 2
    val MODES = listOf(OFF to "Off", WHEN_LOCKED to "When locked: earn one more open", EVERY_OPEN to "Before every open")
    val LEVELS = listOf(
        1 to "Easy: add and subtract to 20",
        2 to "Times tables",
        3 to "Two-digit numbers",
        4 to "Percents and fractions",
        5 to "Algebra: solve for x",
    )

    data class Problem(val text: String, val answer: Int)

    fun make(level: Int, r: java.util.Random): Problem {
        fun n(a: Int, b: Int) = a + r.nextInt(b - a + 1)
        return when (level.coerceIn(1, 5)) {
            1 -> { val a = n(1, 20); val b = n(1, 20); if (r.nextBoolean() || a < b) Problem("$a + $b", a + b) else Problem("$a \u2212 $b", a - b) }
            2 -> { val a = n(2, 12); val b = n(2, 12); Problem("$a \u00D7 $b", a * b) }
            3 -> when (r.nextInt(3)) {
                0 -> { val a = n(10, 99); val b = n(10, 99); Problem("$a + $b", a + b) }
                1 -> { val a = n(20, 99); val b = n(10, a); Problem("$a \u2212 $b", a - b) }
                else -> { val a = n(11, 25); val b = n(2, 9); Problem("$a \u00D7 $b", a * b) }
            }
            4 -> if (r.nextBoolean()) {
                val p = listOf(10, 20, 25, 50, 75)[r.nextInt(5)]
                val unit = 100 / gcd(p, 100)
                val base = unit * n(1, 200 / unit).coerceAtLeast(1)
                Problem("$p% of $base", p * base / 100)
            } else {
                val d = n(2, 10); val num = n(1, d - 1); val base = d * n(2, 12)
                Problem("$num/$d of $base", num * base / d)
            }
            else -> if (r.nextBoolean()) {
                val x = n(1, 12); val a = n(2, 9); val b = n(1, 30)
                Problem("${a}x + $b = ${a * x + b}", x)
            } else {
                val x = n(3, 15); val b = n(1, x - 1); val a = n(2, 6)
                Problem("$a(x \u2212 $b) = ${a * (x - b)}", x)
            }
        }
    }

    private fun gcd(a: Int, b: Int): Int = if (b == 0) a else gcd(b, a % b)

    /** Read what was typed: digits only (spaces ignored); null when it isn't a whole number. */
    fun parse(t: String): Int? = t.trim().replace(" ", "").takeIf { it.matches(Regex("\\d{1,6}")) }?.toInt()
}

/** How a nudge message sounds. */
object Sound {
    const val OFF = 0
    /** The phone's text-to-speech voice reads the message. */
    const val SPEAK = 1
    /** A recording the person made in the app. */
    const val REC = 2
}

/** Ready-made nudge messages to pick from (the person can edit them). */
val NUDGE_EXAMPLES = listOf(
    "Stop opening up {app}. Touch grass instead.",
    "Checking your portfolio won't make it go up.",
    "Is this really why you picked up your phone?",
    "Put the phone down and go for a walk.",
    "Nothing new happened since last time.",
    "Future you will thank you for closing {app}.",
    "Drink some water and stretch first.",
    "Only {left} opens left today. Spend them well.",
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

/** Longest nudge message. */
const val MSG_MAX = 160

object Logic {
    fun dayKey(d: LocalDate): String = d.toString()

    fun opens(s: State, day: String, pkg: String): DayApp = s.days[day]?.get(pkg) ?: DayApp()

    /** The days that count for [rule] on [day]: just that day, or Monday to [day] for a weekly limit. */
    fun periodDays(rule: AppRule, day: String): List<String> {
        if (!rule.weekly) return listOf(day)
        val d = LocalDate.parse(day)
        val mon = d.minusDays((d.dayOfWeek.value - 1).toLong())
        return (0..(d.dayOfWeek.value - 1)).map { dayKey(mon.plusDays(it.toLong())) }
    }
    /** Opens used in the period (the day, or the week so far). */
    fun used(s: State, day: String, rule: AppRule): Int = periodDays(rule, day).sumOf { opens(s, it, rule.pkg).opens }
    /** Opens earned with maths in the period. */
    fun earned(s: State, day: String, rule: AppRule): Int = periodDays(rule, day).sumOf { opens(s, it, rule.pkg).earned }
    /** Emergency opens in the period. */
    fun extras(s: State, day: String, rule: AppRule): Int = periodDays(rule, day).sumOf { opens(s, it, rule.pkg).extra }
    /** The period's allowance: the limit plus opens earned with maths. */
    fun allowance(s: State, day: String, rule: AppRule): Int = rule.limit + earned(s, day, rule)
    fun left(s: State, day: String, rule: AppRule): Int = (allowance(s, day, rule) - used(s, day, rule)).coerceAtLeast(0)
    /** Days left in the week, today included (7 on Monday, 1 on Sunday). */
    fun daysLeftInWeek(day: String): Int = 8 - LocalDate.parse(day).dayOfWeek.value
    /** "about 4 a day" share for a weekly limit (null for a daily one). */
    fun perDay(s: State, day: String, rule: AppRule): Int? =
        if (!rule.weekly) null else (left(s, day, rule) + daysLeftInWeek(day) - 1) / daysLeftInWeek(day)
    /** "today" / "this week". */
    fun periodWord(rule: AppRule): String = if (rule.weekly) "this week" else "today"
    /** When a locked app opens again. */
    fun unlocksAt(rule: AppRule): String = if (rule.weekly) "Monday" else "midnight"

    /** Can one more open be earned with maths for [rule] today? */
    fun canEarn(s: State, day: String, rule: AppRule): Boolean =
        s.settings.mathMode != Maths.OFF && (s.settings.mathMax == 0 || opens(s, day, rule.pkg).earned < s.settings.mathMax)
    /** Opens still to earn today (null = no limit). */
    fun earnLeft(s: State, day: String, rule: AppRule): Int? =
        if (s.settings.mathMax == 0) null else (s.settings.mathMax - opens(s, day, rule.pkg).earned).coerceAtLeast(0)

    fun addEarned(s: State, day: String, pkg: String): State {
        val today = s.days[day].orEmpty()
        val cur = today[pkg] ?: DayApp()
        return s.copy(days = prune(s.days + (day to (today + (pkg to cur.copy(earned = cur.earned + 1)))), day))
    }

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
        s.settings.pause == 0 && !s.settings.ask && left(s, day, rule) > 1 && s.settings.mathMode != Maths.EVERY_OPEN &&
            nudgeText(s, day, rule) == null && nudgeSound(s, rule, locked = false) == Sound.OFF

    /** Fill in {app} and {left} in a nudge message. */
    fun fill(text: String, app: String, left: Int): String =
        text.replace("{app}", app, ignoreCase = true).replace("{left}", left.toString(), ignoreCase = true).trim()

    /** The nudge message to show for [rule] (its own, else the default), or null when there is none / nudges are off. */
    fun nudgeText(s: State, day: String, rule: AppRule): String? {
        if (!s.settings.nudge) return null
        val t = rule.msg.ifBlank { s.settings.msg }
        if (t.isBlank()) return null
        return fill(t, rule.label, left(s, day, rule))
    }

    /** Which sound to play when the gate shows ([locked] = the app is locked for today). */
    fun nudgeSound(s: State, rule: AppRule, locked: Boolean): Int {
        if (!s.settings.nudge) return Sound.OFF
        if (s.settings.soundLockedOnly && !locked) return Sound.OFF
        return if (rule.sound in Sound.OFF..Sound.REC) rule.sound else s.settings.sound.coerceIn(Sound.OFF, Sound.REC)
    }

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
    /** Opens earned with maths don't break it; for a weekly limit the week so far must be within the allowance. */
    fun dayKept(s: State, day: String): Boolean {
        val d = s.days[day] ?: return true
        return s.apps.none { r ->
            val o = d[r.pkg] ?: return@none false
            o.extra > 0 || (if (r.weekly) used(s, day, r) > allowance(s, day, r) else o.opens > r.limit + o.earned)
        }
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
        else -> old.on && (!new.on || new.limit * (if (new.weekly) 1 else 7) > old.limit * (if (old.weekly) 1 else 7))
    }

    /** Text for the notification after an open: (title, body, isWarning). */
    fun openMessage(s: State, day: String, rule: AppRule, extra: Boolean): Triple<String, String, Boolean> {
        val left = left(s, day, rule)
        val warn = s.settings.warnAt
        val n = nudgeText(s, day, rule)
        val m = openBase(rule, used(s, day, rule), allowance(s, day, rule), extras(s, day, rule), left, warn, extra)
        return if (n == null) m else Triple(m.first, m.second + "\n" + n, m.third)
    }

    private fun openBase(rule: AppRule, used: Int, allow: Int, extras: Int, left: Int, warn: Int, extra: Boolean): Triple<String, String, Boolean> {
        val p = periodWord(rule)
        return when {
            extra -> Triple("${rule.label}: extra open", "Over the limit $p ($extras extra). It locks again when you leave.", true)
            left == 0 -> Triple("${rule.label}: last open used", "$used/$allow opens used $p. It locks until ${unlocksAt(rule)}.", true)
            warn > 0 && left <= warn -> Triple("WARNING: $left ${if (left == 1) "open" else "opens"} left of ${rule.label}", "$used/$allow opens used $p.", true)
            else -> Triple("${rule.label}: $used/$allow opens used", "$left left $p.", false)
        }
    }

    /** One line per limited app for the status-bar counter, fewest left first. Null when there is nothing to show. */
    fun barSummary(s: State, day: String): Pair<String, String>? {
        val on = s.apps.filter { it.on }
        if (on.isEmpty()) return null
        val sorted = on.sortedBy { left(s, day, it) }
        val first = sorted.first()
        val title = "${left(s, day, first)} ${if (left(s, day, first) == 1) "open" else "opens"} left of ${first.label}"
        val body = sorted.joinToString(" · ") { "${it.label} ${used(s, day, it)}/${allowance(s, day, it)}" + (if (it.weekly) " wk" else "") }
        return title to body
    }

    /** Fewest opens left over the apps with a limit (the number drawn in the status-bar icon). */
    fun fewestLeft(s: State, day: String): Int? = s.apps.filter { it.on }.minOfOrNull { left(s, day, it) }

    // ---- JSON ----
    fun toJson(s: State): String {
        val o = JSONObject()
        o.put("v", 1)
        o.put("apps", org.json.JSONArray().apply {
            s.apps.forEach { put(JSONObject().put("p", it.pkg).put("l", it.label).put("n", it.limit).put("on", it.on).apply {
                if (it.msg.isNotEmpty()) put("m", it.msg)
                if (it.sound >= 0) put("s", it.sound)
                if (it.weekly) put("w", true)
            }) }
        })
        o.put("set", JSONObject().put("pause", s.settings.pause).put("grace", s.settings.grace)
            .put("ask", s.settings.ask).put("strict", s.settings.strict)
            .put("notify", s.settings.notify).put("warn", s.settings.warnAt).put("bar", s.settings.bar)
            .put("nudge", s.settings.nudge).put("msg", s.settings.msg).put("snd", s.settings.sound)
            .put("vol", s.settings.vol).put("sndLock", s.settings.soundLockedOnly)
            .put("mm", s.settings.mathMode).put("ml", s.settings.mathLevel).put("mc", s.settings.mathCount).put("mx", s.settings.mathMax))
        val days = JSONObject()
        s.days.forEach { (day, m) ->
            val dj = JSONObject()
            m.forEach { (pkg, a) ->
                val aj = JSONObject().put("o", a.opens)
                if (a.extra > 0) aj.put("x", a.extra)
                if (a.earned > 0) aj.put("e", a.earned)
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
                    val wk = j.optBoolean("w", false)
                    apps += AppRule(j.getString("p"), j.optString("l", j.getString("p")), j.optInt("n", 5).coerceIn(1, if (wk) 500 else 99), j.optBoolean("on", true),
                        j.optString("m", "").take(MSG_MAX), j.optInt("s", -1).coerceIn(-1, Sound.REC), wk)
                }
            }
            val sj = o.optJSONObject("set") ?: JSONObject()
            val settings = Settings(
                pause = sj.optInt("pause", 5).coerceIn(0, 120),
                grace = sj.optInt("grace", 3).coerceIn(0, 30),
                ask = sj.optBoolean("ask", true),
                strict = sj.optBoolean("strict", false),
                notify = sj.optBoolean("notify", true),
                warnAt = sj.optInt("warn", 3).coerceIn(0, 10),
                bar = sj.optBoolean("bar", true),
                nudge = sj.optBoolean("nudge", true),
                msg = sj.optString("msg", "").take(MSG_MAX),
                sound = sj.optInt("snd", Sound.OFF).coerceIn(Sound.OFF, Sound.REC),
                vol = sj.optInt("vol", 80).coerceIn(0, 100),
                soundLockedOnly = sj.optBoolean("sndLock", false),
                mathMode = sj.optInt("mm", Maths.WHEN_LOCKED).coerceIn(Maths.OFF, Maths.EVERY_OPEN),
                mathLevel = sj.optInt("ml", 2).coerceIn(1, 5),
                mathCount = sj.optInt("mc", 3).coerceIn(1, 5),
                mathMax = sj.optInt("mx", 3).coerceIn(0, 10),
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
                        m[pkg] = DayApp(aj.optInt("o"), aj.optInt("x"), r, aj.optInt("e"))
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
