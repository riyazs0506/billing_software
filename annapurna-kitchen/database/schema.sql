-- ---------------------------------------------------------------------------
-- Annapurna Kitchen - Billing Software
-- MySQL schema (generated from the SQLAlchemy models; keep in sync via
-- `flask --app run:app db migrate`).
--
-- Normal installs should use Alembic:
--     flask --app run:app db upgrade
-- This file exists for DBAs who prefer to create the schema by hand and for
-- reviewing the physical design at a glance.
-- ---------------------------------------------------------------------------

CREATE DATABASE IF NOT EXISTS annapurna_kitchen
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE annapurna_kitchen;

SET FOREIGN_KEY_CHECKS = 0;


-- ----------------------------------------------------------------------
-- categories
-- ----------------------------------------------------------------------
CREATE TABLE categories (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	name VARCHAR(100) NOT NULL, 
	sort_order INTEGER NOT NULL, 
	is_active BOOL NOT NULL, 
	created_at DATETIME NOT NULL, 
	updated_at DATETIME NOT NULL, 
	PRIMARY KEY (id), 
	UNIQUE (name)
)CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX ix_categories_created_at ON categories (created_at);

-- ----------------------------------------------------------------------
-- customers
-- ----------------------------------------------------------------------
CREATE TABLE customers (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	name VARCHAR(100) NOT NULL, 
	phone VARCHAR(15) NOT NULL, 
	loyalty_points INTEGER NOT NULL, 
	note VARCHAR(255), 
	created_at DATETIME NOT NULL, 
	updated_at DATETIME NOT NULL, 
	PRIMARY KEY (id)
)CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX ix_customers_created_at ON customers (created_at);
CREATE UNIQUE INDEX ix_customers_phone ON customers (phone);

-- ----------------------------------------------------------------------
-- discounts
-- ----------------------------------------------------------------------
CREATE TABLE discounts (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	name VARCHAR(80), 
	type ENUM('global','special_date') NOT NULL, 
	percentage NUMERIC(5, 2) NOT NULL, 
	is_active BOOL NOT NULL, 
	start_date DATE, 
	end_date DATE, 
	created_at DATETIME NOT NULL, 
	updated_at DATETIME NOT NULL, 
	PRIMARY KEY (id)
)CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX ix_discounts_created_at ON discounts (created_at);
CREATE INDEX ix_discounts_end_date ON discounts (end_date);
CREATE INDEX ix_discounts_is_active ON discounts (is_active);
CREATE INDEX ix_discounts_start_date ON discounts (start_date);
CREATE INDEX ix_discounts_type ON discounts (type);

-- ----------------------------------------------------------------------
-- raw_materials
-- ----------------------------------------------------------------------
CREATE TABLE raw_materials (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	name VARCHAR(100) NOT NULL, 
	unit ENUM('kg','litre','unit') NOT NULL, 
	current_stock NUMERIC(12, 3) NOT NULL, 
	low_stock_threshold NUMERIC(12, 3) NOT NULL, 
	is_active BOOL NOT NULL, 
	created_at DATETIME NOT NULL, 
	updated_at DATETIME NOT NULL, 
	PRIMARY KEY (id), 
	UNIQUE (name)
)CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX ix_raw_materials_created_at ON raw_materials (created_at);

-- ----------------------------------------------------------------------
-- settings
-- ----------------------------------------------------------------------
CREATE TABLE settings (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	`key` VARCHAR(80) NOT NULL, 
	value TEXT, 
	created_at DATETIME NOT NULL, 
	updated_at DATETIME NOT NULL, 
	PRIMARY KEY (id)
)CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX ix_settings_created_at ON settings (created_at);
CREATE UNIQUE INDEX ix_settings_key ON settings (`key`);

