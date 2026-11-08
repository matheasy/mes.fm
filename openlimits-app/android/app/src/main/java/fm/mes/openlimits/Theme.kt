package fm.mes.openlimits

import android.graphics.drawable.Drawable
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.graphics.drawable.toBitmap

val Indigo = Color(0xFF4338CA)
val IndigoLight = Color(0xFFA5B4FC)
val Ok = Color(0xFF15803D)
val Warn = Color(0xFFB45309)
val Bad = Color(0xFFB91C1C)

private val Light = lightColorScheme(
    primary = Indigo, onPrimary = Color.White, primaryContainer = Color(0xFFE0E7FF), onPrimaryContainer = Color(0xFF1E1B4B),
    background = Color(0xFFF7F7FB), surface = Color.White, surfaceVariant = Color(0xFFEEEEF6),
    onBackground = Color(0xFF16161D), onSurface = Color(0xFF16161D), onSurfaceVariant = Color(0xFF4B4B5C),
)
private val Dark = darkColorScheme(
    primary = IndigoLight, onPrimary = Color(0xFF1E1B4B), primaryContainer = Color(0xFF312E81), onPrimaryContainer = Color(0xFFE0E7FF),
    background = Color(0xFF121218), surface = Color(0xFF1C1C24), surfaceVariant = Color(0xFF272733),
    onBackground = Color(0xFFEDEDF4), onSurface = Color(0xFFEDEDF4), onSurfaceVariant = Color(0xFFB9B9C8),
)

@Composable
fun OLTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = if (isSystemInDarkTheme()) Dark else Light, content = content)
}

/** The app's own icon (or its first letter if it is gone). */
@Composable
fun AppIcon(pkg: String, label: String, size: Dp = 40.dp) {
    val ctx = LocalContext.current
    val bmp = remember(pkg) { Apps.icon(ctx, pkg)?.let { d: Drawable -> d.toBitmap(128, 128).asImageBitmap() } }
    if (bmp != null) Image(bmp, contentDescription = null, modifier = Modifier.size(size))
    else Box(Modifier.size(size).clip(RoundedCornerShape(10.dp)).background(Indigo), contentAlignment = Alignment.Center) {
        Text(label.take(1).uppercase(), color = Color.White, fontWeight = FontWeight.Bold, fontSize = (size.value * 0.45f).sp)
    }
}
