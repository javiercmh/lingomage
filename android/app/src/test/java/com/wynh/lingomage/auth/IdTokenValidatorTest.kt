package com.wynh.lingomage.auth

import com.nimbusds.jose.JOSEObjectType
import com.nimbusds.jose.JWSAlgorithm
import com.nimbusds.jose.JWSHeader
import com.nimbusds.jose.crypto.RSASSASigner
import com.nimbusds.jose.jwk.JWKSet
import com.nimbusds.jose.jwk.gen.RSAKeyGenerator
import com.nimbusds.jwt.JWTClaimsSet
import com.nimbusds.jwt.SignedJWT
import org.junit.Assert.*
import org.junit.Test
import java.util.Date

class IdTokenValidatorTest {
    private val now = 1_000_000L
    private val validator = IdTokenValidator { now }

    @Test fun `accepts only a signed identity for the issued audience and nonce`() {
        val identity = validator.validate(token(), "oaiapp_test", "nonce", keys)
        assertEquals("subject", identity.subject)
        assertEquals("test@example.com", identity.email)
    }

    @Test fun `rejects wrong issuer audience expiry nonce and unknown signature key`() {
        assertRejected(token(issuer = "https://evil.example"))
        assertRejected(token(audience = listOf("another-client")))
        assertRejected(token(expiry = now - 1))
        assertRejected(token(nonce = "wrong"))
        assertRejected(token(keyId = "unpublished"))
        assertRejected(token(audience = listOf("oaiapp_test", "other")))
        val wrongKeys = JWKSet(RSAKeyGenerator(2048).keyID("test-key").generate().toPublicJWK())
        try { validator.validate(token(), "oaiapp_test", "nonce", wrongKeys); fail() } catch (_: AuthFailure) { }
    }

    @Test fun `does not accept unsigned JWTs`() {
        assertRejected("eyJhbGciOiJub25lIn0.eyJzdWIiOiJzdWJqZWN0In0.")
    }

    private fun assertRejected(value: String) {
        try { validator.validate(value, "oaiapp_test", "nonce", keys); fail("Expected identity rejection") } catch (_: AuthFailure) { }
    }

    private fun token(issuer: String = OpenAiAuth.ISSUER, audience: List<String> = listOf("oaiapp_test"),
        expiry: Long = now + 60_000, nonce: String = "nonce", keyId: String = "test-key"): String {
        val claims = JWTClaimsSet.Builder().issuer(issuer).subject("subject").audience(audience)
            .expirationTime(Date(expiry)).issueTime(Date(now - 10_000)).claim("nonce", nonce)
            .claim("email", "test@example.com").build()
        return SignedJWT(JWSHeader.Builder(JWSAlgorithm.RS256).type(JOSEObjectType.JWT).keyID(keyId).build(), claims)
            .apply { sign(RSASSASigner(key)) }.serialize()
    }

    companion object {
        private val key = RSAKeyGenerator(2048).keyID("test-key").generate()
        private val keys = JWKSet(key.toPublicJWK())
    }
}
