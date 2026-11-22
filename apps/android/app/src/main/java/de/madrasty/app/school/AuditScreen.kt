package de.madrasty.app.school

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
import androidx.compose.material3.HorizontalDivider
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
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import de.madrasty.app.R
import de.madrasty.app.api.WirePage
import de.madrasty.app.api.decodeData
import de.madrasty.app.identity.IdentityViewModel
import de.madrasty.app.identity.loadAccountSurface
import de.madrasty.app.ui.AsyncState
import de.madrasty.app.ui.AsyncSurface
import de.madrasty.app.ui.CopyValue
import de.madrasty.app.ui.isolate
import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

data class AuditDestination(val kind:String,val id:String?,val linkId:String?,val yearId:String?)

data class AuditFilters(
    val from:String="",
    val to:String="",
    val area:String="",
    val action:String="",
    val actorId:String="",
) {
    fun query(locale:String, includeSelection:Boolean=true):String {
        val fields = mutableListOf("locale" to locale,"from" to from,"to" to to)
        if (includeSelection) fields += listOf("resourceKind" to area,"action" to action,"actorId" to actorId)
        return fields.filter { (_,value) -> value.isNotEmpty() }.joinToString("&") { (key,value) -> "$key=${Uri.encode(value)}" }
    }
}

private val areaLabels = mapOf(
    "access" to R.string.audit_area_access,"calendar" to R.string.audit_area_calendar,"assignments" to R.string.audit_area_assignments,
    "family" to R.string.audit_area_family,"imports" to R.string.audit_area_imports,"invitation" to R.string.audit_area_invitation,
    "timetable" to R.string.audit_area_timetable,"attendance" to R.string.audit_area_attendance,
    "academics" to R.string.audit_area_academics,"bank" to R.string.audit_area_bank,"finance" to R.string.audit_area_finance,
    "communications" to R.string.audit_area_communications,
)
private val categoryLabels = mapOf(
    "permissions" to R.string.audit_change_permissions,"revocation" to R.string.audit_change_revocation,"settings" to R.string.audit_change_settings,
    "creation" to R.string.audit_change_creation,"update" to R.string.audit_change_update,"approval" to R.string.audit_change_approval,
    "transfer" to R.string.audit_change_transfer,"withdrawal" to R.string.audit_change_withdrawal,"correction" to R.string.audit_change_correction,
    "reversal" to R.string.audit_change_reversal,"publication" to R.string.audit_change_publication,
)
private val operationLabels = mapOf(
    "school.student_created" to R.string.audit_student_created,"school.student_updated" to R.string.audit_student_updated,
    "school.guardian_created" to R.string.audit_guardian_created,"school.guardian_updated" to R.string.audit_guardian_updated,
    "family.link_pending" to R.string.audit_link_pending,"family.link_approved" to R.string.audit_link_approved,"family.link_revoked" to R.string.audit_link_revoked,
    "school.enrollment_placed" to R.string.audit_enrollment_placed,"school.staff_created" to R.string.audit_staff_created,
    "school.staff_updated" to R.string.audit_staff_updated,"school.year_created" to R.string.audit_year_created,
    "school.year_changed" to R.string.audit_year_changed,"school.day_changed" to R.string.audit_day_changed,
    "school.class_created" to R.string.audit_class_created,"school.class_changed" to R.string.audit_class_changed,
    "school.year_rolled_over" to R.string.audit_year_rolled_over,"school.import_uploaded" to R.string.audit_import_uploaded,
    "school.import_committed" to R.string.audit_import_committed,"invitation.issued" to R.string.audit_invite_issued,
    "invitation.batch_requested" to R.string.audit_invite_batch_requested,"school.assignment_created" to R.string.audit_assignment_created,
    "school.assignment_changed" to R.string.audit_assignment_changed,"school.substitute_assigned" to R.string.audit_substitute_assigned,
    "school.room_created" to R.string.audit_room_created,"school.room_changed" to R.string.audit_room_changed,
    "school.timetable_added" to R.string.audit_timetable_added,"school.timetable_changed" to R.string.audit_timetable_changed,
    "attendance.sheet_opened" to R.string.audit_sheet_opened,"attendance.sheet_approved" to R.string.audit_sheet_approved,
    "attendance.arrival_confirmed" to R.string.audit_arrival_confirmed,"attendance.corrected" to R.string.audit_attendance_corrected,
    "invoice.issued" to R.string.audit_invoice_issued,"payment.recorded" to R.string.audit_payment_recorded,
    "payment.reversed" to R.string.audit_payment_reversed,
)

