/* ============================================================
 * 云天小队财务管理系统 v2.0 - app.js
 * 功能：登录认证、收支记账、循环记账、统计分析、云端加密同步
 * 数据存储：GitHub 仓库（AES-256-GCM 加密）+ localStorage 缓存
 * ============================================================ */

(function() {
'use strict';

/* ===== 认证配置（SHA-256哈希） ===== */
var AUTH = {
  u: 'f4277deb9a04ea46a48d79fa5f9cc48dce186a57ae657e3191437c3c9b69ccd4',
  p: '3ffab7445150d7e673fa554200fe529a625b734ca8c305c4bfbb112b850e9acd'
};

function sha256(str) {
  return crypto.subtle.digest('SHA-256', new TextEncoder().encode(str)).then(function(buf) {
    return Array.from(new Uint8Array(buf)).map(function(b) { return b.toString(16).padStart(2, '0'); }).join('');
  });
}

function checkAuth(username, password) {
  return sha256(username).then(function(uHash) {
    return sha256(password).then(function(pHash) {
      return uHash === AUTH.u && pHash === AUTH.p;
    });
  });
}

/* ===== 云端数据库配置（GitHub 仓库 + AES 加密）=====
 * 数据以 AES-256-GCM 加密后存入 GitHub 公开仓库的 data/cloud.json 文件。
 * 即使仓库完全公开，没有云同步密码也无法解密，杜绝明文泄露。
 * 永久有效、免费、多设备同步。
 */
var CLOUD_CONFIG = {
  owner: 'tiankai67',
  repo: 'yuntian-finance',
  path: 'data/cloud.json',
  branch: 'main'
};

/* ===== 本地存储键 ===== */
var STORAGE_KEY = 'yuntian_finance_v6';
var SESSION_KEY = 'yuntian_finance_session';
var CLOUD_TOKEN_KEY = 'yf_cloud_token';
var CLOUD_PWD_KEY = 'yf_cloud_password';
var CLOUD_EN_KEY = 'yf_cloud_enabled';

/* ===== 云同步设置 ===== */
function getCloudSettings() {
  return {
    token: localStorage.getItem(CLOUD_TOKEN_KEY) || '',
    password: localStorage.getItem(CLOUD_PWD_KEY) || '',
    enabled: localStorage.getItem(CLOUD_EN_KEY) === '1'
  };
}
function setCloudSettings(s) {
  localStorage.setItem(CLOUD_TOKEN_KEY, s.token || '');
  localStorage.setItem(CLOUD_PWD_KEY, s.password || '');
  localStorage.setItem(CLOUD_EN_KEY, s.enabled ? '1' : '0');
}

var lastCloudSha = null;

/* ===== 默认数据 ===== */
var defaultData = {
  settings: {
    teamName: '云天小队',
    initialBalance: 588.54,
    initialBalanceDate: '2025-02-25'
  },
  meetingRound: 1,
  categories: {
    income: ['货币基金收益', '银行利息', '活动收入', '赞助', '其他收入'],
    expense: ['餐饮', '交通', '物资', '活动支出', '其他支出']
  },
  transactions: [],
  recurringRules: [
    {
      id: 'rule_init_1',
      type: 'income',
      amount: 0.02,
      category: '货币基金收益',
      description: '货币基金每日收益',
      frequency: 'daily',
      startDate: '2025-02-25',
      endDate: null,
      enabled: true,
      createdAt: '2025-02-25T00:00:00.000Z'
    }
  ],
  deletedRecurringIds: [],
  members: []
};

/* ===== 加密回退数据（AES-256-GCM + PBKDF2）=====
 * 当云端blob过期且无本地缓存时，用操作密码解密恢复初始数据。
 * 数据以密文存储，非明文，保护队员隐私。
 * 结构：salt(32B) + iv(12B) + authTag(16B) + ciphertext，整体base64编码。
 */
var ENCRYPTED_FALLBACK = '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';

var appData = null;
var trendChart = null;
var categoryChart = null;
var isCloudLoading = false;

/* ============================================================
 * 云端数据库操作（GitHub 仓库 + AES-256-GCM 加密）
 * 数据以密文形式存入公开仓库 data/cloud.json，无密码不可读。
 * ============================================================ */

/* base64 与二进制互转（分块处理，避免大数组 apply 栈溢出） */
function bytesToBase64(bytes) {
  var bin = '';
  var chunk = 0x8000;
  for (var i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}
function base64ToBytes(b64) {
  var bin = atob(b64);
  var out = new Uint8Array(bin.length);
  for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/* 用密码派生 AES 密钥（PBKDF2） */
function deriveCloudKey(password, salt) {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  ).then(function(km) {
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: salt, iterations: 100000, hash: 'SHA-256' },
      km,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  });
}

/* 加密数据：salt(32) + iv(12) + (ciphertext+tag) → base64 */
function encryptCloudData(data, password) {
  var salt = crypto.getRandomValues(new Uint8Array(32));
  var iv = crypto.getRandomValues(new Uint8Array(12));
  return deriveCloudKey(password, salt)
    .then(function(key) {
      var plaintext = new TextEncoder().encode(JSON.stringify(data));
      return crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, plaintext);
    })
    .then(function(ct) {
      var out = new Uint8Array(salt.length + iv.length + ct.byteLength);
      out.set(salt, 0);
      out.set(iv, salt.length);
      out.set(new Uint8Array(ct), salt.length + iv.length);
      return bytesToBase64(out);
    });
}

/* 解密数据：base64 → salt(32) + iv(12) + (ciphertext+tag) → JSON */
function decryptCloudData(b64, password) {
  return new Promise(function(resolve, reject) {
    try {
      var combined = base64ToBytes(b64);
      var salt = combined.slice(0, 32);
      var iv = combined.slice(32, 44);
      var ct = combined.slice(44);
      deriveCloudKey(password, salt)
        .then(function(key) {
          return crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv }, key, ct);
        })
        .then(function(pt) {
          resolve(JSON.parse(new TextDecoder().decode(pt)));
        })
        .catch(function(e) { reject(e); });
    } catch (e) { reject(e); }
  });
}

/* 从 GitHub 加载加密数据 */
function cloudLoad(callback) {
  var s = getCloudSettings();
  if (!s.enabled || !s.token) { callback('disabled', null); return; }

  var url = 'https://api.github.com/repos/' + CLOUD_CONFIG.owner + '/' + CLOUD_CONFIG.repo +
            '/contents/' + CLOUD_CONFIG.path + '?ref=' + CLOUD_CONFIG.branch;
  var controller = new AbortController();
  var timeoutId = setTimeout(function() { controller.abort(); }, 15000);

  fetch(url, {
    headers: { 'Authorization': 'token ' + s.token, 'Accept': 'application/vnd.github.v3+json' },
    signal: controller.signal
  })
    .then(function(res) {
      clearTimeout(timeoutId);
      if (res.status === 404) { callback('empty', null); return; }
      if (res.status === 401 || res.status === 403) { callback('auth', null); return; }
      if (!res.ok) { callback('error', null); return; }
      return res.json().then(function(json) {
        try {
          // GitHub contents API 返回的 json.content 本身就是 base64 字符串，
          // decryptCloudData 内部会再次 base64 解码，这里【不能再 atob 一次】，否则双重解码必失败。
          var content = json.content.replace(/\s/g, '');
          decryptCloudData(content, s.password)
            .then(function(data) { lastCloudSha = json.sha; callback(null, data); })
            .catch(function() { callback('password', null); });
        } catch (e) { callback('error', null); }
      });
    })
    .catch(function() { clearTimeout(timeoutId); callback('network', null); });
}

/* 保存加密数据到 GitHub（last-write-wins + sha 冲突重试） */
function cloudSave(data, callback) {
  var s = getCloudSettings();
  if (!s.enabled || !s.token) { if (callback) callback('disabled'); return; }

  function doPut(sha) {
    return encryptCloudData(data, s.password).then(function(b64) {
      var url = 'https://api.github.com/repos/' + CLOUD_CONFIG.owner + '/' + CLOUD_CONFIG.repo +
                '/contents/' + CLOUD_CONFIG.path;
      var body = {
        message: 'Update cloud data ' + new Date().toISOString(),
        content: b64,
        branch: CLOUD_CONFIG.branch
      };
      if (sha) body.sha = sha;
      return fetch(url, {
        method: 'PUT',
        headers: { 'Authorization': 'token ' + s.token, 'Content-Type': 'application/json', 'Accept': 'application/vnd.github.v3+json' },
        body: JSON.stringify(body)
      }).then(function(res) { return { ok: res.ok, status: res.status }; });
    });
  }

  doPut(lastCloudSha)
    .then(function(r) {
      if (r.ok) { if (callback) callback(null); return; }
      if (r.status === 409) {
        // 远端已变更，仅重新读取 sha（不刷新 UI），再以本地数据覆盖
        var chkUrl = 'https://api.github.com/repos/' + CLOUD_CONFIG.owner + '/' + CLOUD_CONFIG.repo +
                     '/contents/' + CLOUD_CONFIG.path + '?ref=' + CLOUD_CONFIG.branch;
        fetch(chkUrl, { headers: { 'Authorization': 'token ' + s.token, 'Accept': 'application/vnd.github.v3+json' } })
          .then(function(res) { return res.ok ? res.json() : null; })
          .then(function(json) {
            lastCloudSha = json ? json.sha : null;
            doPut(lastCloudSha).then(function(r2) {
              if (callback) callback(r2.ok ? null : 'error');
            });
          })
          .catch(function() { if (callback) callback('network'); });
        return;
      }
      if (callback) callback('error');
    })
    .catch(function() { if (callback) callback('network'); });
}

