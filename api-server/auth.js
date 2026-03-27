const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'your-jwt-secret-change-me';
const ACCESS_TOKEN_EXPIRES = parseInt(process.env.ACCESS_TOKEN_EXPIRES) || 604800; // 7天
const REFRESH_TOKEN_EXPIRES = parseInt(process.env.REFRESH_TOKEN_EXPIRES) || 2592000; // 30天

function generateTokens(userId) {
  const accessToken = jwt.sign({ userId }, JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRES });
  const refreshToken = jwt.sign({ userId, type: 'refresh' }, JWT_SECRET, { expiresIn: REFRESH_TOKEN_EXPIRES });
  return { accessToken, refreshToken };
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (e) {
    return null;
  }
}

function getExpiryDate(expiresIn) {
  return new Date(Date.now() + expiresIn * 1000);
}

module.exports = {
  generateTokens,
  verifyToken,
  getExpiryDate,
  ACCESS_TOKEN_EXPIRES,
  REFRESH_TOKEN_EXPIRES
};
