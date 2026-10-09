package com.wynh.lingomage.auth

import kotlinx.coroutines.async
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Test
import java.net.HttpURLConnection
import java.net.URI

class LoopbackListenerTest {
    @Test fun `loopback ignores unrelated traffic and delivers one validated callback`() = runBlocking {
        val listener = LoopbackListener()
        val attempt = OAuthAttempt(listener.redirectUri, "host", state = "expected")
        assertEquals("127.0.0.1", URI(listener.redirectUri).host)
        val waiting = async(kotlinx.coroutines.Dispatchers.Default) { listener.await(attempt, 5_000) }
        assertEquals(400, get(listener.redirectUri + "?state=wrong&code=secret&client_id=oaiapp_test").first)
        assertFalse(waiting.isCompleted)
        val response = get(listener.redirectUri + "?state=expected&code=secret&client_id=oaiapp_test")
        assertEquals(200, response.first)
        assertFalse(response.second.contains("secret"))
        assertEquals("oaiapp_test", (waiting.await() as CallbackResult.Success).clientId)
        assertClosed(listener.redirectUri)
    }

    @Test fun `timeout and cancellation close the port`() = runBlocking {
        val listener = LoopbackListener()
        try { listener.await(OAuthAttempt(listener.redirectUri, "host"), 10); fail() } catch (_: AuthFailure) { }
        assertClosed(listener.redirectUri)
        val cancelled = LoopbackListener()
        val waiting = async(kotlinx.coroutines.Dispatchers.Default) { cancelled.await(OAuthAttempt(cancelled.redirectUri, "host")) }
        kotlinx.coroutines.delay(50)
        waiting.cancelAndJoin()
        assertClosed(cancelled.redirectUri)
    }

    private fun get(url: String): Pair<Int, String> {
        val connection = URI(url).toURL().openConnection() as HttpURLConnection
        connection.connectTimeout = 1_000
        connection.readTimeout = 2_000
        return try {
            val code = connection.responseCode
            code to (if (code < 400) connection.inputStream else connection.errorStream).bufferedReader().use { it.readText() }
        } finally { connection.disconnect() }
    }
    private fun assertClosed(url: String) {
        try { get(url); fail("Listener should be closed") } catch (_: java.io.IOException) { }
    }
}
