package de.madrasty.app.finance

import android.content.ContentValues
import android.content.res.Configuration
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.graphics.Bitmap
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.test.ExperimentalTestApi
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.captureToImage
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.unit.LayoutDirection
import androidx.test.platform.app.InstrumentationRegistry
import de.madrasty.app.R
import de.madrasty.app.ui.SchoolTheme
import org.json.JSONObject
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import java.util.Locale

/**
 * Native, on-emulator visual fixture using the production finance presentation
 * and theme. No auth token, live network or financial mutation. This is component/
 * screen layout evidence; authenticated workflow evidence comes from browser QA.
 */
class FinanceVisualTest {
    @get:Rule val compose = createComposeRule()

    @Test fun adminDeLight() = capture("de", false, false)
    @Test fun adminArDark() = capture("ar", true, false)
    @Test fun payerDeDark() = capture("de", true, true)
    @Test fun payerArLight() = capture("ar", false, true)

    @OptIn(ExperimentalTestApi::class)
    private fun capture(language: String, dark: Boolean, payer: Boolean) {
        val ar = language == "ar"
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val target = instrumentation.targetContext
        compose.setContent {
            val context = LocalContext.current
            val localized = remember(language, context) {
                context.createConfigurationContext(Configuration(context.resources.configuration).apply {
                    setLocale(Locale.forLanguageTag(language))
                })
            }
            CompositionLocalProvider(
                LocalContext provides localized,
                LocalConfiguration provides localized.resources.configuration,
                LocalLayoutDirection provides if (ar) LayoutDirection.Rtl else LayoutDirection.Ltr,
            ) {
                SchoolTheme(darkMode = dark) {
                    Surface(color = MaterialTheme.colorScheme.background) {
                        FinancePage(if (payer) R.string.finance_my_payments else R.string.fee_invoices, {}) {
                            if (payer) {
                                FinancePayerSummary(listOf(JSONObject()
                                    .put("currency", "EUR")
                                    .put("outstandingMinor", 5100L)
                                    .put("collectibleMinor", 8300L)
                                    .put("appliedMinor", 3200L)), {})
                            } else {
                                FinanceBalanceCard(stringResource(R.string.cashbook_balance), financeMoney(8400L, "EUR"))
                                Button(onClick = {}, modifier = Modifier.fillMaxWidth()) {
                                    Text(stringResource(R.string.receipt_record))
                                }
                            }
                            FinanceRecordRow(
                                title = if (ar) "عبد الرحمن محمد أحمد إبراهيم مصطفى عبد الله السيد محمود" else "Johanna Marie Sophie von Hohenlohe-Langenburg-Wiśniewska-Kowalczyk",
                                subtitle = "2026-11 · QA-001", amount = financeMoney(5100L, "EUR"),
                                status = stringResource(R.string.fee_unpaid), onClick = {},
                            )
                            FinanceRecordRow(
                                title = if (ar) "نور" else "Noor",
                                subtitle = "2026-11 · QA-002", amount = financeMoney(2000L, "EUR"),
                                status = stringResource(R.string.fee_partial), onClick = {},
                            )
                            FinanceRecordRow(
                                title = if (ar) "أمينة" else "Amina",
                                subtitle = "2026-11 · QA-003", amount = financeMoney(0L, "EUR"),
                                status = stringResource(R.string.fee_paid), onClick = {},
                            )
                        }
                    }
                }
            }
        }
        compose.onNodeWithText(if (payer) (if (ar) "مدفوعاتي" else "Meine Zahlungen") else (if (ar) "الفواتير" else "Rechnungen")).assertIsDisplayed()
        compose.waitForIdle()
        instrumentation.waitForIdleSync()
        // Capture the app window, not unrelated emulator launcher/system dialogs.
        val bitmap = compose.onRoot().captureToImage().asAndroidBitmap()
        assertTrue(bitmap.width >= 640 && bitmap.height >= 1000)
        check(Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q)
        val name = "finance-native-fixture-${if(payer) "payer" else "admin"}-$language-${if(dark) "dark" else "light"}.png"
        val resolver = target.contentResolver
        val uri = requireNotNull(resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, ContentValues().apply {
            put(MediaStore.MediaColumns.DISPLAY_NAME, name)
            put(MediaStore.MediaColumns.MIME_TYPE, "image/png")
            put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/madrasty-finance-qa")
            put(MediaStore.MediaColumns.IS_PENDING, 1)
        }))
        requireNotNull(resolver.openOutputStream(uri)).use { assertTrue(bitmap.compress(Bitmap.CompressFormat.PNG, 100, it)) }
        resolver.update(uri, ContentValues().apply { put(MediaStore.MediaColumns.IS_PENDING, 0) }, null, null)
        bitmap.recycle()
    }
}
