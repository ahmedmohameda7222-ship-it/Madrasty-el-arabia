package de.madrasty.app.comms

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.res.Configuration
import android.net.Uri
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import de.madrasty.app.MainActivity
import de.madrasty.app.R
import java.util.Locale
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update

private const val CHANNEL="school-notices"
private const val PUSH_ACTION="de.madrasty.app.action.OPEN_SCHOOL_NOTICE"
private const val NOTICE="school_notice"
private const val GUARD="school_device_guard"
private val uuid=Regex("^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$")

internal fun isSchoolPushIntent(intent:Intent?)=intent?.action==PUSH_ACTION
internal fun verifiedPushNotice(context:Context,intent:Intent?):String?{
    if(!isSchoolPushIntent(intent))return null
    val guard=intent?.getStringExtra(GUARD)?:return null
    if(guard!=currentAndroidDeliveryGuard(context))return null
    return intent.getStringExtra(NOTICE)?.takeIf(uuid::matches)
}

// Process-local opaque signal only; the foreground UI always rechecks account/persona APIs.
private val pushRevision=MutableStateFlow(0)
internal val schoolPushRevision=pushRevision.asStateFlow()

class SchoolMessagingService:FirebaseMessagingService(){
    @Suppress("DEPRECATION", "OVERRIDE_DEPRECATION")
    override fun onNewToken(token:String){requireAndroidPushRefresh(applicationContext)}

    override fun onMessageReceived(message:RemoteMessage){
        val id=message.data["noticeId"]?.takeIf(uuid::matches)?:return
        val guard=message.data["deviceGuard"]?.takeIf(uuid::matches)?:return
        val locale=message.data["locale"]?.takeIf{it in listOf("ar","de")}?:return
        val context=applicationContext
        if(guard!=currentAndroidDeliveryGuard(context)||!androidPushAllowed(context))return
        pushRevision.update{it+1}
        val configuration=Configuration(resources.configuration).apply{setLocale(Locale.forLanguageTag(locale))}
        val localized=createConfigurationContext(configuration)
        val manager=getSystemService(NotificationManager::class.java)
        val channel=NotificationChannel(CHANNEL,localized.getString(R.string.notices_title),NotificationManager.IMPORTANCE_DEFAULT)
        manager.createNotificationChannel(channel)
        val activity=Intent(context,MainActivity::class.java).apply{
            action=PUSH_ACTION
            data=Uri.parse("madrasty-internal://notice/$id")
            addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP)
            putExtra(NOTICE,id)
            putExtra(GUARD,guard)
        }
        val open=PendingIntent.getActivity(context,0,activity,PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val notice=Notification.Builder(context,CHANNEL).setSmallIcon(R.drawable.ic_bell)
            .setContentTitle(localized.getString(R.string.app_name)).setContentText(localized.getString(R.string.notices_push_generic))
            .setContentIntent(open).setAutoCancel(true).setVisibility(Notification.VISIBILITY_PRIVATE).build()
        if(guard==currentAndroidDeliveryGuard(context))manager.notify("notice-$id",0,notice)
    }
}
