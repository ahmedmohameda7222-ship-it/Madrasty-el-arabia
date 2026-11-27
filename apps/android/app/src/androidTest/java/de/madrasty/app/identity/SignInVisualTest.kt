package de.madrasty.app.identity

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
        val signIn = compose.onNode(hasText(activity.getString(R.string.sign_in)) and isNotEnabled())
        compose.onNode(hasText(activity.getString(R.string.email))).assertIsDisplayed()
        compose.onNode(hasText(activity.getString(R.string.password))).assertIsDisplayed()
        compose.onNode(hasText(activity.getString(R.string.show_password)) and hasClickAction()).assertIsDisplayed()
        signIn.assertIsDisplayed().assertIsNotEnabled().assertHeightIsAtLeast(48.dp)
    }
}
