package de.madrasty.app.identity

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
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
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
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
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import java.util.Locale

private const val root = "/teacher-applications"
private val states = mapOf("submitted" to R.string.applicant_submitted, "approved" to R.string.applicant_approved,
    "declined" to R.string.applicant_declined)

@Composable
fun ApplicantScreen(model: IdentityViewModel, close: () -> Unit) {
    val code = if (LocalConfiguration.current.locales[0].language == "de") "de" else "ar"
    var available by remember { mutableStateOf<Boolean?>(null) }
    var data by remember { mutableStateOf<JSONObject?>(null) }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var emailSent by remember { mutableStateOf(false) }
    var failure by remember { mutableStateOf(false) }
    suspend fun refresh() {
        data = decodeData(model.applicantCall("$root/me")) { it as? JSONObject }.data
        available = true
    }
    LaunchedEffect(Unit) {
        try { refresh() }
        catch (error: CancellationException) { throw error }
        catch (error: HttpFailure) { available = false; failure = error.status !in 401..403 }
        catch (_: Exception) { available = false; failure = true }
    }
    BackHandler(onBack = close)
    Column(Modifier.fillMaxSize().safeDrawingPadding().imePadding().verticalScroll(rememberScrollState()).padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)) {
        TextButton(onClick = close) { Text(stringResource(R.string.back)) }
        Text(stringResource(R.string.teacher_apply), Modifier.semantics { heading() }, style = MaterialTheme.typography.headlineMedium)
        when (available) {
            null -> Text(stringResource(R.string.loading))
            false -> {
                Text(stringResource(R.string.applicant_verify), style = MaterialTheme.typography.titleLarge)
                Field(R.string.email, email) { email = it }
                Submit(email.trim().isNotEmpty(), R.string.applicant_send_link) {
                    model.applicantRegistration(email,code)
                    emailSent = true
                }
                if (emailSent) Text(stringResource(R.string.applicant_link_sent))
                OutlinedTextField(password, { password = it }, label = { Text(stringResource(R.string.password)) },
                    singleLine = true, modifier = Modifier.fillMaxWidth(), visualTransformation = PasswordVisualTransformation())
                Submit(email.isNotBlank() && password.isNotBlank(), R.string.applicant_signin) {
                    model.applicantSignIn(email,password)
                    password = ""; failure = false
                    refresh()
                }
            }
            true -> {
                val record = data
                if (record == null) ApplicationForm(code) { fields ->
                    data = decodeData(model.applicantCall(root,fields)) { it as JSONObject }.data
                } else {
                    ApplicationState(record,code)
                    Submit(true,R.string.applicant_refresh) { refresh() }
                }
                TextButton(onClick = { model.endApplicantSession(); available = false; data = null; password = "" }) {
                    Text(stringResource(R.string.applicant_signout))
                }
            }
        }
        if (failure) Text(stringResource(R.string.auth_unavailable))
    }
}

@Composable
private fun ApplicationForm(default: String, send: suspend (JSONObject) -> Unit) {
    var name by remember { mutableStateOf("") }
    var contact by remember { mutableStateOf("") }
    var subjects by remember { mutableStateOf("") }
    var locale by remember { mutableStateOf(default) }
    Field(R.string.family_name,name) { name = it }
    Field(R.string.applicant_contact,contact) { contact = it }
    Field(R.string.applicant_subjects,subjects) { subjects = it }
    Text(stringResource(R.string.guardian_locale))
    FilterChip(locale == "ar",{locale="ar"},label={ Text("العربية") })
    FilterChip(locale == "de",{locale="de"},label={ Text("Deutsch") })
    Submit(name.trim().length in 1..200 && contact.length <= 180, R.string.applicant_submit) {
        val values = JSONObject().put("displayName",name.trim()).put("correspondenceLocale",locale)
            .put("requestedSubjects",JSONArray(subjects.split(',', '،').map(String::trim).filter(String::isNotEmpty)))
        if (contact.isNotBlank()) values.put("workContact",contact.trim())
        send(values)
    }
}

