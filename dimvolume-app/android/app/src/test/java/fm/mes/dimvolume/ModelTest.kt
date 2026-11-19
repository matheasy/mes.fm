package fm.mes.dimvolume

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ModelTest {
    private val db = { i: Int -> floatArrayOf(-96f, -48f, -40f, -32f, -24f, -16f, -8f, 0f)[i] }

    @Test fun overlayNeverPassesEightyPercent() {
        for (d in 0..100) for (t in 0..3) for (k in listOf(0, 50, 100))
            assertTrue(Model.overlay(d, t, k).second <= 0.8f + 1e-6f)
    }
    @Test fun overlayBlackWithoutTint() {
        assertEquals(0, Model.overlay(50, 0, 100).first)
        assertEquals(0.5f, Model.overlay(50, 0, 100).second, 1e-6f)
    }
    @Test fun tintShowsAtZeroDim() { assertTrue(Model.overlay(0, 2, 100).second > 0f) }
    @Test fun wholeStepNoTurnDown() {
        val p = Model.plan(12, 4, 7, db)
        assertEquals(3, p.index); assertEquals(0f, p.attenDb, 0f)
    }
    @Test fun halfWayIsHalfTheGap() {
        val p = Model.plan(10, 4, 7, db)   // between step 2 (-40) and 3 (-32)
        assertEquals(3, p.index); assertEquals(-4f, p.attenDb, 0f)
    }
    @Test fun belowStepOneFades() {
        val p = Model.plan(1, 4, 7, db)
        assertEquals(1, p.index); assertEquals(-18f, p.attenDb, 0f)
        assertEquals(0, Model.plan(0, 4, 7, db).index)
    }
    @Test fun clampsAndMonotone() {
        var last = -999f
        for (f in 0..28) {
            val p = Model.plan(f, 4, 7, db)
            val loud = if (p.index == 0) -999f else db(p.index) + p.attenDb
            assertTrue("f=$f", loud >= last); last = loud
        }
        assertEquals(7, Model.plan(99, 4, 7, db).index)
    }
    @Test fun defaultCurve() {
        assertEquals(0f, Model.defaultDb(15, 15), 0f)
        assertTrue(Model.defaultDb(1, 15) < Model.defaultDb(2, 15))
    }
}
