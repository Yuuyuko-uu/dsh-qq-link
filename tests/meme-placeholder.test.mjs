// 1.5.5（issue #37）：`[表情: 名字]` → markdown 图
//
// 三条规矩各测一遍：默认关不动、对不上原样留、路径不存在原样留。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { 换表情占位符, 抠正文图 } from '../lib/host.js'

const 临时 = mkdtempSync(join(tmpdir(), 'qqlink-meme-'))
const 图路径 = join(临时, 'mao.jpg')
writeFileSync(图路径, 'not-a-real-jpeg')

test.after(() => rmSync(临时, { recursive: true, force: true }))

const 配置 = (表 = { 猫: 图路径, 开心: 'https://example.com/happy.png' }, 开 = true) => ({
  表情占位符: 开,
  表情映射: 表,
})

test('开关关着：正文一个字都不动', () => {
  const 原文 = '看看这个 [表情: 猫] 好不好'
  assert.equal(换表情占位符(原文, 配置({ 猫: 图路径 }, false)), 原文)
})

test('没有配置：原样返回', () => {
  const 原文 = '[表情: 猫]'
  assert.equal(换表情占位符(原文, null), 原文)
  assert.equal(换表情占位符(原文, { 表情占位符: true }), 原文)
})

test('名字对得上、文件在：换成 markdown 图', () => {
  const 出 = 换表情占位符('看看这个 [表情: 猫] 好不好', 配置())
  assert.equal(出, '看看这个 ![猫](' + 图路径 + ') 好不好')
})

test('http(s) 直链：不需要文件存在', () => {
  const 出 = 换表情占位符('[表情: 开心]', 配置())
  assert.equal(出, '![开心](https://example.com/happy.png)')
})

test('名字没配：原样留着', () => {
  const 原文 = '[表情: 无语]'
  assert.equal(换表情占位符(原文, 配置()), 原文)
})

test('路径不存在：原样留着', () => {
  const 原文 = '[表情: 猫]'
  assert.equal(换表情占位符(原文, 配置({ 猫: join(临时, '没有这张.jpg') })), 原文)
})

test('相对路径：不在这里解析，原样留着', () => {
  const 原文 = '[表情: 猫]'
  assert.equal(换表情占位符(原文, 配置({ 猫: 'stickers/猫.jpg' })), 原文)
})

test('空名字 / 空值：原样留着', () => {
  assert.equal(换表情占位符('[表情: ]', 配置()), '[表情: ]')
  assert.equal(换表情占位符('[表情: 猫]', 配置({ 猫: '   ' })), '[表情: 猫]')
})

test('一段里多个占位符：各换各的', () => {
  const 出 = 换表情占位符('[表情: 猫] 和 [表情: 开心]', 配置())
  assert.equal(出, '![猫](' + 图路径 + ') 和 ![开心](https://example.com/happy.png)')
})

test('和抠正文图串起来：图被抽走，净文字里不留占位符', () => {
  const 出 = 换表情占位符('看看 [表情: 猫]', 配置())
  const { 净文字, 图 } = 抠正文图(出)
  assert.equal(净文字, '看看')
  assert.equal(图.length, 1)
  assert.equal(图[0].kind, 'path')
  assert.equal(图[0].value, 图路径)
})
