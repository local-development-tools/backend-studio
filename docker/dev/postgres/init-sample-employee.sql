-- Sample schema for development database: sample_employee

CREATE TABLE IF NOT EXISTS departments (
  department_id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  location VARCHAR(120) NOT NULL
);

CREATE TABLE IF NOT EXISTS positions (
  position_id SERIAL PRIMARY KEY,
  title VARCHAR(120) NOT NULL,
  seniority_level VARCHAR(40) NOT NULL,
  min_salary NUMERIC(12,2) NOT NULL,
  max_salary NUMERIC(12,2) NOT NULL,
  CONSTRAINT positions_salary_range_chk CHECK (min_salary <= max_salary)
);

CREATE TABLE IF NOT EXISTS employees (
  employee_id SERIAL PRIMARY KEY,
  department_id INT NOT NULL REFERENCES departments(department_id),
  manager_id INT NULL REFERENCES employees(employee_id),
  first_name VARCHAR(80) NOT NULL,
  last_name VARCHAR(80) NOT NULL,
  email VARCHAR(160) NOT NULL UNIQUE,
  hire_date DATE NOT NULL,
  salary NUMERIC(12,2) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS projects (
  project_id SERIAL PRIMARY KEY,
  department_id INT NOT NULL REFERENCES departments(department_id),
  project_code VARCHAR(32) NOT NULL UNIQUE,
  name VARCHAR(150) NOT NULL,
  budget NUMERIC(14,2) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE,
  status VARCHAR(30) NOT NULL DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS employee_projects (
  employee_id INT NOT NULL REFERENCES employees(employee_id),
  project_id INT NOT NULL REFERENCES projects(project_id),
  project_role VARCHAR(80) NOT NULL,
  allocation_percent INT NOT NULL DEFAULT 100,
  assigned_at TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (employee_id, project_id),
  CONSTRAINT employee_projects_allocation_chk CHECK (allocation_percent BETWEEN 1 AND 100)
);

CREATE TABLE IF NOT EXISTS employee_positions (
  employee_id INT NOT NULL REFERENCES employees(employee_id),
  position_id INT NOT NULL REFERENCES positions(position_id),
  starts_on DATE NOT NULL,
  ends_on DATE,
  PRIMARY KEY (employee_id, position_id, starts_on)
);

CREATE TABLE IF NOT EXISTS payroll (
  payroll_id SERIAL PRIMARY KEY,
  employee_id INT NOT NULL REFERENCES employees(employee_id),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  gross_pay NUMERIC(12,2) NOT NULL,
  bonus NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax_amount NUMERIC(12,2) NOT NULL,
  net_pay NUMERIC(12,2) NOT NULL,
  paid_at DATE,
  CONSTRAINT payroll_period_chk CHECK (period_start <= period_end)
);

CREATE INDEX IF NOT EXISTS idx_employees_department ON employees(department_id);
CREATE INDEX IF NOT EXISTS idx_employees_manager ON employees(manager_id);
CREATE INDEX IF NOT EXISTS idx_projects_department ON projects(department_id);
CREATE INDEX IF NOT EXISTS idx_payroll_employee ON payroll(employee_id);

INSERT INTO departments (name, location)
VALUES
  ('Engineering', 'Warsaw'),
  ('Human Resources', 'Krakow'),
  ('Finance', 'Gdansk')
ON CONFLICT (name) DO NOTHING;

INSERT INTO positions (title, seniority_level, min_salary, max_salary)
VALUES
  ('Software Engineer', 'Mid', 9000, 15000),
  ('Engineering Manager', 'Senior', 16000, 24000),
  ('HR Specialist', 'Mid', 7000, 11000),
  ('Financial Analyst', 'Senior', 10000, 17000)
ON CONFLICT DO NOTHING;

INSERT INTO employees (department_id, manager_id, first_name, last_name, email, hire_date, salary)
VALUES
  ((SELECT department_id FROM departments WHERE name = 'Engineering'), NULL, 'Anna', 'Nowak', 'anna.nowak@example.com', '2021-03-01', 22000),
  ((SELECT department_id FROM departments WHERE name = 'Engineering'), 1, 'Piotr', 'Kowalski', 'piotr.kowalski@example.com', '2022-06-15', 13500),
  ((SELECT department_id FROM departments WHERE name = 'Engineering'), 1, 'Marta', 'Wisniewska', 'marta.wisniewska@example.com', '2023-01-10', 12800),
  ((SELECT department_id FROM departments WHERE name = 'Human Resources'), NULL, 'Ola', 'Zielinska', 'ola.zielinska@example.com', '2020-09-01', 9800),
  ((SELECT department_id FROM departments WHERE name = 'Finance'), NULL, 'Jan', 'Wojcik', 'jan.wojcik@example.com', '2019-11-20', 14500)
ON CONFLICT (email) DO NOTHING;

INSERT INTO projects (department_id, project_code, name, budget, start_date, end_date, status)
VALUES
  ((SELECT department_id FROM departments WHERE name = 'Engineering'), 'ENG-CRM-01', 'CRM Modernization', 650000, '2024-02-01', NULL, 'active'),
  ((SELECT department_id FROM departments WHERE name = 'Engineering'), 'ENG-DATA-02', 'Data Platform Upgrade', 480000, '2024-05-15', NULL, 'active'),
  ((SELECT department_id FROM departments WHERE name = 'Finance'), 'FIN-REP-01', 'Reporting Automation', 210000, '2024-01-10', '2025-01-31', 'completed')
ON CONFLICT (project_code) DO NOTHING;

INSERT INTO employee_projects (employee_id, project_id, project_role, allocation_percent)
VALUES
  ((SELECT employee_id FROM employees WHERE email = 'anna.nowak@example.com'), (SELECT project_id FROM projects WHERE project_code = 'ENG-CRM-01'), 'Sponsor', 20),
  ((SELECT employee_id FROM employees WHERE email = 'piotr.kowalski@example.com'), (SELECT project_id FROM projects WHERE project_code = 'ENG-CRM-01'), 'Backend Developer', 70),
  ((SELECT employee_id FROM employees WHERE email = 'marta.wisniewska@example.com'), (SELECT project_id FROM projects WHERE project_code = 'ENG-DATA-02'), 'Data Engineer', 80),
  ((SELECT employee_id FROM employees WHERE email = 'jan.wojcik@example.com'), (SELECT project_id FROM projects WHERE project_code = 'FIN-REP-01'), 'Business Analyst', 60)
ON CONFLICT (employee_id, project_id) DO NOTHING;

INSERT INTO employee_positions (employee_id, position_id, starts_on, ends_on)
VALUES
  ((SELECT employee_id FROM employees WHERE email = 'anna.nowak@example.com'), (SELECT position_id FROM positions WHERE title = 'Engineering Manager'), '2021-03-01', NULL),
  ((SELECT employee_id FROM employees WHERE email = 'piotr.kowalski@example.com'), (SELECT position_id FROM positions WHERE title = 'Software Engineer'), '2022-06-15', NULL),
  ((SELECT employee_id FROM employees WHERE email = 'marta.wisniewska@example.com'), (SELECT position_id FROM positions WHERE title = 'Software Engineer'), '2023-01-10', NULL),
  ((SELECT employee_id FROM employees WHERE email = 'ola.zielinska@example.com'), (SELECT position_id FROM positions WHERE title = 'HR Specialist'), '2020-09-01', NULL),
  ((SELECT employee_id FROM employees WHERE email = 'jan.wojcik@example.com'), (SELECT position_id FROM positions WHERE title = 'Financial Analyst'), '2019-11-20', NULL)
ON CONFLICT (employee_id, position_id, starts_on) DO NOTHING;

INSERT INTO payroll (employee_id, period_start, period_end, gross_pay, bonus, tax_amount, net_pay, paid_at)
VALUES
  ((SELECT employee_id FROM employees WHERE email = 'piotr.kowalski@example.com'), '2026-03-01', '2026-03-31', 13500, 1200, 2850, 11850, '2026-04-03'),
  ((SELECT employee_id FROM employees WHERE email = 'marta.wisniewska@example.com'), '2026-03-01', '2026-03-31', 12800, 900, 2620, 11080, '2026-04-03'),
  ((SELECT employee_id FROM employees WHERE email = 'jan.wojcik@example.com'), '2026-03-01', '2026-03-31', 14500, 1500, 3200, 12800, '2026-04-03')
ON CONFLICT DO NOTHING;