/* ============================================================
 * 加密回退数据解密（AES-256-GCM + PBKDF2）
 * 当云端 blob 过期且本地无缓存时，用操作密码解密恢复初始数据
 * ============================================================ */
function decryptFallback(password) {
  return new Promise(function(resolve, reject) {
    try {
      var combined = Uint8Array.from(atob(ENCRYPTED_FALLBACK), function(c) { return c.charCodeAt(0); });
      // 结构：salt(32B) + iv(12B) + authTag(16B) + ciphertext
      var salt = combined.slice(0, 32);
      var iv = combined.slice(32, 44);
      var authTag = combined.slice(44, 60);
      var ciphertext = combined.slice(60);

      // PBKDF2 派生密钥
      crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(password),
        { name: 'PBKDF2' },
        false,
        ['deriveKey']
      ).then(function(keyMaterial) {
        return crypto.subtle.deriveKey(
          {
            name: 'PBKDF2',
            salt: salt,
            iterations: 100000,
            hash: 'SHA-256'
          },
          keyMaterial,
          { name: 'AES-GCM', length: 256 },
          false,
          ['decrypt']
        );
      }).then(function(aesKey) {
        // 拼接 ciphertext + authTag（Web Crypto API 要求 authTag 在数据末尾）
        var encryptedData = new Uint8Array(ciphertext.length + authTag.length);
        encryptedData.set(ciphertext, 0);
        encryptedData.set(authTag, ciphertext.length);

        return crypto.subtle.decrypt(
          { name: 'AES-GCM', iv: iv },
          aesKey,
          encryptedData
        );
      }).then(function(decryptedBuffer) {
        var decryptedText = new TextDecoder().decode(decryptedBuffer);
        var data = JSON.parse(decryptedText);
        resolve(data);
      }).catch(function(err) {
        reject(err);
      });
    } catch(e) {
      reject(e);
    }
  });
}

/* ============================================================
 * 数据管理
 * ============================================================ */

function loadLocalData() {
  try {
    var raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      var data = JSON.parse(raw);
      normalizeData(data);
      return data;
    }
  } catch(e) {}
  return null;
}

function saveLocalData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(appData));
}

/* 从云端加载并更新本地 - 多层恢复策略 */
function loadCloudData() {
  var s = getCloudSettings();

  // 云端未启用：仅用本地缓存
  if (!s.enabled || !s.token) {
    var localOnly = loadLocalData();
    if (localOnly) {
      appData = localOnly;
    } else {
      appData = JSON.parse(JSON.stringify(defaultData));
      saveLocalData();
    }
    normalizeData(appData);
    setSyncStatus('local');
    if (document.getElementById('app').style.display !== 'none') {
      initUI();
      renderAll();
    }
    return;
  }

  setSyncStatus('syncing');
  isCloudLoading = true;

  cloudLoad(function(err, data) {
    isCloudLoading = false;

    if (!err && data && data.settings) {
      // ===== 云端加密数据可用 =====
      appData = data;
      normalizeData(appData);
      saveLocalData();
      setSyncStatus('synced');
      if (document.getElementById('app').style.display !== 'none') {
        initUI();
        renderAll();
      }
    } else if (err === 'empty') {
      // ===== 云端无文件，用本地缓存上传（首次同步/迁移）=====
      var localData = loadLocalData();
      if (localData) {
        appData = localData;
        normalizeData(appData);
        saveLocalData();
        cloudSave(appData, function(saveErr) {
          setSyncStatus(saveErr ? 'error' : 'synced');
          if (document.getElementById('app').style.display !== 'none') {
            initUI();
            renderAll();
          }
        });
      } else {
        recoverFromFallback(function(decryptedData) {
          if (decryptedData) {
            appData = decryptedData;
            normalizeData(appData);
            saveLocalData();
            cloudSave(appData, function(saveErr) {
              setSyncStatus(saveErr ? 'error' : 'synced');
              if (document.getElementById('app').style.display !== 'none') {
                initUI();
                renderAll();
              }
            });
          } else {
            appData = JSON.parse(JSON.stringify(defaultData));
            saveLocalData();
            setSyncStatus('error');
            if (document.getElementById('app').style.display !== 'none') {
              initUI();
              renderAll();
            }
          }
        });
      }
    } else if (err === 'auth') {
      // Token 无效
      setSyncStatus('error');
      showToast('云端同步失败：GitHub Token 无效或无权限', 'error');
      useLocalFallback();
    } else if (err === 'password') {
      // 解密密码错误
      setSyncStatus('error');
      showToast('云端数据解密失败：云同步密码错误', 'error');
      useLocalFallback();
    } else {
      // 网络/其他错误，使用本地缓存
      useLocalFallback();
    }
  });
}

/* 网络/认证异常时退回本地缓存 */
function useLocalFallback() {
  var fallback = loadLocalData();
  if (fallback) {
    appData = fallback;
  } else {
    appData = JSON.parse(JSON.stringify(defaultData));
    saveLocalData();
  }
  normalizeData(appData);
  setSyncStatus('error');
  if (document.getElementById('app').style.display !== 'none') {
    initUI();
    renderAll();
  }
}

/* 数据规范化（补充缺失字段） */
function normalizeData(data) {
  if (!data.transactions) data.transactions = [];
  if (!data.recurringRules) data.recurringRules = [];
  if (!data.deletedRecurringIds) data.deletedRecurringIds = [];
  if (!data.categories) data.categories = JSON.parse(JSON.stringify(defaultData.categories));
  if (!data.members) data.members = JSON.parse(JSON.stringify(defaultData.members));
  if (data.meetingRound === undefined) data.meetingRound = 1;
  if (data.members) {
    data.members.forEach(function(m) {
      if (m.meetingDone === undefined) m.meetingDone = false;
    });
  }
}

/* 加密回退数据解密弹窗（通用） */
function showDecryptDialog(opts) {
  opts = opts || {};
  var overlay = document.getElementById('delete-password-overlay');
  var input = document.getElementById('delete-password-input');
  var error = document.getElementById('delete-password-error');
  var titleEl = document.getElementById('delete-password-title');
  var descEl = document.getElementById('delete-password-desc');
  var submitBtn = document.getElementById('delete-password-submit');

  titleEl.textContent = opts.title || '数据恢复';
  descEl.textContent = opts.desc || '请输入操作密码以恢复初始队员名单';
  submitBtn.textContent = opts.btnText || '恢复数据';
  input.value = '';
  input.type = 'password';
  error.style.display = 'none';
  error.textContent = '密码错误，请重试';
  overlay.style.display = 'flex';
  input.focus();

  var cancelBtn = document.getElementById('delete-password-cancel');
  var closeBtn = document.getElementById('delete-password-close');
  var skipBtn = document.createElement('button');
  skipBtn.textContent = opts.skipText || '跳过';
  skipBtn.className = 'btn btn-small';
  skipBtn.style.marginLeft = '8px';
  submitBtn.parentNode.insertBefore(skipBtn, submitBtn.nextSibling);

  function cleanup() {
    overlay.style.display = 'none';
    submitBtn.removeEventListener('click', onSubmit);
    cancelBtn.removeEventListener('click', onCancel);
    closeBtn.removeEventListener('click', onCancel);
    skipBtn.removeEventListener('click', onCancel);
    input.removeEventListener('keydown', onKeydown);
    if (skipBtn.parentNode) skipBtn.parentNode.removeChild(skipBtn);
  }
  function onSubmit() {
    var entered = input.value;
    if (!entered) return;
    submitBtn.textContent = '解密中...';
    submitBtn.disabled = true;
    decryptFallback(entered).then(function(data) {
      cleanup();
      if (opts.onSuccess) opts.onSuccess(data);
    }).catch(function() {
      error.style.display = 'block';
      input.value = '';
      input.focus();
      submitBtn.textContent = opts.btnText || '恢复数据';
      submitBtn.disabled = false;
    });
  }
  function onCancel() { cleanup(); if (opts.onSkip) opts.onSkip(); }
  function onKeydown(e) {
    if (e.key === 'Enter') { e.preventDefault(); onSubmit(); }
    if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
  }

  submitBtn.addEventListener('click', onSubmit);
  cancelBtn.addEventListener('click', onCancel);
  closeBtn.addEventListener('click', onCancel);
  skipBtn.addEventListener('click', onCancel);
  input.addEventListener('keydown', onKeydown);
}

