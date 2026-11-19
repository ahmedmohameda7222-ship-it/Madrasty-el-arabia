package de.madrasty.app

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.unit.LayoutDirection
import androidx.lifecycle.ViewModelProvider
import de.madrasty.app.identity.IdentityScreen
import de.madrasty.app.identity.IdentityViewModel
import de.madrasty.app.ui.SchoolTheme

class MainActivity : ComponentActivity() {
    private var callback by mutableStateOf<Uri?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        if (savedInstanceState == null) callback = intent.data
        val model = ViewModelProvider(this)[IdentityViewModel::class.java]
        setContent {
            val language = LocalConfiguration.current.locales[0].language
            CompositionLocalProvider(LocalLayoutDirection provides if (language == "de") LayoutDirection.Ltr else LayoutDirection.Rtl) {
                SchoolTheme {
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
