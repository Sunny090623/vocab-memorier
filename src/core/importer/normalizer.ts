/**
 * 单词提取与归一化
 * 从输入行中提取英文词目，兼容尾随中文释义或备注，如:
 * "convert（已认识）" -> "convert"
 * "apple, 苹果" -> "apple"
 * "look up - 查阅" -> "look up"
 */
export function extractAndNormalizeWord(line: string): { word: string; note: string } | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) {
    return null;
  }

  // 匹配行首英文单词或短语
  const match = trimmed.match(/^([a-zA-Z\s\-']+)(.*)$/);
  if (!match) {
    return null;
  }

  // 去除单词末尾附带的标点或连字符（如 "look up -" -> "look up"）
  const rawWord = match[1].replace(/[,\s\-:：]+$/, '').trim();
  const rest = match[2].trim();

  if (!rawWord) {
    return null;
  }

  return {
    word: rawWord.toLowerCase(),
    note: rest.replace(/^[,\s\-:：]+/, '').trim(),
  };
}