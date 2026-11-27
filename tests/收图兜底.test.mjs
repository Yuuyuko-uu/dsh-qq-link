// 收图兜底（2026-11-27：她一次发三张图全挂，日志只有「下载失败」四个字，查不出原因）
//
// 事故原貌：
//   消息段里的 url 是带 rkey 签名的，会过期 / 会被 CDN 拒；以前只认这一个地址，
//   抓不到就把图丢掉，日志只写「第 N 张图下载失败」——
//   地址过期、HTTP 403、连接被拒、超时，四种情况长得一模一样。
//
// 现在的规则：
//   ① 失败要说出原因（写进 `原因` 数组，调用方记进 diag）
//   ② url 抓不下来时，拿 file 名去 NapCat 的 /get_image 换一份新地址再试
import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const 家 = mkdtempSync(join(tmpdir(), 'qqbridge-收图-'))
process.env.DSH_HOME = 家

// 一张「图」：只要不是空字节，真假无所谓
const 图 = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01])

const 图服 = createServer((req, res) => {
  if (req.url === '/404') { res.writeHead(404); res.end('no'); return }
  res.writeHead(200, { 'content-type': 'image/jpeg' })
  res.end(图)
})
await new Promise((r) => 图服.listen(0, '127.0.0.1', r))
const 图口 = 图服.address().port
const 好地址 = `http://127.0.0.1:${图口}/img.jpg`
// 一个**没人监听**的端口：抓它一定立刻 ECONNREFUSED（模拟「地址过期/被拒」）
const 死地址 = 'http://127.0.0.1:1/gone.jpg'

let 换地址次数 = 0
let 猫给不给 = true
const 猫服 = createServer((req, res) => {
  let 体 = ''
  req.on('data', (c) => { 体 += c })
  req.on('end', () => {
    if (req.url === '/get_image') {
      换地址次数 += 1
      let 名 = ''
      try { 名 = String(JSON.parse(体 || '{}').file || '') } catch (e) {}
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ status: 'ok', retcode: 0, data: { url: 猫给不给 && 名 ? 好地址 : '' } }))
      return
    }
    res.writeHead(404); res.end('{}')
  })
})
await new Promise((r) => 猫服.listen(0, '127.0.0.1', r))
const 猫口 = 猫服.address().port
writeFileSync(join(家, 'qq-bridge-config.json'),
  JSON.stringify({ NapCat: `http://127.0.0.1:${猫口}`, 令牌: '' }), 'utf8')

const { 取图字节 } = await import('../lib/host.js')

test('原地址能抓 → 直接用，不去麻烦 NapCat', async () => {
  换地址次数 = 0
  const 原因 = []
  const b = await 取图字节({ url: 好地址, file: 'abc.jpg' }, 原因)
  assert.ok(b && b.length, '应该拿到字节')
  assert.deepEqual(b, 图)
  assert.equal(换地址次数, 0, '原地址够用就不该换')
  assert.deepEqual(原因, [], '成功了不该有失败原因')
})

test('原地址过期（连不上）+ file 只有文件名 → 去 NapCat 换一份新地址，抓到了', async () => {
  换地址次数 = 0
  猫给不给 = true
  const 原因 = []
  const b = await 取图字节({ url: 死地址, file: '6122DE1566.jpg' }, 原因)
  assert.ok(b && b.length, '换到新地址之后应该拿到字节：' + JSON.stringify(原因))
  assert.deepEqual(b, 图)
  assert.equal(换地址次数, 1, '应该正好问了一次 /get_image')
  assert.ok(原因.some((x) => x.includes('原地址')), '要把原地址失败的原因留下：' + JSON.stringify(原因))
})

test('NapCat 也给不出地址 → 返回 null，但原因里说得清楚', async () => {
  换地址次数 = 0
  猫给不给 = false
  const 原因 = []
  const b = await 取图字节({ url: 死地址, file: 'abc.jpg' }, 原因)
  assert.equal(b, null)
  assert.equal(换地址次数, 1)
  assert.ok(原因.some((x) => x.includes('原地址')), '缺「原地址已失败」：' + JSON.stringify(原因))
  assert.ok(原因.some((x) => x.includes('换不到新地址')), '缺「换不到」：' + JSON.stringify(原因))
  猫给不给 = true
})

test('HTTP 404 要报成 404，不能只说「下载失败」', async () => {
  const 原因 = []
  const b = await 取图字节({ url: `http://127.0.0.1:${图口}/404` }, 原因)
  assert.equal(b, null)
  assert.ok(原因.some((x) => x.includes('404')), '要把状态码写出来：' + JSON.stringify(原因))
})

test('没有 url、只有 base64:// → 照样能解出来', async () => {
  const 原因 = []
  const b = await 取图字节({ file: 'base64://' + 图.toString('base64') }, 原因)
  assert.deepEqual(b, 图)
})

test('没有 url、只有本地路径 → 读得到', async () => {
  const 路 = join(家, 'local.jpg')
  writeFileSync(路, 图)
  const 原因 = []
  const b = await 取图字节({ file: 路 }, 原因)
  assert.deepEqual(b, 图)
})

test('什么都没有 → null，原因写「这一张没有 url」', async () => {
  const 原因 = []
  const b = await 取图字节({}, 原因)
  assert.equal(b, null)
  assert.ok(原因.includes('这一张没有 url'), JSON.stringify(原因))
})

test('传了空段（段.data 丢了）也不能炸', async () => {
  assert.equal(await 取图字节(null), null)
  assert.equal(await 取图字节(undefined), null)
})

test('base64 本身就是空的 → 要留下原因，别当成功', async () => {
  const 原因 = []
  const b = await 取图字节({ file: 'base64://' }, 原因)
  assert.equal(b, null)
  assert.ok(原因.some((x) => x.includes('base64')), JSON.stringify(原因))
})

test.after(() => {
  图服.close()
  猫服.close()
})