@Composable
fun AuditScreen(
    model: IdentityViewModel,
    selected:String?,
    choose:(String?)->Unit,
    filters:AuditFilters,
    changeFilters:(AuditFilters)->Unit,
    open:(AuditDestination)->Unit,
    close:()->Unit,
) {
    val locale = if (LocalConfiguration.current.locales[0].language == "de") "de" else "ar"
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    var refresh by remember { mutableStateOf(0) }
    var draft by remember(filters) { mutableStateOf(filters) }
    var search by remember { mutableStateOf("") }
    var actorQuery by remember { mutableStateOf("") }
    val filterQuery = filters.query(locale,includeSelection=false)
    val catalog = scheduleRead("/school/audit/filters?$filterQuery&actorQuery=${Uri.encode(actorQuery)}",refresh,model::timetableObject)
    val timezone = (catalog as? AsyncState.Ready)?.content?.getString("timezone") ?: "UTC"

    BackHandler { if (selected == null) close() else choose(null) }
    DisposableEffect(lifecycle) {
        val observer=LifecycleEventObserver { _,event -> if (event == Lifecycle.Event.ON_RESUME) refresh++ }
        lifecycle.addObserver(observer)
        onDispose { lifecycle.removeObserver(observer) }
    }
    Column(Modifier.fillMaxSize().safeDrawingPadding().imePadding().verticalScroll(rememberScrollState()).padding(20.dp),
        verticalArrangement=Arrangement.spacedBy(8.dp)) {
        TextButton(onClick={if (selected == null) close() else choose(null)}) { Text(stringResource(R.string.back)) }
        Text(stringResource(R.string.audit_title),style=MaterialTheme.typography.headlineMedium)
        if (selected != null) {
            val record = scheduleRead("/school/audit/$selected?locale=$locale",refresh,model::timetableObject)
            AsyncSurface(record) { row ->
                Text(auditLabel(row),style=MaterialTheme.typography.titleLarge)
                Text(stringResource(R.string.audit_actor))
                Text(isolate(row.getString("actorDisplay")))
                Text(stringResource(R.string.audit_timestamp))
                Text(isolate(occurredAt(row,locale,timezone)))
                Text(stringResource(R.string.audit_change))
                Text(stringResource(categoryLabels.getValue(row.getString("changeCategory"))))
                CopyValue(stringResource(R.string.audit_request),row.getString("requestId"))
                val destination=row.optJSONObject("permittedResourceLink")
                if (destination != null) {
                    TextButton(onClick={
                        open(AuditDestination(destination.getString("kind"),destination.present("id"),destination.present("linkId"),destination.present("yearId")))
                    }) { Text(stringResource(R.string.audit_open)) }
                }
            }
        } else {
            Field(R.string.audit_from,draft.from) { draft = draft.copy(from=it.take(10)) }
            Field(R.string.audit_to,draft.to) { draft = draft.copy(to=it.take(10)) }
            AsyncSurface(catalog) { options ->
                val actions=options.getJSONArray("actions").tableRows()
                Text(stringResource(R.string.audit_area))
                FilterChip(draft.area.isEmpty(),onClick={draft=draft.copy(area="",action="")},label={Text(stringResource(R.string.directory_all))})
                actions.map { it.getString("resourceKind") }.distinct().forEach { area ->
                    FilterChip(draft.area==area,onClick={draft=draft.copy(area=area,action="")},
                        label={Text(stringResource(areaLabels.getValue(area)))})
                }
                Text(stringResource(R.string.audit_action))
                FilterChip(draft.action.isEmpty(),onClick={draft=draft.copy(action="")},label={Text(stringResource(R.string.directory_all))})
                actions.filter { draft.area.isEmpty() || it.getString("resourceKind")==draft.area }.forEach { option ->
                    val action=option.getString("action")
                    FilterChip(draft.action==action,onClick={draft=draft.copy(action=action)},label={Text(auditLabel(option))})
                }
                Field(R.string.audit_search_actor,search) { search=it.take(100) }
                TextButton(onClick={actorQuery=search.trim()}) { Text(stringResource(R.string.staff_search)) }
                Text(stringResource(R.string.audit_actor))
                FilterChip(draft.actorId.isEmpty(),onClick={draft=draft.copy(actorId="")},label={Text(stringResource(R.string.directory_all))})
                options.getJSONArray("actors").tableRows().forEach { row ->
                    val id=row.getString("id")
                    FilterChip(draft.actorId==id,onClick={draft=draft.copy(actorId=id)},label={Text(isolate(row.getString("displayName")))})
                }
            }
            val valid=(draft.from.isEmpty()||timetableDate(draft.from))&&(draft.to.isEmpty()||timetableDate(draft.to))
                &&(draft.from.isEmpty()||draft.to.isEmpty()||draft.from<=draft.to)
            TextButton(enabled=valid,onClick={changeFilters(draft)}) { Text(stringResource(R.string.audit_apply)) }
            TextButton(onClick={draft=AuditFilters();search="";actorQuery="";changeFilters(draft)}) { Text(stringResource(R.string.clear_filter)) }
            AuditRows(model,filters,refresh,locale,timezone,choose)
        }
    }
}

