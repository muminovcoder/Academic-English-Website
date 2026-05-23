'use strict';

const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('localhost')
        ? false
        : { rejectUnauthorized: true }
});

async function initDb() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            username VARCHAR(24) NOT NULL,
            password_hash VARCHAR(255),
            google_id VARCHAR(255),
            email VARCHAR(255),
            display_name VARCHAR(255),
            avatar_url TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CONSTRAINT users_username_unique UNIQUE (username)
        );

        CREATE TABLE IF NOT EXISTS vocabulary_books (
            id SERIAL PRIMARY KEY,
            slug VARCHAR(64) NOT NULL,
            title VARCHAR(255) NOT NULL,
            description TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CONSTRAINT vocabulary_books_slug_unique UNIQUE (slug)
        );

        CREATE TABLE IF NOT EXISTS profiles (
            user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
            username VARCHAR(24) NOT NULL,
            selected_vocabulary_book_id INTEGER REFERENCES vocabulary_books(id),
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
    `);

    await pool.query(`
        ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id VARCHAR(255);
        ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255);
        ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name VARCHAR(255);
        ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
        ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
    `);

    await pool.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS users_google_id_unique
        ON users (google_id) WHERE google_id IS NOT NULL;
    `);

    await pool.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique
        ON users (email) WHERE email IS NOT NULL;
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS user_presence (
            user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
            username VARCHAR(24) NOT NULL,
            last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS user_presence_last_seen_idx ON user_presence (last_seen);
    `);

    await pool.query(
        `INSERT INTO vocabulary_books (slug, title, description)
         VALUES ($1, $2, $3)
         ON CONFLICT (slug) DO NOTHING`,
        [
            'ielts-advanced',
            'Vocabulary for IELTS Advanced',
            'Units 1–10 — academic vocabulary for IELTS Advanced learners.'
        ]
    );
}

module.exports = { pool, initDb };
