package fm.mes.dimvolume

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.AudioManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import kotlin.math.roundToInt

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Store.load(this)
        enableEdgeToEdge()
        setContent { DVTheme { Screen() } }
    }
}

private fun apply(c: Context) {
    Store.save(c)
    if (Store.dimOn.value || Store.volOn.value) DimService.send(c) else DimService.stop(c)
}

@Composable
private fun Screen() {
    val c = LocalContext.current
    var canOverlay by remember { mutableStateOf(DimService.canOverlay(c)) }
    var canNotify by remember { mutableStateOf(notifyOk(c)) }
    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) {
        canOverlay = DimService.canOverlay(c); canNotify = notifyOk(c)
        if (canOverlay && (Store.dimOn.value || Store.volOn.value)) DimService.send(c)
    }
    Column(
        Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background).systemBarsPadding()
            .verticalScroll(rememberScrollState()).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Text("MES Dim & Volume", fontSize = 26.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onBackground)
        Text("Darker than the phone's lowest brightness, and volume in smaller steps.",
            color = MaterialTheme.colorScheme.onSurfaceVariant)

        if (!canOverlay) Note("Allow \"Display over other apps\" so the dimmer can cover every app. Taps go straight through it.",
            "Allow") {
            c.startActivity(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:${c.packageName}")))
        }
        if (!canNotify && Build.VERSION.SDK_INT >= 33) Note("Allow notifications to get the −/+ buttons in your notification shade.",
            "Allow") {
            (c as? ComponentActivity)?.requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 1)
        }

        DimCard(canOverlay)
        VolCard()

        Text("Tip: add the \"Dim screen\" tile to Quick Settings (pull the shade down twice, tap the pencil).",
            fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text("Nothing leaves your phone. No ads, no account. Privacy: mes.fm/privacy-policy#dim-volume",
            fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.clickable {
                c.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://mes.fm/privacy-policy#dim-volume")))
            })
        Spacer(Modifier.height(24.dp))
    }
}

@Composable
private fun DimCard(canOverlay: Boolean) {
    val c = LocalContext.current
    Card2 {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("Screen dimmer", fontSize = 19.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
            Switch(checked = Store.dimOn.value, enabled = canOverlay, onCheckedChange = { Store.dimOn.value = it; apply(c) })
        }
        val dim = Store.dim.intValue
        Text("Dim: $dim%  ·  ${Model.lightLeft(dim)}% of the light left", fontSize = 14.sp)
        StepSlider(dim, 0, Model.MAX_DIM, onChange = { Store.dim.intValue = it; if (Store.dimOn.value) apply(c) })
        Text("Android stops other apps' layers at 80% so your taps still work. Together with the lowest brightness that is far darker than the phone's own minimum.",
            fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)

        Text("Night colour", fontSize = 14.sp, fontWeight = FontWeight.Medium)
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Model.TINT_NAMES.forEachIndexed { i, n ->
                FilterChip(selected = Store.tintIdx.intValue == i, onClick = { Store.tintIdx.intValue = i; if (Store.dimOn.value) apply(c) },
                    label = { Text(n) })
            }
        }
        if (Store.tintIdx.intValue > 0) {
            Text("Colour strength: ${Store.tint.intValue}%", fontSize = 14.sp)
            StepSlider(Store.tint.intValue, 0, 100, onChange = { Store.tint.intValue = it; if (Store.dimOn.value) apply(c) })
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("Also use the lowest backlight while dimming", fontSize = 14.sp, modifier = Modifier.weight(1f))
            Switch(checked = Store.dimBrightness.value, onCheckedChange = { Store.dimBrightness.value = it; if (Store.dimOn.value) apply(c) })
        }
        Text("Notification −/+ step: ${Store.stepPct.intValue}%", fontSize = 14.sp)
        StepSlider(Store.stepPct.intValue, 1, 10, onChange = { Store.stepPct.intValue = it; apply(c) })
        Preview()
    }
}

