import bcrypt from 'bcryptjs';
// Fixed test-only salt allows an HTTP regression for pass-the-hash rejection.
export const adminStoredHash = bcrypt.hashSync('admin123', '$2b$10$abcdefghijklmnopqrstuu');
