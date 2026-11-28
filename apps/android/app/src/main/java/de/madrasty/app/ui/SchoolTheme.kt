package de.madrasty.app.ui

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

private val light = lightColorScheme(
    primary = Color(0xFF155544), onPrimary = Color.White,
    surfaceTint = Color(0xFF155544),
    primaryContainer = Color(0xFFE0EEE5), onPrimaryContainer = Color(0xFF184A3A),
    secondary = Color(0xFF496459), onSecondary = Color.White,
    secondaryContainer = Color(0xFFE0EEE5), onSecondaryContainer = Color(0xFF184A3A),
    tertiary = Color(0xFF733F46), onTertiary = Color.White,
    tertiaryContainer = Color(0xFFF4DFE2), onTertiaryContainer = Color(0xFF592C35),
    background = Color(0xFFF5F6F2), onBackground = Color(0xFF17221E),
    surface = Color.White, onSurface = Color(0xFF17221E),
    surfaceVariant = Color(0xFFE9EDE8), onSurfaceVariant = Color(0xFF536259),
    surfaceContainerLowest = Color.White,
    surfaceContainerLow = Color(0xFFF5F6F2),
    surfaceContainer = Color(0xFFEFF2ED),
    surfaceContainerHigh = Color(0xFFE9EDE8),
    surfaceContainerHighest = Color(0xFFE2E8E2),
    outline = Color(0xFF77887E), outlineVariant = Color(0xFFDCE4DD),
    error = Color(0xFF9C332B), onError = Color.White,
)

private val dark = darkColorScheme(
    primary = Color(0xFFA1E0C6), onPrimary = Color(0xFF13362B),
    surfaceTint = Color(0xFFCCCCCC),
    primaryContainer = Color(0xFF29483B), onPrimaryContainer = Color(0xFFC8EFDD),
    secondary = Color(0xFFC5C5C5), onSecondary = Color(0xFF262626),
    secondaryContainer = Color(0xFF303030), onSecondaryContainer = Color(0xFFFFFFFF),
    tertiary = Color(0xFFF0AFB7), onTertiary = Color(0xFF472029),
    tertiaryContainer = Color(0xFF623640), onTertiaryContainer = Color(0xFFFFDADF),
    background = Color(0xFF000000), onBackground = Color(0xFFFFFFFF),
    surface = Color(0xFF1C1C1C), onSurface = Color(0xFFFFFFFF),
    surfaceVariant = Color(0xFF262626), onSurfaceVariant = Color(0xFFB8B8B8),
    surfaceContainerLowest = Color(0xFF000000),
    surfaceContainerLow = Color(0xFF121212),
    surfaceContainer = Color(0xFF1C1C1C),
    surfaceContainerHigh = Color(0xFF262626),
    surfaceContainerHighest = Color(0xFF303030),
    surfaceDim = Color(0xFF121212), surfaceBright = Color(0xFF303030),
    inverseSurface = Color(0xFFEDEDED), inverseOnSurface = Color(0xFF1C1C1C),
    outline = Color(0xFF8E8E8E), outlineVariant = Color(0xFF3B3B3B),
    error = Color(0xFFFFB4A9), onError = Color(0xFF60140F),
)

private val schoolShapes = Shapes(
    extraSmall = RoundedCornerShape(10.dp),
    small = RoundedCornerShape(14.dp),
    medium = RoundedCornerShape(16.dp),
    large = RoundedCornerShape(22.dp),
    extraLarge = RoundedCornerShape(28.dp),
)

private val schoolTypography = Typography().let { base ->
    base.copy(
        headlineMedium = base.headlineMedium.copy(fontSize = 32.sp, lineHeight = 40.sp, fontWeight = FontWeight.Bold),
        titleLarge = base.titleLarge.copy(fontSize = 22.sp, lineHeight = 29.sp, fontWeight = FontWeight.SemiBold),
        bodyLarge = base.bodyLarge.copy(fontSize = 16.sp, lineHeight = 25.sp, letterSpacing = 0.sp),
        bodySmall = base.bodySmall.copy(fontSize = 14.sp, lineHeight = 21.sp, letterSpacing = 0.sp),
        labelLarge = base.labelLarge.copy(fontWeight = FontWeight.SemiBold, letterSpacing = 0.sp),
    )
}

internal val LocalSchoolDarkTheme = staticCompositionLocalOf { false }

@Composable
fun SchoolTheme(darkMode: Boolean = isSystemInDarkTheme(), content: @Composable () -> Unit) {
    CompositionLocalProvider(LocalSchoolDarkTheme provides darkMode) {
        MaterialTheme(
            colorScheme = if (darkMode) dark else light,
            typography = schoolTypography,
            shapes = schoolShapes,
            content = content,
        )
    }
}
