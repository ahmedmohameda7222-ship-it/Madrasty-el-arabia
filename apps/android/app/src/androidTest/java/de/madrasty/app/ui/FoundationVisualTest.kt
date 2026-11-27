package de.madrasty.app.ui

import android.content.res.Configuration
import android.graphics.Bitmap
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.test.platform.app.InstrumentationRegistry
import de.madrasty.app.R
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import java.io.File
import java.util.Locale

/** Exercises the actual school shell and hero against local Compose state. */
class FoundationVisualTest {
    @get:Rule val compose = createComposeRule()

    @Test fun adminGermanLight() = verify("de", false, Persona.Admin)
    @Test fun guardianArabicDark() = verify("ar", true, Persona.Guardian)

    private fun verify(language: String, dark: Boolean, persona: Persona) {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val context = instrumentation.targetContext
        val baseline = InstrumentationRegistry.getArguments().getString("visualPolishBaseline") == "true"
        val arabic = language == "ar"
        val resources = context.createConfigurationContext(Configuration(context.resources.configuration).apply {
            setLocale(Locale.forLanguageTag(language))
        }).resources
        val title = if (arabic) "مدرسة تجريبية" else "Aufgaben der Schule"
        val action = if (arabic) "افتح بيانات الطفل" else "Aufgaben öffnen"
        val alternate = if (arabic) "الفصل الثاني" else "Zweite Klasse"
        val detail = if (arabic) "٣ مهام مفتوحة" else "3 offene Aufgaben"
        val destination = if (arabic) "عرض تجريبي" else "Testansicht"
        val folder = File(requireNotNull(context.getExternalFilesDir("visual-polish")), if (baseline) "before" else "after")
        val prefix = "${persona.name.lowercase()}-$language-${if (dark) "dark" else "light"}"
        var observedCanvas = Color.Unspecified

        compose.setContent {
            val current = LocalContext.current
            val localized = remember(current, language) {
                current.createConfigurationContext(Configuration(current.resources.configuration).apply {
                    setLocale(Locale.forLanguageTag(language))
                })
            }
            CompositionLocalProvider(
                LocalContext provides localized,
                LocalConfiguration provides localized.resources.configuration,
                LocalLayoutDirection provides if (arabic) LayoutDirection.Rtl else LayoutDirection.Ltr,
            ) {
                SchoolTheme(darkMode = dark) {
                    val canvas = MaterialTheme.colorScheme.background
                    SideEffect { observedCanvas = canvas }
                    var selected by remember { mutableStateOf(SchoolTab.Home) }
                    val choices = listOf(ScopeOption("one", if (arabic) "الفصل الأول" else "Erste Klasse"), ScopeOption("two", alternate))
                    var scope by remember { mutableStateOf(choices.first()) }
                    SchoolShell(
                        actor = SchoolPartition("fixture", "fixture", persona),
                        selected = selected,
                        changeTab = { selected = it },
                        selectedScope = scope,
                        choices = choices,
                        selectScope = { id -> scope = choices.single { it.id == id } },
                    ) { tab ->
                        if (tab == SchoolTab.Home) {
                            RoleHero(persona, title, detail, action) { selected = SchoolTab.More }
                        } else {
                            Text(destination)
                        }
                    }
                }
            }
        }

        fun capture(scene: String) {
            compose.waitForIdle()
            instrumentation.waitForIdleSync()
            val bitmap = requireNotNull(instrumentation.uiAutomation.takeScreenshot())
            try {
                folder.mkdirs()
                File(folder, "$prefix-$scene.png").outputStream().use {
                    assertTrue(bitmap.compress(Bitmap.CompressFormat.PNG, 100, it))
                }
            } finally { bitmap.recycle() }
        }

        compose.onNodeWithText(title).assertIsDisplayed()
        capture("home")
        compose.onNodeWithText(resources.getString(R.string.choose_scope)).performClick()
        compose.onNodeWithText(isolate(alternate)).assertIsDisplayed()
        capture("scope")
        compose.onNodeWithText(isolate(alternate)).performClick()
        compose.onNodeWithText(isolate(alternate)).assertIsDisplayed()
        val heroAction = compose.onNodeWithText(action)
        if (!baseline) heroAction.assertHeightIsAtLeast(48.dp)
        heroAction.performClick()
        compose.onNodeWithText(destination).assertIsDisplayed()
        compose.onNodeWithText(resources.getString(R.string.nav_home)).performClick()
        compose.onNodeWithText(title).assertIsDisplayed()
        if (!baseline) {
            compose.runOnIdle {
                assertEquals(if (dark) Color(0xFF111A18) else Color(0xFFF5F6F2), observedCanvas)
            }
        }
    }
}
