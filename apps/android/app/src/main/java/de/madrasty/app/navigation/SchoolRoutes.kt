package de.madrasty.app.navigation

import android.net.Uri
import de.madrasty.app.BuildConfig
import de.madrasty.app.api.decodeData
import de.madrasty.app.identity.IdentityViewModel
import org.json.JSONObject
import java.time.LocalDate

private val resourceId = Regex("[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}")
private val childKinds = setOf(SchoolResourceKind.ATTENDANCE, SchoolResourceKind.EXAM,
    SchoolResourceKind.EVALUATION, SchoolResourceKind.ACTIVITY, SchoolResourceKind.HOMEWORK)

internal data class PendingSchoolResource(val link: SchoolResourceLink, val accountId: String?)

internal fun schoolResourceFromUri(uri: Uri?): SchoolResourceLink? {
    uri ?: return null
    val school = Uri.parse(BuildConfig.API_ORIGIN)
    if (uri.scheme != "https" || !school.host.equals(uri.host, ignoreCase = true) || school.port != uri.port ||
        uri.userInfo != null || uri.fragment != null) return null
    val parts = uri.pathSegments
    if (parts.firstOrNull() !in listOf("ar", "de")) return null
    if (parts.size == 3 && parts[1] == "open-notice" && uri.queryParameterNames.isEmpty() && resourceId.matches(parts[2])) {
        return SchoolResourceLink(SchoolResourceKind.NOTICE, parts[2])
    }
    if (parts.size != 4 || parts[1] != "open" || !resourceId.matches(parts[3])) return null
    val kind = SchoolResourceKind.entries.firstOrNull { it.wire == parts[2] } ?: return null
    if (uri.queryParameterNames.any { it !in setOf("child","date") } ||
        uri.getQueryParameters("child").size > 1 || uri.getQueryParameters("date").size > 1) return null
    val child = uri.getQueryParameter("child")
    val date = uri.getQueryParameter("date")
    if ((child != null) != (kind in childKinds) || child != null && !resourceId.matches(child) ||
        (date != null) != (kind == SchoolResourceKind.ATTENDANCE) ||
        date != null && (date.length != 10 || runCatching { LocalDate.parse(date) }.isFailure)) return null
    return SchoolResourceLink(kind,parts[3],child,date)
}

internal suspend fun IdentityViewModel.resolveSchoolResource(link: SchoolResourceLink): SchoolResourceLink {
    val query = listOf("child" to link.childId,"date" to link.date).mapNotNull { (key,value) ->
        value?.let { "$key=${Uri.encode(it)}" }
    }.joinToString("&")
    val path = SchoolOperations.resolveSchoolResourceLink.replace("{kind}",link.kind.wire).replace("{id}",link.id)
    val response = schoolRequest(path + if (query.isEmpty()) "" else "?$query")
    return decodeData(response) { SchoolResourceLink.fromJson(it as JSONObject) }.data
}

internal fun SchoolResourceLink.navigationTarget(): JSONObject =
    JSONObject().put("kind",kind.wire).put("id",id).apply {
        childId?.let { put("childId",it) }
        date?.let { put("date",it) }
    }