@Composable
private fun AuditRows(model:IdentityViewModel, filters:AuditFilters,refresh:Int,locale:String,timezone:String,open:(String)->Unit) {
    val path="/school/audit?${filters.query(locale)}&limit=25"
    var retry by remember(path) { mutableStateOf(0) }
    var state by remember(path,refresh) { mutableStateOf<AsyncState<WirePage<List<JSONObject>>>>(AsyncState.InitialLoading()) }
    LaunchedEffect(path,refresh,retry) {
        state=loadAccountSurface({retry++}) { model.auditPage(path) }
    }
    AsyncSurface(state) { page ->
        if (page.data.isEmpty()) Text(stringResource(R.string.audit_empty))
        page.data.forEach { row ->
            HorizontalDivider()
            TextButton(onClick={open(row.getString("id"))}) {
                Column {
                    Text(auditLabel(row))
                    Text(isolate(row.getString("actorDisplay")))
                    Text(isolate(occurredAt(row,locale,timezone)))
                }
            }
        }
        page.nextCursor?.let { cursor ->
            Submit(true,R.string.staff_more,success=null) {
                val next=model.auditPage("$path&cursor=${Uri.encode(cursor)}")
                if ((state as? AsyncState.Ready)?.content == page) {
                    state=AsyncState.Ready(WirePage(page.data + next.data,next.nextCursor))
                }
            }
        }
    }
}

private suspend fun IdentityViewModel.auditPage(path:String)=decodeData(schoolRequest(path)) { (it as JSONArray).tableRows() }

@Composable
private fun auditLabel(row:JSONObject):String {
    val literal=operationLabels[row.getString("action")]
    if (literal != null) return stringResource(literal)
    val area=stringResource(areaLabels.getValue(row.getString("resourceKind")))
    val change=stringResource(categoryLabels.getValue(row.getString("changeCategory")))
    return "$area · $change"
}
private fun occurredAt(row:JSONObject,locale:String,timezone:String):String =
    DateTimeFormatter.ofPattern("d MMM yyyy, HH:mm:ss z",Locale.forLanguageTag(locale))
        .withZone(ZoneId.of(timezone)).format(Instant.parse(row.getString("occurredAt")))
private fun JSONObject.present(name:String):String? = if(isNull(name))null else getString(name)
