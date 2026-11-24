package de.madrasty.app.finance

import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.res.stringResource
import de.madrasty.app.R
import de.madrasty.app.academics.academicPages
import de.madrasty.app.academics.academicRead
import de.madrasty.app.academics.string
import de.madrasty.app.identity.IdentityViewModel
import de.madrasty.app.school.Field
import de.madrasty.app.school.Submit
import de.madrasty.app.school.schoolCommand
import de.madrasty.app.ui.AsyncSurface
import de.madrasty.app.ui.isolate
import org.json.JSONObject

@Composable
internal fun FeeSettings(model: IdentityViewModel, initialStudent: String?, close: () -> Unit, bank: (() -> Unit)? = null) {
    var payerTab by remember(initialStudent) { mutableStateOf(initialStudent != null) }
    var student by remember(initialStudent) { mutableStateOf(initialStudent) }
    var revision by remember { mutableIntStateOf(0) }
    val context = academicRead("/finance/billing-options", revision) { model.financeObject(it) }
    FinancePage(R.string.fee_settings, close) {
        if(bank!=null)TextButton(onClick=bank){Text(stringResource(R.string.finance_bank))}
        AutomaticBillingPanel(model)
        FilterChip(!payerTab, { payerTab = false }, label = { Text(stringResource(R.string.fee_tariffs)) })
        FilterChip(payerTab, { payerTab = true }, label = { Text(stringResource(R.string.fee_payer)) })
        AsyncSurface(context) { options ->
            val month = options.getString("schoolMonth")
            if (!payerTab) TariffEditor(model, options)
            else {
                val selected = student
                if (selected == null) {
                    PupilFinancePicker(model, month, null, false, revision) { pupil ->
                        TextButton(onClick = { student = pupil.getString("id") }) { Text(pupilFinanceLabel(pupil)) }
                    }
                } else {
                    TextButton(onClick = { student = null }) { Text(stringResource(R.string.fee_choose_pupil)) }
                    val profile = academicRead("/finance/children/$selected/payer", revision) { model.financeObject(it) }
                    AsyncSurface(profile) { value ->
                        key(selected, value.getInt("revision")) { PayerEditor(model, value, month) { revision++ } }
                    }
                }
            }
        }
    }
}

@Composable
private fun TariffEditor(model: IdentityViewModel, options: JSONObject) {
    val firstMonth = options.getString("schoolMonth")
    val currency = options.string("currency")
    var month by remember(firstMonth) { mutableStateOf(firstMonth) }
    var day by remember { mutableStateOf(options.string("dueDay") ?: "1") }
    var amount by remember { mutableStateOf("") }
    var preview by remember { mutableStateOf<JSONObject?>(null) }
    var refresh by remember { mutableIntStateOf(0) }
    val attempts = remember { mutableMapOf<String, Pair<String, String>>() }
    val prepared = preview
    if (prepared == null) {
        Field(R.string.fee_effective, month) { month = financeDigits(it).take(7) }
        Field(R.string.fee_due_day, day) { day = financeDigits(it).take(2) }
        Field(R.string.fee_monthly,amount){amount=it.take(24)}
        val due = day.toIntOrNull()
        val items = feeLineInput(listOf(DraftFeeLine("اشتراك شهري","Monatsbeitrag",amount)), currency)
        Button(
            enabled = validBillingMonth(month) && month >= firstMonth && due != null && due in 1..31 && items != null,
            onClick = { preview = JSONObject().put("effectiveFromMonth", month).put("dueDay", due).put("lines", items) },
        ) { Text(stringResource(R.string.fee_preview)) }
    } else if (currency != null) {
        Text(stringResource(R.string.fee_effective) + " · " + isolate(prepared.getString("effectiveFromMonth")))
        Text(stringResource(R.string.fee_due_day) + " · " + isolate(prepared.getString("dueDay")))
        FeeLineSummary(prepared.financeRows("lines"), currency)
        TextButton(onClick = { preview = null }) { Text(stringResource(R.string.fee_edit)) }
        Submit(true) {
            model.schoolCommand(attempts, "/finance/tariffs", "POST", prepared)
            preview = null
            amount = ""
            refresh++
        }
    }
    if (refresh > 0) Text(stringResource(R.string.saved))
    HorizontalDivider()
    academicPages(model, "/finance/tariffs?limit=20", refresh) { rows ->
        for (tariff in rows) {
            Text(isolate(tariff.getString("effectiveFromMonth")), style = MaterialTheme.typography.titleMedium)
            Text(stringResource(R.string.fee_due_day) + " · " + isolate(tariff.getString("dueDay")))
            FeeLineSummary(tariff.financeRows("lines"), tariff.getString("currency"))
        }
    }
}

@Composable
private fun PayerEditor(model: IdentityViewModel, profile: JSONObject, firstMonth: String, changed: () -> Unit) {
    val choices = profile.financeRows("choices")
    var guardian by remember { mutableStateOf(choices.firstOrNull()?.getString("id")) }
    var month by remember(firstMonth) { mutableStateOf(firstMonth) }
    var review by remember { mutableStateOf(false) }
    val attempts = remember { mutableMapOf<String, Pair<String, String>>() }
    Text(pupilFinanceLabel(profile), style = MaterialTheme.typography.titleLarge)
    if (choices.isEmpty()) Text(stringResource(R.string.fee_payer_missing))
    else if (!review) {
        for (choice in choices) {
            val id = choice.getString("id")
            val note = if (choice.getBoolean("activeAccount")) "" else " · " + stringResource(R.string.fee_payer_inactive)
            FilterChip(guardian == id, { guardian = id }, label = { Text(isolate(choice.getString("displayName")) + note) })
        }
        Field(R.string.fee_effective, month) { month = financeDigits(it).take(7) }
        Button(onClick = { review = true }, enabled = guardian != null && validBillingMonth(month) && month >= firstMonth) {
            Text(stringResource(R.string.fee_preview))
        }
    } else {
        Text(isolate(choices.first { it.getString("id") == guardian }.getString("displayName")) + " · " + isolate(month))
        TextButton(onClick = { review = false }) { Text(stringResource(R.string.fee_edit)) }
        Submit(true) {
            val input = JSONObject().put("guardianId", guardian).put("effectiveFromMonth", month).put("revision", profile.getInt("revision"))
            model.schoolCommand(attempts, "/finance/children/${profile.getString("studentId")}/payer", "PUT", input)
            changed()
        }
    }
    HorizontalDivider()
    for (item in profile.financeRows("designations")) {
        Text(isolate(item.getString("effectiveFromMonth")) + " · " + isolate(item.getString("guardianName")))
    }
}
