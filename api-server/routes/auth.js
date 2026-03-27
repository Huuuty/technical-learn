const express = require('express');
const router = express.Router();
const pool = require('../db');
const { encrypt, getLast4 } = require('../crypto');
const { generateTokens, getExpiryDate, ACCESS_TOKEN_EXPIRES, REFRESH_TOKEN_EXPIRES } = require('../auth');
const { authMiddleware } = require('../middleware');
const { v4: uuidv4 } = require('uuid');

// 发送手机验证码
router.post('/phone/send-code', async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone || !/^1[3-9]\d{9}$/.test(phone)) {
      return res.json({ code: 1001, message: '无效的手机号' });
    }

    // 生成6位验证码
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5分钟

    // TODO: 调用阿里云短信服务发送验证码
    // 目前模拟发送
    console.log(`[模拟] 发送验证码 ${code} 到 ${phone}`);

    // 存储验证码
    await pool.execute(
      'INSERT INTO sms_verification_codes (phone, code, purpose, expires_at) VALUES (?, ?, ?, ?)',
      [phone, code, 'login', expiresAt]
    );

    res.json({ code: 0, message: '验证码已发送', data: { expires_in: 300 } });
  } catch (error) {
    console.error('Send code error:', error);
    res.status(500).json({ code: 5001, message: '服务器内部错误' });
  }
});

// 验证码登录
router.post('/phone/verify', async (req, res) => {
  try {
    const { phone, code } = req.body;
    if (!phone || !code) {
      return res.json({ code: 1001, message: '参数错误' });
    }

    // 验证验证码
    const [rows] = await pool.execute(
      'SELECT * FROM sms_verification_codes WHERE phone = ? AND code = ? AND purpose = ? AND expires_at > NOW() AND verified_at IS NULL ORDER BY created_at DESC LIMIT 1',
      [phone, code, 'login']
    );

    if (rows.length === 0) {
      return res.json({ code: 1002, message: '验证码错误或已过期' });
    }

    // 标记验证码已使用
    await pool.execute('UPDATE sms_verification_codes SET verified_at = NOW() WHERE id = ?', [rows[0].id]);

    // 查找或创建用户
    let [users] = await pool.execute('SELECT * FROM users WHERE phone = ?', [phone]);
    let user;
    let isNewUser = false;

    if (users.length === 0) {
      // 创建新用户
      const [result] = await pool.execute(
        'INSERT INTO users (phone, nickname) VALUES (?, ?)',
        [phone, phone.slice(0, 3) + '****' + phone.slice(-4)]
      );
      user = { id: result.insertId, phone, nickname: phone.slice(0, 3) + '****' + phone.slice(-4) };
      isNewUser = true;
    } else {
      user = users[0];
    }

    // 更新最后登录时间
    await pool.execute('UPDATE users SET last_login_at = NOW() WHERE id = ?', [user.id]);

    // 生成Token
    const { accessToken, refreshToken } = generateTokens(user.id);
    const expiresAt = getExpiryDate(ACCESS_TOKEN_EXPIRES);

    // 存储会话
    await pool.execute(
      'INSERT INTO user_sessions (id, user_id, access_token, refresh_token, expires_at) VALUES (?, ?, ?, ?, ?)',
      [uuidv4(), user.id, accessToken, refreshToken, expiresAt]
    );

    res.json({
      code: 0,
      message: '登录成功',
      data: {
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_in: ACCESS_TOKEN_EXPIRES,
        is_new_user: isNewUser,
        user: {
          id: user.id,
          phone: user.phone.slice(0, 3) + '****' + user.phone.slice(-4),
          nickname: user.nickname
        }
      }
    });
  } catch (error) {
    console.error('Verify error:', error);
    res.status(500).json({ code: 5001, message: '服务器内部错误' });
  }
});

// 微信登录
router.post('/wechat/login', async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) {
      return res.json({ code: 1001, message: '参数错误' });
    }

    // TODO: 用code换取openid
    // const openid = await getWechatOpenid(code);
    const openid = 'mock_openid_' + code; // 模拟

    // 查找或创建用户
    let [users] = await pool.execute('SELECT * FROM users WHERE wechat_openid = ?', [openid]);
    let user;
    let isNewUser = false;

    if (users.length === 0) {
      const [result] = await pool.execute(
        'INSERT INTO users (wechat_openid, nickname) VALUES (?, ?)',
        [openid, '微信用户']
      );
      user = { id: result.insertId, nickname: '微信用户', avatar_url: null };
      isNewUser = true;
    } else {
      user = users[0];
    }

    // 更新最后登录时间
    await pool.execute('UPDATE users SET last_login_at = NOW() WHERE id = ?', [user.id]);

    // 生成Token
    const { accessToken, refreshToken } = generateTokens(user.id);
    const expiresAt = getExpiryDate(ACCESS_TOKEN_EXPIRES);

    await pool.execute(
      'INSERT INTO user_sessions (id, user_id, access_token, refresh_token, expires_at) VALUES (?, ?, ?, ?, ?)',
      [uuidv4(), user.id, accessToken, refreshToken, expiresAt]
    );

    res.json({
      code: 0,
      message: '登录成功',
      data: {
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_in: ACCESS_TOKEN_EXPIRES,
        is_new_user: isNewUser,
        user: {
          id: user.id,
          nickname: user.nickname,
          avatar_url: user.avatar_url
        }
      }
    });
  } catch (error) {
    console.error('Wechat login error:', error);
    res.status(500).json({ code: 5001, message: '服务器内部错误' });
  }
});

// 获取当前用户
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const [users] = await pool.execute('SELECT * FROM users WHERE id = ?', [req.userId]);
    if (users.length === 0) {
      return res.json({ code: 4001, message: '用户不存在' });
    }

    const user = users[0];
    const [apiKeys] = await pool.execute('SELECT * FROM user_api_keys WHERE user_id = ?', [req.userId]);

    res.json({
      code: 0,
      data: {
        id: user.id,
        phone: user.phone ? user.phone.slice(0, 3) + '****' + user.phone.slice(-4) : null,
        nickname: user.nickname,
        avatar_url: user.avatar_url,
        has_api_key: apiKeys.length > 0,
        created_at: user.created_at
      }
    });
  } catch (error) {
    console.error('Get me error:', error);
    res.status(500).json({ code: 5001, message: '服务器内部错误' });
  }
});

// 退出登录
router.post('/logout', authMiddleware, async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader.slice(7);
    await pool.execute('DELETE FROM user_sessions WHERE access_token = ?', [token]);
    res.json({ code: 0, message: '已退出登录' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ code: 5001, message: '服务器内部错误' });
  }
});

module.exports = router;
