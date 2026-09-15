import { describe, it, expect } from 'vitest'
import { otherUser, isTodoFor, isReviewer, reviewerOf, isDaily, canHelp, isHelped, STATUS_LABEL, REDEMPTION_LABEL } from './store.jsx'

const task = (extra = {}) => ({ id: 't', status: 'pending', assigned_to: 'A', shared: false, completed_by: null, recurrence_rule: null, ...extra })

describe('otherUser', () => {
  it('A ↔ B 互換', () => {
    expect(otherUser('A')).toBe('B')
    expect(otherUser('B')).toBe('A')
  })
})

describe('isTodoFor', () => {
  it('指派給我且未完成 → 是我的待辦', () => {
    expect(isTodoFor(task({ assigned_to: 'A', status: 'pending' }), 'A')).toBe(true)
    expect(isTodoFor(task({ assigned_to: 'A', status: 'rejected' }), 'A')).toBe(true)
  })
  it('指派給對方 → 不是我的待辦;共同任務兩人都是', () => {
    expect(isTodoFor(task({ assigned_to: 'B' }), 'A')).toBe(false)
    expect(isTodoFor(task({ shared: true, assigned_to: null }), 'A')).toBe(true)
    expect(isTodoFor(task({ shared: true, assigned_to: null }), 'B')).toBe(true)
  })
  it('已送審 / 已核准不算待辦', () => {
    expect(isTodoFor(task({ status: 'submitted' }), 'A')).toBe(false)
    expect(isTodoFor(task({ status: 'approved' }), 'A')).toBe(false)
  })
})

describe('isReviewer / reviewerOf', () => {
  it('待審核且完成者不是我 → 我是審核者', () => {
    expect(isReviewer(task({ status: 'submitted', completed_by: 'B' }), 'A')).toBe(true)
    expect(isReviewer(task({ status: 'submitted', completed_by: 'A' }), 'A')).toBe(false)
    expect(isReviewer(task({ status: 'pending', completed_by: null }), 'A')).toBe(false)
  })
  it('reviewerOf 是完成者以外的人;尚未完成為 null', () => {
    expect(reviewerOf(task({ completed_by: 'A' }))).toBe('B')
    expect(reviewerOf(task({ completed_by: 'B' }))).toBe('A')
    expect(reviewerOf(task({ completed_by: null }))).toBeNull()
  })
})

describe('isDaily', () => {
  it('有重複規則才是每日任務', () => {
    expect(isDaily(task({ recurrence_rule: { freq: 'daily' } }))).toBe(true)
    expect(isDaily(task({ recurrence_rule: null }))).toBe(false)
    expect(isDaily(task({}))).toBe(false)
  })
})

describe('canHelp', () => {
  it('對方的未完成任務可以幫忙', () => {
    expect(canHelp(task({ assigned_to: 'B', status: 'pending' }), 'A')).toBe(true)
    expect(canHelp(task({ assigned_to: 'B', status: 'rejected' }), 'A')).toBe(true)
  })
  it('自己的、共同的、已送審的、沒指派的都不能幫忙', () => {
    expect(canHelp(task({ assigned_to: 'A' }), 'A')).toBe(false)
    expect(canHelp(task({ shared: true, assigned_to: 'B' }), 'A')).toBe(false)
    expect(canHelp(task({ assigned_to: 'B', status: 'submitted' }), 'A')).toBe(false)
    expect(Boolean(canHelp(task({ assigned_to: null }), 'A'))).toBe(false)
  })
})

describe('isHelped', () => {
  it('完成者不是被指派者 → 幫忙完成', () => {
    expect(isHelped(task({ assigned_to: 'B', completed_by: 'A' }))).toBe(true)
    expect(isHelped(task({ assigned_to: 'A', completed_by: 'A' }))).toBe(false)
  })
  it('共同任務、尚未完成、沒指派者都不算', () => {
    expect(isHelped(task({ shared: true, assigned_to: 'B', completed_by: 'A' }))).toBe(false)
    expect(isHelped(task({ assigned_to: 'B', completed_by: null }))).toBe(false)
    expect(isHelped(task({ assigned_to: null, completed_by: 'A' }))).toBe(false)
  })
})

describe('狀態標籤', () => {
  it('四種任務狀態與三種兌換狀態都有中文標籤', () => {
    expect(Object.keys(STATUS_LABEL).sort()).toEqual(['approved', 'pending', 'rejected', 'submitted'])
    expect(Object.keys(REDEMPTION_LABEL).sort()).toEqual(['fulfilled', 'rejected', 'requested'])
  })
})
