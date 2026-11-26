package de.madrasty.app.finance

import android.net.Uri
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.res.stringResource
import de.madrasty.app.R
import de.madrasty.app.academics.academicPages
import de.madrasty.app.academics.academicRead
import de.madrasty.app.identity.IdentityViewModel
import de.madrasty.app.school.Field
import de.madrasty.app.school.Submit
import de.madrasty.app.school.schoolCommand
import de.madrasty.app.ui.AsyncSurface
import de.madrasty.app.ui.isolate
import org.json.JSONObject
import org.json.JSONArray
import java.util.UUID

@Composable
internal fun RecordPayment(
    model: IdentityViewModel, invoiceId: String?, openReceipt: (String) -> Unit, openQueue: () -> Unit, close: () -> Unit,
) {
    FinancePage(R.string.receipt_record, close) {
        TextButton(onClick = openQueue) { Text(stringResource(R.string.receipt_queue)) }
        val options = academicRead("/finance/receipt-options", 0) { model.financeObject(it) }
        AsyncSurface(options) { setup ->
            if (invoiceId == null) PaymentForm(model, setup, null, openReceipt)
            else {
                val invoice = academicRead("/finance/invoices/$invoiceId", 0) { model.financeObject(it) }
                AsyncSurface(invoice) { selected -> PaymentForm(model, setup, selected, openReceipt) }
            }
        }
    }
}

@Composable
private fun PaymentForm(model: IdentityViewModel, setup: JSONObject, initial: JSONObject?, openReceipt: (String) -> Unit) {
    val currency=setup.getString("currency")
    val today=setup.getString("schoolDate")
    val attempts=remember { mutableMapOf<String,Pair<String,String>>() }
    var method by remember { mutableStateOf(if(setup.getBoolean("cashEnabled")) "cash" else "bank") }
    var date by remember(today) { mutableStateOf(today) }
    var reference by remember { mutableStateOf("") }
    var cashReference by remember { mutableStateOf("CASH-"+UUID.randomUUID()) }
    var rows by remember(initial) { mutableStateOf(initial?.takeIf{it.getLong("balanceMinor")>0L}?.let{listOf(it to financePlainAmount(it.getLong("balanceMinor"),currency))}?:emptyList()) }
    var amount by remember(initial) { mutableStateOf(initial?.takeIf{it.getLong("balanceMinor")>0L}?.let{financePlainAmount(it.getLong("balanceMinor"),currency)}?:"") }
    var amountEdited by remember(initial) { mutableStateOf(false) }
    var verified by remember { mutableStateOf(false) }
    var choose by remember { mutableStateOf(false) }
    var review by remember { mutableStateOf<JSONObject?>(null) }
    var result by remember { mutableStateOf<JSONObject?>(null) }
    val prepared=review
    result?.let { receipt ->
        Text(isolate(receipt.getString("receiptNumber"))+" · "+stringResource(receiptStateLabel(receipt.getString("state"))))
        TextButton(onClick={openReceipt(receipt.getString("id"))}) {Text(stringResource(R.string.receipt_open))}
    }
    if(prepared!=null){
        Text(stringResource(receiptMethodLabel(method))+" · "+isolate(date))
        FinanceBalanceCard(stringResource(R.string.receipt_total),financeMoney(prepared.getLong("amountMinor"),currency))
        for((invoice,value) in rows){Text(receiptInvoiceLabel(invoice));Text(isolate(value))}
        TextButton(onClick={review=null}) {Text(stringResource(R.string.fee_edit))}
        Submit(true,R.string.receipt_confirm,success=null){
            result=model.schoolCommand(attempts,"/finance/receipts","POST",prepared)
            review=null;reference="";cashReference="CASH-"+UUID.randomUUID();amount="";amountEdited=false;verified=false;rows=emptyList()
        }
        return
    }
    Field(R.string.receipt_total,amount){amountEdited=true;amount=it.take(24)}
    if(setup.getBoolean("cashEnabled")){
        FlowRow {
            FilterChip(method=="cash",{method="cash"},label={Text(stringResource(R.string.receipt_cash))})
            FilterChip(method=="bank",{method="bank"},label={Text(stringResource(R.string.receipt_bank))})
        }
    }else Text(stringResource(R.string.receipt_bank))
    if(method=="bank")Field(R.string.receipt_reference,reference){reference=it.take(160)}
    Field(R.string.receipt_date,date){date=financeDigits(it).take(10)}
    for((index,row) in rows.withIndex()){
        Text(receiptInvoiceLabel(row.first))
        Field(R.string.receipt_allocation_amount,row.second){value->rows=rows.mapIndexed{i,r->if(i==index)r.first to value.take(24) else r}}
        TextButton(onClick={rows=rows.filterIndexed{i,_->i!=index}}){Text(stringResource(R.string.fee_remove_line))}
    }
    TextButton(onClick={choose=!choose}){Text(stringResource(R.string.receipt_optional_invoice))}
    if(choose)ReceiptInvoicePicker(model,currency,rows.map{it.first.getString("id")}.toSet()){ invoice->
        rows=rows+(invoice to financePlainAmount(invoice.getLong("balanceMinor"),currency))
        if(!amountEdited) amount=financePlainAmount(rows.sumOf{financeMinor(it.second,currency,it.first.getLong("balanceMinor"))?:0L},currency)
        choose=false
    }
    FilterChip(verified,{verified=!verified},label={Text(stringResource(R.string.receipt_confirmed_external))})
    val allocations=rows.map{(invoice,value)->financeMinor(value,currency,invoice.getLong("balanceMinor"))}
    val minor=financeMinor(amount,currency,100_000_000_000_000)
    val ref=if(method=="cash")cashReference else reference.trim()
    val ready=minor!=null&&verified&&ref.isNotEmpty()&&ref.none{it.isISOControl()||Character.getType(it)==Character.FORMAT.toInt()}&&validFinanceDate(date)&&date>="1900-01-01"&&date<=today&&allocations.all{it!=null}&&allocations.filterNotNull().sum()<=minor
    Button(enabled=ready,onClick={
        val input=JSONObject().put("externalReceiptRef",ref).put("receivedDate",date).put("method",method).put("currency",currency).put("amountMinor",minor).put("verified",true)
        if(rows.isNotEmpty())input.put("allocations",JSONArray().apply{rows.forEachIndexed{i,row->put(JSONObject().put("invoiceId",row.first.getString("id")).put("invoiceRevision",row.first.getInt("revision")).put("amountMinor",allocations[i]))}})
        review=input;result=null;choose=false
    }){Text(stringResource(R.string.fee_preview))}
}