/* 自动恢复（blob过期且无本地缓存时调用） */
function recoverFromFallback(callback) {
  showDecryptDialog({
    title: '数据恢复',
    desc: '云端数据已过期且本地无缓存。请输入操作密码以恢复初始队员名单',
    btnText: '恢复数据',
    skipText: '使用空数据',
    onSuccess: function(data) { callback(data); },
    onSkip: function() { callback(null); }
  });
}

/* 保存数据到本地 + 云端 */
function saveData() {
  saveLocalData();
  var s = getCloudSettings();
  if (!s.enabled || !s.token) {
    setSyncStatus('local');
    return;
  }
  setSyncStatus('syncing');
  cloudSave(appData, function(err) {
    if (err === 'password') {
      setSyncStatus('error');
      showToast('云端解密密码错误', 'error');
    } else if (err) {
      setSyncStatus('error');
    } else {
      setSyncStatus('synced');
    }
  });
}

/* ============================================================
 * 工具函数
 * ============================================================ */

function formatDate(d) {
  var dt = new Date(d);
  var y = dt.getFullYear();
  var m = String(dt.getMonth() + 1).padStart(2, '0');
  var day = String(dt.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
}

function todayStr() {
  return formatDate(new Date());
}

function formatMoney(n) {
  return '\u00a5' + Number(n).toFixed(2);
}

function genId() {
  return 'id_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
}

function getIconForCategory(category, type) {
  var icons = {
    '货币基金收益': '\u{1F4B0}',
    '银行利息': '\u{1F3E6}',
    '活动收入': '\u{1F389}',
    '赞助': '\u{1F91D}',
    '其他收入': '\u{1F4C8}',
    '餐饮': '\u{1F37D}',
    '交通': '\u{1F697}',
    '物资': '\u{1F4E6}',
    '活动支出': '\u{1F3AA}',
    '其他支出': '\u{1F4C9}'
  };
  return icons[category] || (type === 'income' ? '\u2795' : '\u2796');
}

/* ============================================================
 * 循环记账计算（核心功能 - 从开始日期追溯到今天）
 * ============================================================ */

function generateRecurringTransactions(endDate) {
  var result = [];
  if (!appData || !appData.recurringRules) return result;

  var deletedIds = appData.deletedRecurringIds || [];
  var end = new Date(endDate || todayStr());
  end.setHours(23, 59, 59, 999);

  for (var i = 0; i < appData.recurringRules.length; i++) {
    var rule = appData.recurringRules[i];
    if (!rule.enabled) continue;

    var start = new Date(rule.startDate);
    var ruleEnd = rule.endDate ? new Date(rule.endDate) : new Date(end);
    if (ruleEnd > end) ruleEnd = new Date(end);

    var current = new Date(start);
    current.setHours(0, 0, 0, 0);

    var count = 0;
    while (current <= ruleEnd && count < 50000) {
      var txId = 'rr_' + rule.id + '_' + formatDate(current);
      if (deletedIds.indexOf(txId) === -1) {
        result.push({
          id: txId,
          type: rule.type,
          amount: rule.amount,
          category: rule.category,
          description: rule.description,
          date: formatDate(current),
          source: 'recurring',
          recurringRuleId: rule.id
        });
      }

      if (rule.frequency === 'daily') {
        current.setDate(current.getDate() + 1);
      } else if (rule.frequency === 'weekly') {
        current.setDate(current.getDate() + 7);
      } else if (rule.frequency === 'monthly') {
        current.setMonth(current.getMonth() + 1);
      }
      count++;
    }
  }
  return result;
}

/* 获取所有交易（手动 + 循环生成的） */
function getAllTransactions(endDate) {
  var manual = appData.transactions.slice();
  var recurring = generateRecurringTransactions(endDate);
  var all = manual.concat(recurring);
  all.sort(function(a, b) {
    var d1 = new Date(a.date);
    var d2 = new Date(b.date);
    if (d1.getTime() !== d2.getTime()) return d2 - d1;
    // 同一天手动记录排在前面
    if (a.source === 'manual' && b.source === 'recurring') return -1;
    if (a.source === 'recurring' && b.source === 'manual') return 1;
    return 0;
  });
  return all;
}

/* 余额计算 */
function calculateBalance(endDate) {
  var end = endDate || todayStr();
  var balance = appData.settings.initialBalance || 0;
  var all = getAllTransactions(end);

  for (var i = 0; i < all.length; i++) {
    var tx = all[i];
    if (tx.date > end) continue;
    if (tx.type === 'income') {
      balance += tx.amount;
    } else {
      balance -= tx.amount;
    }
  }
  return Math.round(balance * 100) / 100;
}

/* ============================================================
 * 登录 / 登出
 * ============================================================ */

function handleLogin(e) {
  e.preventDefault();
  var username = document.getElementById('login-username').value.trim();
  var password = document.getElementById('login-password').value;
  var errEl = document.getElementById('login-error');

  if (username && password) {
    checkAuth(username, password).then(function(ok) {
      if (ok) {
        sessionStorage.setItem(SESSION_KEY, '1');
        showApp();
      } else {
        errEl.textContent = '账号或密码错误，请重试';
        errEl.style.display = 'block';
      }
    });
  } else {
    errEl.textContent = '账号或密码错误，请重试';
    errEl.style.display = 'block';
  }
}

/* 手动恢复初始队员名单 */
window.manualRecoverFallback = function() {
  showDecryptDialog({
    title: '恢复队员名单',
    desc: '请输入操作密码以解密并恢复初始队员名单',
    btnText: '恢复数据',
    onSuccess: function(decryptedData) {
      // 保留现有交易记录和设置，只恢复队员名单
      var existingTransactions = appData.transactions || [];
      var existingSettings = appData.settings;
      var existingRecurringRules = appData.recurringRules || [];
      var existingDeletedRecurringIds = appData.deletedRecurringIds || [];
      var existingMeetingRound = appData.meetingRound || 1;

      appData = decryptedData;
      appData.transactions = existingTransactions;
      appData.settings = existingSettings;
      appData.recurringRules = existingRecurringRules;
      appData.deletedRecurringIds = existingDeletedRecurringIds;
      appData.meetingRound = existingMeetingRound;
      normalizeData(appData);
      saveLocalData();
      setSyncStatus('syncing');
      cloudSave(appData, function(saveErr) {
        setSyncStatus(saveErr ? 'error' : 'synced');
      });
      initUI();
      renderAll();
      alert('队员名单已成功恢复！共恢复 ' + decryptedData.members.length + ' 名队员。');
    },
    onSkip: function() {
      // 用户取消，不做任何操作
    }
  });
};

function handleLogout() {
  sessionStorage.removeItem(SESSION_KEY);
  document.getElementById('app').style.display = 'none';
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('login-password').value = '';
  document.getElementById('login-error').style.display = 'none';
}

function isLoggedIn() {
  return sessionStorage.getItem(SESSION_KEY) === '1';
}

function showApp() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app').style.display = 'block';

  // 先用本地数据快速渲染
  var localData = loadLocalData();
  if (localData) {
    appData = localData;
  } else {
    appData = JSON.parse(JSON.stringify(defaultData));
    saveLocalData();
  }
  initUI();
  renderAll();

  // 然后从云端加载最新数据（GitHub 长期存储，无需保活）
  loadCloudData();

  // 填充云端同步设置 UI
  loadCloudSettingsUI();
}

/* ============================================================
 * 同步状态
 * ============================================================ */

function setSyncStatus(status) {
  var el = document.getElementById('sync-status');
  if (!el) return;
  el.className = 'sync-status ' + status;
  var labels = {
    'syncing': '同步中...',
    'synced': '已同步（云端加密）',
    'local': '仅本地（未开启云同步）',
    'error': '同步失败',
    '加载中...': '加载中...'
  };
  el.textContent = labels[status] || status;
}

/* ============================================================
 * UI 初始化
 * ============================================================ */

function initUI() {
  document.getElementById('current-date').textContent = todayStr();
  document.getElementById('tx-date').value = todayStr();
  document.getElementById('rr-start').value = todayStr();

  // 填充设置表单
  document.getElementById('setting-team-name').value = appData.settings.teamName || '云天小队';
  document.getElementById('setting-init-balance').value = appData.settings.initialBalance || 0;
  document.getElementById('setting-init-date').value = appData.settings.initialBalanceDate || todayStr();

  // 更新分类下拉
  populateCategoryFilters();
  updateTxCategoryOptions('income');
  updateRrCategoryOptions('income');
  renderCategoryManager();
}

