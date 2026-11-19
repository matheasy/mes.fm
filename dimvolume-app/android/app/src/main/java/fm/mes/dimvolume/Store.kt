package fm.mes.dimvolume

import android.content.Context
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf

/** Settings, kept in SharedPreferences "dv" and mirrored in Compose state. */
object Store {
    private const val P = "dv"
    val dimOn = mutableStateOf(false)
    val dim = mutableIntStateOf(40)
    val tintIdx = mutableIntStateOf(0)
    val tint = mutableIntStateOf(50)
    val dimBrightness = mutableStateOf(true)   // also ask for the lowest backlight while dimming
    val volOn = mutableStateOf(false)
    val sub = mutableIntStateOf(4)             // fine steps per system step
    val fine = mutableIntStateOf(-1)           // -1 = follow the system step
    val stepPct = mutableIntStateOf(5)         // notification dim -/+ step
    // Live status written by the service.
    val volStatus = mutableStateOf("")
    val effectOk = mutableStateOf<Boolean?>(null)
    private var loaded = false

    fun load(c: Context) {
        if (loaded) return
        val p = c.getSharedPreferences(P, Context.MODE_PRIVATE)
        dimOn.value = p.getBoolean("dimOn", false)
        dim.intValue = p.getInt("dim", 40)
        tintIdx.intValue = p.getInt("tintIdx", 0)
        tint.intValue = p.getInt("tint", 50)
        dimBrightness.value = p.getBoolean("dimBr", true)
        volOn.value = p.getBoolean("volOn", false)
        sub.intValue = p.getInt("sub", 4)
        fine.intValue = p.getInt("fine", -1)
        stepPct.intValue = p.getInt("stepPct", 5)
        loaded = true
    }

    fun save(c: Context) {
        c.getSharedPreferences(P, Context.MODE_PRIVATE).edit()
            .putBoolean("dimOn", dimOn.value).putInt("dim", dim.intValue)
            .putInt("tintIdx", tintIdx.intValue).putInt("tint", tint.intValue)
            .putBoolean("dimBr", dimBrightness.value).putBoolean("volOn", volOn.value)
            .putInt("sub", sub.intValue).putInt("fine", fine.intValue).putInt("stepPct", stepPct.intValue)
            .apply()
    }
}
