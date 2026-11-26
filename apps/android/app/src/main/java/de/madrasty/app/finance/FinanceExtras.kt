package de.madrasty.app.finance

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.material3.TextButton
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Text
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.*
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import de.madrasty.app.R
import de.madrasty.app.academics.academicRead
import de.madrasty.app.identity.IdentityViewModel
import de.madrasty.app.school.Field
import de.madrasty.app.school.Submit
import de.madrasty.app.school.schoolCommand
import de.madrasty.app.ui.AsyncSurface
import de.madrasty.app.ui.isolate
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject

@Composable
internal fun FinancePdfButton(model:IdentityViewModel,kind:String,id:String,number:String){
    val context=LocalContext.current
    val scope=rememberCoroutineScope()
    val actor=model.session?.actor
    val locale=if(LocalConfiguration.current.locales[0].language=="ar")"ar" else "de"
    var busy by remember(actor,id){mutableStateOf(false)}
    var message by remember(actor,id){mutableStateOf<Int?>(null)}
    val save=rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/pdf")){uri->
        if(uri==null||actor==null){busy=false}else scope.launch{
            try{
                if(model.session?.actor!=actor)return@launch
                val bytes=model.schoolFinancePdf("/finance/$kind/$id/pdf?locale=$locale")
                if(model.session?.actor!=actor)return@launch
                withContext(Dispatchers.IO){requireNotNull(context.contentResolver.openOutputStream(uri,"w")).use{it.write(bytes)}}
                message=R.string.saved
            }catch(c:CancellationException){throw c}catch(_:Exception){message=R.string.finance_report_export_failed}finally{busy=false}
        }
    }
    Button(enabled=!busy,onClick={message=null;busy=true;save.launch(number.replace(Regex("[^A-Za-z0-9_.-]"),"_")+".pdf")}){Text(stringResource(R.string.finance_pdf))}
    message?.let{Text(stringResource(it))}
}

@Composable
internal fun AutomaticBillingPanel(model:IdentityViewModel){
    var refresh by remember{mutableIntStateOf(0)}
    val state=academicRead("/finance/automatic-billing",refresh){model.financeObject(it)}
    Text(stringResource(R.string.finance_auto),style=MaterialTheme.typography.titleMedium)
    AsyncSurface(state){data->
        key(data.getInt("revision")){
            val attempts=remember{mutableMapOf<String,Pair<String,String>>()}
            val current=data.getString("schoolMonth")
            var enabled by remember{mutableStateOf(data.getBoolean("enabled"))}
            val storedStart=data.getString("startMonth")
            var start by remember{mutableStateOf(storedStart)}
            FilterChip(enabled,{enabled=!enabled},label={Text(stringResource(R.string.finance_auto_enabled))})
            Field(R.string.finance_auto_start,start){start=financeDigits(it).take(7)}
            if(data.getInt("missingPayers")>0)Text(stringResource(R.string.finance_auto_missing,data.getInt("missingPayers")))
            val issues=data.optJSONArray("payerIssues")
            if(issues!=null&&issues.length()>0){
                var showIssues by remember { mutableStateOf(false) }
                TextButton(onClick={showIssues=!showIssues}) {Text(stringResource(R.string.finance_payer_issues,issues.length()))}
                if(showIssues){
                    Text(stringResource(R.string.finance_payer_issue_hint))
                    for(index in 0 until issues.length()){
                        val issue=issues.getJSONObject(index)
                        Text(isolate(issue.getString("studentName"))+" · "+isolate(issue.getString("studentNumber")))
                        Text(stringResource(if(issue.getString("reason")=="payer_missing") R.string.finance_payer_missing else R.string.finance_payer_unreachable))
                    }
                }
            }
            Submit(validBillingMonth(start)&&(start==storedStart||start>=current)&&(enabled!=data.getBoolean("enabled")||start!=data.getString("startMonth"))){
                model.schoolCommand(attempts,"/finance/automatic-billing","PUT",JSONObject().put("enabled",enabled).put("startMonth",start).put("revision",data.getInt("revision")))
                refresh++
            }
        }
    }
    HorizontalDivider()
}

