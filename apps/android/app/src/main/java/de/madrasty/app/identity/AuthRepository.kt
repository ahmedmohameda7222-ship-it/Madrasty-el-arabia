package de.madrasty.app.identity

import android.content.Context
import android.net.Uri
import android.util.Base64
import de.madrasty.app.BuildConfig
import de.madrasty.app.api.decodeData
import de.madrasty.app.api.decodeError
import de.madrasty.app.ui.Persona
import de.madrasty.app.ui.SchoolPartition
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.IOException
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.util.concurrent.TimeUnit
import java.net.URI
import java.security.MessageDigest
import java.security.SecureRandom

data class SchoolSession(
    val actor: SchoolPartition,
    val personas: List<Persona>,
    val assurance: String,
    val expiresAt: String,
)

class HttpFailure(val status: Int, val code: String?) : IOException()

class AuthRepository(context: Context) {
    private val store = SessionStore(context.applicationContext)
    private val mutex = Mutex()
    private val random = SecureRandom()
    private var access: String? = null
    private var applicantAccess: String? = null
    private var active: SchoolSession? = null
    private val apiOrigin = BuildConfig.API_ORIGIN
    private var authConfig: ProviderConfig? = null
    private val http = OkHttpClient.Builder().followRedirects(false).followSslRedirects(false)
        .connectTimeout(8, TimeUnit.SECONDS).callTimeout(15, TimeUnit.SECONDS).build()

    suspend fun requestApplicant(email: String, locale: String) = io {
        exchange("$apiOrigin/api/v1/teacher-applications/registration",
            JSONObject().put("email",email.trim()).put("locale",locale),emptyMap(),decodeApiError=true)
        Unit
    }

    suspend fun applicantSignIn(email: String, password: String) = io {
        val response = providerToken("password",JSONObject().put("email",email.trim()).put("password",password))
        val token = response.getString("access_token")
        api("/teacher-applications/me",token)
        applicantAccess = token
    }

    suspend fun applicantRequest(path: String, body: JSONObject?) = io {
        if (!path.startsWith("/teacher-applications")) throw HttpFailure(403,"forbidden")
        val token = applicantAccess ?: access ?: throw HttpFailure(401,"unauthenticated")
        api(path,token,body)
    }

    suspend fun closeApplicant() = io { applicantAccess = null }
    suspend fun acceptInvite(existing: Boolean, body: JSONObject, idempotencyKey: String) = io {
        val operation = if (existing) "existing" else "activate"
        exchange("$apiOrigin/api/v1/invitations/$operation", body,
            mapOf("Idempotency-Key" to idempotencyKey), decodeApiError = true)
        Unit
    }

    suspend fun signIn(email: String, password: String): SchoolSession = io {
        flushPending()
        val response = providerToken("password", JSONObject().put("email", email.trim()).put("password", password))
        adopt(response)
    }

    suspend fun restore(): SchoolSession? = io {
        flushPending()
        val refresh = store.read("refresh") ?: return@io null
        try {
            adopt(providerToken("refresh_token", JSONObject().put("refresh_token", refresh)))
        } catch (error: HttpFailure) {
            if (error.status == 400 || error.status == 401 || error.status == 403) {
                clearLocal()
                return@io null
            }
            throw error
        }
    }

    suspend fun switchPersona(next: Persona): SchoolSession = io {
        val current = active ?: throw HttpFailure(401, "unauthenticated")
        require(next in current.personas)
        val body = JSONObject().put("persona", next.name.lowercase())
        authenticated("/auth/persona", body, current.actor.persona).let(::parseSchoolSession).also { active = it }
    }

    suspend fun signOut(allDevices: Boolean) = io {
        val token = access
        val ticket = store.read("logout_ticket")
        if (ticket != null) {
            store.write("pending_logout", JSONObject().put("ticket", ticket).put("allDevices", allDevices).toString())
        }
        clearLocal()
        if (token != null) {
            try {
                api("/auth/sign-out", token, JSONObject().put("allDevices", allDevices))
                store.remove("pending_logout")
                return@io
            } catch (_: IOException) {
                // The logout-only ticket remains safe to persist after local credentials are erased.
            }
        }
        flushPending()
    }

    suspend fun retrySignOut() = io { flushPending() }

