package de.madrasty.app.identity

import android.net.Uri
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
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
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import de.madrasty.app.BuildConfig
import de.madrasty.app.R
import de.madrasty.app.api.WirePage
import de.madrasty.app.api.decodeData
import de.madrasty.app.school.Field
import de.madrasty.app.school.Submit
import de.madrasty.app.school.schoolCommand
import de.madrasty.app.ui.AsyncState
import de.madrasty.app.ui.AsyncSurface
import de.madrasty.app.ui.isolate
import kotlinx.coroutines.CancellationException
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

internal fun isSchoolInvitation(uri: Uri): Boolean {
    val origin = Uri.parse(BuildConfig.API_ORIGIN)
    return uri.scheme == "https" && uri.authority == origin.authority && uri.path in listOf("/ar/invite", "/de/invite")
}

@Composable
fun InvitationLanding(model: IdentityViewModel, uri: Uri, close: () -> Unit) {
    val fields = remember(uri) { Uri.parse("https://local.invalid/?${uri.encodedFragment.orEmpty()}") }
    val token = fields.getQueryParameter("token")?.takeIf { it.matches(Regex("[A-Za-z0-9_-]{43}")) }
    val proof = fields.getQueryParameter("proof")?.takeIf { it.matches(Regex("[A-Za-z0-9_-]{16,256}")) }
    var open by remember(uri) { mutableStateOf(false) }
    var existing by remember(uri) { mutableStateOf(proof == null) }
    var completed by remember(uri) { mutableStateOf(false) }
    var email by remember(uri) { mutableStateOf("") }
    var password by remember(uri) { mutableStateOf("") }
    var repeat by remember(uri) { mutableStateOf("") }
    val key = remember(uri) { UUID.randomUUID().toString() }
    BackHandler(onBack = close)

    Column(Modifier.fillMaxSize().safeDrawingPadding().imePadding().verticalScroll(rememberScrollState()).padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text(stringResource(R.string.invite_landing), Modifier.semantics { heading() }, style = MaterialTheme.typography.headlineMedium)
        when {
            completed -> Text(stringResource(R.string.invite_success))
            token == null -> Text(stringResource(R.string.invite_invalid))
            !open -> Button(onClick = { open = true }) { Text(stringResource(R.string.invite_continue)) }
            else -> {
                if (existing) Field(R.string.email, email) { email = it }
                PasswordInput(if (existing) R.string.password else R.string.invite_new_password, password) { password = it }
                if (!existing) PasswordInput(R.string.invite_repeat_password, repeat) { repeat = it }
                Submit(if (existing) email.isNotBlank() && password.isNotBlank() else password.length >= 12 && password == repeat,
                    if (existing) R.string.invite_confirm else R.string.invite_activate) {
                    val body = JSONObject().put("token", token).put("password", password)
                    if (existing) body.put("email", email.trim()) else body.put("proof", proof)
                    model.acceptInvite(existing, body, key)
                    password = ""; repeat = ""; completed = true
                }
                if (!existing) TextButton(onClick = { existing = true; repeat = ""; password = "" }) {
                    Text(stringResource(R.string.invite_have_account))
                }
            }
        }
        TextButton(onClick = close) { Text(stringResource(if (completed) R.string.sign_in else R.string.close)) }
    }
}

@Composable
private fun PasswordInput(label: Int, value: String, change: (String) -> Unit) {
    OutlinedTextField(value, change, singleLine = true, modifier = Modifier.fillMaxWidth(),
        label = { Text(stringResource(label)) }, visualTransformation = PasswordVisualTransformation(),
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password))
}

private val validity = mapOf("pending" to R.string.invite_pending, "expired" to R.string.invite_expired,
    "replaced" to R.string.invite_replaced, "revoked" to R.string.invite_revoked, "activated" to R.string.invite_activated)
private val delivery = mapOf("ready" to R.string.invite_ready, "queued" to R.string.invite_queued,
    "sent" to R.string.invite_sent, "bounced" to R.string.invite_bounced)
private typealias InvitationRows = AsyncState<WirePage<List<JSONObject>>>

