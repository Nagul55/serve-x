import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export function normalizeEmail(value = '') {
  return String(value).trim().toLowerCase();
}

export function isValidEmail(value = '') {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value).trim());
}

export function hashToken(value = '') {
  return crypto
    .createHash('sha256')
    .update(`${value}:${env.refreshTokenSecret}`)
    .digest('hex');
}

export function buildAccessJwt({ userId, email, role, jti, sessionId, claims = {} }) {
  return jwt.sign(
    { sub: userId, email, role, jti, sid: sessionId, typ: 'access', ...claims },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn }
  );
}

export function buildRefreshJwt({ userId, email, role, refreshJti, sessionId, claims = {} }) {
  return jwt.sign(
    { sub: userId, email, role, rjti: refreshJti, sid: sessionId, typ: 'refresh', ...claims },
    env.refreshTokenSecret,
    { expiresIn: env.refreshTokenExpiresIn }
  );
}

export function verifyAccessJwt(token) {
  return jwt.verify(token, env.jwtSecret);
}

export function verifyRefreshJwt(token) {
  return jwt.verify(token, env.refreshTokenSecret);
}

export function resolveClientIp(req) {
  const header = req.headers['x-forwarded-for'];
  if (typeof header === 'string' && header.length > 0) {
    return header.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || '';
}
