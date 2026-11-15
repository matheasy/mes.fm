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
}
