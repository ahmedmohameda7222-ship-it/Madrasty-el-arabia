package de.madrasty.app.identity

import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import de.madrasty.app.R
import de.madrasty.app.api.WirePage
import de.madrasty.app.api.decodeData
import de.madrasty.app.school.Field
import de.madrasty.app.school.Submit
import de.madrasty.app.ui.AsyncState
import de.madrasty.app.ui.AsyncSurface
import de.madrasty.app.ui.isolate
import org.json.JSONArray
import org.json.JSONObject

@Composable
fun DirectoryScreen(model: IdentityViewModel, close: () -> Unit) {
    var selected by remember { mutableStateOf<String?>(null) }
    var search by remember { mutableStateOf("") }
    var query by remember { mutableStateOf("") }
    var role by remember { mutableStateOf("") }
    var refresh by remember { mutableStateOf(0) }
    val language = LocalConfiguration.current.locales[0].language
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    BackHandler {
        if (selected == null) close() else selected = null
    }
    DisposableEffect(lifecycle) {
        val observe = LifecycleEventObserver { _, event -> if (event == Lifecycle.Event.ON_RESUME) refresh++ }
        lifecycle.addObserver(observe)
        onDispose { lifecycle.removeObserver(observe) }
    }
    Column(
        Modifier.fillMaxSize().safeDrawingPadding().imePadding().verticalScroll(rememberScrollState()).padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        TextButton(onClick = { if (selected == null) close() else selected = null }) { Text(stringResource(R.string.back)) }
        Text(stringResource(R.string.directory_title), style = MaterialTheme.typography.headlineMedium)
        val id = selected
        if (id == null) {
            Field(R.string.directory_query, search) { search = it.take(120) }
            TextButton(onClick = { query = search.trim(); refresh++ }) { Text(stringResource(R.string.staff_search)) }
            val options = listOf(
                "" to R.string.directory_all, "teacher" to R.string.staff_role_teacher, "principal" to R.string.staff_role_principal,
                "deputy" to R.string.staff_role_deputy, "office" to R.string.staff_role_office, "guardian" to R.string.persona_guardian,
            )
            options.forEach { (key,label) ->
                FilterChip(role == key, onClick = { role = key }, label = { Text(stringResource(label)) })
            }
            if (role.isNotEmpty() || search.isNotEmpty()) TextButton(onClick = { search = ""; query = ""; role = "" }) {
                Text(stringResource(R.string.clear_filter))
            }
            DirectoryResults(model,query,role,refresh,language) { selected = it }
        } else DirectoryDetail(model,id,refresh,language)
    }
}

@Composable
private fun DirectoryResults(model: IdentityViewModel, query: String, role: String, refresh: Int, language: String, open: (String) -> Unit) {
    var retry by remember { mutableStateOf(0) }
    var state by remember(query,role,refresh) { mutableStateOf<AsyncState<WirePage<List<JSONObject>>>>(AsyncState.InitialLoading()) }
    LaunchedEffect(query,role,refresh,retry) {
        state = AsyncState.InitialLoading()
        state = loadAccountSurface({ retry++ }) { directoryPage(model,query,role,null) }
    }
    AsyncSurface(state) { page ->
        if (page.data.isEmpty()) Text(stringResource(R.string.directory_empty))
        page.data.forEach { row ->
            TextButton(onClick = { open(row.getString("id")) }) {
                Column {
                    val title = title(row,language)
                    Text(isolate(row.optional("displayName") ?: title))
                    if (row.optional("displayName") != null) Text(isolate(title),style = MaterialTheme.typography.bodySmall)
                }
            }
        }
        page.nextCursor?.let { cursor ->
            Submit(true,R.string.staff_more) {
                val next = directoryPage(model,query,role,cursor)
                if ((state as? AsyncState.Ready)?.content == page) {
                    state = AsyncState.Ready(WirePage(page.data + next.data,next.nextCursor))
                }
            }
        }
    }
}

private suspend fun directoryPage(model: IdentityViewModel, query: String, role: String, cursor: String?) =
    decodeData(model.schoolRequest("/directory?limit=30&query=${Uri.encode(query)}" +
        (if (role.isNotEmpty()) "&role=$role" else "") + (cursor?.let { "&cursor=$it" } ?: ""))) { value ->
        val rows = value as JSONArray
        List(rows.length(),rows::getJSONObject)
    }

@Composable
private fun DirectoryDetail(model: IdentityViewModel, id: String, refresh: Int, language: String) {
    val context = LocalContext.current
    var retry by remember { mutableStateOf(0) }
    var state by remember(id,refresh) { mutableStateOf<AsyncState<JSONObject>>(AsyncState.InitialLoading()) }
    var unavailable by remember(id) { mutableStateOf(false) }

    fun open(scheme: String, value: String, action: String) {
        unavailable = try {
            context.startActivity(Intent(action,Uri.fromParts(scheme,value,null)))
            false
        } catch (_: ActivityNotFoundException) { true }
    }
    LaunchedEffect(id,refresh,retry) {
        state = loadAccountSurface({ retry++ }) {
            decodeData(model.schoolRequest("/directory/$id")) { it as JSONObject }.data
        }
    }
    AsyncSurface(state) { row ->
        val title = title(row,language)
        Text(isolate(row.optional("displayName") ?: title),style = MaterialTheme.typography.titleLarge)
        if (row.optional("displayName") != null) Text(isolate(title))
        val contexts = row.getJSONArray("contexts")
        for (index in 0 until contexts.length()) {
            val item = contexts.getJSONObject(index)
            Text(isolate(item.getString(if (language == "de") "nameDe" else "nameAr")))
        }
        row.optional("workEmail")?.let { email ->
            TextButton(onClick = { open("mailto",email,Intent.ACTION_SENDTO) }) { Text(stringResource(R.string.directory_mail)) }
        }
        row.optional("workPhone")?.let { phone ->
            if (phone.any(Char::isDigit)) TextButton(onClick = { open("tel",phone,Intent.ACTION_DIAL) }) {
                Text(stringResource(R.string.directory_call))
            }
        }
        if (unavailable) Text(stringResource(R.string.directory_external_unavailable))
    }
}

private fun title(row: JSONObject, language: String) = row.getString(if (language == "de") "titleDe" else "titleAr")
private fun JSONObject.optional(key: String) = if (isNull(key)) null else getString(key)
