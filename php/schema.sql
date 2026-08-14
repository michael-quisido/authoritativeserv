CREATE DATABASE IF NOT EXISTS authnamedb CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE authnamedb;

CREATE TABLE IF NOT EXISTS admins (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(64) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS users (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(64) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS url_rules (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  dummy_path VARCHAR(255) NOT NULL UNIQUE,
  real_path VARCHAR(255) NOT NULL UNIQUE,
  associated_user_id INT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_rules_user FOREIGN KEY (associated_user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS verification_codes (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  type ENUM('admin','user') NOT NULL,
  admin_id INT UNSIGNED NULL,
  user_id INT UNSIGNED NULL,
  rule_id INT UNSIGNED NULL,
  code_hash CHAR(64) NOT NULL,
  attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
  expires_at DATETIME NOT NULL,
  used_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_lookup (type, admin_id, user_id, rule_id),
  INDEX idx_expiry (expires_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS email_rate_limits (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  scope_key VARCHAR(255) NOT NULL,
  window_start DATETIME NOT NULL,
  INDEX idx_scope (scope_key, window_start)
) ENGINE=InnoDB;

-- Seed admin: username admin_security / password pass_admin_security7777 / email mike082112@gmail.com
INSERT INTO admins (username, password_hash, email)
VALUES ('admin_security', '$2y$12$RK8WWhxx1RV7uaxe9ke5COJw5fUjafRaP.Z1OHCS.vki9Qnq7XFXi', 'mike082112@gmail.com')
ON DUPLICATE KEY UPDATE username = VALUES(username);
