package de.madrasty.app.comms

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.size
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import de.madrasty.app.R
import de.madrasty.app.api.decodeData
import org.json.JSONObject
import de.madrasty.app.academics.academicPages
import de.madrasty.app.academics.academicRead
import de.madrasty.app.identity.IdentityViewModel
import de.madrasty.app.ui.AsyncState
import de.madrasty.app.ui.Persona
import de.madrasty.app.ui.isolate

@Composable
internal fun CommunicationFeed(model:IdentityViewModel,persona:Persona,broadcasts:()->Unit,news:()->Unit,newNews:()->Unit,events:()->Unit){
    val language=if(LocalContext.current.resources.configuration.locales[0].language=="de")"de" else "ar"
    var filter by remember{mutableStateOf("all")}
    var refresh by remember{mutableStateOf(0)}
    var manage by remember{mutableStateOf(false)}
    if(persona!=Persona.Guardian){
        val options=academicRead("/school/publishing-options",refresh){decodeData(model.schoolRequest(it)){it as JSONObject}.data}
        val data=(options as? AsyncState.Ready)?.content
        val classes=data?.optJSONArray("classes")
        val canWrite=data?.optBoolean("schoolWide")==true||(classes!=null&&(0 until classes.length()).any{classes.getJSONObject(it).optBoolean("canWrite")})
        Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.End,verticalAlignment=Alignment.CenterVertically){
            if(canWrite)Box{
                IconButton(onClick={manage=true},modifier=Modifier.size(48.dp)){
                    Icon(painterResource(R.drawable.ic_comms_add),contentDescription=stringResource(R.string.comms_manage))
                }
                DropdownMenu(expanded=manage,onDismissRequest={manage=false}){
                    DropdownMenuItem(text={Text(stringResource(R.string.publish_new_news))},onClick={manage=false;newNews()})
                    DropdownMenuItem(text={Text(stringResource(R.string.broadcast_title))},onClick={manage=false;broadcasts()})
                    DropdownMenuItem(text={Text(stringResource(R.string.publish_managed))},onClick={manage=false;news()})
                    DropdownMenuItem(text={Text(stringResource(R.string.school_events))},onClick={manage=false;events()})
                }
            }
            IconButton(onClick={refresh++},modifier=Modifier.size(48.dp)){
                Icon(painterResource(R.drawable.ic_comms_retry),contentDescription=stringResource(R.string.broadcast_refresh))
            }
        }
    }
    FlowRow(horizontalArrangement=Arrangement.spacedBy(4.dp)){
        for((key,label) in listOf("all" to R.string.directory_all,"announcement" to R.string.broadcast_title,"news" to R.string.school_news)){
            FilterChip(filter==key,onClick={filter=key},label={Text(stringResource(label))})
        }
    }
    if(persona==Persona.Guardian)TextButton(onClick={refresh++}){Text(stringResource(R.string.broadcast_refresh))}
    academicPages(model,"/comms/feed?limit=25&locale=$language&filter=$filter",refresh+model.attendanceNetworkRevision){items->
        for(item in items){
            HorizontalDivider()
            Text(stringResource(if(item.getString("kind")=="news")R.string.school_news else R.string.broadcast_title),style=MaterialTheme.typography.labelMedium)
            Text(isolate(item.getString("title")),style=MaterialTheme.typography.titleMedium)
            Text(isolate(item.getString("body")))
        }
    }
}
