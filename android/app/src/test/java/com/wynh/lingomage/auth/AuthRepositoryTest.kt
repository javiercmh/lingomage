package com.wynh.lingomage.auth

import com.nimbusds.jose.jwk.JWKSet
import com.wynh.lingomage.network.ApiFailure
import kotlinx.coroutines.async
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout
import okhttp3.HttpUrl.Companion.toHttpUrl
import org.junit.Assert.*
import org.junit.Test

class AuthRepositoryTest {
    @Test fun `callback waits for foreground before exchanging the code`() = runBlocking {
        val api = FakeApi()
        val repo = AuthRepository(MemoryStore(), api, IdTokenValidator(), this)
        repo.state.first { it.phase == AuthPhase.IDLE }
        repo.beginSignIn()
        val authorization = withTimeout(5_000) { repo.browserRequests.receive() }.toHttpUrl()
        val callback = authorization.queryParameter("redirect_uri")!!.toHttpUrl().newBuilder()
            .addQueryParameter("state", authorization.queryParameter("state"))
            .addQueryParameter("code", "test-code")
            .addQueryParameter("client_id", "oaiapp_test")
            .build()
        withContext(Dispatchers.IO) {
            val connection = callback.toUrl().openConnection() as java.net.HttpURLConnection
            connection.connectTimeout = 2_000
            connection.readTimeout = 2_000
            try { assertEquals(200, connection.responseCode) } finally { connection.disconnect() }
        }
        withTimeout(5_000) { repo.state.first { it.phase == AuthPhase.EXCHANGING } }
        assertEquals(0, api.exchanges)
        repo.setForeground(true)
        withTimeout(5_000) { repo.state.first { it.phase == AuthPhase.IDLE } }
        assertEquals(1, api.exchanges)
    }

    @Test fun `concurrent refresh rotates once and preserves other account`() = runBlocking {
        val store = MemoryStore()
        val api = FakeApi()
        val repo = AuthRepository(store, api, IdTokenValidator(), this) { 1_000_000 }
        repo.state.first { it.phase == AuthPhase.IDLE }
        val first = async { repo.activeRegistration() }
        val second = async { repo.activeRegistration() }
        assertEquals("renewed-access", first.await().credentials!!.accessToken)
        assertEquals("rotated-refresh", second.await().credentials!!.refreshToken)
        assertEquals(1, api.refreshes)
        assertEquals("other-access", store.value.registrations[1].credentials!!.accessToken)
        assertEquals("issued-one", store.value.activeClientId)
    }

    @Test fun `logout deletes all selected tokens but retains registration and host`() = runBlocking {
        val store = MemoryStore()
        val api = FakeApi()
        val repo = AuthRepository(store, api, IdTokenValidator(), this)
        repo.state.first { it.phase == AuthPhase.IDLE }
        repo.signOut()
        assertEquals("issued-one", api.revokedClient)
        assertNull(store.value.registrations[0].credentials)
        assertNotNull(store.value.registrations[1].credentials)
        assertEquals("host", store.value.hostId)
        assertEquals("subject-one", store.value.registrations[0].identity.subject)
    }

    @Test fun `failed revocation still removes local tokens and reports unconfirmed remote state`() = runBlocking {
        val store = MemoryStore()
        val repo = AuthRepository(store, FakeApi(failRevoke = true), IdTokenValidator(), this)
        repo.state.first { it.phase == AuthPhase.IDLE }
        assertTrue(repo.signOut().contains("not confirmed"))
        assertNull(store.value.registrations[0].credentials)
    }

    @Test fun `identity scope alone cannot authorize inference`() = runBlocking {
        val store = MemoryStore()
        val old = store.value.registrations[0]
        store.value = CredentialSnapshot("host", listOf(Registration(old.clientId, old.identity,
            Credentials("access", null, "id", Long.MAX_VALUE, setOf("openid")))), old.clientId)
        val api = FakeApi()
        val repo = AuthRepository(store, api, IdTokenValidator(), this)
        repo.state.first { it.phase == AuthPhase.IDLE }
        try { repo.activeRegistration(); fail() } catch (_: AuthFailure) { }
        assertEquals(0, api.refreshes)
    }

    @Test fun `storage failure preserves existing records and exposes recovery`() = runBlocking {
        val store = object : CredentialStore {
            override fun read(): CredentialSnapshot = throw AuthFailure("Cannot unlock")
            override fun write(snapshot: CredentialSnapshot) { fail("Must not overwrite unreadable credentials") }
            override fun reset() { fail("Reset needs explicit user action") }
        }
        val repo = AuthRepository(store, FakeApi(), IdTokenValidator(), this)
        assertTrue(repo.state.first { it.phase == AuthPhase.IDLE }.storageFailed)
    }

    private class MemoryStore : CredentialStore {
        var value = CredentialSnapshot("host", listOf(
            Registration("issued-one", Identity(OpenAiAuth.ISSUER, "subject-one", "same@example.com"),
                Credentials("expired", "refresh", "id", 1, OpenAiAuth.scopes)),
            Registration("issued-two", Identity(OpenAiAuth.ISSUER, "subject-two", "same@example.com"),
                Credentials("other-access", "other-refresh", "id-two", Long.MAX_VALUE, OpenAiAuth.scopes))
        ), "issued-one")
        override fun read() = value
        override fun write(snapshot: CredentialSnapshot) { value = snapshot }
        override fun reset() { }
    }

    private class FakeApi(val failRevoke: Boolean = false) : OAuthApi {
        var refreshes = 0
        var exchanges = 0
        var revokedClient: String? = null
        override suspend fun exchange(attempt: OAuthAttempt, callback: CallbackResult.Success): TokenGrant {
            exchanges++
            throw AuthFailure("Test exchange stopped before credentials are issued")
        }
        override suspend fun refresh(registration: Registration): TokenGrant {
            assertEquals("issued-one", registration.clientId)
            refreshes++
            delay(20)
            return TokenGrant("renewed-access", "rotated-refresh", null, 3_600, null)
        }
        override suspend fun signingKeys(): JWKSet = error("Not used")
        override suspend fun revoke(registration: Registration) {
            revokedClient = registration.clientId
            if (failRevoke) throw ApiFailure(ApiFailure.Kind.PERMISSION, "Revocation denied")
        }
    }
}
