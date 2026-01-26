-- Create database for space-api
-- Run this script in MySQL Workbench

-- Create the database (replace 'space_db' with your DB_NAME from .env if different)
CREATE DATABASE IF NOT EXISTS space_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Use the database
USE space_db;

-- Verify the database was created
SHOW DATABASES LIKE 'space_db';
