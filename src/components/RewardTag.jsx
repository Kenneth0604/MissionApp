/** 任務卡片 / 詳情用:顯示這個任務的獎勵是積分、實體獎勵或無獎勵 */
export default function RewardTag({ task, size = 'md' }) {
  const big = size === 'lg'
  if (task.reward_type === 'none') {
    return <span className={`font-medium text-muted ${big ? 'text-base' : 'text-xs'}`}>無獎勵</span>
  }
  if (task.reward_type === 'reward') {
    return (
      <span className={`inline-flex items-center gap-1 font-bold text-accent ${big ? 'text-lg' : 'text-sm'}`}>
        🎁 {task.reward?.name ?? '獎勵'}
      </span>
    )
  }
  return <span className={`font-bold text-primary ${big ? 'text-2xl' : 'text-base'}`}>+{task.reward_points}</span>
}
