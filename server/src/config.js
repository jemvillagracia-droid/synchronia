import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, '..', '..');
export const DATA_DIR = process.env.SYNCHRONIA_DATA_DIR || path.join(ROOT, 'data');
export const DB_PATH = process.env.SYNCHRONIA_DB || path.join(DATA_DIR, 'synchronia.db');
export const PORT = Number(process.env.PORT || 4317);
export const IS_PROD = process.env.NODE_ENV === 'production';
export const SESSION_DAYS = 14;
export const APP_NAME = 'SYNCHRONIA';
export const APP_TAGLINE = 'Synchronize. Evolve. Transcend.';
export const APP_VERSION = '0.1.0';