function populateCategoryFilters() {
  var cats = {};
  // Add all defined categories
  if (appData.categories) {
    (appData.categories.income || []).forEach(function(c) { cats[c] = true; });
    (appData.categories.expense || []).forEach(function(c) { cats[c] = true; });
  }
  // Also add any categories used in existing transactions/rules (in case of old data)
  if (appData.transactions) {
    appData.transactions.forEach(function(t) { cats[t.category] = true; });
  }
  if (appData.recurringRules) {
    appData.recurringRules.forEach(function(r) { cats[r.category] = true; });
  }

  var filterCat = document.getElementById('filter-category');
  var statsCat = document.getElementById('stats-category');
  var currentFilter = filterCat.value;
  var currentStats = statsCat.value;

  filterCat.innerHTML = '<option value="">全部分类</option>';
  statsCat.innerHTML = '<option value="">全部分类</option>';

  Object.keys(cats).forEach(function(c) {
    var o1 = document.createElement('option');
    o1.value = c; o1.textContent = c;
    filterCat.appendChild(o1);

    var o2 = document.createElement('option');
    o2.value = c; o2.textContent = c;
    statsCat.appendChild(o2);
  });

  filterCat.value = currentFilter;
  statsCat.value = currentStats;
}

/* ============================================================
 * 渲染
 * ============================================================ */

function renderAll() {
  renderOverview();
  renderTransactions();
  renderRecurring();
  renderMembers();
}

/* --- 概览 --- */
function renderOverview() {
  var balance = calculateBalance();
  document.getElementById('overview-balance').textContent = formatMoney(balance);
  document.getElementById('overview-last-update').textContent = '截至 ' + todayStr();

  var now = new Date();
  var monthStart = formatDate(new Date(now.getFullYear(), now.getMonth(), 1));
  var today = todayStr();
  var all = getAllTransactions();
  var monthIncome = 0, monthExpense = 0;

  all.forEach(function(t) {
    if (t.date >= monthStart && t.date <= today) {
      if (t.type === 'income') monthIncome += t.amount;
      else monthExpense += t.amount;
    }
  });

  document.getElementById('overview-month-income').textContent = formatMoney(monthIncome);
  document.getElementById('overview-month-expense').textContent = formatMoney(monthExpense);

  // 货币基金累计收益
  var fundTotal = 0;
  all.forEach(function(t) {
    if (t.category === '货币基金收益' && t.type === 'income') {
      fundTotal += t.amount;
    }
  });
  document.getElementById('overview-fund-total').textContent = formatMoney(fundTotal);

  // 最近交易
  var recent = all.slice(0, 10);
  var container = document.getElementById('overview-recent');
  if (recent.length === 0) {
    container.innerHTML = '<div class="tx-empty">暂无交易记录</div>';
  } else {
    container.innerHTML = recent.map(renderTxItem).join('');
  }
}

/* --- 交易项 --- */
function renderTxItem(tx) {
  var icon = getIconForCategory(tx.category, tx.type);
  var sign = tx.type === 'income' ? '+' : '-';
  var badge = tx.source === 'recurring' ? '<span class="tx-badge">循环</span>' : '';
  var amountStr = sign + formatMoney(tx.amount).replace('\u00a5', '');
  return '<div class="tx-item">' +
    '<div class="tx-icon ' + tx.type + '">' + icon + '</div>' +
    '<div class="tx-info">' +
      '<div class="tx-category">' + escapeHtml(tx.category) + badge + '</div>' +
      '<div class="tx-desc">' + escapeHtml(tx.description || '') + '</div>' +
    '</div>' +
    '<div class="tx-right">' +
      '<div class="tx-amount ' + tx.type + '">' + amountStr + '</div>' +
      '<div class="tx-date">' + tx.date + '</div>' +
    '</div>' +
    '<button class="tx-delete" onclick="deleteTransaction(\'' + tx.id + '\')" title="删除">\u2715</button>' +
  '</div>';
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/[&<>"']/g, function(c) {
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
  });
}

/* --- 交易列表 --- */
function renderTransactions() {
  var filterType = document.getElementById('filter-type').value;
  var filterCat = document.getElementById('filter-category').value;
  var filterStart = document.getElementById('filter-start').value;
  var filterEnd = document.getElementById('filter-end').value;

  var all = getAllTransactions();
  var filtered = all.filter(function(t) {
    if (filterType && t.type !== filterType) return false;
    if (filterCat && t.category !== filterCat) return false;
    if (filterStart && t.date < filterStart) return false;
    if (filterEnd && t.date > filterEnd) return false;
    return true;
  });

  var container = document.getElementById('tx-list');
  if (filtered.length === 0) {
    container.innerHTML = '<div class="tx-empty">暂无符合条件的交易记录</div>';
  } else {
    container.innerHTML = filtered.map(renderTxItem).join('');
  }
}

/* --- 循环规则列表 --- */
function renderRecurring() {
  var container = document.getElementById('recurring-list');
  if (!appData.recurringRules || appData.recurringRules.length === 0) {
    container.innerHTML = '<div class="tx-empty">暂无循环记账规则</div>';
    return;
  }

  var today = todayStr();
  container.innerHTML = appData.recurringRules.map(function(r) {
    var freqText = {daily:'每天', weekly:'每周', monthly:'每月'}[r.frequency];
    var typeBadge = r.type === 'income'
      ? '<span class="badge badge-income">收入</span>'
      : '<span class="badge badge-expense">支出</span>';
    var statusBadge = r.enabled
      ? '<span class="badge badge-active">启用中</span>'
      : '<span class="badge badge-inactive">已暂停</span>';

    // 计算该规则从开始日期到今天产生的累计金额
    var recurring = generateRecurringTransactions(today);
    var ruleTotal = 0;
    var ruleCount = 0;
    recurring.forEach(function(t) {
      if (t.recurringRuleId === r.id) {
        ruleTotal += t.amount;
        ruleCount++;
      }
    });

    return '<div class="rule-item ' + (r.enabled ? '' : 'rule-disabled') + '">' +
      '<div class="rule-header">' +
        '<div class="rule-title">' + typeBadge + ' ' + escapeHtml(r.category) + ' ' + statusBadge + '</div>' +
        '<label class="toggle-switch">' +
          '<input type="checkbox" ' + (r.enabled ? 'checked' : '') + ' onchange="toggleRule(\'' + r.id + '\')">' +
          '<span class="toggle-slider"></span>' +
        '</label>' +
      '</div>' +
      '<div class="rule-info">' +
        '金额：' + formatMoney(r.amount) + ' / ' + freqText + '<br>' +
        '备注：' + escapeHtml(r.description || '无') + '<br>' +
        '开始：' + r.startDate + (r.endDate ? '  结束：' + r.endDate : '  （持续）') + '<br>' +
        '已追溯生成：' + ruleCount + ' 笔，累计 ' + formatMoney(ruleTotal) +
      '</div>' +
      '<div class="rule-actions">' +
        '<button class="btn btn-small btn-danger" onclick="deleteRule(\'' + r.id + '\')">删除规则</button>' +
      '</div>' +
    '</div>';
  }).join('');
}

/* ============================================================
 * 交易操作
 * ============================================================ */

function addTransaction(tx) {
  tx.id = genId();
  tx.source = 'manual';
  tx.createdAt = new Date().toISOString();
  appData.transactions.push(tx);
  saveData();
}

/* 操作密码验证弹窗（所有修改数据库的操作共用） */
window.verifyDeletePassword = function(callback, opts) {
  opts = opts || {};
  var overlay = document.getElementById('delete-password-overlay');
  var input = document.getElementById('delete-password-input');
  var error = document.getElementById('delete-password-error');
  var titleEl = document.getElementById('delete-password-title');
  var descEl = document.getElementById('delete-password-desc');
  var submitBtn = document.getElementById('delete-password-submit');

  titleEl.textContent = opts.title || '操作验证';
  descEl.textContent = opts.desc || '请输入密码以确认操作';
  submitBtn.textContent = opts.btnText || '确认';

  input.value = '';
  error.style.display = 'none';
  overlay.style.display = 'flex';
  input.focus();

  var cancelBtn = document.getElementById('delete-password-cancel');
  var closeBtn = document.getElementById('delete-password-close');

  function cleanup() {
    overlay.style.display = 'none';
    submitBtn.removeEventListener('click', onSubmit);
    cancelBtn.removeEventListener('click', onCancel);
    closeBtn.removeEventListener('click', onCancel);
    input.removeEventListener('keydown', onKeydown);
  }
  function onSubmit() {
    var entered = input.value;
    sha256(entered).then(function(hash) {
      if (hash === 'da9d2b79c84bc1e8e257dcea2dfc4297e7bd0edf903f268fc5d4846ea1dd45dd') {
        cleanup();
        callback();
      } else {
        error.style.display = 'block';
        input.value = '';
        input.focus();
      }
    });
  }
  function onCancel() { cleanup(); }
  function onKeydown(e) {
    if (e.key === 'Enter') { e.preventDefault(); onSubmit(); }
    if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
  }

  submitBtn.addEventListener('click', onSubmit);
  cancelBtn.addEventListener('click', onCancel);
  closeBtn.addEventListener('click', onCancel);
  input.addEventListener('keydown', onKeydown);
};

