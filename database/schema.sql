SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS audit_log;
DROP TABLE IF EXISTS refresh_tokens;
DROP TABLE IF EXISTS transkrip;
DROP TABLE IF EXISTS nilai;
DROP TABLE IF EXISTS kelas;
DROP TABLE IF EXISTS devices;
DROP TABLE IF EXISTS users;
SET FOREIGN_KEY_CHECKS = 1;

CREATE TABLE users (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  username      VARCHAR(50)  NOT NULL UNIQUE,
  password_hash VARCHAR(100) NOT NULL,
  nama          VARCHAR(100) NOT NULL,
  role          ENUM('mahasiswa','dosen','admin') NOT NULL,
  nim           VARCHAR(20)  NULL UNIQUE
) ENGINE=InnoDB;

CREATE TABLE devices (
  id        INT AUTO_INCREMENT PRIMARY KEY,
  user_id   INT          NOT NULL,
  device_id VARCHAR(100) NOT NULL,
  UNIQUE KEY uq_user_device (user_id, device_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE kelas (
  id       INT AUTO_INCREMENT PRIMARY KEY,
  kode_mk  VARCHAR(20)  NOT NULL,
  nama_mk  VARCHAR(100) NOT NULL,
  dosen_id INT          NOT NULL,
  FOREIGN KEY (dosen_id) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE nilai (
  id       INT AUTO_INCREMENT PRIMARY KEY,
  kelas_id INT          NOT NULL,
  nim      VARCHAR(20)  NOT NULL,
  nilai    DECIMAL(5,2) NULL,
  final    TINYINT(1)   NOT NULL DEFAULT 0,
  UNIQUE KEY uq_kelas_nim (kelas_id, nim),
  FOREIGN KEY (kelas_id) REFERENCES kelas(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE transkrip (
  id       INT AUTO_INCREMENT PRIMARY KEY,
  nim      VARCHAR(20)  NOT NULL,
  kelas_id INT          NOT NULL,
  kode_mk  VARCHAR(20)  NOT NULL,
  nama_mk  VARCHAR(100) NOT NULL,
  nilai    DECIMAL(5,2) NOT NULL,
  huruf    CHAR(2)      NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_nim_kelas (nim, kelas_id)
) ENGINE=InnoDB;

CREATE TABLE refresh_tokens (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  user_id    INT          NOT NULL,
  token_hash CHAR(64)     NOT NULL UNIQUE,
  expires_at DATETIME     NOT NULL,
  revoked    TINYINT(1)   NOT NULL DEFAULT 0,
  created_at TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE audit_log (
  id       BIGINT AUTO_INCREMENT PRIMARY KEY,
  waktu    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  subjek   VARCHAR(100) NOT NULL,
  endpoint VARCHAR(255) NOT NULL,
  device   VARCHAR(100) NULL,
  hasil    ENUM('allow','deny') NOT NULL,
  alasan   VARCHAR(255) NOT NULL
) ENGINE=InnoDB;
