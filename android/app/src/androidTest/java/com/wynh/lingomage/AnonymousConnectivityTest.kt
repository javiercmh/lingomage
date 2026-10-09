package com.wynh.lingomage

import androidx.test.ext.junit.runners.AndroidJUnit4
import com.wynh.lingomage.auth.OpenAiAuth
import okhttp3.OkHttpClient
import okhttp3.FormBody
import okhttp3.Request
import org.junit.Assert.fail
import org.junit.Test
import org.junit.runner.RunWith
import java.util.concurrent.TimeUnit

/** Anonymous connectivity only. No account credentials or authorization codes are used. */
@RunWith(AndroidJUnit4::class)
class AnonymousConnectivityTest {
    @Test fun reachesOpenAiDiscoveryOverVerifiedTls() {
        val client = OkHttpClient.Builder().callTimeout(30, TimeUnit.SECONDS).build()
        try {
            client.newCall(Request.Builder().url(OpenAiAuth.DISCOVERY).build()).execute().use { response ->
                if (!response.isSuccessful) fail("Anonymous discovery returned HTTP ${response.code}")
            }
        } catch (e: java.io.IOException) {
            // This request carries no secrets; print only exception types and safe classification.
            val causes = generateSequence<Throwable>(e) { it.cause }.map { it.javaClass.simpleName }.take(5).joinToString(" / ")
            fail("Anonymous discovery connectivity failure: $causes")
        }
    }

    @Test fun tokenEndpointRespondsToAnonymousInvalidGrant() {
        val client = OkHttpClient.Builder().callTimeout(30, TimeUnit.SECONDS).build()
        val form = FormBody.Builder().add("grant_type", "authorization_code")
            .add("client_id", "invalid-connectivity-probe").add("code", "invalid-connectivity-probe")
            .add("code_verifier", "invalid-connectivity-probe").add("resource", OpenAiAuth.RESOURCE)
            .add("redirect_uri", "http://127.0.0.1:1455/auth/callback").build()
        try {
            client.newCall(Request.Builder().url(OpenAiAuth.TOKEN).post(form).build()).execute().use { response ->
                if (response.code !in 400..499) fail("Expected a rejected anonymous probe; HTTP ${response.code}")
            }
        } catch (e: java.io.IOException) {
            val causes = generateSequence<Throwable>(e) { it.cause }.map { it.javaClass.simpleName }.take(5).joinToString(" / ")
            fail("Anonymous token endpoint connectivity failure: $causes")
        }
    }
}