-- ----------------------------------------------------------------------
-- tables
-- ----------------------------------------------------------------------
CREATE TABLE tables (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	table_number VARCHAR(10) NOT NULL, 
	seats INTEGER NOT NULL, 
	status ENUM('empty','occupied','bill_pending') NOT NULL, 
	is_active BOOL NOT NULL, 
	created_at DATETIME NOT NULL, 
	updated_at DATETIME NOT NULL, 
	PRIMARY KEY (id), 
	UNIQUE (table_number)
)CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX ix_tables_created_at ON tables (created_at);
CREATE INDEX ix_tables_status ON tables (status);

-- ----------------------------------------------------------------------
-- users
-- ----------------------------------------------------------------------
CREATE TABLE users (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	name VARCHAR(100) NOT NULL, 
	username VARCHAR(50) NOT NULL, 
	password_hash VARCHAR(255) NOT NULL, 
	`role` ENUM('admin','cashier') NOT NULL, 
	is_active BOOL NOT NULL, 
	created_at DATETIME NOT NULL, 
	updated_at DATETIME NOT NULL, 
	PRIMARY KEY (id)
)CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX ix_users_created_at ON users (created_at);
CREATE INDEX ix_users_role ON users (`role`);
CREATE UNIQUE INDEX ix_users_username ON users (username);

-- ----------------------------------------------------------------------
-- backup_logs
-- ----------------------------------------------------------------------
CREATE TABLE backup_logs (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	filename VARCHAR(255), 
	size_bytes BIGINT, 
	status ENUM('success','failed') NOT NULL, 
	`trigger` VARCHAR(20) NOT NULL, 
	message TEXT, 
	created_by INTEGER, 
	created_at DATETIME NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(created_by) REFERENCES users (id)
)CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX ix_backup_logs_created_at ON backup_logs (created_at);

-- ----------------------------------------------------------------------
-- expenses
-- ----------------------------------------------------------------------
CREATE TABLE expenses (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	description VARCHAR(255) NOT NULL, 
	category VARCHAR(60), 
	amount NUMERIC(10, 2) NOT NULL, 
	date DATE NOT NULL, 
	created_by INTEGER, 
	created_at DATETIME NOT NULL, 
	updated_at DATETIME NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(created_by) REFERENCES users (id)
)CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX ix_expenses_created_at ON expenses (created_at);
CREATE INDEX ix_expenses_date ON expenses (date);

-- ----------------------------------------------------------------------
-- menu_items
-- ----------------------------------------------------------------------
CREATE TABLE menu_items (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	category_id INTEGER NOT NULL, 
	name VARCHAR(150) NOT NULL, 
	description VARCHAR(255), 
	price NUMERIC(10, 2) NOT NULL, 
	is_available BOOL NOT NULL, 
	is_deleted BOOL NOT NULL, 
	created_at DATETIME NOT NULL, 
	updated_at DATETIME NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(category_id) REFERENCES categories (id)
)CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX ix_menu_items_category_id ON menu_items (category_id);
CREATE INDEX ix_menu_items_created_at ON menu_items (created_at);
CREATE INDEX ix_menu_items_is_available ON menu_items (is_available);
CREATE INDEX ix_menu_items_is_deleted ON menu_items (is_deleted);
CREATE INDEX ix_menu_items_name ON menu_items (name);

