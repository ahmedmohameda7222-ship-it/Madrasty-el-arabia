package de.madrasty.app.school

import android.app.Application
import android.content.ContentValues
import android.content.res.Configuration
import android.graphics.Bitmap
import android.os.Environment
import android.provider.MediaStore
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.ViewModelStore
import androidx.test.platform.app.InstrumentationRegistry
import de.madrasty.app.identity.IdentityViewModel
import de.madrasty.app.ui.SchoolTheme
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import java.util.Locale

/** Actual wizard component, synthetic local input, no registration or data mutation. */
class FamilyVisualTest {
    @get:Rule val compose=createComposeRule()
    @Test fun germanLight()=capture("de",false)
    @Test fun germanDark()=capture("de",true)
    @Test fun arabicLight()=capture("ar",false)
    @Test fun arabicDark()=capture("ar",true)
    @OptIn(ExperimentalTestApi::class)
    private fun capture(language:String,dark:Boolean){
        val instrumentation=InstrumentationRegistry.getInstrumentation()
        val context=instrumentation.targetContext
        val app=context.applicationContext as Application
        val store=ViewModelStore()
        lateinit var model:IdentityViewModel
        instrumentation.runOnMainSync{model=ViewModelProvider(store,ViewModelProvider.AndroidViewModelFactory.getInstance(app))[IdentityViewModel::class.java]}
        val ar=language=="ar"
        try{
            compose.setContent{
                val current=LocalContext.current
                val localized=remember(current,language){current.createConfigurationContext(Configuration(current.resources.configuration).apply{setLocale(Locale.forLanguageTag(language))})}
                CompositionLocalProvider(LocalContext provides localized,LocalConfiguration provides localized.resources.configuration,LocalLayoutDirection provides if(ar)LayoutDirection.Rtl else LayoutDirection.Ltr){
                    SchoolTheme(darkMode=dark){
                        Surface(color=MaterialTheme.colorScheme.background){
                            Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),verticalArrangement=Arrangement.spacedBy(8.dp)){
                                FamilyWizard(model,false,remember{mutableMapOf<String,Pair<String,String>>()}){error("Synthetic visual fixture must not submit")}
                            }
                        }
                    }
                }
            }
            compose.onNodeWithText(if(ar)"الأسرة · 1/5" else "Familie · 1/5").assertIsDisplayed()
            val next=compose.onNodeWithText(if(ar)"التالي" else "Weiter")
            next.assertIsNotEnabled()
            val prefix="family-$language-${if(dark)"dark" else "light"}"
            fun save(stage:String){
                compose.waitForIdle();instrumentation.waitForIdleSync()
                val bitmap=compose.onRoot().captureToImage().asAndroidBitmap()
                assertTrue(bitmap.width>=640&&bitmap.height>=1000)
                val resolver=context.contentResolver
                val uri=requireNotNull(resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI,ContentValues().apply{
                    put(MediaStore.MediaColumns.DISPLAY_NAME,"$prefix-$stage.png")
                    put(MediaStore.MediaColumns.MIME_TYPE,"image/png")
                    put(MediaStore.MediaColumns.RELATIVE_PATH,Environment.DIRECTORY_DOWNLOADS+"/madrasty-family-qa")
                    put(MediaStore.MediaColumns.IS_PENDING,1)
                }))
                requireNotNull(resolver.openOutputStream(uri)).use{assertTrue(bitmap.compress(Bitmap.CompressFormat.PNG,100,it))}
                resolver.update(uri,ContentValues().apply{put(MediaStore.MediaColumns.IS_PENDING,0)},null,null)
                bitmap.recycle()
            }
            save("family")
            compose.onAllNodes(hasSetTextAction()).onFirst().performTextInput(if(ar)"أسرة تجريبية" else "QA Beispiel")
            next.assertIsEnabled().performClick()
            compose.onNodeWithText(if(ar)"أولياء الأمور · 2/5" else "Sorgeberechtigte · 2/5").assertIsDisplayed()
            save("guardian")
        }finally{instrumentation.runOnMainSync{store.clear()}}
    }
}
