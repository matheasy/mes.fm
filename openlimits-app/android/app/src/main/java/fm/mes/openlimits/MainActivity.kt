package fm.mes.openlimits

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.provider.Settings as AndroidSettings
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import java.time.LocalDate
import java.time.format.TextStyle
import java.util.Locale

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        setContent { OLTheme { Surface(color = MaterialTheme.colorScheme.background) { Root() } } }
    }
}

private sealed interface Screen {
    data object Home : Screen
    data object Add : Screen
}

@Composable
private fun Root() {
    var screen by remember { mutableStateOf<Screen>(Screen.Home) }
    BackHandler(enabled = screen != Screen.Home) { screen = Screen.Home }
    when (screen) {
        Screen.Home -> HomeScreen(onAdd = { screen = Screen.Add })
        Screen.Add -> AddScreen(onDone = { screen = Screen.Home })
    }
}

/** True while the screen is showing; re-checked when coming back from system settings. */
@Composable
private fun rememberServiceOn(): Boolean {
    val ctx = LocalContext.current
    var on by remember { mutableStateOf(Apps.serviceOn(ctx)) }
    val owner = LocalLifecycleOwner.current
    DisposableEffect(owner) {
        val obs = LifecycleEventObserver { _, e -> if (e == Lifecycle.Event.ON_RESUME) on = Apps.serviceOn(ctx) }
        owner.lifecycle.addObserver(obs)
        onDispose { owner.lifecycle.removeObserver(obs) }
    }
    return on
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun HomeScreen(onAdd: () -> Unit) {
    val ctx = LocalContext.current
    val s by Store.state(ctx).collectAsState()
    val on = rememberServiceOn()
    val today = LocalDate.now()
    val day = Store.today()
    var editing by remember { mutableStateOf<AppRule?>(null) }
    var disclosure by remember { mutableStateOf(false) }

    Column(Modifier.fillMaxSize().systemBarsPadding().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 12.dp)) {
        Text("Open Limits", fontSize = 30.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onBackground)
        Text("Open your apps on purpose, not on autopilot.", fontSize = 15.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.height(16.dp))

        if (!on) {
            Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer)) {
                Column(Modifier.padding(16.dp)) {
                    Text("Step 1: turn on the counter", fontWeight = FontWeight.Bold, fontSize = 18.sp, color = MaterialTheme.colorScheme.onPrimaryContainer)
                    Spacer(Modifier.height(6.dp))
                    Text("Android needs your OK before Open Limits can notice when you open an app. You switch it on once in Accessibility settings.",
                        color = MaterialTheme.colorScheme.onPrimaryContainer, fontSize = 15.sp)
                    Spacer(Modifier.height(12.dp))
                    Button(onClick = { disclosure = true }) { Text("Turn it on") }
                }
            }
            Spacer(Modifier.height(14.dp))
        }

        if (s.apps.isNotEmpty()) {
            val st = Logic.streak(s, today)
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(if (st > 0) "🔥 $st-day streak" else "Start a streak today", fontWeight = FontWeight.SemiBold, fontSize = 17.sp, color = MaterialTheme.colorScheme.onBackground)
                Spacer(Modifier.weight(1f))
                if (s.bestStreak > 0) Text("Best: ${s.bestStreak}", color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Spacer(Modifier.height(10.dp))
        }

        Text("Today", fontWeight = FontWeight.Bold, fontSize = 20.sp, color = MaterialTheme.colorScheme.onBackground)
        Spacer(Modifier.height(8.dp))
        if (s.apps.isEmpty()) {
            Text("No limits yet. Add the app you want to open less, like Instagram, and choose how many opens a day it gets.",
                color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 15.sp)
            Spacer(Modifier.height(10.dp))
        }
        s.apps.forEach { r -> AppRow(s, day, r) { editing = r } ; Spacer(Modifier.height(8.dp)) }
        FilledTonalButton(onClick = onAdd, modifier = Modifier.fillMaxWidth().height(52.dp)) {
            Icon(Icons.Filled.Add, null); Spacer(Modifier.width(6.dp)); Text("Add an app", fontSize = 16.sp)
        }

        if (s.apps.isNotEmpty()) {
            Spacer(Modifier.height(22.dp))
            WeekChart(s, today)
            val reasons = Logic.reasonTotals(s, today, 7)
            if (reasons.isNotEmpty()) { Spacer(Modifier.height(16.dp)); ReasonsCard(reasons) }
        }

        Spacer(Modifier.height(22.dp))
        SettingsCard(s)
        Spacer(Modifier.height(18.dp))
        Text("Made by MES · mes.fm", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 13.sp,
            modifier = Modifier.clickable { ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://mes.fm/mobile-apps"))) }.padding(vertical = 4.dp))
        Text("Want a feature? Tell us at mes.fm/contact", color = MaterialTheme.colorScheme.primary, fontSize = 13.sp,
            modifier = Modifier.clickable { ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://mes.fm/contact?subject=Open%20Limits%20app%20idea"))) }.padding(vertical = 4.dp))
        Text("Privacy policy", color = MaterialTheme.colorScheme.primary, fontSize = 13.sp,
            modifier = Modifier.clickable { ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://mes.fm/privacy-policy#open-limits"))) }.padding(vertical = 4.dp))
        Spacer(Modifier.height(24.dp))
    }

    if (disclosure) AlertDialog(
        onDismissRequest = { disclosure = false },
        title = { Text("How Open Limits uses Accessibility") },
        text = {
            Text("Open Limits uses Android's Accessibility service only to see which app is on screen. That is how it counts your opens, shows the pause screen and locks an app when its opens run out.\n\n" +
                "It does not read what is on your screen, does not type or tap for you, and collects or sends nothing: your limits and counts stay on this phone.\n\n" +
                "On the next screen, tap \"MES Open Limits\" and switch it on.")
        },
        confirmButton = { Button(onClick = {
            disclosure = false
            Store.update(ctx) { it.copy(agreed = true) }
            ctx.startActivity(Intent(AndroidSettings.ACTION_ACCESSIBILITY_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        }) { Text("I agree, open settings") } },
        dismissButton = { TextButton(onClick = { disclosure = false }) { Text("Not now") } },
    )

    editing?.let { r -> EditDialog(s, r, onClose = { editing = null }) }
}

@Composable
private fun AppRow(s: State, day: String, r: AppRule, onClick: () -> Unit) {
    val used = Logic.opens(s, day, r.pkg)
    val left = Logic.left(s, day, r)
    val frac = (used.opens.toFloat() / r.limit).coerceIn(0f, 1f)
    val color = when { !r.on -> MaterialTheme.colorScheme.onSurfaceVariant; left == 0 -> Bad; left <= 1 -> Warn; else -> Ok }
    Card(Modifier.fillMaxWidth().clickable(onClick = onClick), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
        Row(Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
            AppIcon(r.pkg, r.label, 44.dp)
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(r.label, fontWeight = FontWeight.SemiBold, fontSize = 17.sp, color = MaterialTheme.colorScheme.onSurface)
                Text(
                    when {
                        !r.on -> "Paused: no limit right now"
                        left == 0 -> "Locked · ${used.opens} of ${r.limit} opens used" + (if (used.extra > 0) " · +${used.extra} extra" else "")
                        else -> "${used.opens} of ${r.limit} opens · $left left"
                    }, fontSize = 14.sp, color = color,
                )
                Spacer(Modifier.height(6.dp))
                LinearProgressIndicator(progress = { frac }, modifier = Modifier.fillMaxWidth().height(6.dp).clip(RoundedCornerShape(3.dp)),
                    color = color, trackColor = MaterialTheme.colorScheme.surfaceVariant, drawStopIndicator = {})
            }
        }
    }
}

@Composable
private fun WeekChart(s: State, today: LocalDate) {
    val h = Logic.history(s, today, 7)
    val limitTotal = s.apps.filter { it.on }.sumOf { it.limit }
    val max = maxOf(h.maxOf { it.second }, limitTotal, 1)
    val bar = MaterialTheme.colorScheme.primary
    val over = Bad
    val line = MaterialTheme.colorScheme.onSurfaceVariant
    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
        Column(Modifier.padding(16.dp)) {
            Text("Last 7 days", fontWeight = FontWeight.Bold, fontSize = 17.sp, color = MaterialTheme.colorScheme.onSurface)
            Text("Opens per day, all apps · dashed line = your total limit ($limitTotal)", fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(10.dp))
            Canvas(Modifier.fillMaxWidth().height(120.dp)) {
                val w = size.width / h.size
                h.forEachIndexed { i, (_, n) ->
                    val bh = size.height * n / max
                    drawRoundRect(if (n > limitTotal) over else bar, Offset(i * w + w * 0.18f, size.height - bh), Size(w * 0.64f, bh), CornerRadius(8f, 8f))
                }
                val y = size.height - size.height * limitTotal / max
                var x = 0f
                while (x < size.width) { drawLine(line, Offset(x, y), Offset(minOf(x + 14f, size.width), y), 3f); x += 26f }
            }
            Row {
                h.forEach { (d, n) ->
                    Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally) {
                        Text("$n", fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.onSurface)
                        Text(if (d == today) "Today" else d.dayOfWeek.getDisplayName(TextStyle.SHORT, Locale.getDefault()), fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
        }
    }
}

@Composable
private fun ReasonsCard(r: Map<String, Int>) {
    val total = r.values.sum().coerceAtLeast(1)
    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
        Column(Modifier.padding(16.dp)) {
            Text("Why you opened them (7 days)", fontWeight = FontWeight.Bold, fontSize = 17.sp, color = MaterialTheme.colorScheme.onSurface)
            Spacer(Modifier.height(8.dp))
            REASONS.forEach { (id, text) ->
                val n = r[id] ?: 0
                Row(Modifier.padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(text, Modifier.width(150.dp), fontSize = 14.sp, color = MaterialTheme.colorScheme.onSurface)
                    Box(Modifier.weight(1f).height(10.dp).clip(RoundedCornerShape(5.dp)).background(MaterialTheme.colorScheme.surfaceVariant)) {
                        Box(Modifier.fillMaxHeight().fillMaxWidth(n.toFloat() / total).background(if (id == "bored") Warn else MaterialTheme.colorScheme.primary))
                    }
                    Text("  ${n * 100 / total}%", fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun SettingsCard(s: State) {
    val ctx = LocalContext.current
    var strictWait by remember { mutableStateOf(false) }
    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
        Column(Modifier.padding(16.dp)) {
            Text("Settings", fontWeight = FontWeight.Bold, fontSize = 17.sp, color = MaterialTheme.colorScheme.onSurface)
            Spacer(Modifier.height(10.dp))
            Text("Pause before opening", fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.onSurface)
            Text("Wait a few seconds (breathe) before the Open button works.", fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Choices(listOf(0, 3, 5, 10, 15), s.settings.pause, { if (it == 0) "None" else "${it}s" }) { v -> Store.update(ctx) { it.copy(settings = it.settings.copy(pause = v)) } }
            Spacer(Modifier.height(12.dp))
            Text("Same open if you come back within", fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.onSurface)
            Text("Switching to another app and back quickly doesn't use another open.", fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Choices(listOf(0, 1, 3, 5, 10), s.settings.grace, { if (it == 0) "Never" else "$it min" }) { v -> Store.update(ctx) { it.copy(settings = it.settings.copy(grace = v)) } }
            Spacer(Modifier.height(8.dp))
            SwitchRow("Ask why I'm opening it", "Tap a reason on the pause screen; see the reasons here.", s.settings.ask) { v -> Store.update(ctx) { it.copy(settings = it.settings.copy(ask = v)) } }
            SwitchRow("Strict mode", "No \"open anyway\" when an app is locked, and loosening a limit makes you wait 30 seconds.", s.settings.strict) { v ->
                if (!v && s.settings.strict) strictWait = true
                else Store.update(ctx) { it.copy(settings = it.settings.copy(strict = v)) }
            }
            if (s.settings.pause == 0 && !s.settings.ask) Text("With no pause and no question, opens are counted quietly and you only see a screen when an app is almost used up or locked.",
                fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 6.dp))
        }
    }
    if (strictWait) WaitDialog("Turn off strict mode?", onDone = { strictWait = false; Store.update(ctx) { it.copy(settings = it.settings.copy(strict = false)) } }, onCancel = { strictWait = false })
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun Choices(values: List<Int>, cur: Int, label: (Int) -> String, onPick: (Int) -> Unit) {
    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(top = 6.dp)) {
        values.forEach { v -> FilterChip(selected = v == cur, onClick = { onPick(v) }, label = { Text(label(v)) }) }
    }
}

@Composable
private fun SwitchRow(title: String, sub: String, value: Boolean, onChange: (Boolean) -> Unit) {
    Row(Modifier.fillMaxWidth().clickable { onChange(!value) }.padding(vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(title, fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.onSurface)
            Text(sub, fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Switch(checked = value, onCheckedChange = onChange)
    }
}

/** Strict mode: a 30-second wait before a looser setting is saved. */
@Composable
private fun WaitDialog(title: String, onDone: () -> Unit, onCancel: () -> Unit) {
    var left by remember { mutableIntStateOf(30) }
    LaunchedEffect(Unit) { while (left > 0) { delay(1000); left-- } }
    AlertDialog(
        onDismissRequest = onCancel,
        title = { Text(title) },
        text = { Text(if (left > 0) "Strict mode is on. Wait $left seconds… Still want it?" else "OK, you waited. Still want it?") },
        confirmButton = { Button(onClick = onDone, enabled = left == 0) { Text(if (left > 0) "Wait $left" else "Yes, do it") } },
        dismissButton = { TextButton(onClick = onCancel) { Text("Keep it") } },
    )
}

@Composable
private fun EditDialog(s: State, r: AppRule, onClose: () -> Unit) {
    val ctx = LocalContext.current
    var limit by remember { mutableIntStateOf(r.limit) }
    var on by remember { mutableStateOf(r.on) }
    var pending by remember { mutableStateOf<(() -> Unit)?>(null) }
    fun apply(next: AppRule?) {
        val save = {
            Store.update(ctx) { st -> st.copy(apps = if (next == null) st.apps.filter { it.pkg != r.pkg } else st.apps.map { if (it.pkg == r.pkg) next else it }) }
            onClose()
        }
        if (s.settings.strict && Logic.loosens(r, next)) pending = save else save()
    }
    AlertDialog(
        onDismissRequest = onClose,
        icon = { AppIcon(r.pkg, r.label, 48.dp) },
        title = { Text(r.label) },
        text = {
            Column {
                Text("Opens per day", fontWeight = FontWeight.SemiBold)
                Row(verticalAlignment = Alignment.CenterVertically) {
                    OutlinedButton(onClick = { if (limit > 1) limit-- }) { Text("−", fontSize = 20.sp) }
                    Text("$limit", fontSize = 32.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(horizontal = 20.dp))
                    OutlinedButton(onClick = { if (limit < 99) limit++ }) { Text("+", fontSize = 20.sp) }
                }
                Spacer(Modifier.height(8.dp))
                SwitchRow("Limit is on", "Turn off to pause this limit without losing it.", on) { on = it }
                TextButton(onClick = { apply(null) }, colors = ButtonDefaults.textButtonColors(contentColor = Bad)) { Text("Remove this app") }
            }
        },
        confirmButton = { Button(onClick = { apply(r.copy(limit = limit, on = on)) }) { Text("Save") } },
        dismissButton = { TextButton(onClick = onClose) { Text("Cancel") } },
    )
    pending?.let { go -> WaitDialog("Loosen this limit?", onDone = { pending = null; go() }, onCancel = { pending = null }) }
}

@Composable
private fun AddScreen(onDone: () -> Unit) {
    val ctx = LocalContext.current
    val s by Store.state(ctx).collectAsState()
    var all by remember { mutableStateOf<List<Launchable>?>(null) }
    var q by remember { mutableStateOf("") }
    var picked by remember { mutableStateOf<Launchable?>(null) }
    LaunchedEffect(Unit) { all = withContext(Dispatchers.IO) { Apps.launchable(ctx) } }
    val have = s.apps.map { it.pkg }.toSet()
    val list = all.orEmpty().filter { it.pkg !in have && (q.isBlank() || it.label.contains(q.trim(), true)) }
    val popular = if (q.isBlank()) Apps.POPULAR.mapNotNull { p -> list.firstOrNull { it.pkg == p } } else emptyList()

    Column(Modifier.fillMaxSize().systemBarsPadding()) {
        Row(Modifier.padding(8.dp), verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onDone) { Icon(Icons.Filled.ArrowBack, "Back") }
            Text("Add an app", fontSize = 22.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onBackground)
        }
        OutlinedTextField(q, { q = it }, Modifier.fillMaxWidth().padding(horizontal = 16.dp), placeholder = { Text("Search your apps") },
            leadingIcon = { Icon(Icons.Filled.Search, null) }, singleLine = true, keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search))
        if (all == null) Box(Modifier.fillMaxWidth().padding(40.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
        LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp)) {
            if (popular.isNotEmpty()) {
                item { Header("Often limited") }
                items(popular, key = { "p" + it.pkg }) { a -> PickRow(a) { picked = a } }
                item { Header("All apps") }
            }
            items(list, key = { it.pkg }) { a -> PickRow(a) { picked = a } }
            if (all != null && list.isEmpty()) item { Text("No apps match \"$q\".", color = MaterialTheme.colorScheme.onSurfaceVariant) }
        }
    }
    picked?.let { a ->
        var limit by remember(a.pkg) { mutableIntStateOf(5) }
        AlertDialog(
            onDismissRequest = { picked = null },
            icon = { AppIcon(a.pkg, a.label, 48.dp) },
            title = { Text("How many opens a day?") },
            text = {
                Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
                    Text(a.label, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        OutlinedButton(onClick = { if (limit > 1) limit-- }) { Text("−", fontSize = 20.sp) }
                        Text("$limit", fontSize = 36.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(horizontal = 20.dp))
                        OutlinedButton(onClick = { if (limit < 99) limit++ }) { Text("+", fontSize = 20.sp) }
                    }
                    Text("After $limit opens it locks until midnight.", fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            },
            confirmButton = { Button(onClick = {
                Store.update(ctx) { it.copy(apps = it.apps + AppRule(a.pkg, a.label, limit)) }
                picked = null; onDone()
            }) { Text("Add limit") } },
            dismissButton = { TextButton(onClick = { picked = null }) { Text("Cancel") } },
        )
    }
}

@Composable
private fun Header(t: String) = Text(t, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary, modifier = Modifier.padding(top = 12.dp, bottom = 6.dp))

@Composable
private fun PickRow(a: Launchable, onClick: () -> Unit) {
    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).clickable(onClick = onClick).padding(vertical = 10.dp, horizontal = 6.dp), verticalAlignment = Alignment.CenterVertically) {
        AppIcon(a.pkg, a.label, 40.dp)
        Spacer(Modifier.width(14.dp))
        Text(a.label, fontSize = 16.sp, color = MaterialTheme.colorScheme.onBackground)
    }
}
