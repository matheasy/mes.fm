export type WalletKey = 'ai' | 'mfa';

export const WALLET_KEYS: WalletKey[] = ['ai', 'mfa'];

export const WALLET_LABELS: Record<WalletKey, string> = {
  ai: 'AI Trading',
  mfa: 'MikeFA',
};

export const WALLET_LINKS: Record<WalletKey, string> = {
  ai: '/ai',
  mfa: '/mfa',
};
