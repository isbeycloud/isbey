// Set before any dotenv/config or storage module is loaded.
process.env.NODE_ENV = 'production';
await import('../server/index.ts');
