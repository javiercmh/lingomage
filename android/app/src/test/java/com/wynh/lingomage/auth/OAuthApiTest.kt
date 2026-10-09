package com.wynh.lingomage.auth

import com.wynh.lingomage.network.ApiFailure
import com.wynh.lingomage.network.HttpGateway
import kotlinx.coroutines.runBlocking
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.Assert.*
import org.junit.Test
import java.net.URLDecoder

class OAuthApiTest {
    @Test fun `code exchange uses issued client PKCE exact URI resource and no secret`() = runBlocking {
        MockWebServer().use { server ->
            server.start()
            server.enqueue(grant())
            val api = api(server)
            val attempt = OAuthAttempt("http://127.0.0.1:54321/auth/callback", "host", verifier = "verifier")
            val result = api.exchange(attempt, CallbackResult.Success("code", "oaiapp_issued"))
            val request = server.takeRequest()
            assertEquals("/api/accounts/oauth/token", request.path)
            val fields = form(request.body.readUtf8())
            assertEquals("oaiapp_issued", fields["client_id"])
            assertEquals(attempt.redirectUri, fields["redirect_uri"])
            assertEquals("verifier", fields["code_verifier"])
            assertEquals(OpenAiAuth.RESOURCE, fields["resource"])
            assertFalse(fields.containsKey("client_secret"))
            assertEquals(OpenAiAuth.scopes, result.scopes)
        }
    }

    @Test fun `refresh uses registration's rotating token and omits scope`() = runBlocking {
        MockWebServer().use { server ->
            server.start(); server.enqueue(grant())
            val saved = Registration("oaiapp_issued", Identity(OpenAiAuth.ISSUER, "subject", null),
                Credentials("access", "rotating-refresh", "id", 1, OpenAiAuth.scopes))
            api(server).refresh(saved)
            val fields = form(server.takeRequest().body.readUtf8())
            assertEquals("refresh_token", fields["grant_type"])
            assertEquals("oaiapp_issued", fields["client_id"])
            assertEquals("rotating-refresh", fields["refresh_token"])
            assertEquals(OpenAiAuth.RESOURCE, fields["resource"])
            assertFalse(fields.containsKey("scope"))
        }
    }

    @Test fun `invalid grant is a recoverable authentication failure`() = runBlocking {
        MockWebServer().use { server ->
            server.start(); server.enqueue(MockResponse().setResponseCode(400).setBody("{\"error\":\"invalid_grant\"}"))
            try {
                api(server).exchange(OAuthAttempt("http://127.0.0.1:1455/auth/callback", "host"), CallbackResult.Success("code", "issued"))
                fail()
            } catch (e: ApiFailure) { assertEquals(ApiFailure.Kind.AUTHENTICATION, e.kind); assertEquals("invalid_grant", e.serviceCode) }
        }
    }

    private fun api(server: MockWebServer) = OpenAiOAuthApi(HttpGateway(OkHttpClient.Builder().addInterceptor { chain ->
        chain.proceed(chain.request().newBuilder().url(server.url(chain.request().url.encodedPath)).build())
    }.build()))

    private fun grant() = MockResponse().setBody("""{"access_token":"access","refresh_token":"refresh","id_token":"id","token_type":"Bearer","expires_in":3600,"scope":"${OpenAiAuth.scopes.joinToString(" ")}"}""")

    private fun form(value: String) = value.split('&').associate {
        val fields = it.split('=', limit = 2)
        URLDecoder.decode(fields[0], "UTF-8") to URLDecoder.decode(fields[1], "UTF-8")
    }
}
