import type { AssetKind } from '@/lib/types';

export const KIND_LABELS: Record<AssetKind, string> = {
  token: 'Token',
  staked: 'Staked',
  savings: 'Savings',
  reward: 'Rewards',
  lp: 'LP',
  vault: 'Vault',
  perp: 'Perps',
};

/** Tailwind classes for the small type badge */
export const KIND_BADGE: Record<AssetKind, string> = {
  token: 'bg-gray-700/40 text-gray-300',
  staked: 'bg-purple-500/15 text-purple-300',
  savings: 'bg-blue-500/15 text-blue-300',
  reward: 'bg-green-500/15 text-green-300',
  lp: 'bg-orange-500/15 text-orange-300',
  vault: 'bg-teal-500/15 text-teal-300',
  perp: 'bg-yellow-500/15 text-yellow-300',
};

export const CHART_COLORS = ['#f0b90b', '#22c55e', '#3b82f6', '#a855f7', '#ef4444', '#14b8a6', '#f97316', '#eab308', '#ec4899', '#64748b'];
