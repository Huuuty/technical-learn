const { verifyToken } = require('./auth');

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ code: 2001, message: '需要登录' });
  }

  const token = authHeader.slice(7);
  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(401).json({ code: 2002, message: 'Token已过期' });
  }

  req.userId = decoded.userId;
  next();
}

module.exports = { authMiddleware };
