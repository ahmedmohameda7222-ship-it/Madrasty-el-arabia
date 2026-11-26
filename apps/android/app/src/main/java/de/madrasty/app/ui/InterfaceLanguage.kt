package de.madrasty.app.ui

import android.content.ContextWrapper
import android.content.res.Configuration
import android.content.res.Resources
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.remember
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import de.madrasty.app.R
import java.util.Locale

internal val LocalChangeInterfaceLanguage = staticCompositionLocalOf<((String)->Unit)?> { null }
private val LocalNotificationSettings = staticCompositionLocalOf<(@Composable ()->Unit)?> { null }

/** Update only composition locals; do not recreate Activity or key the screen by language. */
@Composable
internal fun InterfaceLanguageProvider(language:String,change:(String)->Unit,notificationSettings:(@Composable ()->Unit)?=null,content:@Composable ()->Unit){
    val context=LocalContext.current
    val system=LocalConfiguration.current
    val localized=remember(context,system,language){
        val configuration=Configuration(system).apply{setLocale(Locale.forLanguageTag(language))}
        val resources=context.createConfigurationContext(configuration).resources
        object:ContextWrapper(context){override fun getResources():Resources=resources}
    }
    CompositionLocalProvider(
        LocalContext provides localized,
        LocalConfiguration provides localized.resources.configuration,
        LocalLayoutDirection provides if(language=="de") LayoutDirection.Ltr else LayoutDirection.Rtl,
        LocalChangeInterfaceLanguage provides change,
        LocalNotificationSettings provides notificationSettings,
        content=content,
    )
}
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun InterfaceSettingsAction(){
    val change=LocalChangeInterfaceLanguage.current?:return
    val notifications=LocalNotificationSettings.current
    var open by remember{mutableStateOf(false)}
    IconButton(onClick={open=true}){
        Icon(painterResource(R.drawable.ic_settings),contentDescription=stringResource(R.string.app_settings))
    }
    if(open){
        ModalBottomSheet(onDismissRequest={open=false}){
            Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(horizontal=20.dp,vertical=12.dp),
                verticalArrangement=Arrangement.spacedBy(12.dp)){
                Text(stringResource(R.string.app_settings),style=MaterialTheme.typography.titleLarge)
                Text(stringResource(R.string.account_ui_language),style=MaterialTheme.typography.titleMedium)
                val language=LocalConfiguration.current.locales[0].language
                Row(horizontalArrangement=Arrangement.spacedBy(8.dp)){
                    listOf("ar" to "العربية","de" to "Deutsch").forEach{(value,label)->
                        FilterChip(selected=language==value,onClick={if(value!=language)change(value)},label={Text(label)})
                    }
                }
                notifications?.invoke()
                TextButton(onClick={open=false},modifier=Modifier.heightIn(min=48.dp)){Text(stringResource(R.string.close))}
            }
        }
    }
}
/** Detail screens keep their existing content and state while exposing the app settings shortcut. */
@Composable
internal fun InterfaceLanguageWorkspace(content:@Composable ()->Unit){
    if(LocalChangeInterfaceLanguage.current==null){content();return}
    Column(Modifier.fillMaxSize().statusBarsPadding()){
        Row(Modifier.fillMaxWidth().padding(horizontal=12.dp),horizontalArrangement=Arrangement.End){InterfaceSettingsAction()}
        Box(Modifier.weight(1f).fillMaxWidth()){content()}
    }
}
