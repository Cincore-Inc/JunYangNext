CREATE TABLE IF NOT EXISTS junyang_deleted_personnel (
  kind VARCHAR(16) NOT NULL,
  record_id INT NOT NULL,
  deleted_at DATETIME(6) NOT NULL,
  deleted_by INT NULL,
  PRIMARY KEY (kind, record_id)
) ENGINE=InnoDB;
