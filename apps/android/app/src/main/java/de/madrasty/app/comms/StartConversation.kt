package de.madrasty.app.comms

import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.res.stringResource
import de.madrasty.app.R
import de.madrasty.app.academics.academicRead
import de.madrasty.app.identity.IdentityViewModel
import de.madrasty.app.school.Submit
import de.madrasty.app.school.records
import de.madrasty.app.school.schoolCommand
import de.madrasty.app.ui.AsyncSurface
import de.madrasty.app.ui.isolate
import org.json.JSONObject

@Composable
fun StartConversation(
    model:IdentityViewModel,targetKind:String,targetId:String,contextKind:String?=null,contextId:String?=null,
    label:Int=R.string.conversation_open,open:(String)->Unit,
){
    val attempts=remember(targetKind,targetId,contextKind,contextId){mutableMapOf<String,Pair<String,String>>()}
    Submit(true,label,success=null){
        val target=JSONObject().put("kind",targetKind).put("id",targetId)
        val input=JSONObject().put("target",target)
        if(contextKind!=null&&contextId!=null)input.put("context",JSONObject().put("kind",contextKind).put("id",contextId))
        val result=model.schoolCommand(attempts,"/threads","POST",input)
        open(result.getString("threadId"))
    }
}

@Composable
fun HomeworkConversation(model:IdentityViewModel,id:String,open:(String)->Unit){
    var asking by remember(id){mutableStateOf(false)}
    TextButton(onClick={asking=!asking}){Text(stringResource(R.string.conversation_homework))}
    if(!asking)return
    val available=academicRead("/academics/homework/$id/thread-targets",0){model.records(it)}
    AsyncSurface(available){people->
        if(people.isEmpty())Text(stringResource(R.string.conversation_no_teacher))
        for(person in people){
            Text(isolate(person.getString("displayName")))
            StartConversation(model,"person",person.getString("id"),"homework",id,open=open)
        }
    }
}
