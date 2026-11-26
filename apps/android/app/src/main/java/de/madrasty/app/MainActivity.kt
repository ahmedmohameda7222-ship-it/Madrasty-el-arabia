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
import androidx.compose.runtime.Composable
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
import de.madrasty.app.comms.isSchoolPushIntent
import de.madrasty.app.comms.verifiedPushNotice
import de.madrasty.app.identity.IdentityScreen
import de.madrasty.app.identity.IdentityViewModel
import de.madrasty.app.identity.readPreferences
import de.madrasty.app.navigation.ReleaseVersionGate
import de.madrasty.app.navigation.schoolResourceFromUri
import de.madrasty.app.ui.Persona
import de.madrasty.app.ui.SchoolTheme
import kotlinx.coroutines.CancellationException
import java.util.Locale

class MainActivity : ComponentActivity() {
    private var callback by mutableStateOf<Uri?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val model = ViewModelProvider(this)[IdentityViewModel::class.java]
        if (savedInstanceState == null) {
            expireChatCameraFiles(this)
            acceptIntent(intent,model)
        }
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
            val darkMode = when (preference?.theme) {
                "dark" -> true
                "light" -> false
                else -> isSystemInDarkTheme()
            }
            SchoolLocaleProvider(language) {
                SchoolTheme(darkMode = darkMode) {
                    Surface(color = MaterialTheme.colorScheme.background) {
                        ReleaseVersionGate(model) {
                            IdentityScreen(model, callback) { callback = null }
                        }
                    }
                }
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        acceptIntent(intent,ViewModelProvider(this)[IdentityViewModel::class.java])
    }

    private fun acceptIntent(intent:Intent,model:IdentityViewModel){
        if(isSchoolPushIntent(intent)){
            verifiedPushNotice(this,intent)?.let(model::routePushNotice)
        } else {
            val route = schoolResourceFromUri(intent.data)
            if (route == null) callback = intent.data
            else {
                callback = null
                model.routeSchoolResource(route)
            }
        }
    }
}

/** Change presentation locals in place. Do not key the workspace by locale,
 * recreate the Activity, or replace the identity/navigation ViewModel. */
@Composable
internal fun SchoolLocaleProvider(language:String,content:@Composable ()->Unit){
    val system=LocalConfiguration.current
    val base=LocalContext.current
    val localized=remember(base,system,language){
        val configuration=Configuration(system).apply{setLocale(Locale.forLanguageTag(language))}
        val localizedResources=base.createConfigurationContext(configuration).resources
        object:ContextWrapper(base){
            override fun getResources():Resources=localizedResources
        }
    }
    CompositionLocalProvider(
        LocalContext provides localized,
        LocalConfiguration provides localized.resources.configuration,
        LocalLayoutDirection provides if(language=="de")LayoutDirection.Ltr else LayoutDirection.Rtl,
        content=content
    )
}
