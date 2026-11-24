package de.madrasty.app.identity

import android.app.DatePickerDialog
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import de.madrasty.app.R
import de.madrasty.app.api.decodeData
import de.madrasty.app.school.Submit
import de.madrasty.app.school.schoolCommand
import de.madrasty.app.ui.AsyncState
import de.madrasty.app.ui.AsyncSurface
import de.madrasty.app.ui.isolate
import org.json.JSONObject
import java.time.LocalDate
import java.util.Calendar

internal suspend fun IdentityViewModel.readOwnProfile() =
    decodeData(schoolRequest("/account/profile")) { it as JSONObject }.data

@Composable
internal fun ProfileGreeting(model: IdentityViewModel, refresh: Int) {
    val account = model.session?.actor
    var name by remember(account) { mutableStateOf("") }
    LaunchedEffect(account,refresh) {
        when(val result=loadAccountSurface({}) { model.readOwnProfile() }) {
            is AsyncState.Ready -> name = if(result.value.isNull("displayName")) "" else result.value.getString("displayName")
            else -> name = ""
        }
    }
    Text(if(name.isBlank()) stringResource(R.string.profile_welcome) else
        stringResource(R.string.profile_welcome_name,isolate(name)),style=MaterialTheme.typography.headlineMedium)
}

@Composable
internal fun ProfileScreen(model: IdentityViewModel, close: () -> Unit) {
    var reload by remember { mutableStateOf(0) }
    var state by remember { mutableStateOf<AsyncState<JSONObject>>(AsyncState.InitialLoading()) }
    val attempts=remember { mutableMapOf<String,Pair<String,String>>() }
    BackHandler(onBack=close)
    LaunchedEffect(reload) {
        state=AsyncState.InitialLoading()
        state=loadAccountSurface({reload++}) { model.readOwnProfile() }
    }
    Column(Modifier.fillMaxSize().safeDrawingPadding().imePadding().verticalScroll(rememberScrollState()).padding(20.dp),
        verticalArrangement=Arrangement.spacedBy(12.dp)) {
        TextButton(onClick=close){Text(stringResource(R.string.back))}
        Text(stringResource(R.string.profile_title),style=MaterialTheme.typography.headlineMedium)
        AsyncSurface(state){profile->
            Text(stringResource(R.string.profile_mine),style=MaterialTheme.typography.titleLarge)
            if(!profile.isNull("displayName"))Text(isolate(profile.getString("displayName")))
            val guardian=profile.optJSONObject("guardian")
            if(guardian!=null){
                key(guardian.getInt("revision"),reload){
                    PersonalProfileForm(guardian){body->
                        model.schoolCommand(attempts,"/account/profile","PATCH",body)
                        reload++
                    }
                }
                HorizontalDivider()
                Text(stringResource(R.string.profile_children),style=MaterialTheme.typography.titleLarge)
                val children=profile.getJSONArray("children")
                for(i in 0 until children.length()){
                    val child=children.getJSONObject(i)
                    key(child.getString("id"),child.getInt("revision"),reload){
                        ChildProfileForm(child){body->
                            model.schoolCommand(attempts,"/account/profile","PATCH",body)
                            reload++
                        }
                    }
                    HorizontalDivider()
                }
            }
        }
        TextButton(onClick={reload++}){Text(stringResource(R.string.profile_reload))}
    }
}

private fun JSONObject.profileString(key:String)=if(isNull(key))"" else getString(key)
private fun nullable(value:String):Any=value.trim().ifEmpty{return JSONObject.NULL}

@Composable
private fun ProfileDate(value:String, change:(String)->Unit){
    val context=LocalContext.current
    Text(stringResource(R.string.profile_birth))
    TextButton(onClick={
        val initial=runCatching { LocalDate.parse(value) }.getOrDefault(LocalDate.now())
        DatePickerDialog(context,{_,year,month,day->change(LocalDate.of(year,month+1,day).toString())},
            initial.year,initial.monthValue-1,initial.dayOfMonth).apply{
            datePicker.maxDate=System.currentTimeMillis()
            datePicker.minDate=Calendar.getInstance().apply{clear();set(1900,0,1)}.timeInMillis
        }.show()
    }){Text(value.ifBlank{stringResource(R.string.profile_choose_date)})}
    if(value.isNotEmpty())TextButton(onClick={change("")}){Text(stringResource(R.string.profile_clear))}
}

@Composable
private fun PersonalProfileForm(row:JSONObject,save:suspend(JSONObject)->Unit){
    var birth by remember { mutableStateOf(row.profileString("birthDate")) }
    var phone by remember { mutableStateOf(row.profileString("phone")) }
    var address by remember { mutableStateOf(row.profileString("emergencyAddress")) }
    ProfileDate(birth){birth=it}
    OutlinedTextField(phone,{phone=it},label={Text(stringResource(R.string.profile_phone))},modifier=Modifier.fillMaxWidth(),singleLine=true)
    OutlinedTextField(address,{address=it},label={Text(stringResource(R.string.profile_address))},modifier=Modifier.fillMaxWidth())
    Submit(phone.trim().length<=48&&address.trim().length<=500,R.string.profile_save){
        save(JSONObject().put("kind","guardian").put("revision",row.getInt("revision"))
            .put("birthDate",nullable(birth)).put("phone",nullable(phone)).put("emergencyAddress",nullable(address)))
    }
}

@Composable
private fun ChildProfileForm(row:JSONObject,save:suspend(JSONObject)->Unit){
    var name by remember { mutableStateOf(row.getString("displayName")) }
    var birth by remember { mutableStateOf(row.profileString("birthDate")) }
    Text(isolate(row.getString("displayName")),style=MaterialTheme.typography.titleMedium)
    OutlinedTextField(name,{name=it},label={Text(stringResource(R.string.profile_name))},modifier=Modifier.fillMaxWidth(),singleLine=true)
    ProfileDate(birth){birth=it}
    if(!row.isNull("age"))Text(stringResource(R.string.profile_age,row.getInt("age")))
    Submit(name.trim().length in 1..200,R.string.profile_save){
        save(JSONObject().put("kind","child").put("id",row.getString("id")).put("revision",row.getInt("revision"))
            .put("displayName",name.trim()).put("birthDate",nullable(birth)))
    }
}