/** Shows what the chosen dim and colour look like on a white card. */
@Composable
private fun Preview() {
    val (rgb, a) = Model.overlay(Store.dim.intValue, Store.tintIdx.intValue, Store.tint.intValue)
    Box(Modifier.fillMaxWidth().height(54.dp).clip(RoundedCornerShape(10.dp)).background(Color.White)) {
        Text("Preview on a white page", color = Color.Black, modifier = Modifier.align(Alignment.Center))
        Box(Modifier.matchParentSize().background(Color(0xFF000000.toInt() or rgb).copy(alpha = a)))
    }
}

@Composable
private fun VolCard() {
    val c = LocalContext.current
    val am = remember { c.getSystemService(Context.AUDIO_SERVICE) as AudioManager }
    val max = remember { am.getStreamMaxVolume(AudioManager.STREAM_MUSIC) }
    val sub = Store.sub.intValue
    val total = max * sub
    val fine = if (Store.fine.intValue < 0) Model.fromIndex(am.getStreamVolume(AudioManager.STREAM_MUSIC), sub) else Store.fine.intValue
    Card2 {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("Fine volume", fontSize = 19.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
            Switch(checked = Store.volOn.value, onCheckedChange = { Store.volOn.value = it; apply(c) })
        }
        Text("Media volume: ${Model.label(fine, sub, max)}  ($fine of $total small steps)", fontSize = 14.sp)
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(onClick = { Store.volOn.value = true; Store.fine.intValue = (fine - 1).coerceAtLeast(0); apply(c) }) { Text("−", fontSize = 20.sp) }
            Box(Modifier.weight(1f)) {
                StepSlider(fine, 0, total, onChange = { Store.volOn.value = true; Store.fine.intValue = it; apply(c) })
            }
            OutlinedButton(onClick = { Store.volOn.value = true; Store.fine.intValue = (fine + 1).coerceAtMost(total); apply(c) }) { Text("+", fontSize = 20.sp) }
        }
        if (Store.volStatus.value.isNotEmpty()) Text(Store.volStatus.value, fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text("Small steps between each phone step", fontSize = 14.sp, fontWeight = FontWeight.Medium)
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            listOf(2, 4, 8).forEach { n ->
                FilterChip(selected = sub == n, onClick = {
                    val ratio = fine.toFloat() / total
                    Store.sub.intValue = n; Store.fine.intValue = (ratio * max * n).roundToInt(); apply(c)
                }, label = { Text("$n") })
            }
        }
        when (Store.effectOk.value) {
            false -> Text("This phone does not allow turning the sound down between steps, so only its own steps work here.",
                fontSize = 12.sp, color = Color(0xFFB45309))
            else -> Text("Your phone has $max volume steps. The app picks the step just above the level you want and turns the sound down the rest of the way. The phone's volume keys still work and move whole steps.",
                fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

// ---------- small helpers ----------
@Composable
private fun StepSlider(value: Int, min: Int, max: Int, onChange: (Int) -> Unit) {
    var v by remember(value) { mutableFloatStateOf(value.toFloat()) }
    Slider(value = v, onValueChange = { v = it; val r = it.roundToInt(); if (r != value) onChange(r) },
        valueRange = min.toFloat()..max.toFloat(), steps = if (max - min <= 12) max - min - 1 else 0)
}

@Composable
private fun Card2(content: @Composable ColumnScope.() -> Unit) {
    Card(Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp), content = content)
    }
}

@Composable
private fun Note(text: String, button: String, onClick: () -> Unit) {
    Card(Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer)) {
        Row(Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(text, modifier = Modifier.weight(1f), color = MaterialTheme.colorScheme.onPrimaryContainer, fontSize = 14.sp)
            Spacer(Modifier.width(8.dp))
            Button(onClick = onClick) { Text(button) }
        }
    }
}

private fun notifyOk(c: Context) = Build.VERSION.SDK_INT < 33 ||
    c.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
