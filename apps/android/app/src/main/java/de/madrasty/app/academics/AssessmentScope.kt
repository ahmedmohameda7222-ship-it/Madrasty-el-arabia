package de.madrasty.app.academics

import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.res.stringResource
import de.madrasty.app.R
import de.madrasty.app.identity.IdentityViewModel
import de.madrasty.app.school.records
import de.madrasty.app.ui.AsyncState
import de.madrasty.app.ui.AsyncSurface
import de.madrasty.app.ui.Persona
import de.madrasty.app.ui.isolate
import org.json.JSONObject

internal data class AssessmentContext(val child:String?,val offering:JSONObject?,val initial:String?)

@Composable
internal fun AssessmentScope(
    model:IdentityViewModel,persona:Persona,language:String,initialChild:String?,initial:String?,version:Int,
    allow:(JSONObject)->Boolean,content:@Composable (AssessmentContext)->Unit,
){
    if(persona==Persona.Guardian){
        var child by remember(initialChild){mutableStateOf(initialChild)}
        val linked=academicRead("/me/children?limit=100",version){model.records(it)}
        AsyncSurface(linked){items->
            val active=child?:items.firstOrNull()?.getString("id")
            items.forEach{item->
                val id=item.getString("id")
                FilterChip(id==active,onClick={child=id},label={Text(isolate(item.getString("displayName")))})
            }
            if(active!=null&&items.any{it.getString("id")==active})key(active){
                content(AssessmentContext(active,null,if(child==initialChild)initial else null))
            }else if(child!=null)AsyncSurface<Unit>(AsyncState.Forbidden()){}
            else Text(stringResource(R.string.empty))
        }
    }else{
        var offeringId by remember{mutableStateOf<String?>(null)}
        val courses=academicRead("/academics/offerings",version){model.records(it)}
        val catalog=academicRead("/academics/subjects?limit=100",version){model.records(it)}
        AsyncSurface(courses){items->
            val available=items.filter(allow)
            val active=available.find{it.getString("id")==offeringId}?:available.firstOrNull()
            val names=(catalog as? AsyncState.Ready)?.content.orEmpty()
            if(available.isNotEmpty())Text(stringResource(R.string.academic_context),style=MaterialTheme.typography.titleMedium)
            available.forEach{offering->
                val id=offering.getString("id")
                val subject=names.find{it.getString("id")==offering.getString("subjectId")}
                val title=subject?.getString(if(language=="ar")"nameAr" else "nameDe")?.let(::isolate)
                FilterChip(id==active?.getString("id"),onClick={offeringId=id},label={
                    Text(listOfNotNull(title,offeringLabel(offering,language)).joinToString(" · "))
                })
            }
            if(active!=null||initial!=null)key(active?.getString("id")){
                content(AssessmentContext(null,active,if(offeringId==null)initial else null))
            }else Text(stringResource(R.string.empty))
        }
    }
}
