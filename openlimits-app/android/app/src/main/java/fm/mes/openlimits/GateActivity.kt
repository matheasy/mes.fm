package fm.mes.openlimits

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.compose.setContent
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/** The pause screen (an open is counted when "Open" is pressed) or the locked screen. */
class GateActivity : ComponentActivity() {
    private var pkg by mutableStateOf("")

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        pkg = intent.getStringExtra(EXTRA_PKG) ?: run { finish(); return }
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() = notNow()
        })
        setContent { OLTheme { GateScreen(pkg, ::open, ::notNow) } }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        intent.getStringExtra(EXTRA_PKG)?.let { pkg = it }
    }

    private fun open(reason: String?, extra: Boolean) {
        LimitService.countOpen(this, pkg, reason, extra)
        LimitService.letThrough(pkg)
        val launch = packageManager.getLaunchIntentForPackage(pkg)
        if (launch != null) startActivity(launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        finish()
    }

    private fun notNow() {
        LimitService.dismissed(pkg)
        startActivity(Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        finish()
    }

    companion object { const val EXTRA_PKG = "pkg" }
}

private val GateBg = Color(0xFF1E1B4B)
private val GateText = Color(0xFFEDEDF4)
private val GateDim = Color(0xFFB9B9DA)

@Composable
fun GateScreen(pkg: String, onOpen: (String?, Boolean) -> Unit, onNotNow: () -> Unit) {
    val ctx = androidx.compose.ui.platform.LocalContext.current
    val s by Store.state(ctx).collectAsState()
    val rule = s.apps.firstOrNull { it.pkg == pkg }
    val label = rule?.label ?: Apps.label(ctx, pkg)
    val day = Store.today()
    val used = Logic.opens(s, day, pkg)
    val limit = rule?.limit ?: 0
    val left = if (rule == null) 1 else Logic.left(s, day, rule)
    val locked = left <= 0

    var wait by remember(pkg) { mutableIntStateOf(if (locked) 0 else s.settings.pause) }
    var reason by remember(pkg) { mutableStateOf<String?>(null) }
    LaunchedEffect(pkg, locked) { while (wait > 0) { delay(1000); wait-- } }

    Column(
        Modifier.fillMaxSize().background(GateBg).systemBarsPadding().padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Spacer(Modifier.weight(1f))
        Breathing(active = wait > 0) { AppIcon(pkg, label, 72.dp) }
        Spacer(Modifier.height(20.dp))
        Text(label, color = GateText, fontSize = 26.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center)
        Spacer(Modifier.height(8.dp))
        if (locked) {
            Text("Locked for today", color = Color(0xFFFCA5A5), fontSize = 20.sp, fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.height(6.dp))
            Text("You used all $limit opens. It unlocks at midnight.", color = GateDim, fontSize = 16.sp, textAlign = TextAlign.Center)
        } else {
            Text("This would be open ${used.opens + 1} of $limit today", color = GateText, fontSize = 18.sp, textAlign = TextAlign.Center)
            Spacer(Modifier.height(6.dp))
            Text(if (left == 1) "It's your last one." else "${left - 1} left after this one.", color = GateDim, fontSize = 15.sp)
        }
        Spacer(Modifier.height(18.dp))
        Dots(limit, used.opens)
        if (!locked && s.settings.ask) {
            Spacer(Modifier.height(26.dp))
            Text("Why are you opening it?", color = GateDim, fontSize = 15.sp)
            Spacer(Modifier.height(8.dp))
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterHorizontally), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                REASONS.forEach { (id, text) ->
                    FilterChip(
                        selected = reason == id, onClick = { reason = if (reason == id) null else id },
                        label = { Text(text, fontSize = 15.sp) },
                        colors = FilterChipDefaults.filterChipColors(labelColor = GateText, selectedContainerColor = IndigoLight, selectedLabelColor = GateBg),
                    )
                }
            }
        }
        Spacer(Modifier.weight(1f))
        if (!locked) {
            Button(
                onClick = { onOpen(reason, false) }, enabled = wait == 0,
                modifier = Modifier.fillMaxWidth().height(56.dp),
                colors = ButtonDefaults.buttonColors(containerColor = IndigoLight, contentColor = GateBg, disabledContainerColor = Color(0xFF3B3A6B), disabledContentColor = GateDim),
            ) { Text(if (wait > 0) "Breathe… $wait" else "Open $label", fontSize = 18.sp, fontWeight = FontWeight.SemiBold) }
            Spacer(Modifier.height(10.dp))
        }
        OutlinedButton(onClick = onNotNow, modifier = Modifier.fillMaxWidth().height(56.dp), colors = ButtonDefaults.outlinedButtonColors(contentColor = GateText)) {
            Text(if (locked) "OK" else "Not now", fontSize = 18.sp)
        }
        if (locked && !s.settings.strict) {
            Spacer(Modifier.height(14.dp))
            HoldButton("Hold 5 seconds to open anyway", 5000) { onOpen(null, true) }
            Text("Counts as an extra open and breaks your streak.", color = GateDim, fontSize = 13.sp, modifier = Modifier.padding(top = 6.dp))
        }
    }
}

/** A slow in-and-out breathing circle around the app icon while the pause counts down. */
@Composable
private fun Breathing(active: Boolean, content: @Composable () -> Unit) {
    val t = rememberInfiniteTransition(label = "b")
    val k by t.animateFloat(1f, 1.35f, infiniteRepeatable(tween(2500, easing = FastOutSlowInEasing), RepeatMode.Reverse), label = "k")
    Box(Modifier.size(150.dp), contentAlignment = Alignment.Center) {
        Box(Modifier.size(110.dp).scale(if (active) k else 1f).clip(CircleShape).background(Color(0x334F46E5)))
        content()
    }
}

/** One dot per open: filled = used. */
@Composable
private fun Dots(limit: Int, used: Int) {
    if (limit > 20) { Text("$used / $limit used", color = GateDim); return }
    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        repeat(limit) { i ->
            Box(Modifier.size(12.dp).clip(CircleShape).background(if (i < used) Color(0xFFFCA5A5) else Color(0xFF4B4A85)))
        }
    }
}

/** A button you have to keep pressed for [ms]: a deliberate, slower way out. */
@Composable
fun HoldButton(text: String, ms: Int, onDone: () -> Unit) {
    var progress by remember { mutableFloatStateOf(0f) }
    Box(
        Modifier.fillMaxWidth().height(48.dp).clip(RoundedCornerShape(24.dp)).background(Color(0x22FFFFFF))
            .pointerInput(Unit) {
                detectTapGestures(onPress = {
                    kotlinx.coroutines.coroutineScope {
                        val job = launch {
                            val start = System.currentTimeMillis()
                            while (true) {
                                progress = ((System.currentTimeMillis() - start).toFloat() / ms).coerceAtMost(1f)
                                if (progress >= 1f) { onDone(); break }
                                delay(30)
                            }
                        }
                        tryAwaitRelease()
                        job.cancel()
                        progress = 0f
                    }
                })
            },
        contentAlignment = Alignment.Center,
    ) {
        Box(Modifier.fillMaxHeight().fillMaxWidth(progress).align(Alignment.CenterStart).background(Color(0x55FCA5A5)))
        Text(text, color = GateText, fontSize = 15.sp)
    }
}
