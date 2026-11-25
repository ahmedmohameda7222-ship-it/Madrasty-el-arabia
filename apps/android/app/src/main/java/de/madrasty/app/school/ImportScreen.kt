package de.madrasty.app.school

import android.content.Intent
import android.net.Uri
import android.provider.OpenableColumns
import android.util.Base64
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Checkbox
import androidx.compose.foundation.layout.Row
import androidx.compose.material3.HorizontalDivider
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import de.madrasty.app.BuildConfig
import de.madrasty.app.R
import de.madrasty.app.api.decodeData
import de.madrasty.app.identity.IdentityViewModel
import de.madrasty.app.identity.loadAccountSurface
import de.madrasty.app.ui.AsyncState
import de.madrasty.app.ui.AsyncSurface
import de.madrasty.app.ui.isolate
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream

private const val maxUpload = 2_500_000
private const val base = "/school/family-imports"
private const val xlsx = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
private val fields = mapOf(
    "familyKey" to R.string.fm_import_key, "familyName" to R.string.fm_import_name,
    "childKey" to R.string.import_child_key, "studentNumber" to R.string.student_number,
    "childName" to R.string.import_child_name, "guardianKey" to R.string.import_guardian_key,
    "guardianName" to R.string.import_guardian_name, "email" to R.string.guardian_email,
    "communicationLocale" to R.string.guardian_locale, "payerCandidate" to R.string.import_candidate,
)
private val optional = setOf("studentNumber", "payerCandidate","familyKey","familyName")
private val dispositions = mapOf("new" to R.string.import_new, "existing" to R.string.import_existing,
    "duplicate" to R.string.import_duplicate, "conflict" to R.string.import_conflict, "revoked" to R.string.import_revoked,
    "skipped" to R.string.import_skipped)