    private fun flushPending() {
        val pending = store.read("pending_logout") ?: return
        try {
            exchange("$apiOrigin/api/v1/auth/revoke", JSONObject(pending), emptyMap(), decodeApiError = true)
            store.remove("pending_logout")
        } catch (error: HttpFailure) {
            if (error.status == 401) store.remove("pending_logout")
            throw error
        }
    }

    suspend fun request(path: String, body: JSONObject? = null, idempotencyKey: String? = null, method: String = if (body == null) "GET" else "POST"): String = io {
        val current = active ?: throw HttpFailure(401, "unauthenticated")
        authenticated(path, body, current.actor.persona, idempotencyKey, method)
    }

    suspend fun prepareLink(): PkceLink = io {
        val verifier = randomText()
        val state = randomText()
        store.write("pkce", JSONObject().put("verifier", verifier).put("state", state)
            .put("expires", System.currentTimeMillis() + 10 * 60_000).toString())
        val hash = MessageDigest.getInstance("SHA-256").digest(verifier.toByteArray(Charsets.US_ASCII))
        val callback = Uri.parse("$apiOrigin/auth/android/callback").buildUpon().appendQueryParameter("state", state).build()
        PkceLink(callback.toString(), Base64.encodeToString(hash, pkceFlags))
    }

    suspend fun completeLink(uri: Uri): SchoolSession = io {
        val origin = Uri.parse(apiOrigin)
        require(uri.scheme == "https" && uri.authority == origin.authority && uri.path == "/auth/android/callback")
        val pending = store.read("pkce")?.let(::JSONObject) ?: throw HttpFailure(401, "unauthenticated")
        val incoming = uri.getQueryParameter("state") ?: ""
        require(pending.getLong("expires") > System.currentTimeMillis() &&
            MessageDigest.isEqual(pending.getString("state").toByteArray(), incoming.toByteArray()))
        val code = uri.getQueryParameter("code") ?: throw HttpFailure(401, "unauthenticated")
        val response = providerToken("pkce", JSONObject().put("auth_code", code)
            .put("code_verifier", pending.getString("verifier")))
        store.remove("pkce")
        adopt(response)
    }

    data class Enrollment(val id: String, val secret: String)

    suspend fun verifiedFactor() = io {
        val raw = authenticated("/auth/mfa/factors", null, requireNotNull(active).actor.persona)
        decodeData(raw) { payload ->
            val factors = payload as org.json.JSONArray
            (0 until factors.length()).asSequence().map(factors::getJSONObject)
                .firstOrNull { it.getString("status") == "verified" }?.getString("id")
        }.data
    }

    suspend fun enrollFactor(): Enrollment = io {
        val registered = authUser("/factors", JSONObject().put("factor_type", "totp").put("issuer", "Madrasty El Arabia"))
        Enrollment(registered.getString("id"), registered.getJSONObject("totp").getString("secret"))
    }

    suspend fun verifyFactor(id: String, code: String): SchoolSession = io {
        val factorId = java.util.UUID.fromString(id).toString()
        val challenge = authUser("/factors/$factorId/challenge", JSONObject())
        val next = authUser("/factors/$factorId/verify", JSONObject().put("challenge_id", challenge.getString("id")).put("code", code))
        adopt(next)
    }

    suspend fun requestEmailChange(email: String, password: String) = io {
        val current = requireNotNull(active)
        authenticated("/auth/email-change", JSONObject().put("newEmail", email.trim()).put("reauthProof", password),
            current.actor.persona)
        Unit
    }

    private fun authUser(path: String, body: JSONObject): JSONObject {
        val config = getProviderConfig()
        val token = access ?: throw HttpFailure(401, "unauthenticated")
        return JSONObject(exchange("${config.origin}/auth/v1$path", body,
            mapOf("apikey" to config.key, "Authorization" to "Bearer $token"), decodeApiError = false))
    }
    private fun adopt(response: JSONObject): SchoolSession {
        val nextAccess = response.getString("access_token")
        val nextRefresh = response.getString("refresh_token")
        val session = parseSchoolSession(api("/auth/session", nextAccess))
        store.write("refresh", nextRefresh)
        val ticket = decodeData(api("/auth/revocation-ticket", nextAccess, JSONObject())) {
            (it as JSONObject).getString("ticket")
        }.data
        store.write("logout_ticket", ticket)
        access = nextAccess
        active = session
        return session
    }

