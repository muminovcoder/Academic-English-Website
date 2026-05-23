'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const { OAuth2Client } = require('google-auth-library');
const { pool } = require('../db');
const { requireAuth } = require('../middleware/auth');
const {
    loadUserPayload,
    toPublicUser,
    signToken,
    uniqueUsername,
    usernameFromEmail
} = require('../lib/userHelpers');

const router = express.Router();

const USERNAME_RE = /^[a-zA-Z0-9_]{3,24}$/;
const PASSWORD_LEN = 8;

function validateUsername(username) {
    if (!username || typeof username !== 'string') return 'Nickname is required.';
    const trimmed = username.trim();
    if (!USERNAME_RE.test(trimmed)) {
        return 'Nickname: 3–24 characters, letters, numbers, underscore only.';
    }
    return null;
}

function validatePassword(password) {
    if (!password || typeof password !== 'string') return 'Password is required.';
    if (password.length !== PASSWORD_LEN) {
        return `Password must be exactly ${PASSWORD_LEN} characters.`;
    }
    return null;
}

function getGoogleClient() {
    const id = process.env.GOOGLE_CLIENT_ID;
    if (!id) return null;
    return new OAuth2Client(id);
}

router.post('/register', async (req, res) => {
    try {
        const username = (req.body.username || '').trim();
        const password = req.body.password || '';

        const userErr = validateUsername(username);
        if (userErr) return res.status(400).json({ error: userErr });
        const passErr = validatePassword(password);
        if (passErr) return res.status(400).json({ error: passErr });

        const passwordHash = await bcrypt.hash(password, 12);

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const userResult = await client.query(
                `INSERT INTO users (username, password_hash)
                 VALUES ($1, $2)
                 RETURNING id, username, created_at`,
                [username.toLowerCase(), passwordHash]
            );

            const user = userResult.rows[0];

            await client.query(
                `INSERT INTO profiles (user_id, username, updated_at)
                 VALUES ($1, $2, NOW())`,
                [user.id, user.username]
            );

            await client.query('COMMIT');

            const full = await loadUserPayload(user.id);
            const token = signToken(full);

            return res.status(201).json({ token, user: toPublicUser(full) });
        } catch (err) {
            await client.query('ROLLBACK');
            if (err.code === '23505') {
                return res.status(409).json({
                    error: 'This nickname is already taken. Choose another one.'
                });
            }
            throw err;
        } finally {
            client.release();
        }
    } catch (err) {
        console.error('register', err);
        return res.status(500).json({ error: 'Could not create account. Try again later.' });
    }
});

router.post('/login', async (req, res) => {
    try {
        const username = (req.body.username || '').trim().toLowerCase();
        const password = req.body.password || '';

        const userErr = validateUsername(username);
        if (userErr) return res.status(400).json({ error: userErr });
        const passErr = validatePassword(password);
        if (passErr) return res.status(400).json({ error: passErr });

        const { rows } = await pool.query(
            `SELECT id, username, password_hash, google_id FROM users WHERE username = $1`,
            [username]
        );

        if (rows.length === 0) {
            return res.status(401).json({ error: 'Invalid nickname or password.' });
        }

        const row = rows[0];

        if (!row.password_hash) {
            return res.status(401).json({
                error: 'This account uses Google sign-in. Click "Connect with Google".'
            });
        }

        const ok = await bcrypt.compare(password, row.password_hash);
        if (!ok) {
            return res.status(401).json({ error: 'Invalid nickname or password.' });
        }

        await pool.query(`UPDATE profiles SET updated_at = NOW() WHERE user_id = $1`, [row.id]);

        const full = await loadUserPayload(row.id);
        const token = signToken(full);

        return res.json({ token, user: toPublicUser(full) });
    } catch (err) {
        console.error('login', err);
        return res.status(500).json({ error: 'Could not sign in. Try again later.' });
    }
});

router.post('/google', async (req, res) => {
    try {
        const credential = req.body.credential;
        if (!credential) {
            return res.status(400).json({ error: 'Google sign-in failed. Try again.' });
        }

        const googleClient = getGoogleClient();
        if (!googleClient) {
            return res.status(503).json({
                error: 'Google sign-in is not configured on the server (GOOGLE_CLIENT_ID missing).'
            });
        }

        const ticket = await googleClient.verifyIdToken({
            idToken: credential,
            audience: process.env.GOOGLE_CLIENT_ID
        });

        const payload = ticket.getPayload();
        const googleId = payload.sub;
        const email = (payload.email || '').toLowerCase();
        const displayName = payload.name || email.split('@')[0] || 'User';
        const avatarUrl = payload.picture || null;

        if (!payload.email_verified) {
            return res.status(400).json({ error: 'Please verify your Google email first.' });
        }

        let userId;

        const byGoogle = await pool.query(`SELECT id FROM users WHERE google_id = $1`, [googleId]);
        if (byGoogle.rows.length > 0) {
            userId = byGoogle.rows[0].id;
            await pool.query(
                `UPDATE users SET email = $1, display_name = $2, avatar_url = $3 WHERE id = $4`,
                [email, displayName, avatarUrl, userId]
            );
        } else if (email) {
            const byEmail = await pool.query(`SELECT id, google_id FROM users WHERE email = $1`, [email]);
            if (byEmail.rows.length > 0) {
                if (byEmail.rows[0].google_id && byEmail.rows[0].google_id !== googleId) {
                    return res.status(409).json({ error: 'This email is linked to another account.' });
                }
                userId = byEmail.rows[0].id;
                await pool.query(
                    `UPDATE users SET google_id = $1, display_name = $2, avatar_url = $3 WHERE id = $4`,
                    [googleId, displayName, avatarUrl, userId]
                );
            }
        }

        if (!userId) {
            const base = usernameFromEmail(email, googleId);
            const username = await uniqueUsername(base);

            const client = await pool.connect();
            try {
                await client.query('BEGIN');
                const inserted = await client.query(
                    `INSERT INTO users (username, password_hash, google_id, email, display_name, avatar_url)
                     VALUES ($1, NULL, $2, $3, $4, $5)
                     RETURNING id`,
                    [username, googleId, email, displayName, avatarUrl]
                );
                userId = inserted.rows[0].id;
                await client.query(
                    `INSERT INTO profiles (user_id, username, updated_at) VALUES ($1, $2, NOW())`,
                    [userId, username]
                );
                await client.query('COMMIT');
            } catch (err) {
                await client.query('ROLLBACK');
                throw err;
            } finally {
                client.release();
            }
        }

        await pool.query(`UPDATE profiles SET updated_at = NOW() WHERE user_id = $1`, [userId]);

        const full = await loadUserPayload(userId);
        const token = signToken(full);

        return res.json({ token, user: toPublicUser(full) });
    } catch (err) {
        console.error('google auth', err);
        return res.status(401).json({ error: 'Google sign-in could not be verified. Try again.' });
    }
});

router.get('/me', requireAuth, async (req, res) => {
    try {
        const full = await loadUserPayload(req.user.id);
        if (!full) return res.status(404).json({ error: 'User not found.' });
        return res.json({ user: toPublicUser(full) });
    } catch (err) {
        console.error('me', err);
        return res.status(500).json({ error: 'Could not load profile.' });
    }
});

module.exports = router;
