-- Script d'initialisation pour MySQL
-- Crée la base et la table `todos`.

CREATE DATABASE IF NOT EXISTS todo_db CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
USE todo_db;

-- Drop the table if it exists (destructive). You asked to change structure even if data is lost.
DROP TABLE IF EXISTS todos;

CREATE TABLE todos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT DEFAULT NULL,
  priority VARCHAR(50) NOT NULL,
  due_date DATE DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_time TIME DEFAULT (CURRENT_TIME())
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

