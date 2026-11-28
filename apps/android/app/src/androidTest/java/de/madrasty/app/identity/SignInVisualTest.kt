package de.madrasty.app.identity

import android.graphics.Bitmap
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import java.io.File
import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.hasClickAction
import androidx.compose.ui.test.isNotEnabled
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.v2.createAndroidComposeRule
import androidx.compose.ui.unit.dp
import de.madrasty.app.MainActivity
import de.madrasty.app.R
import org.junit.Rule
import org.junit.Test

class SignInVisualTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()

    @Test fun signedOutScreenKeepsActionsAndFullHeightPrimary() {
        val activity = compose.activity
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        InstrumentationRegistry.getArguments().getString("visualPolishFontScale")?.toFloat()?.let { expected ->
            assertEquals(expected, activity.resources.configuration.fontScale, 0.05f)
        }
        val signIn = compose.onNode(hasText(activity.getString(R.string.sign_in)) and isNotEnabled())
        compose.onNode(hasText(activity.getString(R.string.email))).assertIsDisplayed()
        compose.onNode(hasText(activity.getString(R.string.password))).assertIsDisplayed()
        compose.onNode(hasText(activity.getString(R.string.show_password)) and hasClickAction()).assertIsDisplayed()
        // The real activity restores its session asynchronously. During restoration the
        // same button has the loading label, so await the settled signed-out state.
        compose.waitUntil(15_000) { compose.onAllNodes(hasText(activity.getString(R.string.sign_in)) and isNotEnabled()).fetchSemanticsNodes().isNotEmpty() }
        signIn.assertIsDisplayed().assertIsNotEnabled().assertHeightIsAtLeast(48.dp)
        compose.waitForIdle()
        instrumentation.waitForIdleSync()
        val folder = File(requireNotNull(activity.getExternalFilesDir("visual-polish")), "after")
        folder.mkdirs()
        val bitmap = requireNotNull(instrumentation.uiAutomation.takeScreenshot())
        try {
            File(folder, "signed-out-${activity.resources.configuration.locales[0].language}.png").outputStream().use {
                assertTrue(bitmap.compress(Bitmap.CompressFormat.PNG, 100, it))
            }
        } finally { bitmap.recycle() }
    }
}
