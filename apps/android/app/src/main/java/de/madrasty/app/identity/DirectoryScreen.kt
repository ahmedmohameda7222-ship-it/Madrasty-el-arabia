package de.madrasty.app.identity

import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Button
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
import androidx.compose.runtime.rememberCoroutineScope
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
import de.madrasty.app.comms.StartConversation
import de.madrasty.app.school.Field
import de.madrasty.app.school.Submit
import de.madrasty.app.school.schoolCommand
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import de.madrasty.app.ui.AsyncState
import de.madrasty.app.ui.AsyncSurface
import de.madrasty.app.ui.isolate
import org.json.JSONArray
import org.json.JSONObject

@Composable
fun DirectoryScreen(model: IdentityViewModel, openThread: (String) -> Unit, close: () -> Unit) {
    var search by remember { mutableStateOf("") }
    var query by remember { mutableStateOf("") }
    var view by remember { mutableStateOf("mine") }
    var refresh by remember { mutableStateOf(0) }
    val language = LocalConfiguration.current.locales[0].language
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    var draft by remember { mutableStateOf<JSONObject?>(null) }
    BackHandler { if(draft!=null) draft=null else close() }
    DisposableEffect(lifecycle) {
        val observe = LifecycleEventObserver { _, event -> if (event == Lifecycle.Event.ON_RESUME) refresh++ }
        lifecycle.addObserver(observe)
        onDispose { lifecycle.removeObserver(observe) }
    }
    LaunchedEffect(search) { delay(250); query = search.trim() }
    Column(
        Modifier.fillMaxSize().safeDrawingPadding().imePadding().verticalScroll(rememberScrollState()).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        TextButton(onClick = { if(draft!=null) draft=null else close() }) { Text(stringResource(R.string.back)) }
        val current=draft
        if(current!=null) {
            FirstContactMessage(model,current,language,openThread)
        } else {
        Text(stringResource(R.string.comms_new_message), style = MaterialTheme.typography.headlineMedium)
        Field(R.string.directory_query, search) { search = it.take(120) }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            FilterChip(view == "mine", onClick = { view = "mine" }, label = { Text(stringResource(R.string.comms_my_contacts)) })
            FilterChip(view == "all", onClick = { view = "all" }, label = { Text(stringResource(R.string.comms_all_people)) })
        }
        DirectoryResults(model, query, view, refresh, language, openThread) { draft=it }
        }
    }
}

