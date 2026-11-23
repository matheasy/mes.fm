package fm.mes.openlimits

import org.junit.Assert.*
import org.junit.Test
import java.time.LocalDate

class LogicTest {
    private val ig = AppRule("com.instagram.android", "Instagram", 3)
    private val base = State(apps = listOf(ig), since = "2026-11-01")
    private val day = "2026-11-07"
    private val start = 1_000_000L

    @Test fun pauseUntilLimitThenLocked() {
        var s = base
        assertEquals(Gate.PAUSE, Logic.decide(s, ig, day, start, start + 10, null, null))
        repeat(3) { s = Logic.addOpen(s, day, ig.pkg, null, false) }
        assertEquals(0, Logic.left(s, day, ig))
        assertEquals(Gate.LOCKED, Logic.decide(s, ig, day, start, start + 10, null, null))
    }

    @Test fun graceComeBack() {
        val s = Logic.addOpen(base, day, ig.pkg, null, false)
        val opened = start + 1000
        // left 2 minutes ago, grace 3 -> same open
        assertEquals(Gate.ALLOW, Logic.decide(s, ig, day, start, opened + 300_000, opened + 180_000, opened))
        // left 4 minutes ago -> new open
        assertEquals(Gate.PAUSE, Logic.decide(s, ig, day, start, opened + 400_000, opened + 160_000, opened))
        // opened yesterday -> new open
        assertEquals(Gate.PAUSE, Logic.decide(s, ig, day, start, start + 10, start + 5, start - 5))
    }

    @Test fun pausedRuleAllows() {
        assertEquals(Gate.ALLOW, Logic.decide(base, ig.copy(on = false), day, start, start, null, null))
    }

    @Test fun silentOnlyWhenNoPauseNoAskAndNotLast() {
        val s = base.copy(settings = Settings(pause = 0, ask = false))
        assertTrue(Logic.silent(s, day, ig))
        val s2 = Logic.addOpen(Logic.addOpen(s, day, ig.pkg, null, false), day, ig.pkg, null, false)
        assertFalse(Logic.silent(s2, day, ig))
        assertFalse(Logic.silent(base, day, ig))
    }

    @Test fun reasonsAndExtra() {
        var s = Logic.addOpen(base, day, ig.pkg, "bored", false)
        s = Logic.addOpen(s, day, ig.pkg, "bored", true)
        val a = Logic.opens(s, day, ig.pkg)
        assertEquals(1, a.opens); assertEquals(1, a.extra); assertEquals(2, a.reasons["bored"])
        assertFalse(Logic.dayKept(s, day))
    }

    @Test fun streak() {
        var s = base
        val today = LocalDate.parse(day)
        assertEquals(7, Logic.streak(s, today)) // Nov 1..7, nothing broken
        s = Logic.addOpen(s, "2026-11-05", ig.pkg, null, true)
        assertEquals(2, Logic.streak(s, today)) // Nov 6, 7
    }

    @Test fun jsonRoundTrip() {
        var s = base.copy(settings = Settings(pause = 10, grace = 5, ask = false, strict = true), bestStreak = 4, agreed = true)
        s = Logic.addOpen(s, day, ig.pkg, "reply", false)
        val back = Logic.fromJson(Logic.toJson(s))
        assertEquals(s, back)
        assertEquals(State(), Logic.fromJson("not json"))
    }

    @Test fun loosens() {
        assertTrue(Logic.loosens(ig, ig.copy(limit = 4)))
        assertFalse(Logic.loosens(ig, ig.copy(limit = 2)))
        assertTrue(Logic.loosens(ig, null))
        assertTrue(Logic.loosens(ig, ig.copy(on = false)))
        assertFalse(Logic.loosens(ig.copy(on = false), ig))
    }

    @Test fun history() {
        val s = Logic.addOpen(base, day, ig.pkg, null, false)
        val h = Logic.history(s, LocalDate.parse(day), 7)
        assertEquals(7, h.size); assertEquals(1, h.last().second); assertEquals(0, h.first().second)
    }

