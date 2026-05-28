// src/providers/encryption/interface.ts
//
// Contract for all encryption provider implementations.
// Both KmsEncryptionProvider (production) and StubEncryptionProvider (dev/test)
// must implement this interface.

export interface IEncryptionProvider {
    /**
     * Encrypt a plaintext string.
     * Returns an opaque ciphertext string that can be stored in the database.
     * Format is provider-specific — never parse it outside this provider.
     */
    encrypt(plaintext: string): Promise<string>;

    /**
     * Decrypt a ciphertext string previously produced by encrypt().
     * Throws if the ciphertext is malformed, tampered, or encrypted with a
     * different key.
     */
    decrypt(ciphertext: string): Promise<string>;

    /**
     * Decrypt then re-encrypt with the current key.
     * Used during key rotation — call this on all stored ciphertexts after
     * a KMS key version change.
     */
    reEncrypt(oldCiphertext: string): Promise<string>;
}