    private fun authenticated(path: String, body: JSONObject?, persona: Persona, idempotencyKey: String? = null, method: String = if (body == null) "GET" else "POST"): String {
        val token = access ?: throw HttpFailure(401, "unauthenticated")
        return try {
            api(path, token, body, persona, idempotencyKey, method)
        } catch (error: HttpFailure) {
            if (error.status != 401) throw error
            val refresh = store.read("refresh") ?: throw error
            val session = adopt(providerToken("refresh_token", JSONObject().put("refresh_token", refresh)))
            if (session.actor.persona != persona) throw HttpFailure(403, "forbidden")
            api(path, checkNotNull(access), body, persona, idempotencyKey, method)
        }
    }

    private fun api(path: String, token: String, body: JSONObject? = null, persona: Persona? = null, key: String? = null, method: String = if (body == null) "GET" else "POST"): String {
        require(path.startsWith("/") && !path.startsWith("//") && !path.contains(".."))
        val headers = buildMap {
            put("Authorization", "Bearer $token")
            persona?.let { put("X-School-Persona", it.name.lowercase()) }
            key?.let { put("Idempotency-Key", it) }
        }
        return exchange("$apiOrigin/api/v1$path", body, headers, decodeApiError = true, method = method)
    }

    private data class ProviderConfig(val origin: String, val key: String)

    private fun getProviderConfig(): ProviderConfig {
        authConfig?.let { return it }
        val raw = exchange("$apiOrigin/api/v1/auth/config", null, emptyMap(), decodeApiError = true)
        return decodeData(raw) { payload ->
            val settings = payload as JSONObject
            val issuer = URI(settings.getString("origin"))
            val key = settings.getString("publishableKey")
            require(issuer.scheme == "https" && issuer.host != null && issuer.userInfo == null &&
                issuer.rawQuery == null && issuer.rawFragment == null && issuer.path.isEmpty())
            require(key.startsWith("sb_publishable_"))
            ProviderConfig(issuer.toString(), key)
        }.data.also { authConfig = it }
    }

    private fun providerToken(grant: String, body: JSONObject): JSONObject {
        val config = getProviderConfig()
        return JSONObject(exchange("${config.origin}/auth/v1/token?grant_type=$grant", body,
            mapOf("apikey" to config.key), decodeApiError = false))
    }

    private fun exchange(
        url: String, body: JSONObject?, headers: Map<String, String>, decodeApiError: Boolean,
        method: String = if (body == null) "GET" else "POST",
    ): String {
        val request = Request.Builder().url(url).header("Accept", "application/json")
            .method(method, body?.toString()?.toRequestBody("application/json; charset=utf-8".toMediaType()))
            .apply { headers.forEach { (name, value) -> header(name, value) } }.build()
        return http.newCall(request).execute().use { response ->
            if (response.code == 204) return@use ""
            val raw = response.body.string()
            if (!response.isSuccessful) {
                val code = if (decodeApiError) runCatching { decodeError(raw).code }.getOrNull() else null
                throw HttpFailure(response.code, code)
            }
            raw
        }
    }

    private fun clearLocal() {
        active = null
        access = null
        applicantAccess = null
        store.remove("refresh")
        store.remove("logout_ticket")
        store.remove("pkce")
        authConfig = null
    }

    private fun randomText() = Base64.encodeToString(ByteArray(32).also(random::nextBytes), pkceFlags)

    private suspend fun <T> io(work: () -> T): T = withContext(Dispatchers.IO) { mutex.withLock { work() } }

    data class PkceLink(val redirectUrl: String, val challenge: String)

    private companion object {
        const val pkceFlags = Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING
        fun persona(value: String) = Persona.entries.firstOrNull { it.name.equals(value, ignoreCase = true) }
            ?: throw IOException("Unsupported school persona")

        fun parseSchoolSession(json: String): SchoolSession = decodeData(json) { payload ->
            val obj = payload as JSONObject
            val options = obj.getJSONArray("personas")
            val offered = List(options.length()) { persona(options.getString(it)) }
            val current = persona(obj.getString("activePersona"))
            require(current in offered)
            SchoolSession(
                SchoolPartition(obj.getString("accountId"), obj.getString("sessionId"), current),
                offered, obj.getString("assurance"), obj.getString("expiresAt"),
            )
        }.data
    }
}