-- ----------------------------------------------------------------------
-- orders
-- ----------------------------------------------------------------------
CREATE TABLE orders (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	order_number VARCHAR(20) NOT NULL, 
	table_id INTEGER, 
	customer_id INTEGER, 
	order_type ENUM('dine_in','takeaway') NOT NULL, 
	status ENUM('open','kot_sent','billed','paid','merged','cancelled') NOT NULL, 
	created_by INTEGER NOT NULL, 
	note VARCHAR(255), 
	kot_sent_at DATETIME, 
	kot_print_count INTEGER NOT NULL, 
	merged_into_order_id INTEGER, 
	client_uid VARCHAR(64), 
	created_at DATETIME NOT NULL, 
	updated_at DATETIME NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(table_id) REFERENCES tables (id), 
	FOREIGN KEY(customer_id) REFERENCES customers (id), 
	FOREIGN KEY(created_by) REFERENCES users (id), 
	FOREIGN KEY(merged_into_order_id) REFERENCES orders (id)
)CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE UNIQUE INDEX ix_orders_client_uid ON orders (client_uid);
CREATE INDEX ix_orders_created_at ON orders (created_at);
CREATE INDEX ix_orders_created_by ON orders (created_by);
CREATE UNIQUE INDEX ix_orders_order_number ON orders (order_number);
CREATE INDEX ix_orders_status ON orders (status);
CREATE INDEX ix_orders_table_id ON orders (table_id);

-- ----------------------------------------------------------------------
-- shifts
-- ----------------------------------------------------------------------
CREATE TABLE shifts (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	user_id INTEGER NOT NULL, 
	login_time DATETIME NOT NULL, 
	logout_time DATETIME, 
	last_seen_at DATETIME NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
)CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX ix_shifts_login_time ON shifts (login_time);
CREATE INDEX ix_shifts_user_id ON shifts (user_id);

-- ----------------------------------------------------------------------
-- bills
-- ----------------------------------------------------------------------
CREATE TABLE bills (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	bill_number VARCHAR(24) NOT NULL, 
	order_id INTEGER NOT NULL, 
	subtotal NUMERIC(10, 2) NOT NULL, 
	discount_applied NUMERIC(10, 2) NOT NULL, 
	discount_percentage NUMERIC(5, 2) NOT NULL, 
	discount_id INTEGER, 
	discount_label VARCHAR(80), 
	taxable_value NUMERIC(10, 2) NOT NULL, 
	cgst_rate NUMERIC(5, 2) NOT NULL, 
	sgst_rate NUMERIC(5, 2) NOT NULL, 
	cgst NUMERIC(10, 2) NOT NULL, 
	sgst NUMERIC(10, 2) NOT NULL, 
	tax_mode ENUM('exclusive','inclusive') NOT NULL, 
	total NUMERIC(10, 2) NOT NULL, 
	status ENUM('pending','paid','void') NOT NULL, 
	created_by INTEGER NOT NULL, 
	customer_id INTEGER, 
	paid_at DATETIME, 
	client_uid VARCHAR(64), 
	created_at DATETIME NOT NULL, 
	updated_at DATETIME NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(order_id) REFERENCES orders (id), 
	FOREIGN KEY(discount_id) REFERENCES discounts (id), 
	FOREIGN KEY(created_by) REFERENCES users (id), 
	FOREIGN KEY(customer_id) REFERENCES customers (id)
)CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE UNIQUE INDEX ix_bills_bill_number ON bills (bill_number);
CREATE UNIQUE INDEX ix_bills_client_uid ON bills (client_uid);
CREATE INDEX ix_bills_created_at ON bills (created_at);
CREATE INDEX ix_bills_created_by ON bills (created_by);
CREATE INDEX ix_bills_customer_id ON bills (customer_id);
CREATE INDEX ix_bills_order_id ON bills (order_id);
CREATE INDEX ix_bills_paid_at ON bills (paid_at);
CREATE INDEX ix_bills_status ON bills (status);

-- ----------------------------------------------------------------------
-- recipe_yield
-- ----------------------------------------------------------------------
CREATE TABLE recipe_yield (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	menu_item_id INTEGER NOT NULL, 
	raw_material_id INTEGER NOT NULL, 
	min_yield_per_unit NUMERIC(10, 3) NOT NULL, 
	max_yield_per_unit NUMERIC(10, 3) NOT NULL, 
	avg_consumption_per_dish NUMERIC(10, 3) NOT NULL, 
	created_at DATETIME NOT NULL, 
	updated_at DATETIME NOT NULL, 
	PRIMARY KEY (id), 
	CONSTRAINT uq_recipe_pair UNIQUE (menu_item_id, raw_material_id), 
	FOREIGN KEY(menu_item_id) REFERENCES menu_items (id) ON DELETE CASCADE, 
	FOREIGN KEY(raw_material_id) REFERENCES raw_materials (id) ON DELETE CASCADE
)CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX ix_recipe_yield_created_at ON recipe_yield (created_at);
CREATE INDEX ix_recipe_yield_menu_item_id ON recipe_yield (menu_item_id);
CREATE INDEX ix_recipe_yield_raw_material_id ON recipe_yield (raw_material_id);