window.deleteTransaction = function(id) {
  window.verifyDeletePassword(function() {
    var manualMatch = appData.transactions.filter(function(t) { return t.id === id; });
    if (manualMatch.length > 0) {
      appData.transactions = appData.transactions.filter(function(t) { return t.id !== id; });
    } else {
      if (!appData.deletedRecurringIds) appData.deletedRecurringIds = [];
      if (appData.deletedRecurringIds.indexOf(id) === -1) {
        appData.deletedRecurringIds.push(id);
      }
    }
    saveData();
    renderAll();
    showToast('已删除', 'success');
  }, { title: '删除交易', desc: '请输入密码以确认删除此交易记录', btnText: '确认删除' });
};

/* ============================================================
 * 循环规则操作
 * ============================================================ */

window.toggleRule = function(id) {
  var rule = null;
  for (var i = 0; i < appData.recurringRules.length; i++) {
    if (appData.recurringRules[i].id === id) { rule = appData.recurringRules[i]; break; }
  }
  if (!rule) return;
  var willEnable = !rule.enabled;
  window.verifyDeletePassword(function() {
    rule.enabled = willEnable;
    saveData();
    renderAll();
    showToast(rule.enabled ? '规则已启用' : '规则已暂停', 'success');
  }, { title: willEnable ? '启用规则' : '暂停规则', desc: '请输入密码以确认操作', btnText: '确认' });
};

window.deleteRule = function(id) {
  window.verifyDeletePassword(function() {
    appData.recurringRules = appData.recurringRules.filter(function(r) { return r.id !== id; });
    saveData();
    renderAll();
    showToast('规则已删除', 'success');
  }, { title: '删除规则', desc: '请输入密码以确认删除此循环记账规则', btnText: '确认删除' });
};

/* ============================================================
 * 表单处理
 * ============================================================ */

function handleTxForm(e) {
  e.preventDefault();
  var type = document.querySelector('input[name="tx-type"]:checked').value;
  var amount = parseFloat(document.getElementById('tx-amount').value);
  var date = document.getElementById('tx-date').value;
  var category = document.getElementById('tx-category').value;
  var description = document.getElementById('tx-description').value;

  if (!amount || amount <= 0) { showToast('请输入有效金额', 'error'); return; }
  if (!date) { showToast('请选择日期', 'error'); return; }

  window.verifyDeletePassword(function() {
    addTransaction({ type: type, amount: amount, date: date, category: category, description: description });

    document.getElementById('tx-amount').value = '';
    document.getElementById('tx-description').value = '';
    document.getElementById('tx-date').value = todayStr();

    renderAll();
    showToast('记账成功', 'success');
  }, { title: '记账验证', desc: '请输入密码以确认记账操作', btnText: '确认记账' });
}

function handleRecurringForm(e) {
  e.preventDefault();
  var type = document.querySelector('input[name="rr-type"]:checked').value;
  var amount = parseFloat(document.getElementById('rr-amount').value);
  var frequency = document.getElementById('rr-frequency').value;
  var startDate = document.getElementById('rr-start').value;
  var endDate = document.getElementById('rr-end').value || null;
  var category = document.getElementById('rr-category').value;
  var description = document.getElementById('rr-description').value;

  if (!amount || amount <= 0) { showToast('请输入有效金额', 'error'); return; }
  if (!startDate) { showToast('请选择开始日期', 'error'); return; }
  if (endDate && endDate < startDate) { showToast('结束日期不能早于开始日期', 'error'); return; }

  window.verifyDeletePassword(function() {
    appData.recurringRules.push({
      id: genId(), type: type, amount: amount, category: category,
      description: description, frequency: frequency,
      startDate: startDate, endDate: endDate, enabled: true,
      createdAt: new Date().toISOString()
    });

    saveData();

    document.getElementById('rr-amount').value = '';
    document.getElementById('rr-description').value = '';
    document.getElementById('rr-start').value = todayStr();
    document.getElementById('rr-end').value = '';

    renderAll();
    showToast('循环记账规则已添加，已从开始日期追溯生成交易', 'success');
  }, { title: '添加循环规则', desc: '请输入密码以确认添加循环记账规则', btnText: '确认添加' });
}

/* ============================================================
 * 统计分析
 * ============================================================ */

function handleStats() {
  var start = document.getElementById('stats-start').value;
  var end = document.getElementById('stats-end').value;
  var category = document.getElementById('stats-category').value;

  if (!start || !end) { showToast('请选择日期范围', 'error'); return; }
  if (start > end) { showToast('开始日期不能晚于结束日期', 'error'); return; }

  var all = getAllTransactions(end);
  var filtered = all.filter(function(t) {
    if (t.date < start || t.date > end) return false;
    if (category && t.category !== category) return false;
    return true;
  });

  var totalIncome = 0, totalExpense = 0;
  filtered.forEach(function(t) {
    if (t.type === 'income') totalIncome += t.amount;
    else totalExpense += t.amount;
  });

  document.getElementById('stats-total-income').textContent = formatMoney(totalIncome);
  document.getElementById('stats-total-expense').textContent = formatMoney(totalExpense);
  document.getElementById('stats-net').textContent = formatMoney(totalIncome - totalExpense);
  document.getElementById('stats-count').textContent = filtered.length + ' 笔';

  document.getElementById('stats-summary').style.display = 'grid';
  document.getElementById('stats-charts').style.display = 'block';

  renderTrendChart(filtered, start, end);
  renderCategoryChart(filtered);
  renderFundDetail(filtered);

  showToast('统计已生成', 'success');
}

function renderTrendChart(data, start, end) {
  var months = {};
  data.forEach(function(t) {
    var month = t.date.substring(0, 7);
    if (!months[month]) months[month] = {income: 0, expense: 0};
    if (t.type === 'income') months[month].income += t.amount;
    else months[month].expense += t.amount;
  });

  var labels = Object.keys(months).sort();
  var incomeData = labels.map(function(m) { return months[m].income; });
  var expenseData = labels.map(function(m) { return months[m].expense; });

  var ctx = document.getElementById('chart-trend').getContext('2d');
  if (trendChart) trendChart.destroy();

  var titleEl = document.getElementById('chart-trend').parentElement.querySelector('.card-title');
  if (labels.length === 0) {
    titleEl.textContent = '收支趋势（无数据）';
    return;
  }
  titleEl.textContent = '收支趋势';

  trendChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        { label: '收入', data: incomeData, backgroundColor: '#16a34a', borderRadius: 4 },
        { label: '支出', data: expenseData, backgroundColor: '#dc2626', borderRadius: 4 }
      ]
    },
    options: {
      responsive: true,
      plugins: { legend: { position: 'bottom' } },
      scales: { y: { beginAtZero: true } }
    }
  });
}

function renderCategoryChart(data) {
  var cats = {};
  data.forEach(function(t) {
    if (t.type === 'income') {
      cats[t.category] = (cats[t.category] || 0) + t.amount;
    }
  });

  var labels = Object.keys(cats);
  var values = labels.map(function(c) { return cats[c]; });
  var colors = ['#2563eb', '#0d9488', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6'];

  var ctx = document.getElementById('chart-category').getContext('2d');
  if (categoryChart) categoryChart.destroy();

  var titleEl = document.getElementById('chart-category').parentElement.querySelector('.card-title');
  if (labels.length === 0) {
    titleEl.textContent = '收入分类分布（无数据）';
    return;
  }
  titleEl.textContent = '收入分类分布';

  categoryChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: values,
        backgroundColor: colors.slice(0, labels.length),
        borderWidth: 2,
        borderColor: '#fff'
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { position: 'bottom' } }
    }
  });
}

function renderFundDetail(data) {
  var fundTx = data.filter(function(t) {
    return t.category === '货币基金收益' && t.type === 'income';
  });

  var container = document.getElementById('stats-fund-detail');
  var content = document.getElementById('fund-detail-content');

  if (fundTx.length === 0) {
    container.style.display = 'none';
    return;
  }

  container.style.display = 'block';

  // 按月汇总
  var monthMap = {};
  fundTx.forEach(function(t) {
    var month = t.date.substring(0, 7);
    if (!monthMap[month]) monthMap[month] = {count: 0, total: 0};
    monthMap[month].count++;
    monthMap[month].total += t.amount;
  });

  var months = Object.keys(monthMap).sort();
  var grandTotal = 0;

  var html = months.map(function(m) {
    grandTotal += monthMap[m].total;
    return '<div class="fund-detail-row">' +
      '<span>' + m + '</span>' +
      '<span>' + monthMap[m].count + ' 笔 &nbsp; ' + formatMoney(monthMap[m].total) + '</span>' +
    '</div>';
  }).join('');

  html += '<div class="fund-detail-row fund-detail-total">' +
    '<span>合计</span>' +
    '<span>' + fundTx.length + ' 笔 &nbsp; ' + formatMoney(grandTotal) + '</span>' +
  '</div>';

  content.innerHTML = html;
}

/* ============================================================
 * 导出 / 导入
 * ============================================================ */

function exportData() {
  var dataStr = JSON.stringify(appData, null, 2);
  var blob = new Blob([dataStr], {type: 'application/json'});
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = 'yuntian_finance_' + todayStr() + '.json';
  a.click();
  URL.revokeObjectURL(url);
  showToast('数据已导出', 'success');
}

