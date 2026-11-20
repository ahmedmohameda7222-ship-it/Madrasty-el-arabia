package de.madrasty.app.attendance

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import de.madrasty.app.identity.SchoolSession
import de.madrasty.app.ui.SchoolPartition
import org.json.JSONArray
import org.json.JSONObject
import java.security.KeyStore
import java.security.MessageDigest
import java.time.Instant
import java.util.UUID
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

internal class AttendanceDraftStore(context:Context):SQLiteOpenHelper(context.applicationContext,"attendance-drafts.db",null,1){
    private val alias="madrasty-attendance-drafts-v1"
    private val keystore=KeyStore.getInstance("AndroidKeyStore").apply{load(null)}
    private data class Binding(val namespace:String,val epoch:String,val expires:Long)

    override fun onCreate(db:SQLiteDatabase){
        db.execSQL("create table binding (singleton integer primary key check(singleton=1), partition_key text not null, epoch text not null, expiry integer not null)")
        db.execSQL("create table draft (record_key text primary key, nonce blob not null, sealed blob not null, expiry integer not null)")
    }
    override fun onUpgrade(db:SQLiteDatabase,oldVersion:Int,newVersion:Int) = error("Unsupported draft schema $oldVersion to $newVersion")

    @Synchronized
    fun bind(session:SchoolSession){
        val expiry=Instant.parse(session.expiresAt).toEpochMilli()
        val now=System.currentTimeMillis()
        if(expiry<=now){clear();return}
        val partition=namespace(session.actor)
        val db=writableDatabase
        db.beginTransaction()
        try{
            val existing=binding(db)
            val same=existing?.namespace==partition&&existing.expires>now
            if(!same)db.delete("draft",null,null)
            val row=ContentValues().apply{
                put("singleton",1)
                put("partition_key",partition)
                put("epoch",if(same)existing.epoch else UUID.randomUUID().toString())
                put("expiry",expiry)
            }
            db.insertWithOnConflict("binding",null,row,SQLiteDatabase.CONFLICT_REPLACE)
            db.delete("draft","expiry <= ?",arrayOf(now.toString()))
            db.setTransactionSuccessful()
            if(!same&&keystore.containsAlias(alias))keystore.deleteEntry(alias)
        }finally{db.endTransaction()}
    }

    @Synchronized
    fun read(actor:SchoolPartition,slot:String):JSONObject?{
        val db=writableDatabase
        val binding=active(db,actor)?:return null
        val record=recordKey(binding,slot)
        return db.query("draft",arrayOf("nonce","sealed"),"record_key = ?",arrayOf(record),null,null,null).use{
            if(!it.moveToFirst())return@use null
            unseal(record,it.getBlob(0),it.getBlob(1))?.takeIf{packet->packet.getString("slot")==slot}?.getJSONObject("value")
        }
    }

    @Synchronized
    fun list(actor:SchoolPartition):List<Pair<String,JSONObject>>{
        val db=writableDatabase
        active(db,actor)?:return emptyList()
        return db.query("draft",arrayOf("record_key","nonce","sealed"),null,null,null,null,null).use{
            buildList{
                while(it.moveToNext()){
                    val item=unseal(it.getString(0),it.getBlob(1),it.getBlob(2))?:continue
                    add(item.getString("slot") to item.getJSONObject("value"))
                }
            }
        }
    }

