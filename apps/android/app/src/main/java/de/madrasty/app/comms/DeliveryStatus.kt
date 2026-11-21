package de.madrasty.app.comms

import android.net.Uri
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
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import de.madrasty.app.R
import de.madrasty.app.academics.academicPages
import de.madrasty.app.api.decodeData
import de.madrasty.app.identity.IdentityViewModel
import de.madrasty.app.school.Submit
import de.madrasty.app.ui.isolate
import org.json.JSONObject
import java.text.NumberFormat
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import java.util.Locale
import java.util.UUID

private val categories=linkedMapOf(
    "invite_guardian" to R.string.delivery_invite_guardians,
    "invite_teacher" to R.string.delivery_invite_teachers,
    "broadcast" to R.string.broadcast_title,
    "attendance" to R.string.nav_attendance,
    "academics" to R.string.delivery_academics,
    "finance" to R.string.conversation_accounts,
    "school" to R.string.delivery_school,
)
private val states=linkedMapOf(
    "queued" to R.string.delivery_queued,
    "accepted" to R.string.delivery_accepted,
    "delivered" to R.string.delivery_delivered,
    "failed" to R.string.delivery_failed,
    "bounced" to R.string.delivery_bounced,
    "uncertain" to R.string.delivery_uncertain,
    "suppressed" to R.string.delivery_suppressed,
)

internal suspend fun IdentityViewModel.mayUseDeliveryStatus()=
    decodeData(schoolRequest("/delivery-status/access")){(it as JSONObject).getBoolean("allowed")}.data

@Composable
internal fun DeliveryStatus(model:IdentityViewModel,job:String?=null,close:()->Unit){
    var category by remember{mutableStateOf("")}
    var state by remember{mutableStateOf("")}
    var refresh by remember{mutableIntStateOf(0)}
    val language=LocalContext.current.resources.configuration.locales[0].language
    val locale=Locale.forLanguageTag(language)
    val timestamp=DateTimeFormatter.ofLocalizedDateTime(FormatStyle.SHORT).withLocale(locale).withZone(ZoneId.systemDefault())
    val number=NumberFormat.getIntegerInstance(locale)
    val query=(job?.let { "&id=${Uri.encode(it)}" } ?: "")+(if(category.isEmpty())"" else "&kind=${Uri.encode(category)}")+(if(state.isEmpty())"" else "&state=${Uri.encode(state)}")
    BackHandler(onBack=close)
    Column(Modifier.fillMaxSize().safeDrawingPadding().imePadding().verticalScroll(rememberScrollState()).padding(20.dp),
        verticalArrangement=Arrangement.spacedBy(8.dp)){
        TextButton(onClick=close){Text(stringResource(R.string.back))}
        Text(stringResource(R.string.delivery_status),style=MaterialTheme.typography.headlineMedium)
        Text(stringResource(R.string.delivery_filter_kind),style=MaterialTheme.typography.titleMedium)
        DeliveryFilters(category,categories){category=it}
        Text(stringResource(R.string.delivery_filter_state),style=MaterialTheme.typography.titleMedium)
        DeliveryFilters(state,states){state=it}
        TextButton(onClick={refresh++}){Text(stringResource(R.string.broadcast_refresh))}
        academicPages(model,"/delivery-status?limit=25$query",refresh+model.attendanceNetworkRevision){items->
            for(item in items){
                val id=item.getString("id")
                val revision=item.getInt("revision")
                key(id,revision){
                    val command=remember{UUID.randomUUID().toString()}
                    val stateKey=item.getString("state")
                    HorizontalDivider()
                    Text(stringResource(categories.getValue(item.getString("kind"))),style=MaterialTheme.typography.titleMedium)
                    Text(stringResource(if(item.getString("channel")=="email")R.string.email else R.string.notices_device)+
                        " · "+stringResource(states.getValue(stateKey)))
                    Text(stringResource(R.string.delivery_attempts)+" · "+isolate(number.format(item.getInt("attempts"))))
                    Text(stringResource(R.string.delivery_updated)+" · "+isolate(timestamp.format(Instant.parse(item.getString("updatedAt")))))
                    if(stateKey=="queued")Text(stringResource(R.string.delivery_due)+" · "+isolate(timestamp.format(Instant.parse(item.getString("dueAt")))))
                    if(item.getBoolean("canRedrive"))Submit(true,R.string.delivery_redrive,success=R.string.delivery_rescheduled){
                        model.schoolRequest("/delivery-status/$id/redrive",JSONObject().put("revision",revision),"POST",command)
                        refresh++
                    }
                }
            }
        }
    }
}

@Composable
private fun DeliveryFilters(selected:String,choices:Map<String,Int>,change:(String)->Unit){
    FlowRow(horizontalArrangement=Arrangement.spacedBy(4.dp)){
        FilterChip(selected.isEmpty(),onClick={change("")},label={Text(stringResource(R.string.directory_all))})
        for((key,label) in choices)FilterChip(selected==key,onClick={change(key)},label={Text(stringResource(label))})
    }
}
