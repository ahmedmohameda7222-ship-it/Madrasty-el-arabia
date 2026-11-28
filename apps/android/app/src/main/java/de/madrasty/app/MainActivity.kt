package de.madrasty.app

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalConfiguration
import androidx.core.view.WindowCompat
import androidx.lifecycle.ViewModelProvider
import de.madrasty.app.comms.expireChatCameraFiles
import de.madrasty.app.comms.isSchoolPushIntent
import de.madrasty.app.comms.verifiedPushNotice
import de.madrasty.app.identity.AppDeviceNotificationPreferences
import de.madrasty.app.identity.IdentityScreen
import de.madrasty.app.identity.IdentityViewModel
import de.madrasty.app.identity.readPreferences
import de.madrasty.app.navigation.ReleaseVersionGate
import de.madrasty.app.navigation.schoolResourceFromUri
import de.madrasty.app.ui.InterfaceLanguageProvider
import de.madrasty.app.ui.Persona
import de.madrasty.app.ui.SchoolTheme
import kotlinx.coroutines.CancellationException

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
        val presentationSettings=getPreferences(MODE_PRIVATE)
        setContent {
            var deviceLanguage by remember{mutableStateOf(presentationSettings.getString("interface_language",null)?.takeIf{it=="ar"||it=="de"})}
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
            val language = deviceLanguage ?: preference?.uiLocale ?: fallback
            val darkMode = when (preference?.theme) {
                "dark" -> true
                "light" -> false
                else -> isSystemInDarkTheme()
            }
            SideEffect {
                val systemBars = WindowCompat.getInsetsController(window, window.decorView)
                systemBars.isAppearanceLightStatusBars = !darkMode
                systemBars.isAppearanceLightNavigationBars = !darkMode
            }
            InterfaceLanguageProvider(language,{selected->
                if(selected=="ar"||selected=="de"){
                    deviceLanguage=selected
                    presentationSettings.edit().putString("interface_language",selected).apply()
                }
            },notificationSettings={
                val active=model.session
                if(active!=null&&!active.offlineOnly&&(active.actor.persona!=Persona.Admin||active.assurance=="aal2")){
                    AppDeviceNotificationPreferences(model,LocalConfiguration.current.locales[0].language)
                }
            }){
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
