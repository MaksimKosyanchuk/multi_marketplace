import { config } from 'dotenv';
import { resolve } from 'path';

process.env.NODE_ENV = process.env.NODE_ENV || 'test';
config({ path: resolve(__dirname, '../.env.test') });
config({ path: resolve(__dirname, '../.env') });
