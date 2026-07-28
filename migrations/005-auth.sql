-- LumenGallery — Auth: usernames + sessions
-- Adds a username to users and a server-side session table for login cookies.

SET CHARACTER SET utf8mb4;
SET COLLATION_CONNECTION = utf8mb4_unicode_ci;

-- Username for registered accounts (email stays the login identifier too).
-- Nullable so pre-existing anonymous rows remain valid.
ALTER TABLE users
  ADD COLUMN username VARCHAR(32) UNIQUE NULL AFTER email;

-- Server-side sessions. The cookie holds only the opaque id; everything else
-- lives here so a session can be revoked server-side (logout, expiry).
CREATE TABLE IF NOT EXISTS sessions (
  id CHAR(64) PRIMARY KEY,            -- random token (also the cookie value)
  user_id CHAR(36) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_sessions_user (user_id),
  INDEX idx_sessions_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