function importData(file) {
  var reader = new FileReader();
  reader.onload = function(e) {
    try {
      var data = JSON.parse(e.target.result);
      if (!data.settings || !data.transactions) { showToast('文件格式不正确', 'error'); return; }
      window.verifyDeletePassword(function() {
        appData = data;
        if (!appData.recurringRules) appData.recurringRules = [];
        if (!appData.deletedRecurringIds) appData.deletedRecurringIds = [];
        if (!appData.categories) appData.categories = JSON.parse(JSON.stringify(defaultData.categories));
        if (!appData.members) appData.members = JSON.parse(JSON.stringify(defaultData.members));
        if (appData.meetingRound === undefined) appData.meetingRound = 1;
        if (appData.members) {
          appData.members.forEach(function(m) {
            if (m.meetingDone === undefined) m.meetingDone = false;
          });
        }
        saveData();
        initUI();
        renderAll();
        showToast('数据导入成功', 'success');
      }, { title: '导入数据', desc: '导入将覆盖当前所有数据，请输入密码以确认', btnText: '确认导入' });
    } catch(err) {
      showToast('导入失败：' + err.message, 'error');
    }
  };
  reader.readAsText(file);
}

function resetData() {
  window.verifyDeletePassword(function() {
    appData = JSON.parse(JSON.stringify(defaultData));
    saveData();
    initUI();
    renderAll();
    showToast('数据已重置', 'success');
  }, { title: '重置数据', desc: '此操作将清除所有数据且不可撤销，请输入密码确认', btnText: '确认重置' });
}

/* ============================================================
 * 设置
 * ============================================================ */

function saveSettings() {
  window.verifyDeletePassword(function() {
    appData.settings.teamName = document.getElementById('setting-team-name').value || '云天小队';
    appData.settings.initialBalance = parseFloat(document.getElementById('setting-init-balance').value) || 0;
    appData.settings.initialBalanceDate = document.getElementById('setting-init-date').value || todayStr();
    saveData();
    renderAll();
    showToast('设置已保存', 'success');
  }, { title: '保存设置', desc: '请输入密码以确认保存设置', btnText: '确认保存' });
}

/* ============================================================
 * 分类管理
 * ============================================================ */

function renderCategoryManager() {
  var cats = appData.categories || { income: [], expense: [] };

  ['income', 'expense'].forEach(function(type) {
    var container = document.getElementById('cat-list-' + type);
    var list = cats[type] || [];
    if (list.length === 0) {
      container.innerHTML = '<div class="cat-empty">暂无分类，点击添加</div>';
    } else {
      container.innerHTML = list.map(function(name, idx) {
        return '<div class="cat-item">' +
          '<span class="cat-item-name">' + escapeHtml(name) + '</span>' +
          '<div class="cat-item-actions">' +
            '<button class="cat-item-btn cat-edit-btn" onclick="editCategoryPrompt(\'' + type + '\',' + idx + ')">编辑</button>' +
            '<button class="cat-item-btn cat-del-btn" onclick="deleteCategoryConfirm(\'' + type + '\',' + idx + ')">删除</button>' +
          '</div>' +
        '</div>';
      }).join('');
    }
  });
}

window.addCategoryPrompt = function(type) {
  window.verifyDeletePassword(function() {
    showCategoryEditOverlay({
      mode: 'add',
      type: type,
      title: '添加' + (type === 'income' ? '收入' : '支出') + '分类',
      desc: '请输入分类名称',
      value: '',
      onSubmit: function(name) {
        if (!appData.categories) appData.categories = { income: [], expense: [] };
        if (!appData.categories[type]) appData.categories[type] = [];
        if (appData.categories[type].indexOf(name) !== -1) {
          showToast('该分类已存在', 'error');
          return;
        }
        appData.categories[type].push(name);
        saveData();
        renderCategoryManager();
        populateCategoryFilters();
        var txType = document.querySelector('input[name="tx-type"]:checked');
        if (txType) updateTxCategoryOptions(txType.value);
        var rrType = document.querySelector('input[name="rr-type"]:checked');
        if (rrType) updateRrCategoryOptions(rrType.value);
        showToast('分类已添加', 'success');
      }
    });
  }, { title: '添加分类', desc: '请输入密码以确认添加分类', btnText: '确认' });
};

window.editCategoryPrompt = function(type, index) {
  window.verifyDeletePassword(function() {
    var oldName = appData.categories[type][index];
    showCategoryEditOverlay({
      mode: 'edit',
      type: type,
      title: '编辑分类',
      desc: '修改分类名称（已有记录将同步更新）',
      value: oldName,
      onSubmit: function(newName) {
        if (newName === oldName) return;
        if (appData.categories[type].indexOf(newName) !== -1) {
          showToast('该分类已存在', 'error');
          return;
        }
        // Update category name
        appData.categories[type][index] = newName;
        // Update all transactions with this category
        if (appData.transactions) {
          appData.transactions.forEach(function(t) {
            if (t.category === oldName) t.category = newName;
          });
        }
        // Update all recurring rules with this category
        if (appData.recurringRules) {
          appData.recurringRules.forEach(function(r) {
            if (r.category === oldName) r.category = newName;
          });
        }
        saveData();
        renderCategoryManager();
        populateCategoryFilters();
        var txType = document.querySelector('input[name="tx-type"]:checked');
        if (txType) updateTxCategoryOptions(txType.value);
        var rrType = document.querySelector('input[name="rr-type"]:checked');
        if (rrType) updateRrCategoryOptions(rrType.value);
        renderAll();
        showToast('分类已更新，相关记录已同步', 'success');
      }
    });
  }, { title: '编辑分类', desc: '请输入密码以确认编辑分类', btnText: '确认' });
};

window.deleteCategoryConfirm = function(type, index) {
  var catName = appData.categories[type][index];
  // Check if any transactions or rules use this category
  var usedInTx = (appData.transactions || []).some(function(t) { return t.category === catName; });
  var usedInRule = (appData.recurringRules || []).some(function(r) { return r.category === catName; });

  if (usedInTx || usedInRule) {
    showToast('该分类已被使用，无法删除', 'error');
    return;
  }

  window.verifyDeletePassword(function() {
    appData.categories[type].splice(index, 1);
    saveData();
    renderCategoryManager();
    populateCategoryFilters();
    var txType = document.querySelector('input[name="tx-type"]:checked');
    if (txType) updateTxCategoryOptions(txType.value);
    var rrType = document.querySelector('input[name="rr-type"]:checked');
    if (rrType) updateRrCategoryOptions(rrType.value);
    showToast('分类已删除', 'success');
  }, { title: '删除分类', desc: '请输入密码以确认删除此分类', btnText: '确认删除' });
};

function showCategoryEditOverlay(config) {
  var overlay = document.getElementById('category-edit-overlay');
  var input = document.getElementById('cat-edit-input');
  var error = document.getElementById('cat-edit-error');
  var titleEl = document.getElementById('cat-edit-title');
  var descEl = document.getElementById('cat-edit-desc');
  var submitBtn = document.getElementById('cat-edit-submit');
  var cancelBtn = document.getElementById('cat-edit-cancel');
  var closeBtn = document.getElementById('cat-edit-close');

  titleEl.textContent = config.title;
  descEl.textContent = config.desc;
  input.value = config.value || '';
  error.style.display = 'none';
  overlay.style.display = 'flex';
  input.focus();

  function cleanup() {
    overlay.style.display = 'none';
    submitBtn.removeEventListener('click', onSubmit);
    cancelBtn.removeEventListener('click', onCancel);
    closeBtn.removeEventListener('click', onCancel);
    input.removeEventListener('keydown', onKeydown);
  }
  function onSubmit() {
    var name = input.value.trim();
    if (!name) {
      error.style.display = 'block';
      input.focus();
      return;
    }
    cleanup();
    config.onSubmit(name);
  }
  function onCancel() { cleanup(); }
  function onKeydown(e) {
    if (e.key === 'Enter') { e.preventDefault(); onSubmit(); }
    if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
  }

  submitBtn.addEventListener('click', onSubmit);
  cancelBtn.addEventListener('click', onCancel);
  closeBtn.addEventListener('click', onCancel);
  input.addEventListener('keydown', onKeydown);
}

/* ============================================================
 * 队员名单管理
 * ============================================================ */