@Composable
internal fun CashbookPanel(model:IdentityViewModel){
    var month by remember{mutableStateOf("")}
    var refresh by remember{mutableIntStateOf(0)}
    Field(R.string.cashbook_month,month){month=financeDigits(it).take(7)}
    val read=academicRead("/finance/cashbook"+if(validBillingMonth(month))"?month=$month" else "",refresh){model.financeObject(it)}
    AsyncSurface(read){data->
        val currency=data.getString("currency")
        FinanceBalanceCard(stringResource(R.string.cashbook_balance),financeMoney(data.getLong("balanceMinor"),currency))
        Text(isolate(data.getString("month")))
        for((field,label) in listOf("incomeMinor" to R.string.cashbook_income,"expenseMinor" to R.string.cashbook_expense,"depositsMinor" to R.string.cashbook_deposit))Text(stringResource(label)+" · "+financeMoney(data.getLong(field),currency))
        if(data.getBoolean("canPost")){
            val attempts=remember{mutableMapOf<String,Pair<String,String>>()}
            val kinds=mapOf("income" to R.string.cashbook_income,"donation" to R.string.cashbook_donation,"expense" to R.string.cashbook_expense,"bank_deposit" to R.string.cashbook_deposit)
            var kind by remember{mutableStateOf("income")}
            var day by remember{mutableStateOf(data.getString("schoolDate"))}
            var amount by remember{mutableStateOf("")}
            var reason by remember{mutableStateOf("")}
            var addMovement by remember{mutableStateOf(false)}
            Button(onClick={addMovement=!addMovement}){Text(stringResource(if(addMovement) R.string.fee_edit else R.string.finance_new_movement))}
            if (addMovement) {
            FlowRow { for((wire,label) in kinds)FilterChip(kind==wire,{kind=wire},label={Text(stringResource(label))}) }
            Field(R.string.receipt_date,day){day=financeDigits(it).take(10)}
            Field(R.string.finance_amount,amount){amount=it.take(24)}
            Field(R.string.cashbook_description,reason){reason=it.take(500)}
            val minor=financeMinor(amount,currency,100_000_000_000_000)
            Submit(minor!=null&&validFinanceDate(day)&&day<=data.getString("schoolDate")&&reason.trim().length>=3){
                model.schoolCommand(attempts,"/finance/cashbook","POST",JSONObject().put("date",day).put("kind",kind).put("amountMinor",minor).put("description",reason.trim()))
                amount="";reason="";addMovement=false;refresh++
            }
            }
        }
        for(entry in data.financeRows("entries")) key(entry.getString("id")){
            HorizontalDivider()
            if(!entry.isNull("reversalOf"))Text(stringResource(R.string.cashbook_correction))
            Text(isolate(entry.getString("description"))+" · "+isolate(entry.getString("date")))
            Text(financeMoney(entry.getLong("signedMinor"),currency))
            if(data.getBoolean("canPost")&&entry.optBoolean("canReverse"))CashMovementCorrection(model,entry,currency){refresh++}
        }
    }
}

@Composable
private fun CashMovementCorrection(model:IdentityViewModel,entry:JSONObject,currency:String,changed:()->Unit){
    var open by remember{mutableStateOf(false)}
    var reason by remember{mutableStateOf("")}
    val attempts=remember{mutableMapOf<String,Pair<String,String>>()}
    if(!open)TextButton(onClick={open=true}){Text(stringResource(R.string.cashbook_correct))}
    else{
        Text(stringResource(R.string.cashbook_correction_hint))
        Text(financeMoney(-entry.getLong("signedMinor"),currency))
        Field(R.string.cashbook_correction_reason,reason){reason=it.take(500)}
        Submit(reason.trim().length>=3,R.string.cashbook_correction_confirm){
            model.schoolCommand(attempts,"/finance/cashbook/reversals","POST",JSONObject().put("movementId",entry.getString("id")).put("reason",reason.trim()))
            open=false;reason="";changed()
        }
        TextButton(onClick={open=false;reason=""}){Text(stringResource(R.string.cashbook_cancel_correction))}
    }
}
