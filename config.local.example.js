// 本地配置模板（不入库）。
// 用法：复制本文件为 config.local.js（已被 .gitignore 忽略），填入你自己的值。
// AUTH.u / AUTH.p 分别是「用户名」「密码」的 SHA-256（小写十六进制）哈希。
// 例如：在浏览器控制台执行
//   await crypto.subtle.digest('SHA-256', new TextEncoder().encode('你的密码'))
//     .then(b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2,'0')).join(''))
// 得到密码哈希后填入下面 p 的位置；用户名哈希同理。
window.__LOCAL_AUTH = {
  u: '在此填入用户名的SHA-256哈希',
  p: '在此填入密码的SHA-256哈希'
};
// 你的 jsonblob.com 云端 blob id（在首次同步后由应用写入 localStorage；
// 也可以直接在这里固定一个你拥有的 blob id）。
window.__LOCAL_BLOB_ID = '在此填入你的jsonblob id';