function renderMembers() {
  var container = document.getElementById('roster-container');
  if (!container) return;
  var members = appData.members || [];

  // Update meeting round summary (only counts 正式队员)
  var round = appData.meetingRound || 1;
  var formalMembers = members.filter(function(m) { return m.category === '正式队员'; });
  var doneCount = formalMembers.filter(function(m) { return m.meetingDone; }).length;
  var totalCount = formalMembers.length;
  var roundNumEl = document.getElementById('meeting-round-num');
  var doneEl = document.getElementById('meeting-done-count');
  var totalEl = document.getElementById('meeting-total-count');
  var fillEl = document.getElementById('meeting-progress-fill');
  if (roundNumEl) roundNumEl.textContent = round;
  if (doneEl) doneEl.textContent = doneCount;
  if (totalEl) totalEl.textContent = totalCount;
  if (fillEl) {
    var pct = totalCount > 0 ? Math.round(doneCount / totalCount * 100) : 0;
    fillEl.style.width = pct + '%';
  }

  if (members.length === 0) {
    container.innerHTML = '<div class="roster-empty">暂无队员信息，点击右上角添加</div>';
    return;
  }

  // Group by category
  var groups = {};
  var groupOrder = ['荣誉队长', '正式队员', '保留队员'];
  members.forEach(function(m) {
    if (!groups[m.category]) groups[m.category] = [];
    groups[m.category].push(m);
  });

  // Also include any categories not in the default order
  members.forEach(function(m) {
    if (groupOrder.indexOf(m.category) === -1 && groups[m.category]) {
      // Already added, just ensure it's in groupOrder at the end
    }
  });
  Object.keys(groups).forEach(function(cat) {
    if (groupOrder.indexOf(cat) === -1) groupOrder.push(cat);
  });

  var html = '';
  groupOrder.forEach(function(cat) {
    if (!groups[cat]) return;
    var list = groups[cat];
    var isFormal = (cat === '正式队员');
    html += '<div class="roster-group">';
    html += '<div class="roster-group-header">' + escapeHtml(cat) + ' <span class="roster-group-count">' + list.length + '人</span></div>';
    html += '<table class="roster-table"><thead><tr>';
    html += '<th>序号</th><th>姓名</th><th>生日（农历）</th><th>联系电话</th><th>备注</th>';
    if (isFormal) html += '<th>本轮例会</th>';
    html += '<th>操作</th>';
    html += '</tr></thead><tbody>';
    list.forEach(function(m, idx) {
      var remarkHtml = m.remark ? '<span class="roster-remark-badge">' + escapeHtml(m.remark) + '</span>' : '';
      var meetingHtml = '';
      if (isFormal) {
        meetingHtml = m.meetingDone
          ? '<button class="meeting-toggle-btn meeting-done" onclick="toggleMeetingDone(\'' + m.id + '\')">✓ 已办</button>'
          : '<button class="meeting-toggle-btn meeting-not-done" onclick="toggleMeetingDone(\'' + m.id + '\')">标记已办</button>';
      }
      html += '<tr>';
      html += '<td>' + (idx + 1) + '</td>';
      html += '<td>' + escapeHtml(m.name) + '</td>';
      html += '<td>' + escapeHtml(m.birthday || '') + '</td>';
      html += '<td>' + escapeHtml(m.phone || '') + '</td>';
      html += '<td>' + remarkHtml + '</td>';
      if (isFormal) html += '<td>' + meetingHtml + '</td>';
      html += '<td><div class="roster-actions">';
      html += '<button class="roster-edit-btn" onclick="editMemberPrompt(\'' + m.id + '\')">编辑</button>';
      html += '<button class="roster-del-btn" onclick="deleteMemberConfirm(\'' + m.id + '\')">删除</button>';
      html += '</div></td>';
      html += '</tr>';
    });
    html += '</tbody></table></div>';
  });

  container.innerHTML = html;
}

window.addMemberPrompt = function() {
  window.verifyDeletePassword(function() {
    showMemberEditOverlay({
      mode: 'add',
      title: '添加队员',
      desc: '请输入队员信息',
      values: { category: '正式队员', name: '', birthday: '', phone: '', remark: '' },
      onSubmit: function(data) {
        if (!data.name || !data.name.trim()) {
          showToast('请填写姓名', 'error');
          return;
        }
        if (!appData.members) appData.members = [];
        appData.members.push({
          id: genId(),
          category: data.category,
          name: data.name.trim(),
          birthday: data.birthday.trim(),
          phone: data.phone.trim(),
          remark: data.remark.trim()
        });
        saveData();
        renderMembers();
        showToast('队员已添加', 'success');
      }
    });
  }, { title: '添加队员', desc: '请输入密码以确认添加队员', btnText: '确认' });
};

window.editMemberPrompt = function(id) {
  var member = null;
  for (var i = 0; i < appData.members.length; i++) {
    if (appData.members[i].id === id) { member = appData.members[i]; break; }
  }
  if (!member) return;

  window.verifyDeletePassword(function() {
    showMemberEditOverlay({
      mode: 'edit',
      title: '编辑队员',
      desc: '修改队员信息',
      values: {
        category: member.category,
        name: member.name,
        birthday: member.birthday || '',
        phone: member.phone || '',
        remark: member.remark || ''
      },
      onSubmit: function(data) {
        if (!data.name || !data.name.trim()) {
          showToast('请填写姓名', 'error');
          return;
        }
        member.category = data.category;
        member.name = data.name.trim();
        member.birthday = data.birthday.trim();
        member.phone = data.phone.trim();
        member.remark = data.remark.trim();
        saveData();
        renderMembers();
        showToast('队员信息已更新', 'success');
      }
    });
  }, { title: '编辑队员', desc: '请输入密码以确认编辑队员信息', btnText: '确认' });
};

window.deleteMemberConfirm = function(id) {
  window.verifyDeletePassword(function() {
    appData.members = appData.members.filter(function(m) { return m.id !== id; });
    saveData();
    renderMembers();
    showToast('队员已删除', 'success');
  }, { title: '删除队员', desc: '请输入密码以确认删除此队员', btnText: '确认删除' });
};

/* ============================================================
 * 例会轮次管理
 * ============================================================ */

window.toggleMeetingDone = function(memberId) {
  window.verifyDeletePassword(function() {
    var member = null;
    for (var i = 0; i < appData.members.length; i++) {
      if (appData.members[i].id === memberId) { member = appData.members[i]; break; }
    }
    if (!member) return;
    member.meetingDone = !member.meetingDone;
    saveData();
    renderMembers();
    showToast(member.meetingDone ? '已标记本轮已办' : '已取消标记', 'success');
  }, { title: '例会状态', desc: '请输入密码以确认操作', btnText: '确认' });
};

window.startNewMeetingRound = function() {
  window.verifyDeletePassword(function() {
    appData.meetingRound = (appData.meetingRound || 1) + 1;
    appData.members.forEach(function(m) {
      if (m.category === '正式队员') m.meetingDone = false;
    });
    saveData();
    renderMembers();
    showToast('已开始第 ' + appData.meetingRound + ' 轮例会', 'success');
  }, { title: '开始新一轮例会', desc: '所有正式队员的例会状态将被重置，请输入密码确认', btnText: '确认' });
};

function showMemberEditOverlay(config) {
  var overlay = document.getElementById('member-edit-overlay');
  var titleEl = document.getElementById('member-edit-title');
  var descEl = document.getElementById('member-edit-desc');
  var errorEl = document.getElementById('member-edit-error');
  var catInput = document.getElementById('member-category');
  var nameInput = document.getElementById('member-name');
  var birthdayInput = document.getElementById('member-birthday');
  var phoneInput = document.getElementById('member-phone');
  var remarkInput = document.getElementById('member-remark');
  var submitBtn = document.getElementById('member-edit-submit');
  var cancelBtn = document.getElementById('member-edit-cancel');
  var closeBtn = document.getElementById('member-edit-close');

  titleEl.textContent = config.title;
  descEl.textContent = config.desc;
  catInput.value = config.values.category;
  nameInput.value = config.values.name;
  birthdayInput.value = config.values.birthday;
  phoneInput.value = config.values.phone;
  remarkInput.value = config.values.remark;
  errorEl.style.display = 'none';
  overlay.style.display = 'flex';
  nameInput.focus();

  function cleanup() {
    overlay.style.display = 'none';
    submitBtn.removeEventListener('click', onSubmit);
    cancelBtn.removeEventListener('click', onCancel);
    closeBtn.removeEventListener('click', onCancel);
    nameInput.removeEventListener('keydown', onKeydown);
  }
  function onSubmit() {
    var name = nameInput.value.trim();
    if (!name) {
      errorEl.style.display = 'block';
      nameInput.focus();
      return;
    }
    cleanup();
    config.onSubmit({
      category: catInput.value,
      name: name,
      birthday: birthdayInput.value,
      phone: phoneInput.value,
      remark: remarkInput.value
    });
  }
  function onCancel() { cleanup(); }
  function onKeydown(e) {
    if (e.key === 'Enter') { e.preventDefault(); onSubmit(); }
    if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
  }

  submitBtn.addEventListener('click', onSubmit);
  cancelBtn.addEventListener('click', onCancel);
  closeBtn.addEventListener('click', onCancel);
  nameInput.addEventListener('keydown', onKeydown);
}

/* ============================================================
 * Tab 切换
 * ============================================================ */

