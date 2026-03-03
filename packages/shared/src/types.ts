// Database row types

export interface CardVaultRow {
  id: string;
  customer_id: number;
  card_number_encrypted: string;
  card_exp_encrypted: string;
  card_last_four: string;
  card_brand: string | null;
  encrypted_envelope: string | null;
  aes_iv_number: string;
  aes_iv_exp: string;
  aes_salt: string | null;
  encryption_version: number;
  status: 'active' | 'used' | 'archived';
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CardVaultAccessLogRow {
  id: string;
  card_vault_id: string | null;
  action: 'viewed' | 'copied' | 'created' | 'deleted' | 'archived' | 'created_manual_entry';
  performed_by: string;
  performed_by_email: string;
  ip_address: string | null;
  user_agent: string | null;
  accessed_at: string;
}

export interface CardCollectionRequestRow {
  id: string;
  customer_id: number;
  token: string;
  status: 'pending' | 'completed' | 'expired';
  created_by: string | null;
  created_at: string;
  expires_at: string;
  completed_at: string | null;
  pre_auth_amount: number | null;
}

export interface VaultConfigRow {
  id: string;
  rsa_public_key_jwk: string;
  rsa_private_key_encrypted: string;
  rsa_private_key_iv: string;
  rsa_private_key_salt: string;
  pbkdf2_iterations: number;
  created_at: string;
}

export interface VaultUserRow {
  id: string;
  email: string;
  access_level: 'entry_only' | 'full_access';
  created_at: string;
}

// Crypto types

export interface EncryptedCardPayload {
  card_number_encrypted: string;
  card_exp_encrypted: string;
  aes_iv_number: string;
  aes_iv_exp: string;
  encrypted_envelope: string;
  card_last_four: string;
  card_brand: string | null;
}

export interface DecryptedCard {
  card_number: string;
  card_exp: string;
}

// API types

export interface ValidateCardRequest {
  payment_method_id: string;
  amount: number;
}

export interface ValidateCardResponse {
  success: boolean;
  error?: string;
}

export type CardBrand = 'Visa' | 'Mastercard' | 'American Express' | 'Discover' | null;
