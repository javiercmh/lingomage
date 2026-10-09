package com.wynh.lingomage

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.wynh.lingomage.auth.AuthFailure
import com.wynh.lingomage.auth.CredentialSnapshot
import com.wynh.lingomage.auth.Credentials
import com.wynh.lingomage.auth.EncryptedCredentialStore
import com.wynh.lingomage.auth.Identity
import com.wynh.lingomage.auth.OpenAiAuth
import com.wynh.lingomage.auth.Registration
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import java.util.UUID

@RunWith(AndroidJUnit4::class)
class CredentialStorageTest {
    @Test fun keystoreRoundTripRotationAndCorruptionRecovery() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        // Test-only key and file: never reset the user's production credentials.
        val name = "credential-test-${UUID.randomUUID()}"
        val store = EncryptedCredentialStore(context, name, name)
        try {
            val hostId = store.read().hostId
            val registration = Registration("issued-test", Identity(OpenAiAuth.ISSUER, "subject", "test@example.com"),
                Credentials("fake-access-secret", "fake-refresh-secret", "fake-id-secret", 3_600_000, OpenAiAuth.scopes))
            store.write(CredentialSnapshot(hostId, listOf(registration), registration.clientId))
            val bytes = File(context.noBackupFilesDir, name).readBytes()
            assertFalse(bytes.toString(Charsets.UTF_8).contains("fake-access-secret"))
            assertFalse(bytes.toString(Charsets.UTF_8).contains("fake-refresh-secret"))
            val restored = EncryptedCredentialStore(context, name, name).read()
            assertEquals(hostId, restored.hostId)
            assertEquals("fake-access-secret", restored.registrations.single().credentials!!.accessToken)
            val updated = Registration(registration.clientId, registration.identity,
                Credentials("next-access", "next-refresh", "fake-id-secret", 7_200_000, OpenAiAuth.scopes))
            store.write(CredentialSnapshot(hostId, listOf(updated), updated.clientId))
            assertEquals("next-refresh", store.read().registrations.single().credentials!!.refreshToken)
            val file = File(context.noBackupFilesDir, name)
            file.writeBytes(file.readBytes().also { it[it.lastIndex] = (it.last().toInt() xor 1).toByte() })
            try { store.read(); fail("Corrupted ciphertext must not load") } catch (_: AuthFailure) { }
            assertTrue(file.exists())
            store.reset()
            assertNotEquals(hostId, store.read().hostId)
        } finally { store.reset() }
    }
}
