package de.madrasty.app.identity

import android.content.Intent
import android.provider.Settings
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import de.madrasty.app.R
import de.madrasty.app.comms.DeviceNotificationSettings
import de.madrasty.app.api.decodeData
import de.madrasty.app.school.Submit
import de.madrasty.app.school.schoolCommand
import de.madrasty.app.ui.LocalChangeInterfaceLanguage
import de.madrasty.app.ui.AsyncState
import de.madrasty.app.ui.AsyncSurface
import kotlinx.coroutines.CancellationException
import org.json.JSONObject

data class AccountPreference(
    val uiLocale: String,
    val correspondenceLocale: String,
    val theme: String,
    val revision: Int,
) {
    fun body() = JSONObject().put("uiLocale",uiLocale).put("correspondenceLocale",correspondenceLocale)
        .put("theme",theme).put("revision",revision)

    companion object {
        fun read(row: JSONObject): AccountPreference {
            val ui = row.getString("uiLocale")
            val mail = row.getString("correspondenceLocale")
            val theme = row.getString("theme")
            val revision = row.getInt("revision")
            require(ui in listOf("ar","de") && mail in listOf("ar","de") &&
                theme in listOf("system","light","dark") && revision >= 0)
            return AccountPreference(ui,mail,theme,revision)
        }
    }
}

internal suspend fun IdentityViewModel.readPreferences(locale: String) =
    decodeData(schoolRequest("/account/preferences?locale=$locale")) { AccountPreference.read(it as JSONObject) }.data

@Composable
fun AccountScreen(model: IdentityViewModel, close: () -> Unit, security: () -> Unit) {
    val fallback = if (LocalConfiguration.current.locales[0].language == "de") "de" else "ar"
    var reload by remember { mutableStateOf(0) }
    var state by remember { mutableStateOf<AsyncState<AccountPreference>>(AsyncState.InitialLoading()) }
    val context = LocalContext.current
    BackHandler(onBack = close)
    LaunchedEffect(reload) {
        state = AsyncState.InitialLoading()
        state = loadAccountSurface({ reload++ }) { model.readPreferences(fallback).copy(uiLocale=fallback) }
    }
    Column(
        Modifier.fillMaxSize().safeDrawingPadding().verticalScroll(rememberScrollState()).padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        TextButton(onClick = close) { Text(stringResource(R.string.back)) }
        Text(stringResource(R.string.account_preferences), style = MaterialTheme.typography.headlineMedium)
        AsyncSurface(state) { preferences ->
            key(preferences.revision,reload) {
                PreferencesEditor(model, preferences, save = { state = AsyncState.Ready(it) }, reload = { reload++ })
            }
        }
        DeviceNotificationSettings(model,fallback)
        TextButton(onClick = {
            val intent = Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
            context.startActivity(intent)
        }) { Text(stringResource(R.string.account_device_settings)) }
        TextButton(onClick = security) { Text(stringResource(R.string.security)) }
    }
}

@Composable
private fun PreferencesEditor(model: IdentityViewModel, initial: AccountPreference, save: (AccountPreference) -> Unit, reload: () -> Unit) {
    val attempts = remember { mutableMapOf<String, Pair<String, String>>() }
    var value by remember { mutableStateOf(initial) }
    val interfaceLanguage=LocalConfiguration.current.locales[0].language
    val changeInterfaceLanguage=LocalChangeInterfaceLanguage.current
    var previousLanguage by remember{mutableStateOf(interfaceLanguage)}
    LaunchedEffect(interfaceLanguage){
        val before=previousLanguage;previousLanguage=interfaceLanguage
        if(value.uiLocale==before)value=value.copy(uiLocale=interfaceLanguage)
    }
    var conflict by remember { mutableStateOf(false) }
    Text(stringResource(R.string.account_ui_language))
    LanguageChoice(value.uiLocale) { value = value.copy(uiLocale = it) }
    Text(stringResource(R.string.account_mail_language))
    LanguageChoice(value.correspondenceLocale) { value = value.copy(correspondenceLocale = it) }
    Text(stringResource(R.string.account_appearance))
    listOf("system" to R.string.account_theme_system,"light" to R.string.account_theme_light,"dark" to R.string.account_theme_dark).forEach { (theme,label) ->
        FilterChip(value.theme == theme, onClick = { value = value.copy(theme = theme) }, label = { Text(stringResource(label)) })
    }
    Submit(!conflict && value != initial,R.string.account_save) {
        val account = model.session?.actor?.accountId
        try {
            val updated = AccountPreference.read(model.schoolCommand(attempts,"/account/preferences","PATCH",value.body()))
            if (account != null && account == model.session?.actor?.accountId) {
                model.applyPreferences(account,updated)
                changeInterfaceLanguage?.invoke(updated.uiLocale)
                save(updated)
            }
        } catch (error: HttpFailure) {
            if (error.code == "stale_revision") conflict = true
            else throw error
        }
    }
    if (conflict) {
        Text(stringResource(R.string.conflict))
        TextButton(onClick = reload) { Text(stringResource(R.string.account_reload)) }
    }
}

@Composable
private fun LanguageChoice(current: String, change: (String) -> Unit) {
    listOf("ar" to "العربية","de" to "Deutsch").forEach { (locale,label) ->
        FilterChip(current == locale, onClick = { change(locale) }, label = { Text(label) })
    }
}

internal suspend fun <T> loadAccountSurface(retry: () -> Unit, operation: suspend () -> T): AsyncState<T> =
    try { AsyncState.Ready(operation()) }
    catch (error: CancellationException) { throw error }
    catch (error: HttpFailure) {
        if (error.status in listOf(401,403,404)) AsyncState.Forbidden() else AsyncState.Error(retry = retry)
    } catch (_: Exception) { AsyncState.Error(retry = retry) }
