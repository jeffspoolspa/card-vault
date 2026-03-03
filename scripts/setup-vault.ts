import * as crypto from 'node:crypto';
import * as readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { createClient } from '@supabase/supabase-js';

const PBKDF2_ITERATIONS = 600_000;

async function main() {
  const rl = readline.createInterface({ input: stdin, output: stdout });

  console.log('\n=== Card Vault — Key Generation Setup ===\n');
  console.log('This generates the RSA key pair and encrypts the private key');
  console.log('with your master password. Run this ONCE.\n');
  console.log('WARNING: If you lose the master password, all encrypted cards');
  console.log('become permanently unreadable.\n');

  const supabaseUrl = await rl.question('Supabase URL: ');
  const supabaseServiceKey = await rl.question('Supabase service role key: ');
  const password = await rl.question('Master password: ');
  const confirm = await rl.question('Confirm master password: ');

  if (password !== confirm) {
    console.error('\nPasswords do not match. Aborting.');
    rl.close();
    process.exit(1);
  }

  if (password.length < 12) {
    console.error('\nPassword must be at least 12 characters. Aborting.');
    rl.close();
    process.exit(1);
  }

  rl.close();

  console.log('\nGenerating RSA-2048 key pair...');

  // Generate RSA-OAEP 2048-bit key pair
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'jwk' } as any,
    privateKeyEncoding: { type: 'pkcs8', format: 'jwk' } as any,
  });

  // The JWK objects need RSA-OAEP algorithm hints for Web Crypto compatibility
  const publicJwk = {
    ...(publicKey as any),
    alg: 'RSA-OAEP-256',
    ext: true,
    key_ops: ['encrypt'],
  };

  const privateJwk = {
    ...(privateKey as any),
    alg: 'RSA-OAEP-256',
    ext: true,
    key_ops: ['decrypt'],
  };

  console.log('Deriving wrapping key from password (PBKDF2, 600k iterations)...');

  // Derive wrapping key from master password
  const salt = crypto.randomBytes(16);
  const wrappingKey = crypto.pbkdf2Sync(
    password,
    salt,
    PBKDF2_ITERATIONS,
    32, // 256 bits
    'sha256',
  );

  console.log('Encrypting RSA private key...');

  // Encrypt the private key JWK with AES-256-GCM
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', wrappingKey, iv);

  const privateKeyJson = JSON.stringify(privateJwk);
  const encrypted = Buffer.concat([
    cipher.update(privateKeyJson, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  // Combine ciphertext + auth tag (Web Crypto expects them concatenated)
  const encryptedWithTag = Buffer.concat([encrypted, authTag]);

  console.log('Storing to vault_config in Supabase...');

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { error } = await supabase.from('vault_config').insert({
    rsa_public_key_jwk: JSON.stringify(publicJwk),
    rsa_private_key_encrypted: encryptedWithTag.toString('base64'),
    rsa_private_key_iv: iv.toString('base64'),
    rsa_private_key_salt: salt.toString('base64'),
    pbkdf2_iterations: PBKDF2_ITERATIONS,
  });

  if (error) {
    console.error('\nFailed to insert vault config:', error.message);
    process.exit(1);
  }

  console.log('\n=== Setup Complete ===');
  console.log('RSA public key and encrypted private key stored in vault_config.');
  console.log('Store the master password in a physical safe. There is no recovery.\n');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
