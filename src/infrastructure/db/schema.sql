CREATE TABLE IF NOT EXISTS clients (
  client_id TEXT PRIMARY KEY,
  client_name TEXT,
  redirect_uris JSONB NOT NULL,
  token_endpoint_auth_method TEXT DEFAULT 'none',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS connections (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  config JSONB NOT NULL,
  encrypted_secrets TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY,
  connection_id UUID REFERENCES connections(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL,
  revoked BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS auth_codes (
  code TEXT PRIMARY KEY, -- This will store the hashed authorization code
  connection_id UUID REFERENCES connections(id) ON DELETE CASCADE,
  expires_at TIMESTAMP NOT NULL,
  redirect_uri TEXT,
  client_id TEXT REFERENCES clients(client_id) ON DELETE CASCADE,
  code_challenge TEXT,
  code_challenge_method TEXT
);


CREATE TABLE IF NOT EXISTS cache (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  expires_at TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cache_expires_at ON cache(expires_at);
CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash);

-- User-Bound API Keys
CREATE TABLE IF NOT EXISTS user_configs (
  id UUID PRIMARY KEY,
  server_id TEXT NOT NULL,
  config_enc TEXT NOT NULL,
  config_kid TEXT,
  config_fingerprint TEXT,
  display_name TEXT,
  revoked_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY,
  user_config_id UUID REFERENCES user_configs(id) ON DELETE CASCADE,
  name TEXT,
  key_hash TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP DEFAULT NOW(),
  last_used_at TIMESTAMP,
  revoked_at TIMESTAMP,
  created_ip TEXT,
  last_used_ip TEXT
);

CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_user_configs_server_id ON user_configs(server_id);

CREATE TABLE IF NOT EXISTS api_key_usage_failures (
  id UUID PRIMARY KEY,
  api_key_id UUID REFERENCES api_keys(id) ON DELETE CASCADE,
  failure_at TIMESTAMP DEFAULT NOW(),
  last_used_ip TEXT,
  error TEXT
);

CREATE INDEX IF NOT EXISTS idx_api_key_usage_failures_api_key_id ON api_key_usage_failures(api_key_id);
CREATE INDEX IF NOT EXISTS idx_api_key_usage_failures_failure_at ON api_key_usage_failures(failure_at);
