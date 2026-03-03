import { PBKDF2_ITERATIONS } from './constants';

// --- Helpers: encoding/decoding ---

export function toBase64(buffer: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}

export function fromBase64(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer as ArrayBuffer;
}

export function generateIV(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV for AES-GCM
}

export function generateSalt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(16));
}

// --- RSA Key Import ---

export async function importRSAPublicKey(jwk: JsonWebKey): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false,
    ['encrypt'],
  );
}

export async function importRSAPrivateKey(jwk: JsonWebKey): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false,
    ['decrypt'],
  );
}

// --- PBKDF2 Key Derivation ---

export async function deriveKeyFromPassword(
  password: string,
  salt: ArrayBuffer,
  iterations: number = PBKDF2_ITERATIONS,
): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

// --- AES-256-GCM Encrypt / Decrypt ---

export async function aesEncrypt(
  key: CryptoKey,
  iv: Uint8Array,
  plaintext: string,
): Promise<ArrayBuffer> {
  const encoder = new TextEncoder();
  return crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    encoder.encode(plaintext),
  );
}

export async function aesDecrypt(
  key: CryptoKey,
  iv: ArrayBuffer,
  ciphertext: ArrayBuffer,
): Promise<string> {
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext,
  );
  return new TextDecoder().decode(decrypted);
}

// --- RSA-OAEP Encrypt / Decrypt (for AES key envelope) ---

export async function rsaEncrypt(
  publicKey: CryptoKey,
  data: ArrayBuffer,
): Promise<ArrayBuffer> {
  return crypto.subtle.encrypt({ name: 'RSA-OAEP' }, publicKey, data);
}

export async function rsaDecrypt(
  privateKey: CryptoKey,
  data: ArrayBuffer,
): Promise<ArrayBuffer> {
  return crypto.subtle.decrypt({ name: 'RSA-OAEP' }, privateKey, data);
}

// --- Collection Flow: Hybrid Encrypt (customer form) ---

export interface EncryptionResult {
  card_number_encrypted: string;
  card_exp_encrypted: string;
  aes_iv_number: string;
  aes_iv_exp: string;
  encrypted_envelope: string;
}

export async function encryptCardData(
  rsaPublicKeyJwk: JsonWebKey,
  cardNumber: string,
  cardExp: string,
): Promise<EncryptionResult> {
  const rsaPublicKey = await importRSAPublicKey(rsaPublicKeyJwk);

  // Generate random AES-256 key
  const aesKey = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true, // extractable — we need to wrap it with RSA
    ['encrypt'],
  );

  const ivNumber = generateIV();
  const ivExp = generateIV();

  // Encrypt card fields with AES
  const encryptedNumber = await aesEncrypt(aesKey, ivNumber, cardNumber);
  const encryptedExp = await aesEncrypt(aesKey, ivExp, cardExp);

  // Wrap the AES key with RSA public key
  const rawAesKey = await crypto.subtle.exportKey('raw', aesKey);
  const encryptedEnvelope = await rsaEncrypt(rsaPublicKey, rawAesKey);

  return {
    card_number_encrypted: toBase64(encryptedNumber),
    card_exp_encrypted: toBase64(encryptedExp),
    aes_iv_number: toBase64(ivNumber.buffer as ArrayBuffer),
    aes_iv_exp: toBase64(ivExp.buffer as ArrayBuffer),
    encrypted_envelope: toBase64(encryptedEnvelope),
  };
}

// --- Admin Flow: Decrypt via RSA envelope ---

export async function decryptCardDataWithEnvelope(
  rsaPrivateKey: CryptoKey,
  encryptedEnvelope: string,
  cardNumberEncrypted: string,
  cardExpEncrypted: string,
  ivNumber: string,
  ivExp: string,
): Promise<{ cardNumber: string; cardExp: string }> {
  // Unwrap the AES key from the RSA envelope
  const rawAesKey = await rsaDecrypt(rsaPrivateKey, fromBase64(encryptedEnvelope));

  const aesKey = await crypto.subtle.importKey(
    'raw',
    rawAesKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt'],
  );

  const cardNumber = await aesDecrypt(aesKey, fromBase64(ivNumber), fromBase64(cardNumberEncrypted));
  const cardExp = await aesDecrypt(aesKey, fromBase64(ivExp), fromBase64(cardExpEncrypted));

  return { cardNumber, cardExp };
}

// --- Admin Flow: Decrypt via PBKDF2 (re-encrypted at-rest) ---

export async function decryptCardDataWithPassword(
  password: string,
  salt: string,
  cardNumberEncrypted: string,
  cardExpEncrypted: string,
  ivNumber: string,
  ivExp: string,
): Promise<{ cardNumber: string; cardExp: string }> {
  const aesKey = await deriveKeyFromPassword(password, fromBase64(salt));
  const cardNumber = await aesDecrypt(aesKey, fromBase64(ivNumber), fromBase64(cardNumberEncrypted));
  const cardExp = await aesDecrypt(aesKey, fromBase64(ivExp), fromBase64(cardExpEncrypted));
  return { cardNumber, cardExp };
}

// --- Re-encryption: RSA envelope → PBKDF2 at-rest ---

export interface ReEncryptionResult {
  card_number_encrypted: string;
  card_exp_encrypted: string;
  aes_iv_number: string;
  aes_iv_exp: string;
  aes_salt: string;
}

export async function reEncryptForStorage(
  password: string,
  cardNumber: string,
  cardExp: string,
): Promise<ReEncryptionResult> {
  const salt = generateSalt();
  const ivNumber = generateIV();
  const ivExp = generateIV();

  const aesKey = await deriveKeyFromPassword(password, salt.buffer as ArrayBuffer);
  const encryptedNumber = await aesEncrypt(aesKey, ivNumber, cardNumber);
  const encryptedExp = await aesEncrypt(aesKey, ivExp, cardExp);

  return {
    card_number_encrypted: toBase64(encryptedNumber),
    card_exp_encrypted: toBase64(encryptedExp),
    aes_iv_number: toBase64(ivNumber.buffer as ArrayBuffer),
    aes_iv_exp: toBase64(ivExp.buffer as ArrayBuffer),
    aes_salt: toBase64(salt.buffer as ArrayBuffer),
  };
}

// --- Vault Config: Decrypt RSA private key with master password ---

export async function decryptPrivateKey(
  password: string,
  encryptedPrivateKey: string,
  iv: string,
  salt: string,
  iterations: number = PBKDF2_ITERATIONS,
): Promise<CryptoKey> {
  const wrappingKey = await deriveKeyFromPassword(password, fromBase64(salt), iterations);
  const decryptedJwkBytes = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(iv) },
    wrappingKey,
    fromBase64(encryptedPrivateKey),
  );
  const jwk = JSON.parse(new TextDecoder().decode(decryptedJwkBytes));
  return importRSAPrivateKey(jwk);
}
