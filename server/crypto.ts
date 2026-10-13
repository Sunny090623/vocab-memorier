import crypto from 'node:crypto';

/**
 * 密码安全加盐哈希：基于 scrypt 原生算法
 * 具备高抗 ASIC/GPU 爆破能力，无需第三方库
 */
export function hashPassword(password: string, customSalt?: string): { hash: string; salt: string } {
  const salt = customSalt || crypto.randomBytes(32).toString('hex');
  const derivedKey = crypto.scryptSync(password, salt, 64);
  return {
    hash: derivedKey.toString('hex'),
    salt,
  };
}

/**
 * 使用 timingSafeEqual 恒定时序核验密码哈希，杜绝时序侧信道攻击
 */
export function verifyPassword(password: string, expectedHash: string, salt: string): boolean {
  try {
    const derivedKey = crypto.scryptSync(password, salt, 64);
    const expectedBuf = Buffer.from(expectedHash, 'hex');
    if (derivedKey.length !== expectedBuf.length) {
      return false;
    }
    return crypto.timingSafeEqual(derivedKey, expectedBuf);
  } catch {
    return false;
  }
}

/**
 * 生成 32 字节高强度随机 Token
 */
export function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * 计算 Token 的 SHA-256 摘要，用于服务端数据库存储与快速哈希索引
 */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