@Composable
fun ImportScreen(model: IdentityViewModel, invitations: (String) -> Unit, initialJob: String? = null, close: () -> Unit) {
    val context = LocalContext.current
    val requests = remember { mutableMapOf<String, Pair<String, String>>() }
    var file by remember { mutableStateOf<Uri?>(null) }
    var name by remember { mutableStateOf("") }
    var inspection by remember { mutableStateOf<JSONObject?>(null) }
    var mapping by remember { mutableStateOf(emptyMap<String, Int>()) }
    var preview by remember { mutableStateOf<JSONObject?>(null) }
    var receipt by remember { mutableStateOf<JSONObject?>(null) }
    var maxRows by remember { mutableStateOf(30) }
    var restoreAttempt by remember(initialJob) { mutableStateOf(0) }
    var restored by remember(initialJob) { mutableStateOf<AsyncState<Unit>>(AsyncState.InitialLoading()) }
    var stage by remember { mutableStateOf(1) }
    var history by remember { mutableStateOf(emptyList<JSONObject>()) }
    var filter by remember { mutableStateOf("all") }
    var confirmed by remember { mutableStateOf(false) }
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        file = uri
        name = uri?.let { value ->
            context.contentResolver.query(value, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
                if (cursor.moveToFirst()) cursor.getString(0) else ""
            }
        }.orEmpty()
    }

    suspend fun inspect(id: String, option: String = "") {
        val selected = model.objectAt("$base/$id$option")
        val columns = selected.getJSONArray("columns").objects()
        val saved = selected.optJSONObject("savedColumnMap")
        mapping = fields.keys.mapNotNull { key ->
            if (saved != null) saved.optInt(key).takeIf { it > 0 }?.let { key to it }
            else columns.filter { it.getString("label").equals(key, ignoreCase = true) }.singleOrNull()
                ?.let { key to it.getInt("index") }
        }.toMap()
        inspection = selected
        preview = null
    }

    suspend fun resume(id:String){
        val status=model.objectAt("$base/$id/status")
        if(status.getString("state")=="committed"){receipt=model.objectAt("$base/$id/receipt");stage=4;return}
        inspect(id);stage=2
        if(status.getString("state")=="review"){preview=model.objectAt("$base/$id/preview");stage=3}
    }
    LaunchedEffect(Unit){history=try{model.records(base)}catch(e:kotlinx.coroutines.CancellationException){throw e}catch(_:Exception){emptyList()}}
    LaunchedEffect(initialJob,restoreAttempt) {
        if (initialJob != null) {
            restored = loadAccountSurface({ restoreAttempt++ }) {
                resume(initialJob)
            }
        }
    }
    BackHandler(onBack = close)
    Column(
        Modifier.fillMaxSize().safeDrawingPadding().imePadding().verticalScroll(rememberScrollState()).padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        TextButton(onClick = close) { Text(stringResource(R.string.back)) }
        Text(stringResource(R.string.import_families), Modifier.semantics { heading() }, style = MaterialTheme.typography.headlineMedium)
        if (initialJob != null) AsyncSurface(restored) {}
        Text(fm("Schritt ","الخطوة ")+stage+"/4",style=MaterialTheme.typography.labelLarge)
        if(stage==1){
        if(history.isNotEmpty())Text(fm("Frühere Importe","الاستيرادات السابقة"),style=MaterialTheme.typography.titleMedium)
        history.forEach{job->Text(isolate(job.getString("fileName")));Submit(true,if(job.getString("state")=="committed")R.string.import_receipt else R.string.import_preview,success=null){resume(job.getString("id"))}}
        Text(stringResource(R.string.import_instructions))
        listOf("csv" to R.string.import_csv, "xlsx" to R.string.import_xlsx).forEach { (extension, label) ->
            TextButton(onClick = {
                context.startActivity(Intent(Intent.ACTION_VIEW,
                    Uri.parse("${BuildConfig.API_ORIGIN}/templates/${if(extension=="csv")"family-import-groups.csv" else "family-import.xlsx"}")))
            }) { Text(stringResource(label)) }
        }
        TextButton(onClick = { picker.launch(arrayOf("text/csv", "text/plain", xlsx)) }) {
            Text(stringResource(R.string.import_select))
        }
        if (name.isNotEmpty()) Text(isolate(name))
        val uri = file
        if (uri != null) Submit(name.endsWith(".csv", true) || name.endsWith(".xlsx", true), R.string.import_upload) {
            val encoded = withContext(Dispatchers.IO) {
                val result = ByteArrayOutputStream()
                val buffer = ByteArray(16_384)
                context.contentResolver.openInputStream(uri)?.use { source ->
                    while (true) {
                        val amount = source.read(buffer)
                        if (amount < 0) break
                        if (result.size() + amount > maxUpload) throw IllegalArgumentException("file too large")
                        result.write(buffer, 0, amount)
                    }
                } ?: throw IllegalArgumentException("file unavailable")
                Base64.encodeToString(result.toByteArray(), Base64.NO_WRAP)
            }
            val data = model.schoolCommand(requests, base, "POST", JSONObject().put("fileName", name)
                .put("mime", if (name.endsWith(".csv", true)) "text/csv" else xlsx).put("bytesBase64", encoded))
            receipt = null
            inspect(data.getString("id"));stage=2
        }
        }

        val current = inspection
        if (stage==2 && current != null && receipt == null) {
            val id = current.getString("id")
            HorizontalDivider()
            Text(stringResource(R.string.import_columns), style = MaterialTheme.typography.titleLarge)
            val sheets = current.getJSONArray("worksheets")
            if (sheets.length() > 0) Text(stringResource(R.string.import_worksheet))
            for (index in 0 until sheets.length()) {
                val label = sheets.getString(index)
                Submit(true, R.string.import_worksheet) { inspect(id, "?worksheet=${Uri.encode(label)}") }
                Text(if (label == current.optString("worksheet")) "✓ $label" else label)
            }
            if (!current.isNull("delimiter")) {
                Text(stringResource(R.string.import_delimiter))
                listOf(",", ";", "\t").forEach { separator ->
                    Text(if (separator == current.getString("delimiter")) "✓ ${separator.replace("\t", "TAB")}" else separator.replace("\t", "TAB"))
                    Submit(true, R.string.import_delimiter) { inspect(id, "?delimiter=${Uri.encode(separator)}") }
                }
            }
            val columns = current.getJSONArray("columns").objects()
            fields.forEach { (field, label) ->
                FamilyChoice(stringResource(label),mapping[field]?.toString()?:"",listOf("" to stringResource(R.string.import_unused))+columns.map{it.getInt("index").toString() to (it.getInt("index").toString()+" · "+isolate(it.getString("label")))}){value->
                    mapping=if(value.isBlank())mapping-field else mapping+(field to value.toInt())
                    preview=null
                }
            }
            val canMap = fields.keys.all { it in optional || it in mapping } && mapping.values.toSet().size == mapping.size
            Submit(canMap, R.string.import_preview) {
                val input = JSONObject().put("columnMap", JSONObject(mapping)).put("revision", current.getInt("revision"))
                listOf("worksheet", "delimiter").forEach { field ->
                    if (!current.isNull(field)) input.put(field, current.getString(field))
                }
                val result = model.schoolCommand(requests, "$base/$id/mapping", "PUT", input)
                preview = result
                inspection = JSONObject(current.toString()).put("revision", result.getInt("revision"))
                maxRows = 30;stage=3;confirmed=false
            }
        }

        val review = preview
        if (stage==3 && review != null && receipt == null) {
            val id = review.getString("id")
            HorizontalDivider()
            Text(stringResource(R.string.import_review), style = MaterialTheme.typography.titleLarge)
            val counts = review.getJSONObject("counts")
            dispositions.forEach { (state, label) -> Text("${stringResource(label)} · ${counts.getInt(state)}") }
            FamilyChoice(fm("Status filtern","تصفية الحالة"),filter,listOf("all" to fm("Alle","الكل"))+dispositions.map{(v,label)->v to stringResource(label)}){filter=it;maxRows=30}
            val records = review.getJSONArray("rows").objects().filter{filter=="all"||it.getString("disposition")==filter}
            records.take(maxRows).forEach { row ->
                val number = row.getInt("rowNo")
                key(number) {
                    RowDecision(model, row) { decision ->
                        val result = model.schoolCommand(requests, "$base/$id/decisions", "PATCH",
                            JSONObject().put("revision", review.getInt("revision")).put("rows", JSONArray(listOf(decision))))
                        preview = result;confirmed=false
                        inspection = inspection?.let { JSONObject(it.toString()).put("revision", result.getInt("revision")) }
                    }
                }
            }
            if (records.size > maxRows) TextButton(onClick = { maxRows += 30 }) { Text(stringResource(R.string.import_more)) }
            Row{Checkbox(checked=confirmed,onCheckedChange={confirmed=it});Text(fm("Ich habe die Verknüpfungen geprüft.","راجعت الروابط والصلاحيات."))}
            TextButton(onClick={stage=2;confirmed=false}){Text(stringResource(R.string.import_columns))}
            Submit(confirmed && counts.getInt("conflict") + counts.getInt("revoked") == 0 &&
                counts.getInt("new") + counts.getInt("existing") > 0, R.string.import_commit) {
                receipt = model.schoolCommand(requests, "$base/$id/commit", "POST",
                    JSONObject().put("reviewedRevision", review.getInt("revision")));stage=4
            }
        }

        if(stage==4)receipt?.let {
            HorizontalDivider()
            Text(stringResource(R.string.import_receipt), style = MaterialTheme.typography.titleLarge)
            Text(stringResource(R.string.import_rows, it.getInt("rowsCommitted")))
            Text(stringResource(R.string.import_links, it.getInt("linksCreated")))
            Text(stringResource(R.string.import_eligible, it.getInt("eligibleGuardians")))
            Text(stringResource(R.string.import_invite_later))
            if (it.getInt("eligibleGuardians") > 0) TextButton(onClick = { invitations(it.getString("id")) }) {
                Text(stringResource(R.string.invite_batch))
            }
        }
        if(stage>1)Submit(true,R.string.import_select,success=null){history=model.records(base);stage=1;inspection=null;preview=null;receipt=null;confirmed=false;file=null;name=""}
    }
}

