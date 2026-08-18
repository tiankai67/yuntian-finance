/* ============================================================
 * 云天小队财务管理系统 v2.0 - app.js
 * 功能：登录认证、收支记账、循环记账、统计分析、云端同步
 * 数据存储：jsonblob.com 云端数据库 + localStorage 缓存
 * ============================================================ */

(function() {
'use strict';

/* ===== 认证配置（SHA-256哈希） ===== */
/* 安全：认证哈希已外置到 config.local.js（该文件被 .gitignore 忽略，不会入库）。
   部署时复制 config.local.example.js 为 config.local.js 并填入你自己的 SHA-256 哈希。
   若未配置，登录将不可用——请先创建 config.local.js。 */
var AUTH = (typeof window !== 'undefined' && window.__LOCAL_AUTH)
  ? window.__LOCAL_AUTH
  : { u: '', p: '' };

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

/* ===== 云端数据库配置 ===== */
var CLOUD_API = 'https://jsonblob.com/api/jsonBlob';
// 安全：云端 blob id 已外置到 config.local.js（gitignore，不入库）。见 config.local.example.js。
var CLOUD_BLOB_ID = (typeof window !== 'undefined' && window.__LOCAL_BLOB_ID)
  ? window.__LOCAL_BLOB_ID
  : '';
var BLOB_ID_KEY = 'yuntian_finance_blob_id_v6';

function getBlobId() {
  return localStorage.getItem(BLOB_ID_KEY) || CLOUD_BLOB_ID;
}

function setBlobId(id) {
  localStorage.setItem(BLOB_ID_KEY, id);
}

/* ===== 本地存储键 ===== */
var STORAGE_KEY = 'yuntian_finance_v6';
var SESSION_KEY = 'yuntian_finance_session';

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
 * 云端数据库操作
 * ============================================================ */

/* 从云端加载数据 */
function cloudLoad(callback) {
  var blobId = getBlobId();
  var controller = new AbortController();
  var timeoutId = setTimeout(function() { controller.abort(); }, 10000);

  fetch(CLOUD_API + '/' + blobId, { signal: controller.signal })
    .then(function(res) {
      clearTimeout(timeoutId);
      if (res.status === 404) {
        // Blob 已过期，需要重建
        callback('expired', null);
      } else if (!res.ok) {
        callback('error', null);
      } else {
        return res.json().then(function(data) { callback(null, data); });
      }
    })
    .catch(function(err) {
      clearTimeout(timeoutId);
      callback('network', null);
    });
}

/* 保存数据到云端 */
function cloudSave(data, callback) {
  var blobId = getBlobId();

  fetch(CLOUD_API + '/' + blobId, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  })
    .then(function(res) {
      if (res.status === 404) {
        // Blob 已过期，创建新 blob
        return fetch(CLOUD_API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        })
          .then(function(res2) {
            // 从 Location header 获取新 blob ID
            var location = res2.headers.get('Location') || res2.headers.get('location');
            if (location) {
              var newId = location.split('/').pop();
              setBlobId(newId);
            }
            return res2.json();
          });
      }
      if (!res.ok) throw new Error('Save failed');
      return res.json();
    })
    .then(function() { if (callback) callback(null); })
    .catch(function(err) { if (callback) callback(err); });
}

/* ============================================================
 * Keep-alive 心跳：定期 ping 云端 blob，防止 24 小时过期
 * ============================================================ */
var keepAliveTimer = null;

function startKeepAlive() {
  if (keepAliveTimer) return;
  // 每 2 小时 ping 一次 blob，保持活跃
  keepAliveTimer = setInterval(function() {
    var blobId = getBlobId();
    fetch(CLOUD_API + '/' + blobId, { method: 'HEAD' })
      .catch(function() {});
  }, 2 * 60 * 60 * 1000);
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
  setSyncStatus('syncing');
  isCloudLoading = true;

  cloudLoad(function(err, data) {
    isCloudLoading = false;

    if (!err && data && data.settings) {
      // ===== Layer 1: 云端数据可用 =====
      appData = data;
      normalizeData(appData);
      saveLocalData();
      setSyncStatus('synced');
      if (document.getElementById('app').style.display !== 'none') {
        initUI();
        renderAll();
      }
    } else if (err === 'expired') {
      // ===== Layer 2: Blob 过期，尝试本地缓存 =====
      var localData = loadLocalData();
      if (localData && localData.members && localData.members.length > 0) {
        // 本地缓存有队员数据，直接用
        appData = localData;
        normalizeData(appData);
        saveLocalData();
        setSyncStatus('syncing');
        cloudSave(appData, function(saveErr) {
          setSyncStatus(saveErr ? 'error' : 'synced');
          if (document.getElementById('app').style.display !== 'none') {
            initUI();
            renderAll();
          }
        });
      } else {
        // ===== Layer 3: 无本地缓存，尝试加密回退数据 =====
        recoverFromFallback(function(decryptedData) {
          if (decryptedData) {
            // 解密成功，使用回退数据
            appData = decryptedData;
            normalizeData(appData);
            saveLocalData();
            setSyncStatus('syncing');
            cloudSave(appData, function(saveErr) {
              setSyncStatus(saveErr ? 'error' : 'synced');
              if (document.getElementById('app').style.display !== 'none') {
                initUI();
                renderAll();
              }
            });
          } else {
            // ===== Layer 4: 全部失败，使用默认空数据 =====
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
    } else {
      // 网络错误，使用本地数据
      var fallback = loadLocalData();
      if (fallback && fallback.members && fallback.members.length > 0) {
        appData = fallback;
      } else if (fallback) {
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
  });
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
  setSyncStatus('syncing');
  cloudSave(appData, function(err) {
    if (err) {
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

  // 然后从云端加载最新数据
  loadCloudData();

  // 启动 keep-alive 心跳，防止 blob 过期
  startKeepAlive();
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
    'synced': '已同步',
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