@Composable
internal fun ReceiptInvoicePicker(
    model: IdentityViewModel, currency: String, excluded: Set<String> = emptySet(), pick: (JSONObject) -> Unit,
) {
    var month by remember { mutableStateOf("") }
    var value by remember { mutableStateOf("") }
    var search by remember { mutableStateOf("") }
    var partial by remember { mutableStateOf(false) }
    Field(R.string.receipt_invoice_search, value) { value = it.take(100) }
    Field(R.string.fee_month, month) { month = financeDigits(it).take(7) }
    Button(onClick = { search = value.trim() }) { Text(stringResource(R.string.fee_search)) }
    FilterChip(!partial, { partial = false }, label = { Text(stringResource(R.string.fee_unpaid)) })
    FilterChip(partial, { partial = true }, label = { Text(stringResource(R.string.fee_partial)) })
    val byMonth = if (validBillingMonth(month)) "&period=$month" else ""
    val state = if (partial) "partial" else "unpaid"
    academicPages(model, "/finance/invoices?limit=20&q=${Uri.encode(search)}&state=$state$byMonth", model.attendanceNetworkRevision) { rows ->
        for (row in rows.filter { it.getString("currency") == currency && it.getLong("balanceMinor") > 0L && it.getString("id") !in excluded }) {
            HorizontalDivider()
            Text(receiptInvoiceLabel(row))
            Text(financeMoney(row.getLong("balanceMinor"), currency))
            TextButton(onClick = { pick(row) }) { Text(stringResource(R.string.receipt_choose_invoice)) }
        }
    }
}

internal fun receiptInvoiceLabel(row: JSONObject): String =
    pupilFinanceLabel(row) + " · " + isolate(row.getString("invoiceNumber")) + " · " + isolate(row.getString("period"))

internal fun receiptMethodLabel(method: String) = if (method == "cash") R.string.receipt_cash else R.string.receipt_bank
internal fun receiptStateLabel(state: String) = when (state) {
    "needs_matching" -> R.string.receipt_needs_matching
    "voided" -> R.string.receipt_voided
    else -> R.string.receipt_allocated_status
}
