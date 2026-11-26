package de.madrasty.app.school

import android.app.Application
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Surface
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.ViewModelStore
import androidx.test.platform.app.InstrumentationRegistry
import de.madrasty.app.identity.IdentityViewModel
import de.madrasty.app.ui.InterfaceSettingsAction
import de.madrasty.app.ui.InterfaceLanguageProvider
import de.madrasty.app.ui.SchoolTheme
import org.junit.Rule
import org.junit.Test

class LanguageStateTest {
    @get:Rule val compose=createComposeRule()
    @Test fun changingLanguagePreservesWizardStepAndEnteredData(){
        val instrumentation=InstrumentationRegistry.getInstrumentation()
        val app=instrumentation.targetContext.applicationContext as Application
        val store=ViewModelStore()
        lateinit var model:IdentityViewModel
        instrumentation.runOnMainSync{model=ViewModelProvider(store,ViewModelProvider.AndroidViewModelFactory.getInstance(app))[IdentityViewModel::class.java]}
        try{
            compose.setContent{
                var language by remember{mutableStateOf("de")}
                InterfaceLanguageProvider(language,{language=it}){
                    SchoolTheme(darkMode=false){
                        Surface{
                            Column(Modifier.fillMaxSize()){
                                InterfaceSettingsAction()
                                Column(Modifier.weight(1f).fillMaxWidth().verticalScroll(rememberScrollState()).padding(12.dp)){
                                    FamilyWizard(model,false,remember{mutableMapOf<String,Pair<String,String>>()}){error("Do not submit")}
                                }
                            }
                        }
                    }
                }
            }
            compose.onAllNodes(hasSetTextAction()).onFirst().performTextInput("QA Family Draft")
            compose.onNodeWithText("Weiter").performScrollTo().performClick()
            compose.onAllNodes(hasSetTextAction()).onFirst().performScrollTo().performTextInput("QA Parent Draft")
            compose.onNodeWithContentDescription("App-Einstellungen").performClick()
            compose.onNodeWithText("العربية",substring=false).performClick()
            compose.onNodeWithText("إغلاق",substring=false).performClick()
            compose.onNodeWithText("أولياء الأمور · 2/5").performScrollTo().assertIsDisplayed()
            compose.onAllNodes(hasSetTextAction()).onFirst().assertTextContains("QA Parent Draft")
            compose.onNodeWithContentDescription("إعدادات التطبيق").performClick()
            compose.onNodeWithText("Deutsch",substring=false).performClick()
            compose.onNodeWithText("Schließen",substring=false).performClick()
            compose.onNodeWithText("Sorgeberechtigte · 2/5").performScrollTo().assertIsDisplayed()
            compose.onAllNodes(hasSetTextAction()).onFirst().assertTextContains("QA Parent Draft")
            compose.onNodeWithText("Zurück",substring=false).performScrollTo().performClick()
            compose.onAllNodes(hasSetTextAction()).onFirst().assertTextContains("QA Family Draft")
        }finally{instrumentation.runOnMainSync{store.clear()}}
    }
}
