-- Initialization script for SmartStock MySQL Database
CREATE DATABASE IF NOT EXISTS smartstock CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Ensure privileges
GRANT ALL PRIVILEGES ON smartstock.* TO 'smartstock_user'@'%';
FLUSH PRIVILEGES;
