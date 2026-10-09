package com.wynh.lingomage.network

import kotlinx.coroutines.runBlocking
import okhttp3.Request
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.Assert.*
import org.junit.Test

class HttpGatewayTest {
    @Test fun `missing content type accepts SSE framing but requires completed inference`() = runBlocking {
        MockWebServer().use { server ->
            server.start()
            val request = Request.Builder().url(server.url("/responses")).build()
            server.enqueue(MockResponse().setBody("data: {\"type\":\"response.output_text.delta\",\"delta\":\"Hello, LingoMage!\"}\n\n" +
                "data: {\"type\":\"response.completed\"}\n\n"))
            assertEquals("Hello, LingoMage!", HttpGateway().textStream(request))
            server.enqueue(MockResponse().setBody("data: {\"type\":\"response.output_text.delta\",\"delta\":\"Partial\"}\n\n"))
            try { HttpGateway().textStream(request); fail() }
            catch (e: ApiFailure) { assertEquals(ApiFailure.Kind.NETWORK, e.kind) }
            server.enqueue(MockResponse().setBody("{\"secret\":\"private\"}"))
            try { HttpGateway().textStream(request); fail() }
            catch (e: ApiFailure) {
                assertTrue(e.userMessage.contains("missing content type"))
                assertFalse(e.userMessage.contains("private"))
            }
        }
    }

    @Test fun `unexpected inference formats expose only status and safe media type`() = runBlocking {
        MockWebServer().use { server ->
            server.start()
            for ((header, safeType) in listOf("application/json" to "application/json", "text/html" to "text/html",
                "application/private-secret" to "other content type")) {
                server.enqueue(MockResponse().addHeader("Content-Type", header).setBody("secret-token"))
                try { HttpGateway().textStream(Request.Builder().url(server.url("/responses")).build()); fail() }
                catch (e: ApiFailure) {
                    assertTrue(e.userMessage.contains("HTTP 200; $safeType"))
                    assertFalse(e.userMessage.contains("secret"))
                }
            }
        }
    }

    @Test fun `classifies auth permission and usage failures without exposing server text`() = runBlocking {
        MockWebServer().use { server ->
            server.start()
            val cases = listOf(401 to ApiFailure.Kind.AUTHENTICATION, 403 to ApiFailure.Kind.PERMISSION, 429 to ApiFailure.Kind.USAGE_LIMIT)
            for ((status, kind) in cases) {
                server.enqueue(MockResponse().setResponseCode(status).setBody("{\"error\":{\"message\":\"secret-token\"}}"))
                try { HttpGateway().json(Request.Builder().url(server.url("/test")).build()); fail() }
                catch (e: ApiFailure) { assertEquals(kind, e.kind); assertFalse(e.message!!.contains("secret-token")) }
            }
        }
    }

    @Test fun `does not follow redirects with bearer credentials`() = runBlocking {
        MockWebServer().use { server ->
            server.start()
            server.enqueue(MockResponse().setResponseCode(302).addHeader("Location", server.url("/leak")))
            try { HttpGateway().json(Request.Builder().url(server.url("/test")).header("Authorization", "Bearer fake").build()); fail() }
            catch (_: ApiFailure) { }
            assertEquals(1, server.requestCount)
        }
    }
}
