package fm.mes.dimvolume

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val Night = Color(0xFF4338CA)
private val Light = lightColorScheme(
    primary = Night, onPrimary = Color.White, primaryContainer = Color(0xFFE0E7FF), onPrimaryContainer = Color(0xFF1E1B4B),
    background = Color(0xFFF6F5FB), surface = Color.White, surfaceVariant = Color(0xFFEEEEF6),
    onBackground = Color(0xFF16161D), onSurface = Color(0xFF16161D), onSurfaceVariant = Color(0xFF4B4B5C),
)
private val Dark = darkColorScheme(
    primary = Color(0xFFA5B4FC), onPrimary = Color(0xFF1E1B4B), primaryContainer = Color(0xFF312E81), onPrimaryContainer = Color(0xFFE0E7FF),
    background = Color(0xFF0E0E14), surface = Color(0xFF1A1A22), surfaceVariant = Color(0xFF262630),
    onBackground = Color(0xFFEDEDF4), onSurface = Color(0xFFEDEDF4), onSurfaceVariant = Color(0xFFB9B9C8),
)

@Composable
fun DVTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = if (isSystemInDarkTheme()) Dark else Light, content = content)
}
