// Generated from packages/contracts/openapi.yaml by pnpm generate:contracts.
package de.madrasty.app.navigation

import org.json.JSONObject

internal enum class SchoolResourceKind(val wire: String) {
    NOTICE("notice"),
    THREAD("thread"),
    BROADCAST("broadcast"),
    CHILD("child"),
    ATTENDANCE("attendance"),
    EXAM("exam"),
    EVALUATION("evaluation"),
    ACTIVITY("activity"),
    HOMEWORK("homework"),
    APPLICATION("application"),
    INVOICE("invoice"),
    RECEIPT("receipt"),
    FEE_STOP("fee_stop");

    companion object {
        fun fromWire(wire: String) = entries.first { it.wire == wire }
    }
}

internal data class SchoolResourceLink(
    val kind: SchoolResourceKind,
    val id: String,
    val childId: String? = null,
    val date: String? = null,
) {
    companion object {
        fun fromJson(value: JSONObject): SchoolResourceLink = SchoolResourceLink(
            kind = SchoolResourceKind.fromWire(value.getString("kind")),
            id = value.getString("id"),
            childId = if (value.isNull("childId")) null else value.getString("childId"),
            date = if (value.isNull("date")) null else value.getString("date"),
        )
    }
}

internal data class AndroidClientVersions(
    val minimumVersionCode: Long,
    val suggestedVersionCode: Long,
    val suggestedVersionName: String,
    val downloadUrl: String,
    val sha256: String,
) {
    companion object {
        fun fromJson(value: JSONObject): AndroidClientVersions = AndroidClientVersions(
            minimumVersionCode = value.getLong("minimumVersionCode"),
            suggestedVersionCode = value.getLong("suggestedVersionCode"),
            suggestedVersionName = value.getString("suggestedVersionName"),
            downloadUrl = value.getString("downloadUrl"),
            sha256 = value.getString("sha256"),
        )
    }
}

internal object SchoolOperations {
    const val resolveSchoolResourceLink = "/resource-links/{kind}/{id}"
    const val getClientVersions = "/client-versions"
}
