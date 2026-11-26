// ⭐ 1.6.8：「插话打断」——她还在答上一轮的时候你又发了一条，要不要先把那一轮掐掉。
//   这里只测**判定规则**（复刻 lib/host.js 里的 该打断吗），不拉起整个插件、不连 QQ。
import { test } from 'node:test'
import assert from 'node:assert/strict'

function 该打断吗(agent, 配置) {
  if (!配置 || 配置.插话打断 !== true) return false
  if (!agent || typeof agent.cancel !== 'function') return false
  const 忙 = agent.status !== undefined ? agent.status !== 'idle' : agent.phase === 'active'
  return Boolean(忙)
}

test('开关关着（默认）：再怎么忙也不打断', () => {
  const agent = { status: 'running', cancel() {} }
  assert.equal(该打断吗(agent, { 插话打断: false }), false)
  assert.equal(该打断吗(agent, {}), false)
  assert.equal(该打断吗(agent, undefined), false)
})

test('开着 + 那一轮在跑：打断', () => {
  const agent = { status: 'running', cancel() {} }
  assert.equal(该打断吗(agent, { 插话打断: true }), true)
})

test('开着 + 那一轮已经空闲：不打断', () => {
  const agent = { status: 'idle', cancel() {} }
  assert.equal(该打断吗(agent, { 插话打断: true }), false)
})

test('开着 + agent 上没有 cancel：不打断也不报错', () => {
  const agent = { status: 'running' }
  assert.equal(该打断吗(agent, { 插话打断: true }), false)
})

test('没有 status 字段时退回看 phase', () => {
  assert.equal(该打断吗({ phase: 'active', cancel() {} }, { 插话打断: true }), true)
  assert.equal(该打断吗({ phase: 'idle', cancel() {} }, { 插话打断: true }), false)
})

test('agent 为空：不打断', () => {
  assert.equal(该打断吗(undefined, { 插话打断: true }), false)
  assert.equal(该打断吗(null, { 插话打断: true }), false)
})