@Composable
fun TeacherApplicationReview(model: IdentityViewModel, close: () -> Unit) {
    val language = if (LocalConfiguration.current.locales[0].language == "de") "de" else "ar"
    val commands = remember { mutableMapOf<String,Pair<String,String>>() }
    var filter by remember { mutableStateOf("submitted") }
    var generation by remember { mutableStateOf(0) }
    var list by remember { mutableStateOf<AsyncState<WirePage<List<JSONObject>>>>(AsyncState.InitialLoading()) }
    var selected by remember { mutableStateOf<JSONObject?>(null) }
    val path = "$root?limit=25" + if (filter.isEmpty()) "" else "&status=$filter"
    BackHandler(onBack = close)
    LaunchedEffect(path,generation) {
        list = AsyncState.InitialLoading()
        list = try { AsyncState.Ready(model.applicationPage(path)) }
        catch (error: CancellationException) { throw error }
        catch (error: HttpFailure) {
            if (error.status in 401..403) AsyncState.Forbidden(close) else AsyncState.Error(retry={generation++})
        } catch (_: Exception) { AsyncState.Error(retry={generation++}) }
    }
    Column(Modifier.fillMaxSize().safeDrawingPadding().imePadding().verticalScroll(rememberScrollState()).padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)) {
        TextButton(onClick = close) { Text(stringResource(R.string.back)) }
        Text(stringResource(R.string.teacher_apps), Modifier.semantics { heading() }, style = MaterialTheme.typography.headlineMedium)
        (mapOf("" to R.string.invite_any) + states).forEach { (value,label) ->
            FilterChip(filter==value,{filter=value;selected=null},label={Text(stringResource(label))})
        }
        AsyncSurface(list) { page ->
            if (page.data.isEmpty()) Text(stringResource(R.string.empty))
            page.data.forEach { application ->
                ApplicationState(application,language)
                if (!application.isNull("workContact")) Text(isolate(application.getString("workContact")))
                application.optJSONArray("requestedSubjects")?.let {
                    if (it.length()>0) Text((0 until it.length()).map(it::getString).joinToString(", "))
                }
                if (application.getString("state")=="submitted") TextButton(onClick = { selected=application }) {
                    Text(stringResource(R.string.teacher_apps))
                }
                HorizontalDivider()
            }
            page.nextCursor?.let { cursor -> Submit(true,R.string.staff_more) {
                val next = model.applicationPage("$path&cursor=$cursor")
                list = AsyncState.Ready(next.copy(data=page.data+next.data))
            } }
        }
        selected?.let { record -> key(record.getString("id")) {
            var message by remember { mutableStateOf("") }
            var decision by remember { mutableStateOf("approved") }
            Text(isolate(record.getString("displayName")),style=MaterialTheme.typography.titleLarge)
            OutlinedTextField(message,{message=it},label={Text(stringResource(R.string.applicant_message))})
            FilterChip(decision=="approved",{decision="approved"},label={Text(stringResource(R.string.applicant_approve))})
            FilterChip(decision=="declined",{decision="declined"},label={Text(stringResource(R.string.applicant_decline))})
            Submit(message.length<=1200,R.string.confirm) {
                val input=JSONObject().put("decision",decision).put("revision",record.getInt("revision"))
                if (message.isNotBlank()) input.put("applicantMessage",message.trim())
                model.schoolCommand(commands,"$root/${record.getString("id")}/decision","POST",input)
                selected=null;generation++
            }
            TextButton(onClick={selected=null}){Text(stringResource(R.string.cancel))}
        } }
    }
}

@Composable
private fun ApplicationState(record: JSONObject, locale: String) {
    val text = states[record.getString("state")] ?: R.string.applicant_submitted
    val format = DateTimeFormatter.ofLocalizedDate(FormatStyle.MEDIUM).withLocale(Locale.forLanguageTag(locale))
        .withZone(ZoneId.systemDefault())
    Text("${isolate(record.getString("displayName"))} · ${stringResource(text)}")
    Text("${stringResource(R.string.applicant_submitted_at)} · ${format.format(Instant.parse(record.getString("submittedAt")))}",
        style=MaterialTheme.typography.bodySmall)
    if (!record.isNull("decidedAt")) Text("${stringResource(R.string.applicant_decided_at)} · ${format.format(Instant.parse(record.getString("decidedAt")))}",
        style=MaterialTheme.typography.bodySmall)
    if (record.optJSONObject("decisionNotice") != null) Text(stringResource(R.string.applicant_decision_notice))
    if (!record.isNull("applicantMessage")) Text(record.getString("applicantMessage"))
}

private suspend fun IdentityViewModel.applicationPage(url:String): WirePage<List<JSONObject>> =
    decodeData(schoolRequest(url)) { data ->
        val values=data as JSONArray
        List(values.length(),values::getJSONObject)
    }
