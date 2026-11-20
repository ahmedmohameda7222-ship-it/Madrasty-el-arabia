package de.madrasty.app.identity

import android.app.Application
import android.net.Uri
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import de.madrasty.app.attendance.AttendanceDraftStore
import de.madrasty.app.attendance.OfflineAttendanceScreen
import de.madrasty.app.R
import de.madrasty.app.ui.Persona
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.launch
import org.json.JSONObject
import org.json.JSONArray
import de.madrasty.app.api.decodeData

class IdentityViewModel(application: Application) : AndroidViewModel(application) {
    private val attendanceDrafts = AttendanceDraftStore(application)
    private val repository = AuthRepository(application,attendanceDrafts)
    var session by mutableStateOf<SchoolSession?>(null)
        private set
    var pending by mutableStateOf(true)
        private set
    var failure by mutableStateOf<Int?>(null)
        private set
    private var initialized = false
    private var reconnecting = false
    var attendanceNetworkRevision by mutableStateOf(0)
        private set
    var attendanceResume by mutableStateOf<String?>(null)
        private set
    var preference by mutableStateOf<Pair<String, AccountPreference>?>(null)
        private set

    fun applyPreferences(account: String, updated: AccountPreference) {
        if (session?.actor?.accountId != account) return
        val current = preference?.takeIf { it.first == account }?.second
        if (current == null || updated.revision >= current.revision) preference = account to updated
    }

    private val connectivity = application.getSystemService(ConnectivityManager::class.java)
    private val networkCallback = object : ConnectivityManager.NetworkCallback() {
        override fun onAvailable(network: Network) {
            viewModelScope.launch {
                try {
                    repository.retrySignOut()
                    if (failure == R.string.sign_out_pending) failure = null
                    attendanceNetworkRevision++
                    reconnectAttendance()
                } catch (error: CancellationException) {
                    throw error
                } catch (_: Exception) {
                    // Keep the pending operation for the next available network.
                }
            }
        }
    }

    init {
        connectivity?.registerDefaultNetworkCallback(networkCallback)
    }

    override fun onCleared() {
        connectivity?.unregisterNetworkCallback(networkCallback)
        super.onCleared()
    }


    fun open(callback: Uri?) {
        if (callback == null && initialized) return
        initialized = true
        run(if (callback == null) R.string.auth_unavailable else R.string.sign_in_failed) {
            session = if (callback == null) repository.restore() else repository.completeLink(callback)
        }
    }

    suspend fun applicantRegistration(email: String, locale: String) = repository.requestApplicant(email,locale)
    suspend fun applicantSignIn(email: String, password: String) = repository.applicantSignIn(email,password)
    suspend fun applicantCall(path: String, data: JSONObject? = null) = repository.applicantRequest(path,data)
    fun endApplicantSession() { viewModelScope.launch { repository.closeApplicant() } }
    suspend fun acceptInvite(existing: Boolean, body: JSONObject, idempotencyKey: String) =
        repository.acceptInvite(existing, body, idempotencyKey)

    fun signIn(email: String, password: String) = run(R.string.sign_in_failed) {
        session = repository.signIn(email, password)
    }

    fun switch(persona: Persona) = run(R.string.auth_unavailable) {
        clearSecurity()
        session = repository.switchPersona(persona)
    }

    var verifiedFactor by mutableStateOf<String?>(null)
        private set
    var enrollment by mutableStateOf<AuthRepository.Enrollment?>(null)
        private set
    var factorsLoaded by mutableStateOf(false)
        private set
    var sentEmail by mutableStateOf(false)
        private set

    suspend fun schoolRequest(path: String, body: JSONObject? = null, method: String = "GET", idempotencyKey: String? = null): String {
        val expected=session?.actor
        val result=repository.request(path,body,idempotencyKey,method)
        val refreshed=repository.snapshot()
        if(refreshed!=null && refreshed.actor==expected && session?.actor==expected && session?.expiresAt!=refreshed.expiresAt)session=refreshed
        return result
    }

