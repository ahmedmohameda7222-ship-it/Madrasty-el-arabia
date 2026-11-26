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
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.remember
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import java.util.Locale

internal val LocalChangeInterfaceLanguage = staticCompositionLocalOf<((String)->Unit)?> { null }

/** Update only composition locals; do not recreate Activity or key the screen by language. */
@Composable
internal fun InterfaceLanguageProvider(language:String,change:(String)->Unit,content:@Composable ()->Unit){
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
        content=content,
    )
}
@Composable
internal fun InterfaceLanguageAction(){
    val change=LocalChangeInterfaceLanguage.current?:return
    val next=if(LocalConfiguration.current.locales[0].language=="ar")"de" else "ar"
    TextButton(onClick={change(next)},modifier=Modifier.heightIn(min=48.dp)){
        Text(if(next=="ar")"العربية" else "Deutsch")
    }
}
/** Detail screens keep their existing content and state while exposing the same language action. */
@Composable
internal fun InterfaceLanguageWorkspace(content:@Composable ()->Unit){
    if(LocalChangeInterfaceLanguage.current==null){content();return}
    Column(Modifier.fillMaxSize().statusBarsPadding()){
        Row(Modifier.fillMaxWidth().padding(horizontal=12.dp),horizontalArrangement=Arrangement.End){InterfaceLanguageAction()}
        Box(Modifier.weight(1f).fillMaxWidth()){content()}
    }
}