@Composable
private fun DirectoryResults(model: IdentityViewModel, query: String, view: String, refresh: Int, language: String, open: (String) -> Unit, compose: (JSONObject) -> Unit) {
    var retry by remember { mutableStateOf(0) }
    var state by remember(query,view,refresh) { mutableStateOf<AsyncState<WirePage<List<JSONObject>>>>(AsyncState.InitialLoading()) }
    var opening by remember { mutableStateOf(false) }
    var failed by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val attempts = remember { mutableMapOf<String,Pair<String,String>>() }
    LaunchedEffect(query,view,refresh,retry) {
        state = AsyncState.InitialLoading()
        state = loadAccountSurface({ retry++ }) { directoryPage(model,query,view,null) }
    }
    AsyncSurface(state) { page ->
        val people = page.data.filter { it.getJSONObject("target").getString("kind") == "person" }
        if (people.isEmpty()) Text(stringResource(R.string.directory_empty))
        val groups = listOf("teacher" to R.string.comms_teachers, "admin" to R.string.comms_administration, "guardian" to R.string.comms_parents)
        for ((kind,label) in groups) {
            val members = people.filter { row ->
                val role = row.getString("role")
                (if (role == "teacher" || role == "guardian") role else "admin") == kind
            }
            if (members.isEmpty()) continue
            Text(stringResource(label),style = MaterialTheme.typography.labelLarge)
            for (row in members) {
                TextButton(enabled = !opening, modifier = Modifier.fillMaxWidth(), onClick = {
                    if (!opening) {
                        opening = true
                        failed = false
                        scope.launch {
                            try {
                                val detail=decodeData(model.schoolRequest("/directory/${row.getString("id")}")) { it as JSONObject }.data
                                val existing=detail.optional("directThreadId")
                                if(existing!=null) open(existing) else compose(detail)
                            } catch (cancel: CancellationException) { throw cancel }
                            catch (_: Exception) { failed = true }
                            finally { opening = false }
                        }
                    }
                }) {
                    Column(Modifier.fillMaxWidth()) {
                        Text(isolate(row.optional("displayName") ?: title(row,language)),style = MaterialTheme.typography.titleMedium)
                        Text(isolate(title(row,language)),style = MaterialTheme.typography.bodySmall)
                        val contexts = row.getJSONArray("contexts")
                        if (contexts.length() > 0) Text((0 until contexts.length()).joinToString(" · ") { i ->
                            isolate(contexts.getJSONObject(i).getString(if(language=="de") "nameDe" else "nameAr"))
                        },style=MaterialTheme.typography.bodySmall)
                    }
                }
            }
        }
        if(failed) Text(stringResource(R.string.comms_open_failed),color=MaterialTheme.colorScheme.error)
        page.nextCursor?.let { cursor ->
            Submit(true,R.string.staff_more) {
                val next = directoryPage(model,query,view,cursor)
                if ((state as? AsyncState.Ready)?.content == page) {
                    val existing=page.data.map { it.getString("id") }.toSet()
                    state = AsyncState.Ready(WirePage(page.data + next.data.filter { it.getString("id") !in existing },next.nextCursor))
                }
            }
        }
    }
}
@Composable
private fun FirstContactMessage(model:IdentityViewModel,row:JSONObject,language:String,open:(String)->Unit) {
    var body by remember(row.getString("id")) { mutableStateOf("") }
    var firstId by remember(row.getString("id")) { mutableStateOf(java.util.UUID.randomUUID().toString()) }
    var sending by remember { mutableStateOf(false) }
    var failed by remember { mutableStateOf(false) }
    val scope=rememberCoroutineScope()
    val attempts=remember { mutableMapOf<String,Pair<String,String>>() }
    fun send(media:Boolean) {
        if(sending||(!media&&body.isBlank())) return
        sending=true;failed=false
        scope.launch {
            try {
                val payload=JSONObject().put("target",row.getJSONObject("target"))
                if(!media)payload.put("firstMessage",JSONObject().put("clientMessageId",firstId).put("body",body.trim()))
                open(model.schoolCommand(attempts,"/threads","POST",payload).getString("threadId"))
            } catch(cancel:CancellationException){throw cancel}
              catch(_:Exception){failed=true}
              finally{sending=false}
        }
    }
    Text(isolate(row.optional("displayName")?:title(row,language)),style=MaterialTheme.typography.headlineSmall)
    Text(isolate(title(row,language)))
    OutlinedTextField(value=body,onValueChange={body=it.take(4000);firstId=java.util.UUID.randomUUID().toString()},
        enabled=!sending,modifier=Modifier.fillMaxWidth(),label={Text(stringResource(R.string.comms_first_message))})
    Button(onClick={send(false)},enabled=!sending&&body.isNotBlank()){Text(stringResource(R.string.comms_first_send))}
    if(body.isBlank())TextButton(onClick={send(true)},enabled=!sending){Text(stringResource(R.string.comms_first_media))}
    if(failed)Text(stringResource(R.string.comms_open_failed),color=MaterialTheme.colorScheme.error)
}
private suspend fun directoryPage(model: IdentityViewModel, query: String, view: String, cursor: String?) =
    decodeData(model.schoolRequest("/directory?limit=30&view=$view&query=${Uri.encode(query)}" +
        (cursor?.let { "&cursor=${Uri.encode(it)}" } ?: ""))) { value ->
        val rows = value as JSONArray
        List(rows.length(),rows::getJSONObject)
    }

@Composable
private fun DirectoryDetail(model: IdentityViewModel, id: String, refresh: Int, language: String, openThread:(String)->Unit) {
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
        val target=row.getJSONObject("target")
        StartConversation(model,target.getString("kind"),target.getString("id"),open=openThread)
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
