INSERT INTO users (id, email, username, password_hash, salt, role, is_active) VALUES
('11111111-1111-1111-1111-111111111111', 'admin@erplite.com', 'admin',
 '$2b$10$X7QRX7QRX7QRX7QRX7QRX7uX7QRX7QRX7QRX7QRX7QRX7QRX7QRX7Q',
 'randomsalt123', 'admin', true),
('22222222-2222-2222-2222-222222222222', 'manager@erplite.com', 'manager',
 '$2b$10$X7QRX7QRX7QRX7QRX7QRX7uX7QRX7QRX7QRX7QRX7QRX7QRX7QRX7Q',
 'randomsalt456', 'inventory_manager', true),
('33333333-3333-3333-3333-333333333333', 'staff@erplite.com', 'staff',
 '$2b$10$X7QRX7QRX7QRX7QRX7QRX7uX7QRX7QRX7QRX7QRX7QRX7QRX7QRX7Q',
 'randomsalt789', 'sales_staff', true);