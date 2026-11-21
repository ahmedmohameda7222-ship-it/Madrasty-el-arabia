package de.madrasty.app.ui

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

private val light = lightColorScheme(
    primary = Color(0xFF076E61), onPrimary = Color.White,
    primaryContainer = Color(0xFFE0F1EB), onPrimaryContainer = Color(0xFF0F4036),
    secondaryContainer = Color(0xFFE0F1EB), onSecondaryContainer = Color(0xFF0F4036),
    background = Color(0xFFF7F9FC), onBackground = Color(0xFF172C37),
    surface = Color.White, onSurface = Color(0xFF172C37),
    surfaceVariant = Color(0xFFEDF2F8), onSurfaceVariant = Color(0xFF3C5664),
    outlineVariant = Color(0xFFE7EDF3),
    error = Color(0xFF9C332B),
)

private val dark = darkColorScheme(
    primary = Color(0xFF8BDEC0), onPrimary = Color(0xFF10332A),
    primaryContainer = Color(0xFF234339), onPrimaryContainer = Color(0xFFCDF5E7),
    secondaryContainer = Color(0xFF234339), onSecondaryContainer = Color(0xFFCDF5E7),
    background = Color(0xFF0E1623), onBackground = Color(0xFFF3F6FB),
    surface = Color(0xFF1B2634), onSurface = Color(0xFFF3F6FB),
    surfaceVariant = Color(0xFF162131), onSurfaceVariant = Color(0xFFD4DDEB),
    outlineVariant = Color(0xFF354556),
    error = Color(0xFFFFB4A9),
)

private val schoolTypography = Typography().let { base ->
    base.copy(
        headlineMedium = base.headlineMedium.copy(fontSize = 28.sp, fontWeight = FontWeight.Bold),
        titleLarge = base.titleLarge.copy(fontSize = 20.sp, fontWeight = FontWeight.SemiBold),
        bodyLarge = base.bodyLarge.copy(fontSize = 16.sp, lineHeight = 25.sp),
        bodySmall = base.bodySmall.copy(fontSize = 14.sp, lineHeight = 20.sp),
    )
}

@Composable
fun SchoolTheme(darkMode: Boolean = isSystemInDarkTheme(), content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = if (darkMode) dark else light,
        typography = schoolTypography,
        content = content,
    )
}
