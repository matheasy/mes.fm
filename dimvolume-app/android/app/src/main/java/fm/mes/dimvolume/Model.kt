package fm.mes.dimvolume

import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/** Pure maths, unit-tested (no Android classes). */
object Model {
    /** Android 12+ refuses taps through other apps' overlays darker than this. */
    const val MAX_DIM = 80

    /** Tint colours (RGB) for the night filter. 0 = none. */
    val TINTS = listOf(0x000000, 0xFF8A00, 0xFF2A00, 0x3D2B00)
    val TINT_NAMES = listOf("None", "Warm", "Red", "Sepia")

    /**
     * One overlay window: colour (opaque RGB) and window alpha 0..1.
     * dim 0..80 = how much light to take away; tint 0..100 = how much of the
     * dimmed part is coloured instead of black. Alpha never passes 0.8.
     */
    fun overlay(dim: Int, tintIdx: Int, tint: Int): Pair<Int, Float> {
        val d = dim.coerceIn(0, MAX_DIM)
        val t = if (tintIdx <= 0) 0 else tint.coerceIn(0, 100)
        // A tint needs some alpha to show even when dim is 0.
        val a = max(d, (t * 0.35).roundToInt()).coerceAtMost(MAX_DIM) / 100f
        val c = TINTS.getOrElse(tintIdx) { 0 }
        val k = t / 100f
        val r = ((c shr 16 and 255) * k).roundToInt()
        val g = ((c shr 8 and 255) * k).roundToInt()
        val b = ((c and 255) * k).roundToInt()
        return Pair((r shl 16) or (g shl 8) or b, a)
    }

    /** How much of the screen's light is left, in percent. */
    fun lightLeft(dim: Int): Int = 100 - dim.coerceIn(0, MAX_DIM)

    /** Result of a fine volume level: the system step to use and how far to turn it down (dB, <= 0). */
    data class Plan(val index: Int, val attenDb: Float)

    /**
     * Fine level f in 0..maxIndex*sub. The system index is the step at or above f,
     * then the gap is closed in dB between that step and the one below.
     * dbOf(i) = the system's own loudness of step i (dB, 0 at the top).
     * Below step 1 the last stretch fades to floorDb under step 1 (step 0 is silent).
     */
    fun plan(f: Int, sub: Int, maxIndex: Int, dbOf: (Int) -> Float, floorDb: Float = 24f): Plan {
        val s = max(1, sub)
        val fc = f.coerceIn(0, maxIndex * s)
        if (fc == 0) return Plan(0, 0f)
        val idx = (fc + s - 1) / s
        val within = fc - (idx - 1) * s          // 1..s
        if (within == s) return Plan(idx, 0f)
        val hi = dbOf(idx)
        val lo = if (idx - 1 >= 1) dbOf(idx - 1) else hi - floorDb
        val gap = max(0f, hi - lo)
        val frac = within.toFloat() / s           // 0..1 of the way up from lo to hi
        val atten = -(gap * (1f - frac))
        return Plan(idx, min(0f, (atten * 2).roundToInt() / 2f))
    }

    /** The fine level that equals a plain system step (no turning down). */
    fun fromIndex(index: Int, sub: Int): Int = index * max(1, sub)

    /** Rough dB of a system step when the phone does not say (Android's default media curve, about 60 dB range). */
    fun defaultDb(i: Int, maxIndex: Int): Float {
        if (i <= 0) return -96f
        val x = i.toFloat() / maxIndex
        return (-60f * (1f - x) * (1f - x * 0.25f)).let { (it * 10).roundToInt() / 10f }
    }

    fun label(f: Int, sub: Int, maxIndex: Int): String {
        val s = max(1, sub)
        val total = maxIndex * s
        return "${(f.coerceIn(0, total) * 100f / total).roundToInt()}%"
    }
}
