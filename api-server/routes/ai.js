const express = require('express');
const router = express.Router();
const pool = require('../db');
const { decrypt } = require('../crypto');
const { authMiddleware } = require('../middleware');
const axios = require('axios');

// 模型配置
const MODEL_CONFIG = {
  deepseek: {
    endpoint: 'https://api.deepseek.com/v1/chat/completions',
    model: 'deepseek-chat'
  },
  openai: {
    endpoint: 'https://api.openai.com/v1/chat/completions',
    model: 'gpt-4o-mini'
  },
  anthropic: {
    endpoint: 'https://api.anthropic.com/v1/messages',
    model: 'claude-3-5-haiku-20241022'
  },
  siliconflow: {
    endpoint: 'https://api.siliconflow.cn/v1/chat/completions',
    model: 'Qwen/Qwen2.5-7B-Instruct'
  }
};

// 获取用户的 API Key 或默认配置
async function getUserAiConfig(userId) {
  const [rows] = await pool.execute(
    'SELECT provider, api_key_encrypted, is_default FROM user_api_keys WHERE user_id = ?',
    [userId]
  );

  if (rows.length === 0 || rows[0].is_default) {
    // 使用默认模型配置
    const [configRows] = await pool.execute(
      'SELECT endpoint_url, model_name, api_key_encrypted FROM default_model_config WHERE is_active = TRUE LIMIT 1'
    );
    if (configRows.length === 0) {
      throw new Error('未配置默认模型');
    }
    return {
      provider: 'siliconflow',
      endpoint: configRows[0].endpoint_url,
      model: configRows[0].model_name,
      apiKey: decrypt(JSON.parse(configRows[0].api_key_encrypted))
    };
  }

  const config = MODEL_CONFIG[rows[0].provider];
  if (!config) {
    throw new Error('不支持的AI服务商');
  }

  return {
    provider: rows[0].provider,
    endpoint: config.endpoint,
    model: config.model,
    apiKey: decrypt(JSON.parse(rows[0].api_key_encrypted))
  };
}

// AI 聊天代理
router.post('/chat', authMiddleware, async (req, res) => {
  try {
    const { messages, temperature = 0.7, stream = false, provider: customProvider } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.json({ code: 1001, message: '参数错误' });
    }

    // 获取用户配置或默认配置
    let aiConfig;
    if (customProvider) {
      // 用户指定了提供商，使用用户自定义的
      const [rows] = await pool.execute(
        'SELECT provider, api_key_encrypted, is_default FROM user_api_keys WHERE user_id = ?',
        [req.userId]
      );
      if (rows.length > 0 && !rows[0].is_default) {
        aiConfig = {
          provider: rows[0].provider,
          ...MODEL_CONFIG[rows[0].provider],
          apiKey: decrypt(JSON.parse(rows[0].api_key_encrypted))
        };
      } else {
        aiConfig = await getUserAiConfig(req.userId);
      }
    } else {
      aiConfig = await getUserAiConfig(req.userId);
    }

    const { endpoint, model, apiKey } = aiConfig;

    // 根据不同提供商调用 AI
    let response;
    if (aiConfig.provider === 'anthropic') {
      // Anthropic 使用不同的 API 格式
      response = await axios.post(endpoint, {
        model,
        messages,
        max_tokens: 4096
      }, {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        },
        timeout: 120000
      });
      res.json({
        code: 0,
        data: {
          id: response.data.id,
          model: response.data.model,
          choices: [{
            message: response.data.content[0],
            finish_reason: 'stop'
          }],
          usage: response.data.usage
        }
      });
    } else {
      // OpenAI 兼容格式 (DeepSeek, SiliconFlow 等)
      response = await axios.post(endpoint, {
        model,
        messages,
        temperature
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        timeout: 120000
      });
      res.json({
        code: 0,
        data: response.data
      });
    }
  } catch (error) {
    console.error('AI chat error:', error);
    if (error.response) {
      return res.json({ code: 3002, message: 'AI服务调用失败', detail: error.response.data });
    }
    res.status(500).json({ code: 5001, message: '服务器内部错误' });
  }
});

// 流式 AI 聊天代理
router.post('/chat/stream', authMiddleware, async (req, res) => {
  try {
    const { messages, temperature = 0.7, provider: customProvider } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.json({ code: 1001, message: '参数错误' });
    }

    const aiConfig = await getUserAiConfig(req.userId);
    const { endpoint, model, apiKey } = aiConfig;

    // 设置 SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const response = await axios.post(endpoint, {
      model,
      messages,
      temperature,
      stream: true
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      responseType: 'stream',
      timeout: 120000
    });

    response.data.on('data', (chunk) => {
      const lines = chunk.toString().split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') {
            res.write('data: [DONE]\n\n');
          } else {
            res.write(`data: ${data}\n\n`);
          }
        }
      }
    });

    response.data.on('end', () => {
      res.end();
    });

    response.data.on('error', (err) => {
      console.error('Stream error:', err);
      res.end();
    });
  } catch (error) {
    console.error('AI stream error:', error);
    res.json({ code: 3002, message: 'AI服务调用失败' });
  }
});

module.exports = router;
