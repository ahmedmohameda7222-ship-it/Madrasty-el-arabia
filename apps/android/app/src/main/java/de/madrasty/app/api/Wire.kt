package de.madrasty.app.api

import org.json.JSONException
import org.json.JSONObject
import java.util.UUID

const val API_VERSION = "v1"

data class WirePage<T>(val data: T, val nextCursor: String?)
data class WireError(
    val code: String,
    val messageKey: String,
    val requestId: UUID,
    val fields: Map<String, String>,
)

fun <T> decodeData(body: String, decode: (Any) -> T): WirePage<T> {
    val envelope = JSONObject(body)
    val nextCursor = if (envelope.has("meta")) {
        val meta = envelope.getJSONObject("meta")
        if (meta.has("nextCursor")) meta.requiredText("nextCursor") else null
    } else null
    return WirePage(decode(envelope.get("data")), nextCursor)
}

fun decodeError(body: String): WireError {
    val failure = JSONObject(body).getJSONObject("error")
    val fields = if (failure.has("fields")) {
        val map = failure.getJSONObject("fields")
        map.keys().asSequence().associateWith { key -> map.requiredText(key) }
    } else emptyMap()

    return WireError(
        code = failure.requiredText("code"),
        messageKey = failure.requiredText("messageKey"),
        requestId = UUID.fromString(failure.requiredText("requestId")),
        fields = fields,
    )
}

fun decodeHealth(data: Any) {
    val health = data as? JSONObject ?: throw JSONException("Invalid health response")
    if (health.requiredText("status") != "ok" || health.requiredText("apiVersion") != API_VERSION) {
        throw JSONException("Unsupported API version")
    }
}

private fun JSONObject.requiredText(key: String): String =
    (get(key) as? String)?.takeIf { it.isNotEmpty() }
        ?: throw JSONException("Invalid string field: $key")
