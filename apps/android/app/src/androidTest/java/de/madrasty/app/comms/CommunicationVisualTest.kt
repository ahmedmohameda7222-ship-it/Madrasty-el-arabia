package de.madrasty.app.comms

import android.app.Application
import android.content.ClipboardManager
import android.content.ContentValues
import android.content.res.Configuration
import android.graphics.Bitmap
import android.os.Environment
import android.provider.MediaStore
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.test.platform.app.InstrumentationRegistry
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.ViewModelStore
import de.madrasty.app.identity.IdentityViewModel
import org.json.JSONArray
import org.json.JSONObject
import de.madrasty.app.R
import de.madrasty.app.ui.SchoolTheme
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import java.util.Locale

/** On-device production bubble layout evidence; no network or real school data. */
class CommunicationVisualTest {
    @get:Rule val compose=createComposeRule()
    @Test fun germanLight()=capture("de",false)
    @Test fun arabicDark()=capture("ar",true)
    @Test fun nativeLongPressOpensActionsAndCopiesMessage(){
        val instrumentation=InstrumentationRegistry.getInstrumentation()
        val app=instrumentation.targetContext.applicationContext as Application
        val store=ViewModelStore()
        lateinit var model:IdentityViewModel
        instrumentation.runOnMainSync{
            model=ViewModelProvider(store,ViewModelProvider.AndroidViewModelFactory.getInstance(app))[IdentityViewModel::class.java]
        }
        val body="Diese Nachricht soll kopiert werden."
        val thread=JSONObject().put("id","qa-thread").put("canReply",true)
        val message=JSONObject().put("id","qa-message").put("own",true).put("body",body)
            .put("source","human").put("createdAt","2026-01-01T10:00:00Z").put("replyable",true)
            .put("attachments",JSONArray()).put("reactions",JSONArray())
        try{
            compose.setContent{
                val context=LocalContext.current
                val localized=remember(context){context.createConfigurationContext(Configuration(context.resources.configuration).apply{setLocale(Locale.GERMAN)})}
                CompositionLocalProvider(LocalContext provides localized,LocalConfiguration provides localized.resources.configuration,
                    LocalLayoutDirection provides LayoutDirection.Ltr){
                    SchoolTheme(darkMode=false){
                        Surface{
                            Column(Modifier.fillMaxSize().padding(16.dp)){
                                ChatMessageItem(model,thread,message,false,{},{},{},{})
                            }
                        }
                    }
                }
            }
            compose.onNodeWithText("Antworten").assertDoesNotExist()
            compose.onNodeWithText(body,substring=true).performTouchInput{longClick()}
            compose.onNodeWithText("Antworten").assertIsDisplayed()
            compose.onNodeWithText("Text kopieren").performClick()
            compose.runOnIdle{
                val clipboard=app.getSystemService(ClipboardManager::class.java)
                assertTrue(clipboard.primaryClip?.getItemAt(0)?.text?.toString()==body)
                clipboard.clearPrimaryClip()
            }
        }finally{instrumentation.runOnMainSync{store.clear()}}
    }
    @OptIn(ExperimentalTestApi::class)
    private fun capture(language:String,dark:Boolean){
        val ar=language=="ar"
        val outgoing=if(ar)"شكرًا، وصلني الإعلان الجديد." else "Vielen Dank für die Nachricht."
        val incoming=if(ar)"مرحبًا، موعد اللقاء يوم السبت الساعة العاشرة." else "Guten Tag, wir treffen uns am Samstag um 10 Uhr."
        compose.setContent {
            val context=LocalContext.current
            val localized=remember(context,language){context.createConfigurationContext(Configuration(context.resources.configuration).apply{setLocale(Locale.forLanguageTag(language))})}
            CompositionLocalProvider(LocalContext provides localized,LocalConfiguration provides localized.resources.configuration,
                LocalLayoutDirection provides if(ar)LayoutDirection.Rtl else LayoutDirection.Ltr){
                SchoolTheme(darkMode=dark){
                    Surface(color=MaterialTheme.colorScheme.background){
                        Column(Modifier.fillMaxSize().padding(16.dp),verticalArrangement=Arrangement.spacedBy(12.dp)){
                            Text(if(ar)"المحادثات" else "Chats",style=MaterialTheme.typography.headlineSmall)
                            Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.Start){
                                CommunicationBubble(false){
                                    Text(if(ar)"مدرس الفصل" else "Klassenlehrkraft",style=MaterialTheme.typography.labelMedium)
                                    Text(incoming)
                                    Text("10:00",style=MaterialTheme.typography.labelSmall)
                                }
                            }
                            Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.End){
                                CommunicationBubble(true){
                                    Text(outgoing)
                                    Text(stringResource(R.string.chat_sent),style=MaterialTheme.typography.labelSmall)
                                }
                            }
                            Spacer(Modifier.weight(1f))
                            OutlinedTextField(value="",onValueChange={},modifier=Modifier.fillMaxWidth(),label={Text(stringResource(R.string.chat_body))})
                            Button(onClick={},modifier=Modifier.fillMaxWidth()){Text(stringResource(R.string.chat_send))}
                        }
                    }
                }
            }
        }
        compose.onNodeWithText(incoming).assertIsDisplayed()
        compose.onNodeWithText(outgoing).assertIsDisplayed()
        compose.waitForIdle()
        val bitmap=compose.onRoot().captureToImage().asAndroidBitmap()
        assertTrue(bitmap.width>=640&&bitmap.height>=1000)
        val resolver=InstrumentationRegistry.getInstrumentation().targetContext.contentResolver
        val uri=requireNotNull(resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI,ContentValues().apply{
            put(MediaStore.MediaColumns.DISPLAY_NAME,"communication-native-$language-${if(dark)"dark" else "light"}.png")
            put(MediaStore.MediaColumns.MIME_TYPE,"image/png")
            put(MediaStore.MediaColumns.RELATIVE_PATH,Environment.DIRECTORY_DOWNLOADS+"/madrasty-comms-qa")
            put(MediaStore.MediaColumns.IS_PENDING,1)
        }))
        requireNotNull(resolver.openOutputStream(uri)).use{assertTrue(bitmap.compress(Bitmap.CompressFormat.PNG,100,it))}
        resolver.update(uri,ContentValues().apply{put(MediaStore.MediaColumns.IS_PENDING,0)},null,null)
        bitmap.recycle()
    }
}
