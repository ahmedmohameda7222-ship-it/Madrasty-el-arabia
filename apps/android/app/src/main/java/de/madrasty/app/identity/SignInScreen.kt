package de.madrasty.app.identity

import android.app.Application
import android.net.Uri
import android.net.ConnectivityManager
import android.net.Network
import androidx.activity.compose.BackHandler
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
import de.madrasty.app.R
import de.madrasty.app.school.CalendarScreen
import de.madrasty.app.school.ChildrenScreen
import de.madrasty.app.school.FamiliesScreen
import de.madrasty.app.school.EnrollmentScreen
import de.madrasty.app.school.ImportScreen
import de.madrasty.app.school.StaffAssignmentsScreen
import de.madrasty.app.school.TeachingSummary
import de.madrasty.app.school.TimetableScreen
import de.madrasty.app.school.SchoolHomeScreen
import de.madrasty.app.school.SchoolWorkQueueScreen
import de.madrasty.app.school.SchoolWorkTarget
import de.madrasty.app.school.WorkQueueSelection
import de.madrasty.app.school.AuditDestination
import de.madrasty.app.school.AuditFilters
import de.madrasty.app.school.AuditScreen
import de.madrasty.app.ui.Persona
import de.madrasty.app.ui.SchoolShell
import de.madrasty.app.ui.SchoolTab
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch
import org.json.JSONObject
import org.json.JSONArray
import de.madrasty.app.api.decodeData

class IdentityViewModel(application: Application) : AndroidViewModel(application) {
    private val repository = AuthRepository(application)
    var session by mutableStateOf<SchoolSession?>(null)
        private set
    var pending by mutableStateOf(true)
        private set
    var failure by mutableStateOf<Int?>(null)
        private set
    private var initialized = false
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

    suspend fun schoolRequest(path: String, body: JSONObject? = null, method: String = "GET", idempotencyKey: String? = null) =
        repository.request(path, body, idempotencyKey, method)

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
    var security by remember(session?.actor) { mutableStateOf(false) }
    var staffAccess by remember(session?.actor) { mutableStateOf(false) }
    var capabilities by remember(session?.actor) { mutableStateOf(emptySet<String>()) }
    var calendar by remember(session?.actor) { mutableStateOf(false) }
    var enrollment by remember(session?.actor) { mutableStateOf(false) }
    var assignments by remember(session?.actor) { mutableStateOf(false) }
    var importing by remember(session?.actor) { mutableStateOf(false) }
    var invitations by remember(session?.actor) { mutableStateOf(false) }
    var inviteBatch by remember(session?.actor) { mutableStateOf<String?>(null) }
    LaunchedEffect(session?.actor, session?.assurance) {
        if (session?.actor?.persona == Persona.Admin && session.assurance == "aal2") {
            capabilities = try { model.capabilities() } catch (error: CancellationException) { throw error } catch (_: Exception) { emptySet() }
        }
    }
    var application by remember(session?.actor) { mutableStateOf(false) }
    var applicationReview by remember(session?.actor) { mutableStateOf(false) }
    var preferences by remember(session?.actor) { mutableStateOf(false) }
    var directory by remember(session?.actor) { mutableStateOf(false) }
    var timetable by remember(session?.actor) { mutableStateOf(false) }
    var timetableChild by remember(session?.actor) { mutableStateOf<String?>(null) }
    var selectedChild by remember(session?.actor) { mutableStateOf<String?>(null) }
    var activeTab by remember(session?.actor) { mutableStateOf(SchoolTab.Home) }
    var attendanceClass by remember(session?.actor) { mutableStateOf<String?>(null) }
    var workDate by remember(session?.actor) { mutableStateOf("") }
    var queueSelection by remember(session?.actor) { mutableStateOf<WorkQueueSelection?>(null) }
    var queueOpen by remember(session?.actor) { mutableStateOf(false) }
    var workTarget by remember(session?.actor) { mutableStateOf<SchoolWorkTarget?>(null) }

    fun openSchedule(child: String?) {
        timetableChild = child
        timetable = true
    }
    fun returnToQueue() {
        workTarget = null
        activeTab = SchoolTab.Home
        queueOpen = queueSelection != null
    }
    var auditing by remember(session?.actor) { mutableStateOf(false) }
    var auditFilters by remember(session?.actor) { mutableStateOf(AuditFilters()) }
    var selectedAuditEntry by remember(session?.actor) { mutableStateOf<String?>(null) }
    var auditDestination by remember(session?.actor) { mutableStateOf<AuditDestination?>(null) }

