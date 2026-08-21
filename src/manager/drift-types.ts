/** 一条主题漂移建议（非阻塞 Chip 的数据源）。 */
export interface DriftSuggestion {
  /** 建议的主题名（用户可编辑/确认）。 */
  candidate: string;
  /** 累计漂移分。 */
  score: number;
  /** 触发理由（keyword / path-jump / tool-switch）。 */
  reasons: string[];
  /** 建议唯一标识（客户端用于"已忽略"记忆）。 */
  nonce: string;
  /** 触发事件 seq。 */
  atSeq: number;
}
