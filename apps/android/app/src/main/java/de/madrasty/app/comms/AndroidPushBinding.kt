package de.madrasty.app.comms

import android.Manifest
import android.app.NotificationManager
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.util.Base64
import com.google.android.gms.tasks.Task
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions
import com.google.firebase.messaging.FirebaseMessaging
import de.madrasty.app.api.decodeData
import de.madrasty.app.identity.HttpFailure
import de.madrasty.app.identity.IdentityViewModel
import de.madrasty.app.ui.SchoolPartition
import kotlinx.coroutines.suspendCancellableCoroutine
import org.json.JSONObject
import java.io.IOException
import java.security.MessageDigest
import java.util.UUID
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

private const val CHANNEL_ENDPOINT="/me/push-subscriptions"
private const val CONFIRMATION_INTERVAL=24*60*60*1000L
private fun preferences(context:Context)=context.getSharedPreferences("school-push-binding",Context.MODE_PRIVATE)

internal data class AndroidPushSettings(val projectId:String,val appId:String,val senderId:String,val apiKey:String)
private data class AndroidPushMarker(val owner:String,val confirmedAt:Long)

internal fun androidPushAllowed(context:Context):Boolean{
    val granted=Build.VERSION.SDK_INT<33||context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)==PackageManager.PERMISSION_GRANTED
    return granted&&context.getSystemService(NotificationManager::class.java)?.areNotificationsEnabled()==true
}

private fun installation(context:Context):String=synchronized(AndroidPushSettings::class.java){
    val preference=preferences(context)
    preference.getString("installation",null)?:UUID.randomUUID().toString().also{
        preference.edit().putString("installation",it).apply()
    }
}

private fun ownerStamp(actor:SchoolPartition):String{
    val digest=MessageDigest.getInstance("SHA-256")
        .digest("${actor.accountId}/${actor.sessionId}/${actor.persona.name}".toByteArray(Charsets.UTF_8))
    return Base64.encodeToString(digest,Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING)
}
private fun marker(context:Context):AndroidPushMarker?{
    val prefs=preferences(context)
    val owner=prefs.getString("owner",null)?:return null
    return AndroidPushMarker(owner,prefs.getLong("confirmedAt",0))
}

internal fun currentAndroidDeliveryGuard(context:Context):String?=preferences(context).getString("deliveryGuard",null)
internal fun requireAndroidPushRefresh(context:Context){
    preferences(context).edit().putLong("confirmedAt",0).apply()
}

internal fun detachAndroidPush(context:Context){
    preferences(context).edit().remove("owner").remove("deliveryGuard").remove("confirmedAt").apply()
    context.getSystemService(NotificationManager::class.java)?.cancelAll()
    runCatching{FirebaseMessaging.getInstance().isAutoInitEnabled=false}
}

internal suspend fun androidPushSettings(model:IdentityViewModel):AndroidPushSettings?{
    val data=decodeData(model.schoolRequest(CHANNEL_ENDPOINT)){it as JSONObject}.data
    val android=data.optJSONObject("android")?:return null
    return AndroidPushSettings(android.getString("projectId"),android.getString("firebaseAppId"),
        android.getString("senderId"),android.getString("apiKey"))
}

private fun messaging(context:Context,settings:AndroidPushSettings):FirebaseMessaging=synchronized(FirebaseApp::class.java){
    val current=runCatching{FirebaseApp.getInstance()}.getOrNull()
    if(current!=null&&current.options.applicationId!=settings.appId)throw IOException("Push provider changed")
    if(current==null){
        val options=FirebaseOptions.Builder().setProjectId(settings.projectId).setApplicationId(settings.appId)
            .setGcmSenderId(settings.senderId).setApiKey(settings.apiKey).build()
        FirebaseApp.initializeApp(context.applicationContext,options)
    }
    FirebaseMessaging.getInstance()
}

private suspend fun <T> Task<T>.awaitValue():T=suspendCancellableCoroutine{continuation->
    addOnCompleteListener{task->
        if(task.isSuccessful)continuation.resume(task.result)
        else continuation.resumeWithException(task.exception?:IOException("Push provider unavailable"))
    }
}

internal suspend fun bindAndroidPush(context:Context,model:IdentityViewModel,expected:SchoolPartition,settings:AndroidPushSettings){
    require(androidPushAllowed(context))
    if(model.session?.actor!=expected)throw HttpFailure(403,"forbidden")
    val client=messaging(context,settings)
    val token=client.token.awaitValue()
    if(model.session?.actor!=expected||!androidPushAllowed(context))throw HttpFailure(403,"forbidden")
    val body=JSONObject().put("platform","android").put("installationId",installation(context))
        .put("sessionId",expected.sessionId).put("token",token)
    val data=decodeData(model.schoolRequest(CHANNEL_ENDPOINT,body,"PUT")){it as JSONObject}.data
    if(model.session?.actor!=expected)throw HttpFailure(403,"forbidden")
    val guard=UUID.fromString(data.getString("guard")).toString()
    preferences(context).edit().putString("owner",ownerStamp(expected)).putString("deliveryGuard",guard)
        .putLong("confirmedAt",System.currentTimeMillis()).apply()
    client.isAutoInitEnabled=true
}

internal suspend fun disableAndroidPush(context:Context,model:IdentityViewModel){
    detachAndroidPush(context)
    val body=JSONObject().put("platform","android").put("installationId",installation(context))
    try{model.schoolRequest(CHANNEL_ENDPOINT,body,"DELETE")}
    finally{
        runCatching{FirebaseMessaging.getInstance().deleteToken()}
    }
}

internal suspend fun reconcileAndroidPush(context:Context,model:IdentityViewModel,expected:SchoolPartition):Boolean{
    val stored=marker(context)?:return false
    if(stored.owner!=ownerStamp(expected)){
        detachAndroidPush(context)
        return false
    }
    if(!androidPushAllowed(context)){
        if(model.session?.actor==expected)disableAndroidPush(context,model)
        return false
    }
    return try{
        val status=decodeData(model.schoolRequest("$CHANNEL_ENDPOINT?platform=android&installationId=${installation(context)}")){
            (it as JSONObject).getBoolean("enabled")
        }.data
        if(model.session?.actor!=expected)return false
        if(!status){
            detachAndroidPush(context)
            return false
        }
        if(System.currentTimeMillis()-stored.confirmedAt>=CONFIRMATION_INTERVAL){
            val options=androidPushSettings(model)?:return false
            bindAndroidPush(context,model,expected,options)
        }
        true
    }catch(problem:HttpFailure){
        if(problem.status in listOf(401,403)&&model.session?.actor==expected)detachAndroidPush(context)
        throw problem
    }
}
