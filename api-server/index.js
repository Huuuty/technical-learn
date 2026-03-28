const pool = require('./db');
const { encrypt, decrypt, getLast4 } = require('./crypto');
const { generateTokens, verifyToken, getExpiryDate, ACCESS_TOKEN_EXPIRES, REFRESH_TOKEN_EXPIRES } = require('./auth');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');

// 简单的请求体解析
function parseBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        req.body = body ? JSON.parse(body) : {};
      } catch (e) {
        req.body = {};
      }
      resolve();
    });
    req.on('error', () => { req.body = {}; resolve(); });
  });
}

// 发送响应
function sendResponse(res, statusCode, headers, data) {
  res.setStatusCode(statusCode);
  if (headers) {
    Object.keys(headers).forEach(key => res.setHeader(key, headers[key]));
  }
  res.send(data);
}

// 认证中间件
async function authMiddleware(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { authorized: false, code: 2001, message: '需要登录' };
  }
  const token = authHeader.slice(7);
  const decoded = verifyToken(token);
  if (!decoded) {
    return { authorized: false, code: 2002, message: 'Token已过期' };
  }
  req.userId = decoded.userId;
  return { authorized: true };
}

// 路由处理
async function handleRequest(req, res) {
  const parsedUrl = require('url').parse(req.url, true);
  const pathname = parsedUrl.pathname;
  req.query = parsedUrl.query;

  const jsonHeaders = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' };

  // CORS 预检
  if (req.method === 'OPTIONS') {
    sendResponse(res, 200, jsonHeaders, '');
    return;
  }

  try {
    await parseBody(req);

    // 健康检查
    if (pathname === '/health') {
      sendResponse(res, 200, jsonHeaders, JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }));
      return;
    }

    // 发送手机验证码
    if (pathname === '/api/auth/phone/send-code' && req.method === 'POST') {
      const { phone } = req.body;
      if (!phone || !/^1[3-9]\d{9}$/.test(phone)) {
        return sendResponse(res, 200, jsonHeaders, JSON.stringify({ code: 1001, message: '无效的手机号' }));
      }
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
      console.log(`[模拟] 发送验证码 ${code} 到 ${phone}`);
      await pool.execute('INSERT INTO sms_verification_codes (phone, code, purpose, expires_at) VALUES (?, ?, ?, ?)', [phone, code, 'login', expiresAt]);
      sendResponse(res, 200, jsonHeaders, JSON.stringify({ code: 0, message: '验证码已发送', data: { expires_in: 300 } }));
      return;
    }

    // 验证码登录
    if (pathname === '/api/auth/phone/verify' && req.method === 'POST') {
      const { phone, code } = req.body;
      if (!phone || !code) return sendResponse(res, 200, jsonHeaders, JSON.stringify({ code: 1001, message: '参数错误' }));
      const [rows] = await pool.execute('SELECT * FROM sms_verification_codes WHERE phone = ? AND code = ? AND purpose = ? AND expires_at > NOW() AND verified_at IS NULL ORDER BY created_at DESC LIMIT 1', [phone, code, 'login']);
      if (rows.length === 0) return sendResponse(res, 200, jsonHeaders, JSON.stringify({ code: 1002, message: '验证码错误或已过期' }));
      await pool.execute('UPDATE sms_verification_codes SET verified_at = NOW() WHERE id = ?', [rows[0].id]);
      let [users] = await pool.execute('SELECT * FROM users WHERE phone = ?', [phone]);
      let user;
      let isNewUser = false;
      if (users.length === 0) {
        const [result] = await pool.execute('INSERT INTO users (phone, nickname) VALUES (?, ?)', [phone, phone.slice(0, 3) + '****' + phone.slice(-4)]);
        user = { id: result.insertId, phone, nickname: phone.slice(0, 3) + '****' + phone.slice(-4) };
        isNewUser = true;
      } else {
        user = users[0];
      }
      await pool.execute('UPDATE users SET last_login_at = NOW() WHERE id = ?', [user.id]);
      const { accessToken, refreshToken } = generateTokens(user.id);
      const expiresAt = getExpiryDate(ACCESS_TOKEN_EXPIRES);
      await pool.execute('INSERT INTO user_sessions (id, user_id, access_token, refresh_token, expires_at) VALUES (?, ?, ?, ?, ?)', [uuidv4(), user.id, accessToken, refreshToken, expiresAt]);
      sendResponse(res, 200, jsonHeaders, JSON.stringify({
        code: 0, message: '登录成功', data: { access_token: accessToken, refresh_token: refreshToken, expires_in: ACCESS_TOKEN_EXPIRES, is_new_user: isNewUser, user: { id: user.id, phone: user.phone.slice(0, 3) + '****' + user.phone.slice(-4), nickname: user.nickname } }
      }));
      return;
    }

    // 微信登录
    if (pathname === '/api/auth/wechat/login' && req.method === 'POST') {
      const { code } = req.body;
      if (!code) return sendResponse(res, 200, jsonHeaders, JSON.stringify({ code: 1001, message: '参数错误' }));
      const openid = 'mock_openid_' + code;
      let [users] = await pool.execute('SELECT * FROM users WHERE wechat_openid = ?', [openid]);
      let user;
      let isNewUser = false;
      if (users.length === 0) {
        const [result] = await pool.execute('INSERT INTO users (wechat_openid, nickname) VALUES (?, ?)', [openid, '微信用户']);
        user = { id: result.insertId, nickname: '微信用户', avatar_url: null };
        isNewUser = true;
      } else {
        user = users[0];
      }
      await pool.execute('UPDATE users SET last_login_at = NOW() WHERE id = ?', [user.id]);
      const { accessToken, refreshToken } = generateTokens(user.id);
      const expiresAt = getExpiryDate(ACCESS_TOKEN_EXPIRES);
      await pool.execute('INSERT INTO user_sessions (id, user_id, access_token, refresh_token, expires_at) VALUES (?, ?, ?, ?, ?)', [uuidv4(), user.id, accessToken, refreshToken, expiresAt]);
      sendResponse(res, 200, jsonHeaders, JSON.stringify({
        code: 0, message: '登录成功', data: { access_token: accessToken, refresh_token: refreshToken, expires_in: ACCESS_TOKEN_EXPIRES, is_new_user: isNewUser, user: { id: user.id, nickname: user.nickname, avatar_url: user.avatar_url } }
      }));
      return;
    }

    // 获取当前用户
    if (pathname === '/api/auth/me' && req.method === 'GET') {
      const auth = await authMiddleware(req);
      if (!auth.authorized) return sendResponse(res, 401, jsonHeaders, JSON.stringify(auth));
      const [users] = await pool.execute('SELECT * FROM users WHERE id = ?', [req.userId]);
      if (users.length === 0) return sendResponse(res, 200, jsonHeaders, JSON.stringify({ code: 4001, message: '用户不存在' }));
      const [apiKeys] = await pool.execute('SELECT * FROM user_api_keys WHERE user_id = ?', [req.userId]);
      const user = users[0];
      sendResponse(res, 200, jsonHeaders, JSON.stringify({
        code: 0, data: { id: user.id, phone: user.phone ? user.phone.slice(0, 3) + '****' + user.phone.slice(-4) : null, nickname: user.nickname, avatar_url: user.avatar_url, has_api_key: apiKeys.length > 0, created_at: user.created_at }
      }));
      return;
    }

    // 退出登录
    if (pathname === '/api/auth/logout' && req.method === 'POST') {
      const auth = await authMiddleware(req);
      if (!auth.authorized) return sendResponse(res, 401, jsonHeaders, JSON.stringify(auth));
      const token = req.headers.authorization.slice(7);
      await pool.execute('DELETE FROM user_sessions WHERE access_token = ?', [token]);
      sendResponse(res, 200, jsonHeaders, JSON.stringify({ code: 0, message: '已退出登录' }));
      return;
    }

    // 获取 API Key 状态
    if (pathname === '/api/user/api-key' && req.method === 'GET') {
      const auth = await authMiddleware(req);
      if (!auth.authorized) return sendResponse(res, 401, jsonHeaders, JSON.stringify(auth));
      const [rows] = await pool.execute('SELECT provider, api_key_last4, is_default, created_at FROM user_api_keys WHERE user_id = ?', [req.userId]);
      if (rows.length === 0) return sendResponse(res, 200, jsonHeaders, JSON.stringify({ code: 0, data: { provider: 'siliconflow', is_default: true } }));
      sendResponse(res, 200, jsonHeaders, JSON.stringify({ code: 0, data: rows[0] }));
      return;
    }

    // 设置 API Key
    if (pathname === '/api/user/api-key' && req.method === 'POST') {
      const auth = await authMiddleware(req);
      if (!auth.authorized) return sendResponse(res, 401, jsonHeaders, JSON.stringify(auth));
      const { provider, api_key } = req.body;
      if (!provider || !api_key) return sendResponse(res, 200, jsonHeaders, JSON.stringify({ code: 1001, message: '参数错误' }));
      const encrypted = encrypt(api_key);
      await pool.execute('DELETE FROM user_api_keys WHERE user_id = ?', [req.userId]);
      await pool.execute('INSERT INTO user_api_keys (user_id, provider, api_key_encrypted, api_key_last4, is_default) VALUES (?, ?, ?, ?, ?)', [req.userId, provider, JSON.stringify(encrypted), getLast4(api_key), false]);
      sendResponse(res, 200, jsonHeaders, JSON.stringify({ code: 0, message: 'API Key 设置成功', data: { provider, api_key_last4: getLast4(api_key), is_default: false } }));
      return;
    }

    // 删除 API Key
    if (pathname === '/api/user/api-key' && req.method === 'DELETE') {
      const auth = await authMiddleware(req);
      if (!auth.authorized) return sendResponse(res, 401, jsonHeaders, JSON.stringify(auth));
      await pool.execute('DELETE FROM user_api_keys WHERE user_id = ?', [req.userId]);
      sendResponse(res, 200, jsonHeaders, JSON.stringify({ code: 0, message: '已删除自定义API Key，将使用默认模型' }));
      return;
    }

    // AI 聊天代理
    if (pathname === '/api/ai/chat' && req.method === 'POST') {
      const auth = await authMiddleware(req);
      if (!auth.authorized) return sendResponse(res, 401, jsonHeaders, JSON.stringify(auth));
      const { messages, temperature = 0.7 } = req.body;
      if (!messages || !Array.isArray(messages)) return sendResponse(res, 200, jsonHeaders, JSON.stringify({ code: 1001, message: '参数错误' }));

      const MODEL_CONFIG = {
        deepseek: { endpoint: 'https://api.deepseek.com/v1/chat/completions', model: 'deepseek-chat' },
        openai: { endpoint: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4o-mini' },
        anthropic: { endpoint: 'https://api.anthropic.com/v1/messages', model: 'claude-3-5-haiku-20241022' },
        siliconflow: { endpoint: 'https://api.siliconflow.cn/v1/chat/completions', model: 'Qwen/Qwen2.5-7B-Instruct' }
      };

      const [rows] = await pool.execute('SELECT provider, api_key_encrypted, is_default FROM user_api_keys WHERE user_id = ?', [req.userId]);
      let aiConfig;

      if (rows.length === 0 || rows[0].is_default) {
        const [configRows] = await pool.execute('SELECT endpoint_url, model_name, api_key_encrypted FROM default_model_config WHERE is_active = TRUE LIMIT 1');
        if (configRows.length === 0) return sendResponse(res, 200, jsonHeaders, JSON.stringify({ code: 3002, message: '未配置默认模型' }));
        const cfg = configRows[0];
        aiConfig = { provider: 'siliconflow', endpoint: cfg.endpoint_url, model: cfg.model_name, apiKey: decrypt(JSON.parse(cfg.api_key_encrypted)) };
      } else {
        const cfg = MODEL_CONFIG[rows[0].provider];
        if (!cfg) return sendResponse(res, 200, jsonHeaders, JSON.stringify({ code: 3002, message: '不支持的AI服务商' }));
        aiConfig = { provider: rows[0].provider, ...cfg, apiKey: decrypt(JSON.parse(rows[0].api_key_encrypted)) };
      }

      try {
        let response;
        if (aiConfig.provider === 'anthropic') {
          response = await axios.post(aiConfig.endpoint, { model: aiConfig.model, messages, max_tokens: 4096 }, { headers: { 'Content-Type': 'application/json', 'x-api-key': aiConfig.apiKey, 'anthropic-version': '2023-06-01' }, timeout: 120000 });
          sendResponse(res, 200, jsonHeaders, JSON.stringify({ code: 0, data: { id: response.data.id, model: response.data.model, choices: [{ message: response.data.content[0], finish_reason: 'stop' }], usage: response.data.usage } }));
        } else {
          response = await axios.post(aiConfig.endpoint, { model: aiConfig.model, messages, temperature }, { headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${aiConfig.apiKey}` }, timeout: 120000 });
          sendResponse(res, 200, jsonHeaders, JSON.stringify({ code: 0, data: response.data }));
        }
      } catch (error) {
        console.error('AI Error:', error.message);
        sendResponse(res, 200, jsonHeaders, JSON.stringify({ code: 3002, message: 'AI服务调用失败', detail: error.response?.data?.error?.message || error.message }));
      }
      return;
    }

    // 404
    sendResponse(res, 404, jsonHeaders, JSON.stringify({ code: 404, message: 'Not Found' }));

  } catch (error) {
    console.error('Server Error:', error.message, error.stack);
    sendResponse(res, 500, jsonHeaders, JSON.stringify({ code: 5001, message: '服务器内部错误: ' + error.message }));
  }
}

// 阿里云函数计算入口
exports.handler = function(request, response, context) {
  handleRequest(request, response);
};