@Composable
fun StaffInvitationsScreen(model: IdentityViewModel, teachers: Boolean, batch: String? = null, invitationId: String? = null, close: () -> Unit) {
    val requests = remember { mutableMapOf<String, Pair<String, String>>() }
    var generation by remember { mutableStateOf(0) }
    var rows by remember { mutableStateOf<InvitationRows>(AsyncState.InitialLoading()) }
    var filter by remember { mutableStateOf("") }
    var change by remember { mutableStateOf<JSONObject?>(null) }
    var currentPage by remember { mutableStateOf<WirePage<List<JSONObject>>?>(null) }
    val query = "/invitations?limit=25" + (invitationId?.let { "&id=$it" } ?: "") + (batch?.let { "&batchId=$it" } ?: "") + (filter.takeIf { it.isNotEmpty() }?.let { "&status=$it" } ?: "")

    LaunchedEffect(generation, query) {
        rows = AsyncState.InitialLoading()
        rows = try {
            val page = model.page(query)
            currentPage = page
            AsyncState.Ready(page)
        } catch (error: CancellationException) { throw error }
        catch (error: HttpFailure) {
            if (error.status in listOf(401,403,404)) AsyncState.Forbidden(close)
            else AsyncState.Error(retry = { generation++ })
        } catch (_: Exception) { AsyncState.Error(retry = { generation++ }) }
    }
    BackHandler(onBack = close)

    Column(Modifier.fillMaxSize().safeDrawingPadding().imePadding().verticalScroll(rememberScrollState()).padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)) {
        TextButton(onClick = close) { Text(stringResource(R.string.back)) }
        Text(stringResource(R.string.invite_title), Modifier.semantics { heading() }, style = MaterialTheme.typography.headlineMedium)
        if (batch != null) BatchInvitations(model, batch, requests) { generation++ }
        if (teachers && batch == null) TeacherInvitation { input ->
            model.schoolCommand(requests, "/invitations/teachers", "POST", input)
            generation++
        }
        HorizontalDivider()
        (mapOf("" to R.string.invite_any) + validity).forEach { (id, title) ->
            FilterChip(filter == id, onClick = { filter = id; change = null }, label = { Text(stringResource(title)) })
        }
        AsyncSurface(rows) { own ->
            if (own.data.isEmpty()) Text(stringResource(R.string.empty))
            own.data.forEach { invitation ->
                val state = invitation.getString("validity")
                val accepted = delivery[invitation.getString("delivery")] ?: R.string.invite_ready
                Text("\u2066${invitation.getString("email")}\u2069")
                Text("${stringResource(validity[state] ?: R.string.invite_revoked)} · ${stringResource(accepted)}")
                if (state == "pending" || state == "expired") TextButton(onClick = { change = invitation }) {
                    Text(stringResource(R.string.invite_reissue))
                }
            }
            own.nextCursor?.let { cursor -> Submit(true, R.string.staff_more) {
                val part = model.page("$query&cursor=$cursor")
                val result = part.copy(data = currentPage?.data.orEmpty() + part.data)
                currentPage = result
                rows = AsyncState.Ready(result)
            } }
        }
        change?.let { item -> key(item.getString("id")) {
            var corrected by remember { mutableStateOf("") }
            Text(stringResource(R.string.invite_reissue), style = MaterialTheme.typography.titleLarge)
            Text("\u2066${item.getString("email")}\u2069")
            Field(R.string.invite_correct, corrected) { corrected = it }
            Submit(true, R.string.invite_confirm) {
                val input = JSONObject().put("revision", item.getInt("revision"))
                if (corrected.isNotBlank()) input.put("correctedEmail", corrected.trim())
                model.schoolCommand(requests, "/invitations/${item.getString("id")}/reissue", "POST", input)
                change = null; generation++
            }
            TextButton(onClick = { change = null }) { Text(stringResource(R.string.cancel)) }
        } }
    }
}

@Composable
private fun BatchInvitations(model: IdentityViewModel, batch: String,
    requests: MutableMap<String, Pair<String, String>>, issued: () -> Unit,
) {
    var rows by remember { mutableStateOf<InvitationRows>(AsyncState.InitialLoading()) }
    var attempt by remember { mutableStateOf(0) }
    var picked by remember { mutableStateOf(emptySet<String>()) }
    var receipt by remember { mutableStateOf<JSONObject?>(null) }
    val url = "/invitations/batches/$batch?limit=50"
    LaunchedEffect(batch, attempt) {
        rows = try { AsyncState.Ready(model.page(url)) }
        catch (error: CancellationException) { throw error }
        catch (_: Exception) { AsyncState.Error(retry = { attempt++ }) }
    }
    Text(stringResource(R.string.invite_batch), style = MaterialTheme.typography.titleLarge)
    AsyncSurface(rows) { page ->
        if (page.data.isEmpty()) Text(stringResource(R.string.empty))
        page.data.forEach { person ->
            val id = person.getString("id")
            FilterChip(id in picked, {
                picked = if (id in picked) picked - id else picked + id
            }, label = { Text("${isolate(person.getString("name"))} · \u2066${person.getString("email")}\u2069 · ${person.getString("locale")}") })
        }
        page.nextCursor?.let { next -> Submit(true, R.string.staff_more) {
            val fetched = model.page("$url&cursor=$next")
            rows = AsyncState.Ready(fetched.copy(data = page.data + fetched.data))
        } }
        Submit(picked.size in 1..100, R.string.invite_queue) {
            receipt = model.schoolCommand(requests, "/invitations/batches", "POST",
                JSONObject().put("committedBatchId", batch).put("recipientIds", JSONArray(picked.toList())))
            picked = emptySet()
            issued()
        }
        receipt?.let {
            Text(stringResource(R.string.invite_count, it.getInt("issued"), it.getInt("alreadyPending")))
        }
    }
}

@Composable
private fun TeacherInvitation(issue: suspend (JSONObject) -> Unit) {
    var name by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    val language = if (LocalConfiguration.current.locales[0].language == "de") "de" else "ar"
    var locale by remember { mutableStateOf(language) }
    Text(stringResource(R.string.invite_teacher), style = MaterialTheme.typography.titleLarge)
    Field(R.string.family_name, name) { name = it }
    Field(R.string.email, email) { email = it }
    FilterChip(locale == "ar", { locale = "ar" }, label = { Text("العربية") })
    FilterChip(locale == "de", { locale = "de" }, label = { Text("Deutsch") })
    Submit(name.trim().length in 1..200 && email.isNotBlank(), R.string.invite_queue) {
        issue(JSONObject().put("name", name.trim()).put("email", email.trim()).put("locale", locale))
        name = ""; email = ""
    }
}

private suspend fun IdentityViewModel.page(url: String): WirePage<List<JSONObject>> =
    decodeData(schoolRequest(url)) { payload ->
        val array = payload as JSONArray
        List(array.length(), array::getJSONObject)
    }