    fun returnToAudit() {
        auditDestination = null
        activeTab = SchoolTab.More
        auditing = true
    }
    fun openAudited(destination: AuditDestination) {
        auditDestination = destination
        auditing = false
        when(destination.kind) {
            "access" -> staffAccess = true
            "calendar" -> calendar = true
            "assignments", "class" -> assignments = true
            "timetable" -> openSchedule(null)
            "invitations" -> invitations = true
            "applications" -> applicationReview = true
            "import" -> importing = true
            "student", "guardian" -> activeTab = SchoolTab.Students
        }
    }
    val currentQueue = queueSelection
    val audited = auditDestination
    if (application) ApplicantScreen(model) { model.endApplicantSession(); application = false }
    else if (applicationReview && "applications.manage" in capabilities) TeacherApplicationReview(model) {
        applicationReview = false
        if (audited?.kind == "applications") returnToAudit()
    }
    else if (session == null) SignInScreen(model) { application = true }
    else if (security || session.actor.persona == Persona.Admin && session.assurance != "aal2") {
        SecurityScreen(model, session) { security = false }
    } else if (staffAccess && "access.manage" in capabilities) StaffAccessScreen(model, session) {
        staffAccess = false
        if (audited?.kind == "access") returnToAudit()
    }
    else if (auditing && "audit.read" in capabilities) AuditScreen(
        model, selectedAuditEntry, { selectedAuditEntry = it }, auditFilters, { auditFilters = it },
        ::openAudited, { auditing = false },
    )
    else if (queueOpen && currentQueue != null && session.actor.persona == Persona.Admin)
        SchoolWorkQueueScreen(model,currentQueue,open = { target ->
            workTarget = target
            queueOpen = false
            when (target) {
                is SchoolWorkTarget.GuardianLink -> activeTab = SchoolTab.Students
                is SchoolWorkTarget.FamilyImport -> importing = true
                is SchoolWorkTarget.ClassAssignment -> assignments = true
            }
        },close = { queueOpen = false; queueSelection = null })
    else if (preferences) AccountScreen(model, close = { preferences = false }, security = { security = true })
    else if (directory) DirectoryScreen(model) { directory = false }
    else if (timetable) TimetableScreen(model, session.actor.persona, timetableChild) {
        timetable = false
        timetableChild = null
        if (audited?.kind == "timetable") returnToAudit()
    }
    else if (calendar && "school.manage" in capabilities) CalendarScreen(model) {
        calendar = false
        if (audited?.kind == "calendar") returnToAudit()
    }
    else if (enrollment && ("school.manage" in capabilities || "students.manage" in capabilities))
        EnrollmentScreen(model, "school.manage" in capabilities, "students.manage" in capabilities) { enrollment = false }
    else if (assignments && ("school.manage" in capabilities || "academics.supervise" in capabilities))
        StaffAssignmentsScreen(model, (workTarget as? SchoolWorkTarget.ClassAssignment) ?:
            audited?.takeIf { it.kind == "class" && it.id != null && it.yearId != null }?.let {
                SchoolWorkTarget.ClassAssignment(checkNotNull(it.id),checkNotNull(it.yearId))
            }
        ) {
            assignments = false
            if (workTarget is SchoolWorkTarget.ClassAssignment) returnToQueue()
            if (audited?.kind in listOf("assignments","class")) returnToAudit()
        }
    else if (invitations && ("students.manage" in capabilities || "applications.manage" in capabilities))
        StaffInvitationsScreen(model, "applications.manage" in capabilities, inviteBatch) {
            invitations = false
            inviteBatch = null
            if (audited?.kind == "invitations") returnToAudit()
        }
    else if (importing && "students.manage" in capabilities)
        ImportScreen(model, { id -> inviteBatch = id; invitations = true },
            (workTarget as? SchoolWorkTarget.FamilyImport)?.jobId ?: audited?.takeIf { it.kind == "import" }?.id
        ) {
            importing = false
            if (workTarget is SchoolWorkTarget.FamilyImport) returnToQueue()
            if (audited?.kind == "import") returnToAudit()
        }
    else SchoolShell(session.actor, activeTab, { next -> activeTab = next; attendanceClass = null }) { tab ->
        Text(stringResource(tab.label), Modifier.semantics { heading() }, style = MaterialTheme.typography.headlineMedium)
        if (tab == SchoolTab.Home) SchoolHomeScreen(
            model, session.actor.persona, workDate, { workDate = it },
            openQueue = { queueSelection = it; queueOpen = true },
            openDirectory = { directory = true },
            child = selectedChild, pickChild = { selectedChild = it },
            openProfile = { selectedChild = it; activeTab = SchoolTab.Children },
            openAttendance = { attendanceClass = it; activeTab = SchoolTab.Attendance },
            openSchedule = ::openSchedule,
        )
        if (tab == SchoolTab.Attendance) TeachingSummary(model, attendanceClass)
        if (tab == SchoolTab.Children) ChildrenScreen(model, selectedChild, { selectedChild = it }, ::openSchedule)
        if (tab == SchoolTab.Students && "students.manage" in capabilities) {
            val queued = workTarget as? SchoolWorkTarget.GuardianLink
            if (queued != null) {
                BackHandler { returnToQueue() }
                TextButton(onClick = ::returnToQueue) { Text(stringResource(R.string.queue_open)) }
            }
            TextButton(onClick = { importing = true }) { Text(stringResource(R.string.import_families)) }
            if (audited?.kind in listOf("student","guardian")) {
                BackHandler { returnToAudit() }
                TextButton(onClick = ::returnToAudit) { Text(stringResource(R.string.audit_title)) }
            }
            val guardian = audited?.takeIf { it.kind == "guardian" }
            FamiliesScreen(model, initialStudent=audited?.takeIf { it.kind == "student" }?.id,
                initialGuardian=queued?.guardianId ?: guardian?.id,initialLink=queued?.linkId ?: guardian?.linkId)
        }
        if (tab == SchoolTab.More) {
            Text(stringResource(R.string.settings_group_account),style=MaterialTheme.typography.titleLarge)
            TextButton(onClick = { security = true }) { Text(stringResource(R.string.security)) }
            TextButton(onClick = { preferences = true }) { Text(stringResource(R.string.account_preferences)) }
            TextButton(onClick = { directory = true }) { Text(stringResource(R.string.directory_title)) }
            AccountActions(model, session)
            if (session.actor.persona != Persona.Admin || capabilities.any {
                it in setOf("school.manage","students.manage","academics.supervise","applications.manage")
            }) Text(stringResource(R.string.settings_group_school),style=MaterialTheme.typography.titleLarge)
            if (session.actor.persona != Persona.Admin || "school.manage" in capabilities || "academics.supervise" in capabilities)
                TextButton(onClick = { timetable = true }) { Text(stringResource(R.string.timetable_title)) }
            if ("school.manage" in capabilities || "academics.supervise" in capabilities)
                TextButton(onClick = { assignments = true }) { Text(stringResource(R.string.staff_assignments)) }
            if ("school.manage" in capabilities) TextButton(onClick = { calendar = true }) { Text(stringResource(R.string.school_calendar)) }
            if ("school.manage" in capabilities || "students.manage" in capabilities)
                TextButton(onClick = { enrollment = true }) { Text(stringResource(R.string.enrollments)) }
            if ("students.manage" in capabilities || "applications.manage" in capabilities)
                TextButton(onClick = { invitations = true }) { Text(stringResource(R.string.invite_title)) }
            if ("applications.manage" in capabilities) TextButton(onClick={applicationReview=true}) { Text(stringResource(R.string.teacher_apps)) }
            if (session.actor.persona == Persona.Guardian) TextButton(onClick={application=true}) { Text(stringResource(R.string.teacher_apply)) }
            if ("access.manage" in capabilities || "audit.read" in capabilities) {
                Text(stringResource(R.string.settings_group_access),style=MaterialTheme.typography.titleLarge)
                if ("access.manage" in capabilities) TextButton(onClick = { staffAccess = true }) { Text(stringResource(R.string.staff_access)) }
                if ("audit.read" in capabilities) TextButton(onClick = { selectedAuditEntry = null; auditing = true }) {
                    Text(stringResource(R.string.audit_title))
                }
            }
        }
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
private fun AccountActions(model: IdentityViewModel, session: SchoolSession) {
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
