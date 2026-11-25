package de.madrasty.app.comms

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.FlowRow
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
import de.madrasty.app.academics.academicPages
import de.madrasty.app.academics.academicRead
import de.madrasty.app.identity.IdentityViewModel
import de.madrasty.app.ui.AsyncState
import de.madrasty.app.ui.Persona
import de.madrasty.app.ui.isolate

@Composable
internal fun CommunicationFeed(model:IdentityViewModel,persona:Persona,broadcasts:()->Unit,news:()->Unit){
    val language=if(LocalContext.current.resources.configuration.locales[0].language=="de")"de" else "ar"
    var filter by remember{mutableStateOf("all")}
    var refresh by remember{mutableStateOf(0)}
    var manage by remember{mutableStateOf(false)}
    if(persona!=Persona.Guardian){
        val options=academicRead("/school/publishing-options",refresh){model.publishingObject(it)}
        val data=(options as? AsyncState.Ready)?.content
        val classes=data?.optJSONArray("classes")
        val canWrite=data?.optBoolean("schoolWide")==true||(classes!=null&&(0 until classes.length()).any{classes.getJSONObject(it).optBoolean("canWrite")})
        if(canWrite){
            TextButton(onClick={manage=!manage}){Text(stringResource(R.string.comms_manage))}
            if(manage){
                TextButton(onClick=broadcasts){Text(stringResource(R.string.broadcast_title))}
                TextButton(onClick=news){Text(stringResource(R.string.school_news))}
            }
        }
    }
    FlowRow(horizontalArrangement=Arrangement.spacedBy(4.dp)){
        for((key,label) in listOf("all" to R.string.directory_all,"announcement" to R.string.broadcast_title,"news" to R.string.school_news)){
            FilterChip(filter==key,onClick={filter=key},label={Text(stringResource(label))})
        }
    }
    TextButton(onClick={refresh++}){Text(stringResource(R.string.broadcast_refresh))}
    academicPages(model,"/comms/feed?limit=25&locale=$language&filter=$filter",refresh+model.attendanceNetworkRevision){items->
        for(item in items){
            HorizontalDivider()
            Text(stringResource(if(item.getString("kind")=="news")R.string.school_news else R.string.broadcast_title),style=MaterialTheme.typography.labelMedium)
            Text(isolate(item.getString("title")),style=MaterialTheme.typography.titleMedium)
            Text(isolate(item.getString("body")))
        }
    }
}