    suspend fun readAttendanceDraft(slot:String):JSONObject?{
        val actor=session?.actor?:return null
        return withContext(Dispatchers.IO){runCatching{attendanceDrafts.read(actor,slot)}.getOrNull()}
    }
    suspend fun listAttendanceDrafts():List<Pair<String,JSONObject>>{
        val actor=session?.actor?:return emptyList()
        return withContext(Dispatchers.IO){runCatching{attendanceDrafts.list(actor)}.getOrDefault(emptyList())}
    }
    suspend fun saveAttendanceDraft(slot:String,value:JSONObject):Boolean{
        val actor=session?.actor?:return false
        return withContext(Dispatchers.IO){runCatching{attendanceDrafts.write(actor,slot,value)}.getOrDefault(false)}
    }
    suspend fun purgeAttendanceDrafts(prefix:String){
        val actor=session?.actor?:return
        withContext(Dispatchers.IO){runCatching{attendanceDrafts.purge(actor,prefix)}}
    }

    fun hasValidatedNetwork():Boolean {
        val active=connectivity?.activeNetwork?:return false
        return connectivity.getNetworkCapabilities(active)?.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)==true
    }

    fun pickAttendanceResume(slot:String?) { attendanceResume=slot }
    fun reconnectAttendance() {
        val previous=session?.takeIf{it.offlineOnly}?:return
        if(reconnecting)return
        reconnecting=true
        viewModelScope.launch{
            try{
                val confirmed=repository.restore(allowOffline=false)
                if(session==previous)session=confirmed
            }catch(error:CancellationException){throw error}
            catch(_:Exception){ /* Keep the confirmed local scope until it expires. */ }
            finally{reconnecting=false}
        }
    }
    fun endExpiredAttendance() {
        if(session?.offlineOnly!=true)return
        session=null
        attendanceResume=null
        viewModelScope.launch(Dispatchers.IO){runCatching{attendanceDrafts.clear()}}
    }

    fun attendanceNoticeStream(path: String, after: String?) = repository.attendanceNoticeStream(path,after)

    suspend fun capabilities(): Set<String> {
        val raw = schoolRequest("/auth/capabilities")
        return decodeData(raw) { value ->
            val keys = value as JSONArray
            (0 until keys.length()).map(keys::getString).toSet()
        }.data
    }
    fun loadFactors() = run(R.string.auth_unavailable) {
        verifiedFactor = repository.verifiedFactor()
        factorsLoaded = true
    }

    fun enrollFactor() = run(R.string.auth_unavailable) { enrollment = repository.enrollFactor() }

    fun verifyFactor(id: String, code: String) = run(R.string.sign_in_failed) {
        session = repository.verifyFactor(id, code)
        verifiedFactor = id
        enrollment = null
    }

    fun requestEmailChange(email: String, password: String) = run(R.string.auth_unavailable) {
        repository.requestEmailChange(email, password)
        sentEmail = true
    }

    private fun clearSecurity() {
        verifiedFactor = null
        enrollment = null
        factorsLoaded = false
        sentEmail = false
    }
    fun signOut(all: Boolean) {
        clearSecurity()
        session = null
        attendanceResume = null
        preference = null
        run(R.string.sign_out_pending) { repository.signOut(all) }
    }

    private fun run(fallback: Int, action: suspend () -> Unit) {
        pending = true
        failure = null
        viewModelScope.launch {
            try {
                action()
            } catch (error: CancellationException) {
                throw error
            } catch (error: Exception) {
                failure = if (error is HttpFailure && error.status >= 500 && fallback == R.string.sign_in_failed)
                    R.string.auth_unavailable else fallback
            } finally {
                pending = false
            }
        }
    }
}

