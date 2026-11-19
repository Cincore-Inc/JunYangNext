CREATE TABLE IF NOT EXISTS junyang_deleted_companies (
  company_id INT NOT NULL PRIMARY KEY,
  deleted_at DATETIME(6) NOT NULL,
  deleted_by INT NULL
) ENGINE=InnoDB;
