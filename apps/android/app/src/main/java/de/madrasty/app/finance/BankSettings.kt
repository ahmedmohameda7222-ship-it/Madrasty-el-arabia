package de.madrasty.app.finance

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import de.madrasty.app.R
import de.madrasty.app.academics.academicRead
import de.madrasty.app.academics.string
import de.madrasty.app.api.decodeData
import de.madrasty.app.identity.HttpFailure
import de.madrasty.app.identity.IdentityViewModel
import de.madrasty.app.school.Field
import de.madrasty.app.ui.AsyncSurface
import de.madrasty.app.ui.ConfirmedAt
import de.madrasty.app.ui.CopyValue
import de.madrasty.app.ui.isolate
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

private const val bankPath="/finance/bank"

@Composable
internal fun BankSettings(model:IdentityViewModel,close:()->Unit){
    var refresh by remember{mutableIntStateOf(0)}
    var state by remember{mutableStateOf<String?>(null)}
    val read=academicRead(bankPath,refresh){model.bankObject(it)}
    BackHandler(onBack=close)
    Column(Modifier.fillMaxSize().safeDrawingPadding().imePadding().verticalScroll(rememberScrollState()).padding(20.dp),
        verticalArrangement=Arrangement.spacedBy(8.dp)){
        TextButton(onClick=close){Text(stringResource(R.string.back))}
        Text(stringResource(R.string.finance_bank),style=MaterialTheme.typography.headlineMedium)
        state?.let{Text(stringResource(R.string.finance_bank_saved)+" · "+isolate(it))}
        AsyncSurface(read){value->
            key(value.getInt("revision")){
                BankEditor(model,value,refresh={refresh++},saved={state=it;refresh++})
            }
        }
    }
}

@Composable
private fun BankEditor(model:IdentityViewModel,settings:JSONObject,refresh:()->Unit,saved:(String)->Unit){
    val current=settings.optJSONObject("active")
    var name by remember{mutableStateOf(current?.optString("beneficiary").orEmpty())}
    var iban by remember{mutableStateOf(current?.optString("iban").orEmpty())}
    var proposal by remember{mutableStateOf<JSONObject?>(null)}
    var challenge by remember{mutableStateOf<String?>(null)}
    var proof by remember{mutableStateOf<String?>(null)}
    var chosen by remember{mutableStateOf<String?>(null)}
    var commandId by remember{mutableStateOf<String?>(null)}
    var code by remember{mutableStateOf("")}
    var pending by remember{mutableStateOf(false)}
    var message by remember{mutableStateOf<Int?>(null)}
    val scope=rememberCoroutineScope()

    fun resetVerification(){
        challenge=null;proof=null;commandId=null;code=""
    }
    fun run(action:suspend ()->Unit){
        if(pending)return
        pending=true;message=null
        scope.launch{
            try{action()}
            catch(cancelled:CancellationException){throw cancelled}
            catch(error:HttpFailure){
                if(error.status==409){proposal=null;resetVerification();message=R.string.finance_bank_stale;refresh()}
                else message=when{
                    "iban" in error.fields->R.string.finance_invalid_iban
                    error.status==403&&proof!=null->R.string.finance_bank_proof_expired
                    else->R.string.generic_error
                }
                if(error.status in listOf(401,403,422))resetVerification()
            }catch(_:Exception){message=R.string.generic_error}
            finally{pending=false}
        }
    }

    Text(stringResource(R.string.finance_bank_active),style=MaterialTheme.typography.titleLarge)
    if(current==null)Text(stringResource(R.string.finance_bank_empty))
    else{
        CopyValue(stringResource(R.string.finance_beneficiary),current.getString("beneficiary"))
        val electronic=current.getString("iban")
        CopyValue(stringResource(R.string.finance_iban),electronic,groupedIban(electronic))
        ConfirmedAt(current.getString("effectiveAt"))
    }
    message?.let{Text(stringResource(it))}
    val reviewed=proposal
    if(reviewed==null){
        Text(stringResource(R.string.finance_bank_new),style=MaterialTheme.typography.titleLarge)
        Field(R.string.finance_beneficiary,name,!pending){name=it.take(140)}
        Field(R.string.finance_iban,iban,!pending){iban=it.take(80)}
        Button(enabled=!pending&&name.isNotBlank()&&iban.isNotBlank(),onClick={
            run{
                val input=JSONObject().put("beneficiary",name).put("iban",iban).put("revision",settings.getInt("revision"))
                proposal=model.bankObject("$bankPath/preview",input,"POST")
                resetVerification()
            }
        }){Text(stringResource(if(pending)R.string.pending else R.string.finance_bank_review))}
        return
    }
    Text(stringResource(R.string.finance_bank_review),style=MaterialTheme.typography.titleLarge)
    Text(stringResource(R.string.finance_beneficiary)+" · "+isolate(reviewed.getString("beneficiary")))
    Text(stringResource(R.string.finance_iban)+" · "+isolate(groupedIban(reviewed.getString("iban"))))
    if(challenge==null&&proof==null){
        val factors=academicRead("/auth/mfa/factors",0){path->
            decodeData(model.schoolRequest(path)){data->
                val rows=data as JSONArray
                List(rows.length(),rows::getJSONObject).filter{it.optString("status")=="verified"}
            }.data
        }
        AsyncSurface(factors){options->
            val selected=options.firstOrNull{it.optString("id")==chosen}?:options.firstOrNull()
            if(selected==null)Text(stringResource(R.string.finance_bank_no_factor))
            else{
                if(options.size>1)FlowRow(horizontalArrangement=Arrangement.spacedBy(4.dp)){
                    options.forEachIndexed{index,row->
                        val id=row.getString("id")
                        FilterChip(id==selected.getString("id"),enabled=!pending,onClick={chosen=id},label={
                            Text(row.string("friendly_name")?:stringResource(R.string.finance_factor_number,index+1))
                        })
                    }
                }
                Button(enabled=!pending,onClick={run{
                    val input=JSONObject(reviewed.toString()).put("factorId",selected.getString("id"))
                    challenge=model.bankObject("$bankPath/step-up",input,"POST").getString("challengeId")
                }}){Text(stringResource(if(pending)R.string.pending else R.string.finance_bank_confirm))}
            }
        }
    }else{
        if(proof==null)Field(R.string.finance_bank_code,code,!pending){
            code=it.map{digit->when(digit){
                in '٠'..'٩'->'0'+(digit-'٠')
                in '۰'..'۹'->'0'+(digit-'۰')
                else->digit
            }}.filter{it in '0'..'9'}.joinToString("").take(6)
        }
        Button(enabled=!pending&&(proof!=null||code.length==6),onClick={run{
            val verified=proof?:model.verifyBankStepUp(checkNotNull(challenge),code).also{proof=it;code=""}
            val input=JSONObject(reviewed.toString()).put("stepUpProof",verified)
            val id=commandId?:UUID.randomUUID().toString().also{commandId=it}
            val response=model.bankObject(bankPath,input,"PUT",id)
            proposal=null;resetVerification();saved(response.getString("maskedIban"))
        }}){Text(stringResource(if(pending)R.string.pending else if(proof==null)R.string.finance_bank_apply else R.string.retry))}
    }
    TextButton(enabled=!pending,onClick={proposal=null;resetVerification();message=null}){
        Text(stringResource(R.string.publish_edit))
    }
}

private suspend fun IdentityViewModel.bankObject(path:String,body:JSONObject?=null,method:String="GET",key:String?=null)=
    decodeData(schoolRequest(path,body,method,key)){it as JSONObject}.data