@Composable
fun IdentityScreen(model: IdentityViewModel, callback: Uri?, consumed: () -> Unit) {
    val invite = callback?.takeIf(::isSchoolInvitation)
    LaunchedEffect(callback) {
        if (invite != null) return@LaunchedEffect
        model.open(callback)
        if (callback != null) consumed()
    }
    if (invite != null) {
        InvitationLanding(model, invite, consumed)
        return
    }
    val session = model.session
    val navigation = remember(session?.actor) { SchoolNavigation() }
    if (navigation.page == WorkspacePage.Apply) {
        ApplicantScreen(model) { model.endApplicantSession(); navigation.back() }
    } else if (session == null) {
        SignInScreen(model) { navigation.open(WorkspacePage.Apply) }
    } else if (session.offlineOnly) {
        OfflineAttendanceScreen(model,session)
    } else {
        SchoolWorkspace(model,session,navigation)
    }
}

@Composable
private fun SignInScreen(model: IdentityViewModel, apply: () -> Unit) {
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var visible by remember { mutableStateOf(false) }
    Column(
        Modifier.fillMaxSize().safeDrawingPadding().imePadding().verticalScroll(rememberScrollState()).padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Image(painterResource(R.drawable.school_seal), null, Modifier.size(64.dp))
        Text(stringResource(R.string.app_name), style = MaterialTheme.typography.titleLarge)
        Text(stringResource(R.string.sign_in), Modifier.semantics { heading() }, style = MaterialTheme.typography.headlineMedium)
        OutlinedTextField(email, { email = it }, label = { Text(stringResource(R.string.email)) },
            modifier = Modifier.fillMaxWidth(), singleLine = true, enabled = !model.pending,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email))
        OutlinedTextField(password, { password = it }, label = { Text(stringResource(R.string.password)) },
            modifier = Modifier.fillMaxWidth(), singleLine = true, enabled = !model.pending,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
            visualTransformation = if (visible) VisualTransformation.None else PasswordVisualTransformation(),
            trailingIcon = { TextButton(onClick = { visible = !visible }) {
                Text(stringResource(if (visible) R.string.hide_password else R.string.show_password))
            } })
        model.failure?.let { Text(stringResource(it), Modifier.semantics { liveRegion = LiveRegionMode.Polite }) }
        Button(
            onClick = { model.signIn(email, password); password = ""; visible = false },
            enabled = !model.pending && email.isNotBlank() && password.isNotEmpty(),
            modifier = Modifier.fillMaxWidth(),
        ) { Text(stringResource(if (model.pending) R.string.loading else R.string.sign_in)) }
        RecoveryLink()
        TextButton(onClick=apply) { Text(stringResource(R.string.teacher_apply)) }
    }
}

@Composable
internal fun AccountActions(model: IdentityViewModel, session: SchoolSession) {
    var revoke by remember { mutableStateOf<Boolean?>(null) }
    var chosen by remember { mutableStateOf<Persona?>(null) }
    if (session.personas.size > 1) {
        Text(stringResource(R.string.change_persona))
        session.personas.filter { it != session.actor.persona }.forEach { persona ->
            TextButton(onClick = { chosen = persona }, enabled = !model.pending) {
                Text(stringResource(personaLabel(persona)))
            }
        }
    }
    TextButton(onClick = { revoke = false }, enabled = !model.pending) { Text(stringResource(R.string.sign_out)) }
    TextButton(onClick = { revoke = true }, enabled = !model.pending) { Text(stringResource(R.string.sign_out_all)) }
    model.failure?.let { Text(stringResource(it), Modifier.semantics { liveRegion = LiveRegionMode.Polite }) }

    if (revoke != null || chosen != null) {
        val cancelling = { revoke = null; chosen = null }
        AlertDialog(
            onDismissRequest = cancelling,
            text = { Text(stringResource(if (revoke == null) R.string.switch_notice else R.string.sign_out_confirm)) },
            confirmButton = { TextButton(onClick = {
                revoke?.let(model::signOut)
                chosen?.let(model::switch)
                cancelling()
            }) { Text(stringResource(R.string.confirm)) } },
            dismissButton = { TextButton(onClick = cancelling) { Text(stringResource(R.string.cancel)) } },
        )
    }
}

private fun personaLabel(persona: Persona): Int = when (persona) {
    Persona.Admin -> R.string.persona_admin
    Persona.Teacher -> R.string.persona_teacher
    Persona.Guardian -> R.string.persona_guardian
}
