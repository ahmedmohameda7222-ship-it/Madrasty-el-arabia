package de.madrasty.app.comms

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