    @Synchronized
    fun write(actor:SchoolPartition,slot:String,value:JSONObject):Boolean{
        val db=writableDatabase
        val binding=active(db,actor)?:return false
        val expiry=minOf(binding.expires,value.optLong("validUntil",binding.expires))
        if(expiry<=System.currentTimeMillis())return false
        val record=recordKey(binding,slot)
        val cipher=Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE,key())
        cipher.updateAAD(record.toByteArray(Charsets.UTF_8))
        val body=JSONObject().put("slot",slot).put("value",value)
        val bytes=cipher.doFinal(body.toString().toByteArray(Charsets.UTF_8))
        return db.insertWithOnConflict("draft",null,ContentValues().apply{
            put("record_key",record)
            put("expiry",expiry)
            put("sealed",bytes)
            put("nonce",cipher.iv)
        },SQLiteDatabase.CONFLICT_REPLACE)>=0
    }

    @Synchronized
    fun purge(actor:SchoolPartition,prefix:String){
        val db=writableDatabase
        val binding=active(db,actor)?:return
        for((slot,_) in list(actor)){
            if(slot.startsWith(prefix))db.delete("draft","record_key = ?",arrayOf(recordKey(binding,slot)))
        }
    }

    @Synchronized
    fun clear(){
        val db=writableDatabase
        db.beginTransaction()
        try{
            db.delete("binding",null,null)
            db.delete("draft",null,null)
            db.setTransactionSuccessful()
        }finally{db.endTransaction()}
        if(keystore.containsAlias(alias))keystore.deleteEntry(alias)
    }

    private fun active(db:SQLiteDatabase,actor:SchoolPartition):Binding?{
        val current=binding(db)?:return null
        val now=System.currentTimeMillis()
        if(current.expires<=now){clear();return null}
        if(current.namespace!=namespace(actor))return null
        db.delete("draft","expiry <= ?",arrayOf(now.toString()))
        return current
    }
    private fun binding(db:SQLiteDatabase)=db.query("binding",arrayOf("partition_key","epoch","expiry"),"singleton=1",null,null,null,null).use{
        if(it.moveToFirst())Binding(it.getString(0),it.getString(1),it.getLong(2)) else null
    }

    private fun key():SecretKey{
        val existing=keystore.getKey(alias,null) as? SecretKey
        if(existing!=null)return existing
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore").apply{
            init(KeyGenParameterSpec.Builder(alias,KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build())
        }.generateKey()
    }

    private fun unseal(record:String,nonce:ByteArray,bytes:ByteArray):JSONObject?=runCatching{
        val cipher=Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE,key(),GCMParameterSpec(128,nonce))
        cipher.updateAAD(record.toByteArray(Charsets.UTF_8))
        JSONObject(cipher.doFinal(bytes).toString(Charsets.UTF_8))
    }.getOrNull()

    private fun namespace(actor:SchoolPartition)=digest("${actor.accountId}/${actor.sessionId}/${actor.persona}")
    private fun recordKey(binding:Binding,slot:String)=digest("${binding.namespace}/${binding.epoch}/$slot")
    private fun digest(value:String)=Base64.encodeToString(
        MessageDigest.getInstance("SHA-256").digest(value.toByteArray(Charsets.UTF_8)),
        Base64.NO_WRAP or Base64.URL_SAFE or Base64.NO_PADDING,
    )
}

internal fun teacherDraftSlot(classId:String,date:String)="sheet/$classId/$date"
internal fun familyDraftSlot(child:String,date:String)="excuse/$child/$date"

internal data class DraftChange(val status:String?,val revision:Int) {
    fun json()=JSONObject().put("status",status?:JSONObject.NULL).put("revision",revision)
}
internal fun JSONObject.draftEdits():Map<String,DraftChange>{
    val values=optJSONObject("drafts")?:return emptyMap()
    return values.keys().asSequence().associateWith { id->
        val item=values.getJSONObject(id)
        DraftChange(item.optString("status").takeUnless{item.isNull("status")},item.getInt("revision"))
    }
}
internal fun encodeDrafts(values:Map<String,DraftChange>)=JSONObject().apply{
    for((id,item) in values)put(id,item.json())
}
internal fun attendanceSnapshot(server:JSONObject,expiry:Long,prior:JSONObject?):JSONObject?{
    if(server.isNull("id"))return null
    val rows=server.getJSONArray("rows")
    val compact=JSONArray()
    for(index in 0 until rows.length()){
        val row=rows.getJSONObject(index)
        compact.put(JSONObject().put("id",row.getString("id")).put("displayName",row.getString("displayName"))
            .put("studentNumber",row.getString("studentNumber")).put("status",row.get("status"))
            .put("revision",row.getInt("revision")).put("locked",row.getBoolean("locked"))
            .put("arrival",!row.isNull("confirmedArrivalAt")))
    }
    return JSONObject().put("kind","sheet").put("classroom",server.getJSONObject("classroom"))
        .put("schoolDate",server.getString("schoolDate")).put("sheetId",server.getString("id"))
        .put("confirmedAt",Instant.now().toString()).put("validUntil",expiry).put("rows",compact)
        .put("readonly",!server.getBoolean("canMark")||!server.getBoolean("teachingDay")||server.getString("state")!="open")
        .put("drafts",prior?.optJSONObject("drafts")?:JSONObject()).put("sync",prior?.optBoolean("sync")?:false)
        .putOpt("inFlight",prior?.optJSONObject("inFlight"))
}
