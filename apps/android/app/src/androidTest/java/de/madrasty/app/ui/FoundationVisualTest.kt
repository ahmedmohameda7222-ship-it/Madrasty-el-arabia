package de.madrasty.app.ui

import android.content.res.Configuration
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
import androidx.compose.ui.test.assertWidthIsAtLeast
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.assertIsNotSelected
import androidx.compose.ui.test.hasClickAction
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.test.performSemanticsAction
import androidx.compose.ui.text.TextLayoutResult
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.test.platform.app.InstrumentationRegistry
import de.madrasty.app.R
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import java.util.Locale

/** Exercises the actual school shell and hero against local Compose state. */
class FoundationVisualTest {
    @get:Rule val compose = createComposeRule()

    @Test fun adminGermanLight() = verify("de", false, Persona.Admin)
    @Test fun guardianArabicDark() = verify("ar", true, Persona.Guardian)
    @Test fun teacherGermanDark() = verify("de", true, Persona.Teacher)
    @Test fun teacherArabicLight() = verify("ar", false, Persona.Teacher)

    private fun verify(language: String, dark: Boolean, persona: Persona) {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val context = instrumentation.targetContext
        InstrumentationRegistry.getArguments().getString("visualPolishFontScale")?.toFloat()?.let { expected ->
            assertEquals(expected, context.resources.configuration.fontScale, 0.05f)
        }
        val baseline = InstrumentationRegistry.getArguments().getString("visualPolishBaseline") == "true"
        val arabic = language == "ar"
        val resources = context.createConfigurationContext(Configuration(context.resources.configuration).apply {
            setLocale(Locale.forLanguageTag(language))
        }).resources
        val title = when (persona) {
            Persona.Admin -> if (arabic) "مهام المدرسة" else "Aufgaben der Schule"
            Persona.Teacher -> if (arabic) "حصص اليوم" else "Unterricht heute"
            Persona.Guardian -> if (arabic) "مدرسة تجريبية" else "Meine Kinder"
        }
        val action = when (persona) {
            Persona.Admin -> if (arabic) "افتح المهام" else "Aufgaben öffnen"
            Persona.Teacher -> if (arabic) "افتح الحضور" else "Anwesenheit öffnen"
            Persona.Guardian -> if (arabic) "افتح بيانات الطفل" else "Kind ansehen"
        }
        val alternate = if (arabic) "الفصل الثاني" else "Zweite Klasse"
        val detail = if (arabic) "٣ مهام مفتوحة" else "3 offene Aufgaben"
        val destination = if (arabic) "عرض تجريبي" else "Testansicht"
        val prefix = "${persona.name.lowercase()}-$language-${if (dark) "dark" else "light"}"
        var observedCanvas = Color.Unspecified
        var observedTab = SchoolTab.Home

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
                    var selected by remember { mutableStateOf(SchoolTab.Home) }
                    SideEffect { observedCanvas = canvas; observedTab = selected }
                    val choices = listOf(ScopeOption("one", if (arabic) "الفصل الأول" else "Erste Klasse"), ScopeOption("two", alternate))
                    var scope by remember { mutableStateOf(choices.first()) }
                    SchoolShell(
                        actor = SchoolPartition("fixture", "fixture", persona),
                        selected = selected,
                        changeTab = { selected = it },
                        selectedScope = scope,
                        choices = choices,
                        unreadMessages = 105,
                        selectScope = { id -> scope = choices.single { it.id == id } },
                    ) { tab ->
                        if (tab == SchoolTab.Home) {
                            if (persona == Persona.Admin) AdminRoleHero(title, detail, action, listOf(alternate)) { selected = SchoolTab.More }
                            else RoleHero(persona, title, detail, action) { selected = SchoolTab.More }
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
                saveVisualEvidence(context, bitmap, "$prefix-$scene.png", if (baseline) "before" else "after")
            } finally { bitmap.recycle() }
        }

        compose.onNodeWithText(title).assertIsDisplayed()
        capture("home")
        compose.onNodeWithText(resources.getString(R.string.choose_scope)).performClick()
        compose.onNodeWithText(isolate(alternate)).assertIsDisplayed()
        capture("scope")
        compose.onNodeWithText(isolate(alternate)).performClick()
        compose.onNodeWithText(isolate(alternate)).assertIsDisplayed()
        val heroAction = compose.onNodeWithText(action).performScrollTo()
        if (!baseline) heroAction.assertHeightIsAtLeast(48.dp)
        heroAction.performClick()
        compose.onNodeWithText(destination).assertIsDisplayed()
        compose.onNodeWithText(resources.getString(R.string.nav_home)).performClick()
        compose.onNodeWithText(title).assertIsDisplayed()
        if (!baseline) {
            // Accessibility typography must keep complete words readable, not merely
            // expose the correct semantics on a fragmented/clipped visual label.
            val second = when (persona) {
                Persona.Admin -> SchoolTab.Students
                Persona.Teacher -> SchoolTab.Attendance
                Persona.Guardian -> SchoolTab.Children
            }
            assertWholeWords(resources.getString(R.string.app_name))
            val tabs = listOf(SchoolTab.Home, second, SchoolTab.Messages, SchoolTab.Calendar, SchoolTab.More)
            tabs.forEach { assertWholeWords(resources.getString(it.label)) }
            compose.onNodeWithContentDescription(resources.getString(R.string.comms_unread_badge, 105), useUnmergedTree = true)
                .assertIsDisplayed()
            assertWholeWords("99+")
            val badgeText = compose.onNodeWithText("99+", useUnmergedTree = true).fetchSemanticsNode()
            assertTrue("Unread badge is horizontally clipped", badgeText.boundsInRoot.width + 1 >= badgeText.size.width)
            assertTrue("Unread badge is vertically clipped", badgeText.boundsInRoot.height + 1 >= badgeText.size.height)
            // Reflow must not remove destinations, reduce touch targets or change selection.
            tabs.forEach { tab ->
                val item = compose.onNode(hasText(resources.getString(tab.label)) and hasClickAction())
                item.assertIsDisplayed().assertHeightIsAtLeast(48.dp).assertWidthIsAtLeast(48.dp)
                item.performClick()
                item.assertIsSelected()
                tabs.filter { it != tab }.forEach { other ->
                    compose.onNode(hasText(resources.getString(other.label)) and hasClickAction()).assertIsNotSelected()
                }
                compose.runOnIdle { assertEquals(tab, observedTab) }
            }
            compose.onNode(hasText(resources.getString(R.string.nav_home)) and hasClickAction()).performClick()
            compose.onNodeWithText(title).assertIsDisplayed()
            compose.runOnIdle {
                assertEquals(if (dark) Color(0xFF111A18) else Color(0xFFF5F6F2), observedCanvas)
            }
        }
    }
    private fun assertWholeWords(label: String) {
        val layouts = mutableListOf<TextLayoutResult>()
        compose.onNodeWithText(label, useUnmergedTree = true)
            .performSemanticsAction(SemanticsActions.GetTextLayoutResult) { action ->
                assertTrue("No text layout for $label", action(layouts))
            }
        assertTrue("No text layout for $label", layouts.isNotEmpty())
        layouts.forEach { layout ->
            val details = "size=${layout.size}, paragraph=${layout.multiParagraph.width}x${layout.multiParagraph.height}, widthOverflow=${layout.didOverflowWidth}, heightOverflow=${layout.didOverflowHeight}, lines=${layout.lineCount}"
            assertTrue("Clipped text: $label ($details)", !layout.hasVisualOverflow)
            val text = layout.layoutInput.text.text
            Regex("\\S+").findAll(text).forEach { word ->
                assertEquals(
                    "Word split across lines in $label: ${word.value}",
                    layout.getLineForOffset(word.range.first),
                    layout.getLineForOffset(word.range.last),
                )
            }
        }
    }
}