window.switchTab = function(tabName) {
  document.querySelectorAll('.tab-btn').forEach(function(btn) {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });
  document.querySelectorAll('.tab-content').forEach(function(content) {
    content.classList.toggle('active', content.id === 'tab-' + tabName);
  });

  if (tabName === 'stats') {
    var now = new Date();
    if (!document.getElementById('stats-start').value) {
      document.getElementById('stats-start').value = appData.settings.initialBalanceDate || '2025-02-25';
    }
    if (!document.getElementById('stats-end').value) {
      document.getElementById('stats-end').value = todayStr();
    }
  }
};

/* ============================================================
 * Toast
 * ============================================================ */

var toastTimer = null;
function showToast(msg, type) {
  var toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.className = 'toast ' + (type || '');
  toast.style.display = 'block';
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(function() {
    toast.style.display = 'none';
  }, 2500);
}

/* ============================================================
 * 快捷日期范围
 * ============================================================ */

function setQuickRange(range) {
  var now = new Date();
  var start, end = todayStr();

  if (range === 'week') {
    var day = now.getDay() || 7;
    start = formatDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() - day + 1));
  } else if (range === 'month') {
    start = formatDate(new Date(now.getFullYear(), now.getMonth(), 1));
  } else if (range === 'quarter') {
    var q = Math.floor(now.getMonth() / 3);
    start = formatDate(new Date(now.getFullYear(), q * 3, 1));
  } else if (range === 'year') {
    start = formatDate(new Date(now.getFullYear(), 0, 1));
  } else if (range === 'all') {
    start = appData.settings.initialBalanceDate || '2025-01-01';
  }

  document.getElementById('stats-start').value = start;
  document.getElementById('stats-end').value = end;
}

/* ============================================================
 * 分类选项更新
 * ============================================================ */

function updateTxCategoryOptions(type) {
  var select = document.getElementById('tx-category');
  var cats = (appData.categories && appData.categories[type]) || [];
  select.innerHTML = cats.map(function(c) {
    return '<option value="' + escapeHtml(c) + '">' + escapeHtml(c) + '</option>';
  }).join('');
}

function updateRrCategoryOptions(type) {
  var select = document.getElementById('rr-category');
  var cats = (appData.categories && appData.categories[type]) || [];
  select.innerHTML = cats.map(function(c) {
    return '<option value="' + escapeHtml(c) + '">' + escapeHtml(c) + '</option>';
  }).join('');
}

/* ============================================================
 * 事件绑定
 * ============================================================ */

function bindEvents() {
  // 登录
  document.getElementById('login-form').addEventListener('submit', handleLogin);
  document.getElementById('logout-btn').addEventListener('click', handleLogout);

  // Tab 切换
  document.querySelectorAll('.tab-btn').forEach(function(btn) {
    btn.addEventListener('click', function() { switchTab(btn.dataset.tab); });
  });

  // 交易表单
  document.getElementById('tx-form').addEventListener('submit', handleTxForm);

  // 循环规则表单
  document.getElementById('recurring-form').addEventListener('submit', handleRecurringForm);

  // 筛选
  document.getElementById('filter-apply').addEventListener('click', renderTransactions);
  document.getElementById('filter-reset').addEventListener('click', function() {
    document.getElementById('filter-type').value = '';
    document.getElementById('filter-category').value = '';
    document.getElementById('filter-start').value = '';
    document.getElementById('filter-end').value = '';
    renderTransactions();
  });

  // 统计
  document.getElementById('stats-apply').addEventListener('click', handleStats);
  document.querySelectorAll('.quick-range .btn').forEach(function(btn) {
    btn.addEventListener('click', function() { setQuickRange(btn.dataset.range); });
  });

  // 设置
  document.getElementById('export-btn').addEventListener('click', exportData);
  document.getElementById('import-btn').addEventListener('click', function() {
    document.getElementById('import-file').click();
  });
  document.getElementById('import-file').addEventListener('change', function(e) {
    if (e.target.files[0]) importData(e.target.files[0]);
    e.target.value = '';
  });
  document.getElementById('reset-btn').addEventListener('click', resetData);
  document.getElementById('save-settings').addEventListener('click', saveSettings);

  // 云端加密同步
  document.getElementById('cloud-save-btn').addEventListener('click', cloudSaveBtnHandler);
  document.getElementById('cloud-test-btn').addEventListener('click', cloudTestBtnHandler);
  document.getElementById('cloud-disable-btn').addEventListener('click', cloudDisableBtnHandler);

  // 队员名单
  document.getElementById('add-member-btn').addEventListener('click', addMemberPrompt);
  document.getElementById('new-round-btn').addEventListener('click', startNewMeetingRound);

  // 类型切换更新分类
  document.querySelectorAll('input[name="tx-type"]').forEach(function(radio) {
    radio.addEventListener('change', function() { updateTxCategoryOptions(radio.value); });
  });
  document.querySelectorAll('input[name="rr-type"]').forEach(function(radio) {
    radio.addEventListener('change', function() { updateRrCategoryOptions(radio.value); });
  });
}

/* ============================================================
 * 云端加密同步设置
 * ============================================================ */
function loadCloudSettingsUI() {
  var s = getCloudSettings();
  var tokenEl = document.getElementById('cloud-token');
  var pwdEl = document.getElementById('cloud-password');
  if (tokenEl && s.token) tokenEl.value = s.token;
  if (pwdEl) pwdEl.value = '';
  var msg = document.getElementById('cloud-status-msg');
  if (msg) {
    if (s.enabled && s.token) msg.textContent = '✅ 云端同步已开启（数据已 AES 加密）';
    else msg.textContent = '⚠️ 云端同步未开启，数据仅存本地浏览器';
  }
}

function showCloudMsg(text, type) {
  var msg = document.getElementById('cloud-status-msg');
  if (msg) {
    msg.textContent = text;
    msg.className = 'card-desc' + (type ? ' status-' + type : '');
  }
}

function cloudSaveBtnHandler() {
  var token = (document.getElementById('cloud-token').value || '').trim();
  var pwd = document.getElementById('cloud-password').value || '';
  if (!token) { showCloudMsg('请输入 GitHub Token', 'error'); return; }
  var s = getCloudSettings();
  // 首次开启或密码为空时，必须有密码用于加密
  if ((!s.enabled || !s.password) && !pwd) {
    showCloudMsg('首次开启需设置云同步密码（用于加密）', 'error');
    return;
  }
  var newPwd = pwd || s.password;
  var testData = appData || loadLocalData() || JSON.parse(JSON.stringify(defaultData));
  // 1) 本地加密/解密自测
  encryptCloudData(testData, newPwd)
    .then(function(b64) { return decryptCloudData(b64, newPwd); })
    .then(function() {
      // 2) 保存设置并上传
      setCloudSettings({ token: token, password: newPwd, enabled: true });
      lastCloudSha = null;
      showCloudMsg('正在加密并上传数据...', '');
      cloudSave(testData, function(err) {
        if (err === 'auth') {
          setCloudSettings({ token: '', password: '', enabled: false });
          showCloudMsg('Token 无效或无权限，请检查后重试', 'error');
        } else if (err) {
          showCloudMsg('数据已本地保存，但上传失败：' + err + '。可稍后点"测试连接"或重新开启', 'error');
        } else {
          showCloudMsg('✅ 同步已开启，数据已加密上传至 GitHub', 'success');
        }
        loadCloudSettingsUI();
      });
    })
    .catch(function() { showCloudMsg('密码处理失败', 'error'); });
}

function cloudTestBtnHandler() {
  var token = (document.getElementById('cloud-token').value || '').trim();
  var pwd = document.getElementById('cloud-password').value || '';
  var prev = getCloudSettings();
  token = token || prev.token;
  pwd = pwd || prev.password;
  if (!token) { showCloudMsg('请先输入或保存 Token', 'error'); return; }
  if (!pwd) { showCloudMsg('请先输入云同步密码', 'error'); return; }
  // 临时启用以便 cloudLoad 读取
  setCloudSettings({ token: token, password: pwd, enabled: true });
  showCloudMsg('正在测试连接...', '');
  cloudLoad(function(err) {
    if (err === 'auth') showCloudMsg('Token 无效或无权限', 'error');
    else if (err === 'empty') showCloudMsg('连接成功！云端暂无数据，开启同步将上传本地数据', 'success');
    else if (err === 'password') showCloudMsg('连接成功，但云同步密码不匹配', 'error');
    else if (err) showCloudMsg('连接异常：' + err, 'error');
    else showCloudMsg('连接成功！云端数据已可解密', 'success');
    // 恢复原始启用状态（测试不改变设置）
    setCloudSettings(prev);
    loadCloudSettingsUI();
  });
}

function cloudDisableBtnHandler() {
  var s = getCloudSettings();
  if (!s.enabled) { showCloudMsg('云端同步本就未开启', ''); return; }
  setCloudSettings({ token: s.token, password: s.password, enabled: false });
  setSyncStatus('local');
  showCloudMsg('云端同步已关闭，数据仅存本地浏览器', '');
  loadCloudSettingsUI();
}

/* ============================================================
 * 初始化
 * ============================================================ */

function init() {
  bindEvents();
  if (isLoggedIn()) {
    showApp();
  } else {
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('app').style.display = 'none';
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

})();
