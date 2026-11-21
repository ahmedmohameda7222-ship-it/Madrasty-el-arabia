package de.madrasty.app.api

import org.json.JSONException
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test
import java.util.UUID

class WireTest {
    @Test
    fun publishedHealthExampleDecodes() {
        val response = """{"data":{"status":"ok","apiVersion":"v1"}}"""
        assertEquals(Unit, decodeData(response, ::decodeHealth).data)
    }

    @Test
    fun incompatibleMajorVersionIsRejected() {
        val response = """{"data":{"status":"ok","apiVersion":"v2"}}"""
        assertThrows(JSONException::class.java) { decodeData(response, ::decodeHealth) }
    }

    @Test
    fun listCursorAndUnknownOptionalFieldsAreHandled() {
        val response = """{"data":"items","meta":{"nextCursor":"next","addedLater":true}}"""
        assertEquals(WirePage("items", "next"), decodeData(response) { it as String })
    }

    @Test
    fun localizedFieldKeysAndRequestIdSurviveDecoding() {
        val id = UUID.fromString("3e4b50ee-8cbf-4b2e-b772-d7a191a45f57")
        val response = """
          {"error":{"code":"validation","requestId":"$id",
          "messageKey":"error.validation","fields":{"email":"error.validation"}}}
        """.trimIndent()
        assertEquals(WireError("validation", "error.validation", id, mapOf("email" to "error.validation")),
            decodeError(response))
    }
}
