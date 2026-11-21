package de.madrasty.app.attendance

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import de.madrasty.app.api.decodeData
import de.madrasty.app.identity.HttpFailure
import de.madrasty.app.identity.IdentityViewModel
import de.madrasty.app.school.tableRows
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
import java.util.UUID

internal data class DraftDelivery(val changes:JSONObject?=null,val queued:Boolean=false)

internal class AttendanceDraftController(private val model:IdentityViewModel,private val slot:String){
    private val writes=Mutex()
    var ready by mutableStateOf(false)
        private set
    var cached by mutableStateOf<JSONObject?>(null)
        private set
    var failed by mutableStateOf(false)
        private set
    private var sending=false

    val drafts: Map<String,DraftChange>
        get()=cached?.draftEdits()?:emptyMap()

    fun updatedOffline(record:JSONObject) { cached=record }

    suspend fun load(){
        cached=model.readAttendanceDraft(slot)
        ready=true
    }

    private suspend fun save(record:JSONObject):Boolean{
        cached=record
        return writes.withLock{model.saveAttendanceDraft(slot,record)}.also { failed=!it }
    }

    suspend fun baseline(server:JSONObject){
        val expiry=model.session?.expiresAt?.let{Instant.parse(it).toEpochMilli()}?:return
        val snapshot=attendanceSnapshot(server,expiry,cached)?:return
        save(snapshot)
    }

    suspend fun edit(change:(Map<String,DraftChange>)->Map<String,DraftChange>){
        val record=cached?:return
        val edits=change(record.draftEdits())
        save(JSONObject(record.toString()).put("drafts",encodeDrafts(edits)))
    }

    suspend fun purge(){
        cached=null
        writes.withLock{model.purgeAttendanceDrafts(slot.substringBeforeLast('/')+"/")}
    }

    suspend fun send(server:JSONObject,automatic:Boolean):DraftDelivery{
        val record=cached?:return DraftDelivery()
        if(sending)return DraftDelivery()
        if(!server.getBoolean("canMark")||!server.getBoolean("teachingDay")||server.getString("state")!="open"){
            if(record.optBoolean("sync")||record.has("inFlight"))save(JSONObject(record.toString()).put("sync",false).apply{remove("inFlight")})
            return DraftDelivery()
        }
        val snapshot=server.getJSONArray("rows").tableRows().associateBy{it.getString("id")}
        val remaining=record.draftEdits().toMutableMap()
        val compatible=JSONArray()
        val blocked=JSONArray()
        for((id,draft) in record.draftEdits().toSortedMap()){
            val row=snapshot[id]
            if(row!=null && row.mark()==draft.status){remaining.remove(id);continue}
            val valid=row!=null && row.getInt("revision")==draft.revision
                && !row.getBoolean("locked") && row.isNull("confirmedArrivalAt")
            if(valid||!automatic)compatible.put(draft.json().put("rowId",id))
            else blocked.put(JSONObject().put("rowId",id).put("reason",reason(row)).put("current",row?:JSONObject.NULL))
        }
        val reviewed=JSONObject(record.toString()).put("drafts",encodeDrafts(remaining))
        val attempt=record.optJSONObject("inFlight")?:JSONObject().put("key",UUID.randomUUID().toString()).put("edits",compatible)
        val edits=attempt.getJSONArray("edits")
        if(edits.length()==0){
            save(reviewed.put("sync",false).apply{remove("inFlight")})
            return DraftDelivery(if(blocked.length()>0)outcome(JSONArray(),JSONArray(),blocked)else null)
        }
        sending=true
        val durable=save(reviewed.put("sync",true).put("inFlight",attempt))
        try{
            val result=model.schoolRequest("/attendance/sheets/${server.getString("id")}/rows",JSONObject().put("edits",edits),
                "PATCH",attempt.getString("key"))
            val response=decodeData(result){it as JSONObject}.data
            val applied=response.getJSONArray("applied")
            val confirmed=applied.tableRows().map{it.getString("id")}.toSet()
            val submitted=edits.tableRows().associateBy{it.getString("rowId")}
            val latest=cached ?: return DraftDelivery()
            val updated=latest.draftEdits().filterNot{(id,draft)->
                val previous=submitted[id]
                id in confirmed && previous!=null && previous.getInt("revision")==draft.revision && previous.mark()==draft.status
            }
            save(JSONObject(latest.toString()).put("drafts",encodeDrafts(updated)).put("sync",false).apply{remove("inFlight")})
            val conflicts=response.getJSONArray("conflicts")
            val known=conflicts.tableRows().map{it.getString("rowId")}.toSet()
            blocked.tableRows().filter{it.getString("rowId") !in known}.forEach{conflicts.put(it)}
            return DraftDelivery(outcome(applied,response.getJSONArray("skippedLocked"),conflicts))
        }catch(error:CancellationException){throw error}
        catch(error:HttpFailure){
            if(error.status<500){
                cached?.let{save(JSONObject(it.toString()).put("sync",false).apply{remove("inFlight")})}
                throw error
            }
            if(durable)return DraftDelivery(queued=true)
            throw error
        }catch(error:Exception){
            if(durable)return DraftDelivery(queued=true)
            throw error
        }finally{sending=false}
    }

    private fun outcome(applied:JSONArray,skipped:JSONArray,conflicts:JSONArray)=JSONObject()
        .put("applied",applied).put("skippedLocked",skipped).put("conflicts",conflicts)
    private fun reason(row:JSONObject?)=when{
        row==null->"outside_roster"
        row.getBoolean("locked")->"locked"
        !row.isNull("confirmedArrivalAt")->"arrival_confirmed"
        else->"stale"
    }
    private fun JSONObject.mark()=optString("status").takeUnless{isNull("status")}
}