-- ----------------------------------------------------------------------
-- order_items
-- ----------------------------------------------------------------------
CREATE TABLE order_items (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	order_id INTEGER NOT NULL, 
	menu_item_id INTEGER NOT NULL, 
	quantity INTEGER NOT NULL, 
	price_at_order NUMERIC(10, 2) NOT NULL, 
	note VARCHAR(160), 
	bill_id INTEGER, 
	kot_sent BOOL NOT NULL, 
	is_voided BOOL NOT NULL, 
	created_at DATETIME NOT NULL, 
	updated_at DATETIME NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(order_id) REFERENCES orders (id) ON DELETE CASCADE, 
	FOREIGN KEY(menu_item_id) REFERENCES menu_items (id), 
	FOREIGN KEY(bill_id) REFERENCES bills (id)
)CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX ix_order_items_bill_id ON order_items (bill_id);
CREATE INDEX ix_order_items_created_at ON order_items (created_at);
CREATE INDEX ix_order_items_menu_item_id ON order_items (menu_item_id);
CREATE INDEX ix_order_items_order_id ON order_items (order_id);

-- ----------------------------------------------------------------------
-- payments
-- ----------------------------------------------------------------------
CREATE TABLE payments (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	bill_id INTEGER NOT NULL, 
	mode ENUM('cash','card','upi') NOT NULL, 
	amount NUMERIC(10, 2) NOT NULL, 
	reference VARCHAR(80), 
	tendered NUMERIC(10, 2), 
	change_given NUMERIC(10, 2), 
	created_by INTEGER, 
	created_at DATETIME NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(bill_id) REFERENCES bills (id) ON DELETE CASCADE, 
	FOREIGN KEY(created_by) REFERENCES users (id)
)CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX ix_payments_bill_id ON payments (bill_id);
CREATE INDEX ix_payments_created_at ON payments (created_at);
CREATE INDEX ix_payments_created_by ON payments (created_by);
CREATE INDEX ix_payments_mode ON payments (mode);

-- ----------------------------------------------------------------------
-- stock_movements
-- ----------------------------------------------------------------------
CREATE TABLE stock_movements (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	raw_material_id INTEGER NOT NULL, 
	change_qty NUMERIC(12, 3) NOT NULL, 
	balance_after NUMERIC(12, 3) NOT NULL, 
	reason ENUM('stock_entry','billing_deduction','correction','wastage') NOT NULL, 
	bill_id INTEGER, 
	note VARCHAR(255), 
	created_by INTEGER, 
	created_at DATETIME NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(raw_material_id) REFERENCES raw_materials (id) ON DELETE CASCADE, 
	FOREIGN KEY(bill_id) REFERENCES bills (id), 
	FOREIGN KEY(created_by) REFERENCES users (id)
)CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX ix_stock_movements_bill_id ON stock_movements (bill_id);
CREATE INDEX ix_stock_movements_created_at ON stock_movements (created_at);
CREATE INDEX ix_stock_movements_raw_material_id ON stock_movements (raw_material_id);


SET FOREIGN_KEY_CHECKS = 1;

-- ---------------------------------------------------------------------------
-- Accounts are provisioned by backend/seed.py (or by a DBA). There is no
-- staff-management module in the application, by design.
-- ---------------------------------------------------------------------------