    @Test fun openMessages() {
        val r = AppRule("x", "Instagram", 8)
        var s = State(apps = listOf(r), since = "2026-11-01")
        repeat(3) { s = Logic.addOpen(s, day, "x", null, false) }
        assertEquals("Instagram: 3/8 opens used", Logic.openMessage(s, day, r, false).first)
        assertFalse(Logic.openMessage(s, day, r, false).third)
        repeat(2) { s = Logic.addOpen(s, day, "x", null, false) }
        val w = Logic.openMessage(s, day, r, false)
        assertEquals("WARNING: 3 opens left of Instagram", w.first); assertTrue(w.third)
        repeat(3) { s = Logic.addOpen(s, day, "x", null, false) }
        assertEquals("Instagram: last open used", Logic.openMessage(s, day, r, false).first)
        val off = s.copy(settings = s.settings.copy(warnAt = 0))
        assertEquals("Instagram: 5/8 opens used", Logic.openMessage(Logic.fromJson(Logic.toJson(off)).copy(days = mapOf(day to mapOf("x" to DayApp(5)))), day, r, false).first)
        assertEquals(0, Logic.fewestLeft(s, day))
        assertEquals("Instagram 8/8", Logic.barSummary(s, day)!!.second)
    }

    @Test fun settingsRoundTrip() {
        val s = State(settings = Settings(pause = 60, notify = false, warnAt = 5, bar = false))
        assertEquals(s.settings, Logic.fromJson(Logic.toJson(s)).settings)
    }

    @Test fun nudgeTextDefaultAndPerApp() {
        val s = base.copy(settings = Settings(msg = "Stop opening {app}. {left} left."))
        assertEquals("Stop opening Instagram. 3 left.", Logic.nudgeText(s, day, ig))
        val own = ig.copy(msg = "Touch grass instead")
        assertEquals("Touch grass instead", Logic.nudgeText(s.copy(apps = listOf(own)), day, own))
        assertNull(Logic.nudgeText(s.copy(settings = s.settings.copy(nudge = false)), day, ig))
        assertNull(Logic.nudgeText(base, day, ig))
    }

    @Test fun nudgeSoundRules() {
        val s = base.copy(settings = Settings(sound = Sound.SPEAK))
        assertEquals(Sound.SPEAK, Logic.nudgeSound(s, ig, locked = false))
        assertEquals(Sound.REC, Logic.nudgeSound(s, ig.copy(sound = Sound.REC), locked = false))
        assertEquals(Sound.OFF, Logic.nudgeSound(s, ig.copy(sound = Sound.OFF), locked = true))
        val lockedOnly = s.copy(settings = s.settings.copy(soundLockedOnly = true))
        assertEquals(Sound.OFF, Logic.nudgeSound(lockedOnly, ig, locked = false))
        assertEquals(Sound.SPEAK, Logic.nudgeSound(lockedOnly, ig, locked = true))
    }

    @Test fun nudgeStopsSilentOpens() {
        val s = base.copy(settings = Settings(pause = 0, ask = false, msg = "Hey"))
        assertFalse(Logic.silent(s, day, ig))
        assertTrue(Logic.silent(s.copy(settings = s.settings.copy(msg = "")), day, ig))
    }

    @Test fun nudgeInNotificationAndJsonRoundTrip() {
        val s = base.copy(apps = listOf(ig.copy(msg = "Checking won't help", sound = Sound.REC)),
            settings = Settings(msg = "def", sound = Sound.SPEAK, vol = 40, soundLockedOnly = true))
        val r = s.apps[0]
        assertTrue(Logic.openMessage(Logic.addOpen(s, day, r.pkg, null, false), day, r, false).second.endsWith("\nChecking won't help"))
        val back = Logic.fromJson(Logic.toJson(s))
        assertEquals(s.apps, back.apps)
        assertEquals(s.settings, back.settings)
        // Old saves (no nudge fields) load with nudges on and no message.
        val old = Logic.fromJson("""{"v":1,"apps":[{"p":"a","l":"A","n":2,"on":true}],"set":{"pause":5}}""")
        assertEquals(-1, old.apps[0].sound); assertEquals("", old.settings.msg); assertTrue(old.settings.nudge)
    }

