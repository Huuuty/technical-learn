const express = require('express');
const router = express.Router();
const pool = require('../db');
const { encrypt, decrypt, getLast4 } = require('../crypto');
const { authMiddleware } = require('../middleware');

// 获取用户的 API Key 配置
router.get('/api-key', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT provider, api_key_last4, is_default, created_at FROM user_api_keys WHERE user_id = ?',
      [req.userId]
    );

    if (rows.length === 0) {
      return res.json({
        code: 0,
        data: {
          provider: 'siliconflow',
          is_default: true
        }
      });
    }

    res.json({
      code: 0,
      data: {
        provider: rows[0].provider,
        api_key_last4: rows[0].api_key_last4,
        is_default: rows[0].is_default,
        created_at: rows[0].created_at
      }
    });
  } catch (error) {
    console.error('Get API key error:', error);
    res.status(500).json({ code: 5001, message: '服务器内部错误' });
  }
});

// 设置用户的 API Key
router.post('/api-key', authMiddleware, async (req, res) => {
  try {
    const { provider, api_key } = req.body;
    if (!provider || !api_key) {
      return res.json({ code: 1001, message: '参数错误' });
    }

    // 加密存储
    const encrypted = encrypt(api_key);
    const encryptedJson = JSON.stringify(encrypted);

    // 删除旧记录
    await pool.execute('DELETE FROM user_api_keys WHERE user_id = ?', [req.userId]);

    // 插入新记录
    await pool.execute(
      'INSERT INTO user_api_keys (user_id, provider, api_key_encrypted, api_key_last4, is_default) VALUES (?, ?, ?, ?, ?)',
      [req.userId, provider, encryptedJson, getLast4(api_key), false]
    );

    res.json({
      code: 0,
      message: 'API Key 设置成功',
      data: {
        provider,
        api_key_last4: getLast4(api_key),
        is_default: false
      }
    });
  } catch (error) {
    console.error('Set API key error:', error);
    res.status(500).json({ code: 5001, message: '服务器内部错误' });
  }
});

// 删除用户的 API Key
router.delete('/api-key', authMiddleware, async (req, res) => {
  try {
    await pool.execute('DELETE FROM user_api_keys WHERE user_id = ?', [req.userId]);
    res.json({
      code: 0,
      message: '已删除自定义API Key，将使用默认模型'
    });
  } catch (error) {
    console.error('Delete API key error:', error);
    res.status(500).json({ code: 5001, message: '服务器内部错误' });
  }
});

module.exports = router;
