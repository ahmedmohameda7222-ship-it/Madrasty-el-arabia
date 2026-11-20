package de.madrasty.app

import android.content.ContextWrapper
import android.content.Intent
import android.content.res.Configuration
import android.content.res.Resources
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.unit.LayoutDirection
import androidx.lifecycle.ViewModelProvider
import de.madrasty.app.comms.expireChatCameraFiles
import de.madrasty.app.identity.IdentityScreen
import de.madrasty.app.identity.IdentityViewModel
import de.madrasty.app.identity.readPreferences
import de.madrasty.app.ui.Persona
import de.madrasty.app.ui.SchoolTheme
import kotlinx.coroutines.CancellationException
import java.util.Locale

class MainActivity : ComponentActivity() {
    private var callback by mutableStateOf<Uri?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        if (savedInstanceState == null) {
            expireChatCameraFiles(this)
            callback = intent.data
        }
        val model = ViewModelProvider(this)[IdentityViewModel::class.java]
        setContent {
            val system = LocalConfiguration.current
            val fallback = if (system.locales[0].language == "de") "de" else "ar"
            val session = model.session
            val account = session?.actor?.accountId
            val preference = model.preference?.takeIf { it.first == account }?.second
            LaunchedEffect(account,session?.assurance,session?.actor?.persona) {
                if (account == null || session.offlineOnly || session.actor.persona == Persona.Admin && session.assurance != "aal2") return@LaunchedEffect
                try {
                    val found = model.readPreferences(fallback)
                    model.applyPreferences(account,found)
                } catch (error: CancellationException) {
                    throw error
                } catch (_: Exception) {
                    // The account screen can retry. Current-session display stays available.
                }
            }
            val language = preference?.uiLocale ?: fallback
            val localized = remember(system,language) {
                val configuration = Configuration(system).apply { setLocale(Locale.forLanguageTag(language)) }
                val localizedResources = createConfigurationContext(configuration).resources
                object : ContextWrapper(this@MainActivity) {
                    override fun getResources(): Resources = localizedResources
                }
            }
            val darkMode = when (preference?.theme) {
                "dark" -> true
                "light" -> false
                else -> isSystemInDarkTheme()
            }
            CompositionLocalProvider(
                LocalContext provides localized,
                LocalConfiguration provides localized.resources.configuration,
                LocalLayoutDirection provides if (language == "de") LayoutDirection.Ltr else LayoutDirection.Rtl,
            ) {
                SchoolTheme(darkMode = darkMode) {
                    Surface(color = MaterialTheme.colorScheme.background) {
                        IdentityScreen(model, callback) { callback = null }
                    }
                }
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        callback = intent.data
    }
}