    @Test fun mathsProblemsHaveWholeAnswers() {
        val r = java.util.Random(7)
        for (level in 1..5) repeat(2000) {
            val q = Maths.make(level, r)
            assertTrue("$level ${q.text}", q.answer >= 0)
            // check the text really gives that answer
            val t = q.text.replace("\u2212", "-").replace("\u00D7", "*")
            val got: Int = when {
                t.contains("x") && t.contains("=") -> {
                    val (lhs, rhs) = t.split("=").map { it.trim() }
                    val c = rhs.toInt()
                    val x = q.answer
                    val v = if (lhs.contains("(")) { val m = Regex("""(\d+)\(x - (\d+)\)""").find(lhs)!!; m.groupValues[1].toInt() * (x - m.groupValues[2].toInt()) }
                            else { val m = Regex("""(\d+)x \+ (\d+)""").find(lhs)!!; m.groupValues[1].toInt() * x + m.groupValues[2].toInt() }
                    assertEquals(t, c, v); x
                }
                t.contains("% of") -> { val (p, b) = t.split("% of").map { it.trim().toInt() }; assertEquals(t, 0, p * b % 100); p * b / 100 }
                t.contains("/") -> { val m = Regex("""(\d+)/(\d+) of (\d+)""").find(t)!!; val (n, d, b) = m.destructured; assertEquals(t, 0, n.toInt() * b.toInt() % d.toInt()); n.toInt() * b.toInt() / d.toInt() }
                t.contains("+") -> t.split("+").sumOf { it.trim().toInt() }
                t.contains("-") -> t.split("-").map { it.trim().toInt() }.let { it[0] - it[1] }
                else -> t.split("*").map { it.trim().toInt() }.let { it[0] * it[1] }
            }
            assertEquals(t, got, q.answer)
        }
        assertEquals(42, Maths.parse(" 42 "))
        assertNull(Maths.parse("4.2"))
        assertNull(Maths.parse("-3"))
    }

    @Test fun earnedOpensRaiseAllowanceAndKeepStreak() {
        val r = AppRule("a", "A", 2)
        var s = State(apps = listOf(r), since = "2026-11-20", settings = Settings(mathMax = 2))
        val d = "2026-11-23"
        s = Logic.addOpen(s, d, "a", null, false); s = Logic.addOpen(s, d, "a", null, false)
        assertEquals(0, Logic.left(s, d, r))
        assertTrue(Logic.canEarn(s, d, r))
        s = Logic.addEarned(s, d, "a")
        assertEquals(1, Logic.left(s, d, r))
        s = Logic.addOpen(s, d, "a", null, false)
        assertTrue(Logic.dayKept(s, d))
        s = Logic.addEarned(s, d, "a")
        assertFalse(Logic.canEarn(s, d, r))
        assertEquals(0, Logic.earnLeft(s, d, r))
        // off: no earning
        assertFalse(Logic.canEarn(s.copy(settings = s.settings.copy(mathMode = Maths.OFF)), d, r))
        // round trip
        val back = Logic.fromJson(Logic.toJson(s))
        assertEquals(2, back.days[d]!!["a"]!!.earned)
        assertEquals(2, back.settings.mathMax)
    }

    @Test fun weeklyBudgetSumsMondayToToday() {
        val r = AppRule("a", "A", 10, weekly = true)
        var s = State(apps = listOf(r), since = "2026-11-01")
        // Mon 2026-11-23 .. Sun 2026-11-29; previous week must not count
        s = Logic.addOpen(s, "2026-11-22", "a", null, false)
        repeat(4) { s = Logic.addOpen(s, "2026-11-23", "a", null, false) }
        repeat(5) { s = Logic.addOpen(s, "2026-11-25", "a", null, false) }
        assertEquals(9, Logic.used(s, "2026-11-25", r))
        assertEquals(1, Logic.left(s, "2026-11-25", r))
        assertEquals(5, Logic.daysLeftInWeek("2026-11-25"))
        assertEquals(1, Logic.perDay(s, "2026-11-25", r))
        assertTrue(Logic.dayKept(s, "2026-11-25"))
        repeat(2) { s = Logic.addOpen(s, "2026-11-26", "a", null, false) }
        assertEquals(0, Logic.left(s, "2026-11-26", r))
        assertFalse(Logic.dayKept(s, "2026-11-26"))
        assertTrue(Logic.dayKept(s, "2026-11-25"))
        assertEquals(listOf("2026-11-23"), Logic.periodDays(r, "2026-11-23"))
        assertEquals(7, Logic.periodDays(r, "2026-11-29").size)
        val back = Logic.fromJson(Logic.toJson(s))
        assertTrue(back.apps[0].weekly); assertEquals(10, back.apps[0].limit)
        // 5 a day -> 35 a week is not looser; 36 is
        assertFalse(Logic.loosens(AppRule("a", "A", 5), AppRule("a", "A", 35, weekly = true)))
        assertTrue(Logic.loosens(AppRule("a", "A", 5), AppRule("a", "A", 36, weekly = true)))
    }
}
