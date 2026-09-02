package com.fortunex.app.data.auth

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * AES-GCM with a key that never leaves the Android Keystore.
 *
 * Tokens are not put in SharedPreferences or in a plain DataStore: on a rooted
 * or backed-up device those are a file anyone can read, and a refresh token is
 * good for thirty days. The key here is generated in hardware where the device
 * has it, is not exportable, and dies with the app's data.
 *
 * The IV is generated per encryption and stored in front of the ciphertext —
 * reusing an IV with GCM is a total break of the mode, so it is never fixed.
 */
object Keystore {
    private const val KEY_ALIAS = "fortunex.tokens.v1"
    private const val TRANSFORM = "AES/GCM/NoPadding"
    private const val TAG_BITS = 128
    private const val IV_BYTES = 12

    private fun key(): SecretKey {
        val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (ks.getEntry(KEY_ALIAS, null) as? KeyStore.SecretKeyEntry)?.let { return it.secretKey }

        val gen = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        gen.init(
            KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setRandomizedEncryptionRequired(true)
                .build(),
        )
        return gen.generateKey()
    }

    fun encrypt(plain: String): String {
        val cipher = Cipher.getInstance(TRANSFORM).apply { init(Cipher.ENCRYPT_MODE, key()) }
        val out = cipher.iv + cipher.doFinal(plain.toByteArray())
        return Base64.encodeToString(out, Base64.NO_WRAP)
    }

    /**
     * Null rather than throwing when the blob cannot be read.
     *
     * A key is invalidated by things outside the app's control — a restore onto
     * another device, the user re-enrolling a fingerprint. The right response is
     * to treat the session as gone and ask them to sign in, not to crash on
     * launch with a KeyStoreException nobody can act on.
     */
    fun decrypt(encoded: String): String? = runCatching {
        val raw = Base64.decode(encoded, Base64.NO_WRAP)
        val cipher = Cipher.getInstance(TRANSFORM).apply {
            init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(TAG_BITS, raw, 0, IV_BYTES))
        }
        String(cipher.doFinal(raw, IV_BYTES, raw.size - IV_BYTES))
    }.getOrNull()
}