@Composable
private fun RowDecision(model: IdentityViewModel, row: JSONObject, commit: suspend (JSONObject) -> Unit) {
    var open by remember { mutableStateOf(false) }
    var decision by remember { mutableStateOf("approve") }
    var payer by remember { mutableStateOf<Boolean?>(null) }
    var query by remember { mutableStateOf("") }
    var records by remember { mutableStateOf(emptyList<JSONObject>()) }
    var chosen by remember { mutableStateOf("") }
    val id = row.getInt("rowNo")
    val status = row.getString("disposition")
    val label = dispositions[status] ?: R.string.import_conflict
    val show = row.optJSONObject("display")
    val matched = decision == "match_guardian" || decision == "match_student"

    TextButton(onClick = { open = !open }) {
        Text("${stringResource(R.string.import_row, id)} · ${stringResource(label)}")
    }
    show?.let { Text("${isolate(it.getString("childName"))} · ${isolate(it.getString("guardianName"))}") }
    val reason = when (row.optString("reason")) {
        "identifier_needs_text" -> R.string.import_text_key
        "formula" -> R.string.import_formula
        "student_number_unknown" -> R.string.import_unknown_number
        "source_key_mismatch" -> R.string.import_key_conflict
        "identity_fields_differ" -> R.string.import_identity_diff
        "conflicting_rows" -> R.string.import_row_conflict
        "guardian_email_collision" -> R.string.import_email_collision
        "inactive_student" -> R.string.import_inactive
        "payer_conflict" -> R.string.import_payer_conflict
        "payer_missing" -> R.string.import_payer_missing
        "link_revoked" -> R.string.import_restore
        "invalid_value", "decision_required" -> R.string.import_invalid
        else -> null
    }
    reason?.let { code ->
        val field = fields[row.optString("column")]
        val description = stringResource(code)
        Text(if (field == null) description else "$description · ${stringResource(field)}")
    }
    if (!open) return
    val decisions = buildMap {
        put("approve", R.string.import_approve)
        put("skip", R.string.import_skip)
        if (status == "revoked") put("restore", R.string.import_restore)
        if (show != null) {
            put("match_guardian", R.string.import_match_guardian)
            put("match_student", R.string.import_match_student)
        }
    }
    decisions.forEach { (code, title) ->
        FilterChip(decision == code, {
            decision = code; chosen = ""; records = emptyList()
        }, label = { Text(stringResource(title)) })
    }
    if (matched) {
        Field(R.string.family_query, query) { query = it }
        Submit(true, R.string.search_family) {
            val mode = if (decision == "match_guardian") "guardians" else "students"
            records = model.records("/school/$mode?query=${Uri.encode(query.trim())}")
        }
        records.forEach { item ->
            val key = item.getString("id")
            FilterChip(chosen == key, { chosen = key }, label = { Text(isolate(item.getString("displayName"))) })
        }
    }
    if (show != null) {
        Text(stringResource(R.string.import_candidate))
        listOf(null to R.string.import_file_value, true to R.string.import_yes, false to R.string.import_no)
            .forEach { (candidate, title) -> FilterChip(payer == candidate, { payer = candidate },
                label = { Text(stringResource(title)) }) }
    }
    Submit(!matched || chosen.isNotEmpty(), R.string.import_save_decision) {
        val edit = JSONObject().put("rowNo", id).put("decision", decision)
        if (matched) edit.put("matchedId", chosen)
        payer?.let { edit.put("payerCandidate", it) }
        commit(edit)
        open = false
    }
}

private suspend fun IdentityViewModel.objectAt(path: String) =
    decodeData(schoolRequest(path)) { it as JSONObject }.data
private fun JSONArray.objects() = List(length(), ::getJSONObject)
