import sqlite3Pkg from 'sqlite3';
const sqlite3 = sqlite3Pkg.verbose();
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let dbPath = path.resolve(__dirname, 'profiles.db');

// Vercel serverless environment has a read-only filesystem except for /tmp
if (process.env.VERCEL === '1') {
    const tmpDbPath = path.join(os.tmpdir(), 'profiles.db');
    if (!fs.existsSync(tmpDbPath) && fs.existsSync(dbPath)) {
        try {
            fs.copyFileSync(dbPath, tmpDbPath);
        } catch (e) {
            console.error('Error copying db to tmp:', e);
        }
    }
    dbPath = tmpDbPath;
}

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database', err.message);
    }
});

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS profiles (
        id TEXT PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        gender TEXT,
        gender_probability REAL,
        sample_size INTEGER,
        age INTEGER,
        age_group TEXT,
        country_id TEXT,
        country_probability REAL,
        created_at TEXT NOT NULL
    )`);
});

const dbRun = (query, params) => new Promise((resolve, reject) => {
    db.run(query, params, function(err) {
        if (err) reject(err);
        else resolve(this);
    });
});
const dbGet = (query, params) => new Promise((resolve, reject) => {
    db.get(query, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
    });
});
const dbAll = (query, params) => new Promise((resolve, reject) => {
    db.all(query, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
    });
});

export { db, dbRun, dbGet, dbAll };
