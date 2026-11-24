package de.madrasty.app.finance

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
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import de.madrasty.app.R
import de.madrasty.app.academics.academicPages
import de.madrasty.app.api.decodeData
import de.madrasty.app.identity.IdentityViewModel
import de.madrasty.app.school.Field
import de.madrasty.app.ui.isolate
import org.json.JSONArray
import org.json.JSONObject
import java.math.BigDecimal
import java.time.LocalDate
import java.time.YearMonth
import java.util.Currency

@Composable
internal fun FinancePage(label: Int, back: () -> Unit, content: @Composable () -> Unit) {
    BackHandler(onBack = back)
    Column(
        Modifier.fillMaxSize().safeDrawingPadding().imePadding().verticalScroll(rememberScrollState()).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        TextButton(onClick = back) { Text(stringResource(R.string.back)) }
        Text(stringResource(label), style = MaterialTheme.typography.headlineMedium)
        content()
    }
}

internal suspend fun IdentityViewModel.financeObject(path: String, input: JSONObject? = null): JSONObject =
    decodeData(schoolRequest(path, input, if (input == null) "GET" else "POST")) { it as JSONObject }.data

internal fun JSONObject.financeRows(key: String): List<JSONObject> =
    getJSONArray(key).let { rows -> List(rows.length(), rows::getJSONObject) }

internal fun financeDigits(value: String): String = buildString(value.length) {
    for (char in value) append(if (char in '٠'..'٩' || char in '۰'..'۹') '0' + char.digitToInt() else char)
}

internal fun validBillingMonth(value: String): Boolean =
    value.length == 7 && runCatching { YearMonth.parse(value).year > 0 }.getOrDefault(false)

internal fun validFinanceDate(value: String): Boolean =
    value.length == 10 && runCatching { LocalDate.parse(value).year > 0 }.getOrDefault(false)

private fun currencyScale(currency: String) = Currency.getInstance(currency).defaultFractionDigits.coerceAtLeast(0)

internal fun financePlainAmount(minor: Long, currency: String): String =
    BigDecimal.valueOf(minor, currencyScale(currency)).toPlainString()

internal fun financeMoney(minor: Long, currency: String) = isolate(financePlainAmount(minor, currency) + " " + currency)

internal fun financeMinor(value: String, currency: String, limit: Long = 1_000_000_000_000): Long? = runCatching {
    val normalized = financeDigits(value.trim()).replace(',', '.').replace('٫', '.')
    if (!normalized.matches(Regex("[0-9]{1,15}(\\.[0-9]{1,6})?"))) return null
    BigDecimal(normalized).movePointRight(currencyScale(currency)).longValueExact().takeIf { it in 1..limit }
}.getOrNull()

internal data class DraftFeeLine(val ar: String = "", val de: String = "", val amount: String = "")

internal fun feeLineInput(lines: List<DraftFeeLine>, currency: String?): JSONArray? {
    currency ?: return null
    val result = JSONArray()
    for (line in lines) {
        val ar = line.ar.trim()
        val de = line.de.trim()
        val amount = financeMinor(line.amount, currency)
        if (ar.isEmpty() || de.isEmpty() || amount == null) return null
        result.put(JSONObject().put("titleAr", ar).put("titleDe", de).put("amountMinor", amount))
    }
    return result
}

@Composable
internal fun FeeLineFields(lines: List<DraftFeeLine>, change: (List<DraftFeeLine>) -> Unit, currency: String?) {
    currency?.let { Text(isolate(it)) }
    lines.forEachIndexed { index, line ->
        fun edit(value: DraftFeeLine) = change(lines.mapIndexed { i, item -> if (i == index) value else item })
        Field(R.string.fee_title_ar, line.ar) { edit(line.copy(ar = it.take(120))) }
        Field(R.string.fee_title_de, line.de) { edit(line.copy(de = it.take(120))) }
        Field(R.string.finance_amount, line.amount) { edit(line.copy(amount = it.take(24))) }
        if (lines.size > 1) TextButton(onClick = { change(lines.filterIndexed { i, _ -> i != index }) }) {
            Text(stringResource(R.string.fee_remove_line))
        }
    }
    TextButton(onClick = { change(lines + DraftFeeLine()) }, enabled = lines.size < 20) {
        Text(stringResource(R.string.fee_add_line))
    }
}

@Composable
internal fun FeeLineSummary(lines: List<JSONObject>, currency: String) {
    val ar = LocalConfiguration.current.locales[0].language == "ar"
    for (line in lines) Text(
        isolate(line.getString(if (ar) "titleAr" else "titleDe")) + " · " + financeMoney(line.getLong("amountMinor"), currency)
    )
}

@Composable
internal fun PupilFinancePicker(
    model: IdentityViewModel, period: String, classId: String?, missing: Boolean, refresh: Int,
    content: @Composable (JSONObject) -> Unit,
) {
    var search by remember { mutableStateOf("") }
    var term by remember { mutableStateOf("") }
    Field(R.string.fee_pupil_search, search) { search = it.take(100) }
    Button(onClick = { term = search.trim() }) { Text(stringResource(R.string.fee_search)) }
    val filter = classId?.let { "&classId=$it" }.orEmpty()
    academicPages(model, "/finance/pupils?limit=25&period=$period&missing=$missing&q=${Uri.encode(term)}$filter", refresh) { rows ->
        rows.forEach { content(it) }
    }
}

internal fun pupilFinanceLabel(pupil: JSONObject): String =
    isolate(pupil.getString("studentName")) + " · " + isolate(pupil.getString("studentNumber"))
