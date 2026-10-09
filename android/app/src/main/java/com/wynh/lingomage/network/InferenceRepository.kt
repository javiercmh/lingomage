package com.wynh.lingomage.network

import com.google.gson.JsonArray
import com.google.gson.JsonObject
import com.wynh.lingomage.auth.AuthRepository
import com.wynh.lingomage.auth.AuthenticationRepository
import com.wynh.lingomage.auth.OpenAiAuth
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody

data class ModelChoice(val slug: String, val displayName: String)

interface InferenceRepository {
    suspend fun models(): List<ModelChoice>
    suspend fun check(model: String): String
    suspend fun generate(model: String, instructions: String, input: String): String
}

class OpenAiInferenceRepository(private val http: HttpGateway, private val auth: AuthenticationRepository) : InferenceRepository {
    override suspend fun models(): List<ModelChoice> {
        val credentials = auth.activeRegistration().credentials!!
        val data = http.json(Request.Builder().url("${OpenAiAuth.RESOURCE}/models")
            .header("Authorization", "Bearer ${credentials.accessToken}").build())
        return data.getAsJsonArray("models")?.mapNotNull { item ->
            val model = item.asJsonObject
            if (model.get("visibility")?.asString != "list") null else
                ModelChoice(model.get("slug")?.asString ?: throw HttpGateway.malformed(),
                    model.get("display_name")?.asString ?: throw HttpGateway.malformed())
        }?.takeIf { it.isNotEmpty() } ?: throw ApiFailure(ApiFailure.Kind.PERMISSION, "No available models were returned for this account.")
    }

    override suspend fun check(model: String): String {
        return generate(model, "Follow the user's request precisely.", "Say exactly: Hello, LingoMage!")
    }

    override suspend fun generate(model: String, instructions: String, input: String): String {
        val credentials = auth.activeRegistration().credentials!!
        val messages = JsonArray().apply { add(JsonObject().apply {
            addProperty("role", "user"); addProperty("content", input)
        }) }
        val body = JsonObject().apply {
            addProperty("model", model); add("input", messages)
            addProperty("instructions", instructions)
            addProperty("store", false); addProperty("stream", true)
        }
        return http.textStream(Request.Builder().url("${OpenAiAuth.RESOURCE}/responses")
            .header("Authorization", "Bearer ${credentials.accessToken}")
            .header("Accept", "text/event-stream")
            .post(body.toString().toRequestBody("application/json".toMediaType())).build())
    }
}
