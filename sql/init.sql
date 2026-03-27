-- 技术日知录 数据库初始化脚本
-- 创建数据库
CREATE DATABASE IF NOT EXISTS tech_daily CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE tech_daily;

-- 用户表
CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY COMMENT '用户ID',
  phone VARCHAR(20) UNIQUE COMMENT '手机号',
  wechat_openid VARCHAR(128) UNIQUE COMMENT '微信OpenID',
  wechat_unionid VARCHAR(128) COMMENT '微信UnionID',
  nickname VARCHAR(64) COMMENT '昵称',
  avatar_url VARCHAR(512) COMMENT '头像URL',
  status TINYINT DEFAULT 1 COMMENT '状态: 1正常 0禁用',
  last_login_at DATETIME COMMENT '最后登录时间',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_phone (phone),
  INDEX idx_wechat_openid (wechat_openid),
  INDEX idx_wechat_unionid (wechat_unionid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户表';

-- 用户API Key表（加密存储）
CREATE TABLE IF NOT EXISTS user_api_keys (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL COMMENT '用户ID',
  provider VARCHAR(32) NOT NULL COMMENT '服务商: deepseek/openai/anthropic/siliconflow',
  api_key_encrypted TEXT NOT NULL COMMENT '加密后的API Key',
  api_key_last4 VARCHAR(8) COMMENT 'API Key后4位(用于显示)',
  is_default BOOLEAN DEFAULT FALSE COMMENT '是否使用默认模型',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_id (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户API Key表';

-- 短信验证码表
CREATE TABLE IF NOT EXISTS sms_verification_codes (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  phone VARCHAR(20) NOT NULL COMMENT '手机号',
  code VARCHAR(8) NOT NULL COMMENT '验证码',
  purpose VARCHAR(16) NOT NULL COMMENT '用途: login/bind',
  expires_at DATETIME NOT NULL COMMENT '过期时间',
  verified_at DATETIME COMMENT '验证时间',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_phone_code (phone, code, expires_at),
  INDEX idx_phone_purpose (phone, purpose)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='短信验证码表';

-- 用户会话表
CREATE TABLE IF NOT EXISTS user_sessions (
  id VARCHAR(64) PRIMARY KEY COMMENT 'Session ID',
  user_id BIGINT UNSIGNED NOT NULL COMMENT '用户ID',
  access_token TEXT NOT NULL COMMENT '访问令牌(加密存储)',
  refresh_token VARCHAR(128) COMMENT '刷新令牌',
  expires_at DATETIME NOT NULL COMMENT '过期时间',
  device_info VARCHAR(256) COMMENT '设备信息',
  ip_address VARCHAR(45) COMMENT 'IP地址',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_id (user_id),
  INDEX idx_expires_at (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户会话表';

-- 默认模型配置表
CREATE TABLE IF NOT EXISTS default_model_config (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  provider VARCHAR(32) NOT NULL DEFAULT 'siliconflow' COMMENT '服务商',
  model_name VARCHAR(64) NOT NULL COMMENT '模型名称',
  endpoint_url VARCHAR(256) NOT NULL COMMENT 'API地址',
  api_key_encrypted TEXT NOT NULL COMMENT '默认API Key(加密)',
  is_active BOOLEAN DEFAULT TRUE COMMENT '是否激活',
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='默认模型配置表';

-- 插入硅基流动默认配置
INSERT INTO default_model_config (provider, model_name, endpoint_url, api_key_encrypted, is_active)
VALUES ('siliconflow', 'Qwen/Qwen2.5-7B-Instruct', 'https://api.siliconflow.cn/v1/chat/completions', '', TRUE);
