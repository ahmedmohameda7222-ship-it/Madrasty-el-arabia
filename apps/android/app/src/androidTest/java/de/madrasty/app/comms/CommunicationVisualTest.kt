package de.madrasty.app.comms

import android.app.Application
import android.content.ClipboardManager
import android.content.ContentValues
import android.content.res.Configuration
import android.graphics.Bitmap
import android.os.Environment
import android.provider.MediaStore
import androidx.activity.compose.LocalActivityResultRegistryOwner
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
import de.madrasty.app.identity.FirstContactMessage
import androidx.compose.ui.platform.testTag
import org.json.JSONArray
import org.json.JSONObject
import de.madrasty.app.R
import de.madrasty.app.ui.SchoolTheme
import de.madrasty.app.ui.SchoolShell
import de.madrasty.app.ui.SchoolPartition
import de.madrasty.app.ui.SchoolTab
import de.madrasty.app.ui.Persona
import de.madrasty.app.ui.InterfaceLanguageProvider
import androidx.compose.foundation.lazy.rememberLazyListState
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import java.util.Locale

/** On-device production bubble layout evidence; no network or real school data. */
class CommunicationVisualTest {
    @get:Rule val compose=createComposeRule()
    @Test fun calendarIsAnIndependentMainDestinationForEachPersona(){
        val persona=mutableStateOf(Persona.Admin)
        val current=mutableStateOf(SchoolTab.Messages)
        compose.setContent {
            InterfaceLanguageProvider("de",{}) {
                SchoolTheme(darkMode=false) {
                    SchoolShell(SchoolPartition("qa-account","qa-session",persona.value),current.value,{current.value=it}){tab->
                        Text("QA destination "+tab.name)
                    }
                }
            }
        }
        for(role in listOf(Persona.Admin,Persona.Teacher,Persona.Guardian)){
            compose.runOnIdle{persona.value=role;current.value=SchoolTab.Messages}
            compose.onNodeWithText("QA destination Messages").assertIsDisplayed()
            compose.onNodeWithText("Kalender",substring=false).performClick()
            compose.onNodeWithText("QA destination Calendar").assertIsDisplayed()
            compose.onNodeWithText("Kontakt",substring=false).performClick()
            compose.onNodeWithText("QA destination Messages").assertIsDisplayed()
        }
    }
    @Test fun calendarIsIndependentPrimaryDestination(){
        compose.setContent{
            var active by remember{mutableStateOf(SchoolTab.Messages)}
            InterfaceLanguageProvider("de",{}){
                SchoolTheme(darkMode=false){
                    SchoolShell(SchoolPartition("qa-account","qa-session",Persona.Guardian),active,{active=it}){
                        Text("QA destination: "+it.name)
                    }
                }
            }
        }
        compose.onNodeWithText("QA destination: Messages").assertIsDisplayed()
        compose.onNode(hasText("Kalender",substring=false) and hasClickAction()).performClick()
        compose.onNodeWithText("QA destination: Calendar").assertIsDisplayed()
        compose.onNode(hasText("Kontakt",substring=false) and hasClickAction()).performClick()
        compose.onNodeWithText("QA destination: Messages").assertIsDisplayed()
    }
    @Test fun inboxRowsAreLazyAndOpenTheCorrectThread(){
        val rows=(1..100).map{JSONObject().put("id","qa-$it").put("contactName","QA Person $it").put("latestPreview","QA Preview $it").put("unread",if(it==1)2 else 0)}
        var selected=""
        compose.setContent{
            SchoolTheme(darkMode=false){
                ThreadRows(rows,rememberLazyListState(),Modifier.fillMaxSize()){selected=it}
            }
        }
        compose.onNodeWithText(de.madrasty.app.ui.isolate("QA Person 1"),substring=false).assertIsDisplayed().performClick()
        compose.runOnIdle{assertTrue(selected=="qa-1")}
        compose.onNodeWithText(de.madrasty.app.ui.isolate("QA Person 100"),substring=false).assertDoesNotExist()
    }
    @Test fun nativeInboxSwipeRevealsActionsWithoutMutatingUntilChosen(){
        val row=JSONObject().put("id","qa-swipe").put("contactName","QA Swipe").put("latestPreview","QA Preview")
        var selected=""
        lateinit var pin:String
        compose.setContent{
            pin=stringResource(R.string.chat_pin)
            SchoolTheme(darkMode=false){ThreadRows(listOf(row),rememberLazyListState(),Modifier.fillMaxSize(),actions={_,field,next->selected="$field:$next"}){}}
        }
        compose.onNodeWithText(de.madrasty.app.ui.isolate("QA Swipe"),substring=false).performTouchInput{swipeLeft()}
        compose.waitUntil(5000){compose.onAllNodesWithText(pin,substring=false).fetchSemanticsNodes().isNotEmpty()}
        compose.runOnIdle{assertTrue(selected=="")}
        compose.onNodeWithText(pin,substring=false).performClick()
        compose.runOnIdle{assertTrue(selected=="pinned:true")}
    }
    @Test fun nativeDraftsKeepThreadsSeparateAndDoNotEraseEditedText(){
        val drafts=NativeChatDrafts()
        drafts.write("one",NativeChatDraft("Private",requestId="request"))
        drafts.write("two",NativeChatDraft("Other",openMedia=true))
        drafts.write("one",NativeChatDraft("Edited"))
        drafts.acknowledge("one","request")
        assertTrue(drafts.read("one")?.body=="Edited")
        assertTrue(drafts.read("two")?.openMedia==true)
        drafts.remove("one")
        assertTrue(drafts.read("one")==null)
    }
    @Test fun firstContactComposerStaysAtBottomInNormalAndReducedViewport(){
        val instrumentation=InstrumentationRegistry.getInstrumentation()
        val app=instrumentation.targetContext.applicationContext as Application
        val store=ViewModelStore()
        lateinit var model:IdentityViewModel
        instrumentation.runOnMainSync{
            model=ViewModelProvider(store,ViewModelProvider.AndroidViewModelFactory.getInstance(app))[IdentityViewModel::class.java]
        }
        val contact=JSONObject().put("id","qa-first-contact").put("displayName","QA Teacher")
            .put("titleDe","Lehrkraft").put("titleAr","مدرس")
        var reduced by mutableStateOf(false)
        lateinit var attachLabel:String
        try{
            compose.setContent{
                attachLabel=stringResource(R.string.comms_first_media)
                SchoolTheme(darkMode=false){
                    Surface(Modifier.fillMaxSize()){
                        Column(Modifier.fillMaxWidth().then(if(reduced)Modifier.height(260.dp) else Modifier.fillMaxHeight()).testTag("first-contact-viewport")){
                            FirstContactMessage(model,contact,"de",{},{_,_->},{})
                        }
                    }
                }
            }
            for(short in listOf(false,true)){
                compose.runOnIdle{reduced=short}
                val viewport=compose.onNodeWithTag("first-contact-viewport").fetchSemanticsNode().boundsInRoot
                val attach=compose.onNodeWithContentDescription(attachLabel).assertIsDisplayed().fetchSemanticsNode().boundsInRoot
                assertTrue("First-message attachment control must remain at the bottom",viewport.bottom-attach.bottom in 0f..(viewport.height*.2f))
            }
        }finally{instrumentation.runOnMainSync{store.clear()}}
    }
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
            .put("attachments",JSONArray()).put("reactions",JSONArray().put(JSONObject().put("emoji","👍").put("count",1).put("mine",false)))
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
            compose.onNodeWithText("👍 1").assertIsDisplayed()
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
    @Test fun nativeAttachmentActionsUseCompactMaterialMenu(){
        val instrumentation=InstrumentationRegistry.getInstrumentation()
        val app=instrumentation.targetContext.applicationContext as Application
        val store=ViewModelStore()
        lateinit var model:IdentityViewModel
        instrumentation.runOnMainSync{
            model=ViewModelProvider(store,ViewModelProvider.AndroidViewModelFactory.getInstance(app))[IdentityViewModel::class.java]
        }
        lateinit var actions:List<String>
        lateinit var attachLabel:String
        try{
            compose.setContent{
                // DropdownMenu is a separate Android window. Exercise it with the
                // actual Activity context, not a configuration-only Context.
                val context=LocalContext.current
                actions=listOf(R.string.chat_media_gallery,R.string.chat_media_camera,R.string.chat_media_record).map{context.getString(it)}
                attachLabel=context.getString(R.string.comms_first_media)
                SchoolTheme(darkMode=false){
                    Surface{
                        Column(Modifier.fillMaxSize().padding(16.dp)){
                            MediaComposer(model,"qa-thread",locked=false,consumed=null,onReady={},onBusy={})
                        }
                    }
                }
            }
            compose.waitForIdle()
            val attach=compose.onNodeWithContentDescription(attachLabel)
            attach.assertIsDisplayed()
            actions.forEach{compose.onNodeWithText(it,substring=false).assertDoesNotExist()}
            attach.performClick()
            compose.waitUntil(timeoutMillis=5000){actions.all{compose.onAllNodesWithText(it,substring=false).fetchSemanticsNodes().isNotEmpty()}}
            actions.forEach{compose.onNodeWithText(it,substring=false).assertIsDisplayed()}
        }finally{instrumentation.runOnMainSync{store.clear()}}
    }
    @OptIn(ExperimentalTestApi::class)
    private fun capture(language:String,dark:Boolean){
        val ar=language=="ar"
        val outgoing=if(ar)"شكرًا، وصلني الإعلان الجديد." else "Vielen Dank für die Nachricht."
        val incoming=if(ar)"مرحبًا، موعد اللقاء يوم السبت الساعة العاشرة." else "Guten Tag, wir treffen uns am Samstag um 10 Uhr."
        val instrumentation=InstrumentationRegistry.getInstrumentation()
        val app=instrumentation.targetContext.applicationContext as Application
        val store=ViewModelStore()
        lateinit var model:IdentityViewModel
        instrumentation.runOnMainSync{
            model=ViewModelProvider(store,ViewModelProvider.AndroidViewModelFactory.getInstance(app))[IdentityViewModel::class.java]
        }
        val thread=JSONObject().put("id","qa-thread").put("canReply",true)
        fun message(id:String,own:Boolean,body:String)=JSONObject()
            .put("id",id).put("own",own).put("body",body)
            .put("source","human").put("createdAt","2026-01-01T10:00:00Z").put("replyable",true)
            .put("authorName",if(ar)"مدرس الفصل" else "Lehrkraft")
            .put("attachments",JSONArray())
            .put("reactions",if(own)JSONArray().put(JSONObject().put("emoji","👍").put("count",1).put("mine",false)) else JSONArray())
        try{
        compose.setContent {
            val context=LocalContext.current
            val registryOwner=requireNotNull(LocalActivityResultRegistryOwner.current)
            val localized=remember(context,language){context.createConfigurationContext(Configuration(context.resources.configuration).apply{setLocale(Locale.forLanguageTag(language))})}
            CompositionLocalProvider(LocalContext provides localized,LocalConfiguration provides localized.resources.configuration,
                LocalActivityResultRegistryOwner provides registryOwner,LocalLayoutDirection provides if(ar)LayoutDirection.Rtl else LayoutDirection.Ltr){
                SchoolTheme(darkMode=dark){
                    Surface(color=MaterialTheme.colorScheme.background){
                        Column(Modifier.fillMaxSize().padding(16.dp),verticalArrangement=Arrangement.spacedBy(12.dp)){
                            Text(if(ar)"المحادثات" else "Chats",style=MaterialTheme.typography.headlineSmall)
                            ChatMessageItem(model,thread,message("qa-incoming",false,incoming),false,{},{},{},{})
                            ChatMessageItem(model,thread,message("qa-outgoing",true,outgoing),false,{},{},{},{})
                            Spacer(Modifier.weight(1f))
                            var typed by remember{mutableStateOf("")}
                            MediaComposer(model,"qa-thread",locked=false,consumed=null,onReady={},onBusy={}){
                                ChatInputField(typed,true){typed=it}
                                ChatSendAction(typed.isNotBlank(),false){}
                            }
                        }
                    }
                }
            }
        }
        compose.onNodeWithText(incoming,substring=true).assertIsDisplayed()
        compose.onNodeWithText(outgoing,substring=true).assertIsDisplayed()
        compose.onNodeWithText("👍 1").assertIsDisplayed()
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
        }finally{instrumentation.runOnMainSync{store.clear()}}
    }
}
