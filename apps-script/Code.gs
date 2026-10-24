/**
 * ระบบบันทึกการประชุม — Google Apps Script (เก็บข้อมูลบน Google Sheet)
 * ภาควิชาเวชศาสตร์การธนาคารเลือด คณะแพทยศาสตร์ศิริราชพยาบาล
 *
 * ติดตั้ง (ดูรายละเอียดใน README.md):
 *   1) วางโค้ดนี้ใน ส่วนขยาย > Apps Script ของ Google Sheet แล้วบันทึก
 *   2) เลือกฟังก์ชัน setup แล้วกด ▶ เรียกใช้ (ครั้งแรกจะได้รหัสผ่านชั่วคราวใน Execution log)
 *   3) ตั้งรหัสผ่านของคุณเองที่เมนู "ระบบบันทึกการประชุม > ตั้งรหัสผ่านใหม่" ในหน้า Google Sheet
 *   4) ทำให้ใช้งานได้ > เว็บแอป (เรียกใช้ในฐานะ: ฉัน / ผู้มีสิทธิ์เข้าถึง: ทุกคน) แล้วนำลิงก์ /exec ไปใส่ใน config.js
 *
 * ข้อมูลอ่านได้ใน 4 แท็บ: การประชุม · ระเบียบวาระ · ผู้เข้าประชุม · งานที่มอบหมาย
 * แท็บซ่อน "_data" เก็บข้อมูลเต็มสำหรับหน้าเว็บ (รวมลายเซ็น) — ห้ามแก้ไขด้วยมือ
 */
var APP_VERSION = '2026-10-24';   // เปิดลิงก์ /exec ในเบราว์เซอร์ จะเห็นเลขเวอร์ชันนี้
var CONFIG = {
  SESSION_HOURS: 6,    // อยู่ในระบบได้นานสุด (ชั่วโมง, ไม่เกิน 6) — นับใหม่ทุกครั้งที่ใช้งาน
  MAX_FAIL: 10,        // ใส่รหัสผิดติดกันกี่ครั้งจึงล็อก
  LOCK_MINUTES: 15     // ล็อกกี่นาที
};
var DATA_SHEET = '_data';
var CHUNK = 45000;
var TABS = {
  meetings: {name: 'การประชุม', head: ['รหัส', 'ชื่อการประชุม', 'ครั้งที่', 'หน่วยงาน', 'วันที่', 'เวลาเริ่ม', 'เวลาสิ้นสุด', 'สถานที่', 'รูปแบบ', 'ประธาน', 'เลขานุการ', 'สถานะ', 'เริ่มประชุมจริง', 'เลิกประชุมจริง', 'ผู้จดรายงาน', 'ผู้ตรวจรายงาน', 'จำนวนเรื่อง', 'มาประชุม (คน)', 'รายชื่อทั้งหมด (คน)', 'แก้ไขล่าสุด']},
  items: {name: 'ระเบียบวาระ', head: ['รหัสการประชุม', 'การประชุม', 'ครั้งที่', 'วันที่', 'วาระ', 'หัวข้อวาระ', 'เรื่องที่', 'เรื่อง', 'ผู้เสนอ', 'เวลา (นาที)', 'เอกสาร', 'รายละเอียด', 'สรุปการอภิปราย', 'มติที่ประชุม']},
  people: {name: 'ผู้เข้าประชุม', head: ['รหัสการประชุม', 'การประชุม', 'ครั้งที่', 'วันที่', 'ลำดับ', 'ชื่อ - สกุล', 'ตำแหน่ง', 'หน่วยงาน', 'ตำแหน่งในที่ประชุม', 'ประเภท', 'สถานะ', 'เวลาลงชื่อ', 'หมายเหตุ', 'ลายมือชื่อ']},
  actions: {name: 'งานที่มอบหมาย', head: ['รหัสการประชุม', 'การประชุม', 'ครั้งที่', 'วันที่ประชุม', 'เรื่อง', 'งานที่มอบหมาย', 'ผู้รับผิดชอบ', 'กำหนดเสร็จ']}
};
var MODE = {onsite: 'ห้องประชุม', online: 'ออนไลน์', hybrid: 'ห้องประชุม + ออนไลน์'};
var MST = {prep: 'เตรียมการ', held: 'ประชุมแล้ว', done: 'รับรองรายงานแล้ว'};
var PST = {pending: 'ยังไม่ลงชื่อ', present: 'มาประชุม', online: 'ประชุมออนไลน์', leave: 'ลาประชุม', absent: 'ไม่มาประชุม'};

/* ---------------- ติดตั้ง / เมนู ---------------- */
function setup() {
  dataSheet_();
  Object.keys(TABS).forEach(function (k) { sheet_(TABS[k].name, TABS[k].head); });
  cleanup_();
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('PW_HASH')) {
    var temp = tempPassword_();
    setPassword_(temp);
    console.log('ติดตั้งเรียบร้อย — รหัสผ่านชั่วคราว: ' + temp);
    console.log('เปลี่ยนเป็นรหัสของคุณเองได้ที่เมนู "ระบบบันทึกการประชุม > ตั้งรหัสผ่านใหม่" ในหน้า Google Sheet');
    showMsg_('ติดตั้งเรียบร้อย\n\nรหัสผ่านชั่วคราว: ' + temp + '\n\nตั้งรหัสของคุณเองได้ที่เมนู ระบบบันทึกการประชุม > ตั้งรหัสผ่านใหม่');
  } else {
    console.log('ติดตั้งเรียบร้อย (ตั้งรหัสผ่านไว้แล้ว — เปลี่ยนได้ที่เมนู ระบบบันทึกการประชุม > ตั้งรหัสผ่านใหม่)');
  }
}
function onOpen() {
  SpreadsheetApp.getUi().createMenu('ระบบบันทึกการประชุม')
    .addItem('ตั้งรหัสผ่านใหม่', 'menuSetPassword')
    .addItem('ติดตั้ง / สร้างแท็บที่ขาด', 'setup')
    .addToUi();
}
function menuSetPassword() {
  var ui = SpreadsheetApp.getUi();
  var r = ui.prompt('ตั้งรหัสผ่านเข้าระบบบันทึกการประชุม', 'พิมพ์รหัสผ่านใหม่ (อย่างน้อย 6 ตัวอักษร)\nทุกคนที่ใช้ระบบจะเข้าด้วยรหัสนี้ และผู้ที่เข้าระบบอยู่จะต้องเข้าใหม่', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  var pw = r.getResponseText();
  if (String(pw).length < 6) { ui.alert('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร'); return; }
  setPassword_(pw);
  CacheService.getScriptCache().remove('fails');
  ui.alert('ตั้งรหัสผ่านใหม่เรียบร้อย');
}
function showMsg_(m) { try { SpreadsheetApp.getUi().alert(m); } catch (e) {} }

/* ---------------- รหัสผ่าน / การเข้าสู่ระบบ ---------------- */
function hash_(salt, pw) {
  var h = salt + '|' + pw;
  for (var i = 0; i < 300; i++) {
    h = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, h + '|' + salt, Utilities.Charset.UTF_8));
  }
  return h;
}
function setPassword_(pw) {
  var salt = Utilities.getUuid();
  PropertiesService.getScriptProperties().setProperties({PW_SALT: salt, PW_HASH: hash_(salt, String(pw)), PW_VER: String(Date.now())});
}
function tempPassword_() {
  var c = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789', s = '';
  for (var i = 0; i < 10; i++) s += c.charAt(Math.floor(Math.random() * c.length));
  return s;
}
function ttl_() { return Math.min(21600, Math.max(600, CONFIG.SESSION_HOURS * 3600)); }
function newSession_() {
  var t = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  CacheService.getScriptCache().put('s_' + t, PropertiesService.getScriptProperties().getProperty('PW_VER') || '1', ttl_());
  return t;
}
function session_(t) {
  if (!t) return false;
  var cache = CacheService.getScriptCache(), v = cache.get('s_' + t);
  if (!v || v !== (PropertiesService.getScriptProperties().getProperty('PW_VER') || '1')) return false;
  cache.put('s_' + t, v, ttl_());   // ต่ออายุทุกครั้งที่ใช้งาน
  return true;
}
function checkPw_(pw) {
  var props = PropertiesService.getScriptProperties();
  return hash_(props.getProperty('PW_SALT'), String(pw)) === props.getProperty('PW_HASH');
}
function login_(pw) {
  var props = PropertiesService.getScriptProperties(), cache = CacheService.getScriptCache();
  if (!props.getProperty('PW_HASH')) return {ok: false, error: 'nopw'};
  var fails = Number(cache.get('fails') || 0);
  if (fails >= CONFIG.MAX_FAIL) return {ok: false, error: 'locked', minutes: CONFIG.LOCK_MINUTES};
  if (!checkPw_(pw)) {
    cache.put('fails', String(fails + 1), CONFIG.LOCK_MINUTES * 60);
    Utilities.sleep(700);
    return {ok: false, error: 'wrong', left: Math.max(0, CONFIG.MAX_FAIL - fails - 1)};
  }
  cache.remove('fails');
  return {ok: true, session: newSession_(), name: SpreadsheetApp.getActiveSpreadsheet().getName(), hours: CONFIG.SESSION_HOURS};
}
function changePw_(p) {
  if (!checkPw_(p.old || '')) return {ok: false, error: 'wrong'};
  if (String(p.pw || '').length < 6) return {ok: false, error: 'short'};
  setPassword_(p.pw);
  return {ok: true, session: newSession_()};
}

/* ---------------- รับคำขอจากหน้าเว็บ ---------------- */
function doGet(e) { return handle_((e && e.parameter) || {}); }
function doPost(e) {
  var b = {};
  try { b = JSON.parse(e.postData.contents); } catch (err) {}
  return handle_(b);
}
function out_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function handle_(p) {
  var a = p.action || 'info';
  try {
    if (a === 'info') return out_({ok: true, app: 'ระบบบันทึกการประชุม', version: APP_VERSION});
    if (a === 'login') return out_(login_(p.password || ''));
    if (!session_(p.session)) return out_({ok: false, error: 'auth'});
    if (a === 'logout') { CacheService.getScriptCache().remove('s_' + p.session); return out_({ok: true}); }
    if (a === 'password') return out_(changePw_(p));
    var lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
      if (a === 'list') return out_(list_(Number(p.since) || 0));
      if (a === 'save') return out_(save_(p.meetings || []));
      if (a === 'delete') return out_(del_(p.ids || []));
      return out_({ok: false, error: 'action'});
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    return out_({ok: false, error: String((err && err.message) || err)});
  }
}

/* ---------------- ข้อมูล ---------------- */
function sheet_(name, head) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold').setBackground('#1f3a68').setFontColor('#ffffff');
    sh.setFrozenRows(1);
    if (name === DATA_SHEET) sh.hideSheet();
  }
  return sh;
}
function dataSheet_() { return sheet_(DATA_SHEET, ['id', 'updated', 'json']); }

function readData_() {
  var sh = dataSheet_(), n = sh.getLastRow();
  if (n < 2) return [];
  var v = sh.getRange(2, 1, n - 1, Math.max(3, sh.getLastColumn())).getValues();
  return v.map(function (r, i) {
    return {row: i + 2, id: String(r[0]).replace(/^~/, ''), updated: Number(r[1]) || 0, cells: r};
  }).filter(function (x) { return x.id; });
}
function json_(x) { return x.cells.slice(2).map(function (c) { return String(c).replace(/^~/, ''); }).join(''); }

function list_(since) {
  var rows = readData_();
  return {
    ok: true, now: Date.now(),
    ids: rows.map(function (r) { return r.id; }),
    meetings: rows.filter(function (r) { return r.updated > since; }).map(function (r) { return JSON.parse(json_(r)); })
  };
}

function save_(list) {
  var sh = dataSheet_(), rows = readData_(), saved = [];
  list.forEach(function (m) {
    if (!m || !m.id) return;
    var ex = null;
    rows.forEach(function (r) { if (r.id === m.id) ex = r; });
    var merged = merge_(m, ex ? JSON.parse(json_(ex)) : null);
    merged.updated = Date.now();
    delete merged.base; delete merged._h; delete merged.syncedAt;
    var s = JSON.stringify(merged), vals = ['~' + m.id, merged.updated];
    for (var i = 0; i < s.length; i += CHUNK) vals.push('~' + s.slice(i, i + CHUNK));
    if (sh.getMaxColumns() < vals.length) sh.insertColumnsAfter(sh.getMaxColumns(), vals.length - sh.getMaxColumns());
    if (ex) {
      sh.getRange(ex.row, 1, 1, Math.max(sh.getLastColumn(), vals.length)).clearContent();
      sh.getRange(ex.row, 1, 1, vals.length).setValues([vals]);
    } else {
      sh.appendRow(vals);
    }
    writeTabs_(merged);
    saved.push(merged);
  });
  cleanup_();
  return {ok: true, now: Date.now(), meetings: saved};
}

/* รวมรายชื่อผู้เข้าประชุมเมื่อมีการแก้ไขพร้อมกันจากหลายเครื่อง (เช่น แท็บเล็ตลงชื่อ + เลขานุการแก้ไข) */
function merge_(inc, ex) {
  if (!ex || (Number(ex.updated) || 0) <= (Number(inc.base) || 0)) return inc;
  var del = {};
  (inc.deletedPeople || []).concat(ex.deletedPeople || []).forEach(function (id) { del[id] = 1; });
  var map = {}, order = [];
  (ex.people || []).forEach(function (p) { map[p.id] = p; });
  (inc.people || []).forEach(function (p) {
    var e = map[p.id];
    map[p.id] = (e && (e.updated || 0) > (p.updated || 0)) ? e : p;
    order.push(p.id);
  });
  (ex.people || []).forEach(function (p) { if (order.indexOf(p.id) < 0) order.push(p.id); });
  inc.people = order.filter(function (id) { return !del[id]; }).map(function (id) { return map[id]; });
  inc.deletedPeople = Object.keys(del);
  return inc;
}

function writeTabs_(m) {
  var t = m.title || '', no = m.no || '', d = m.date || '', ppl = m.people || [];
  var here = ppl.filter(function (p) { return p.status === 'present' || p.status === 'online'; }).length;
  replace_(TABS.meetings, m.id, [[m.id, t, no, m.org, d, m.start, m.end, m.venue, MODE[m.mode], m.chair, m.secretary, MST[m.status],
    m.actualStart, m.actualEnd, m.recorder, m.checker, (m.items || []).length, here, ppl.length,
    Utilities.formatDate(new Date(m.updated), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm')]]);
  var items = [], acts = [];
  (m.sections || []).forEach(function (s, si) {
    (m.items || []).filter(function (it) { return it.sec === s.id; }).forEach(function (it, ii) {
      var n2 = (si + 1) + '.' + (ii + 1);
      items.push([m.id, t, no, d, 'วาระที่ ' + (si + 1), s.title, n2, it.title, it.presenter, it.mins, it.attach, it.detail, it.discussion, it.resolution]);
      (it.actions || []).forEach(function (a) {
        if (a.task) acts.push([m.id, t, no, d, n2 + ' ' + (it.title || ''), a.task, a.owner, a.due]);
      });
    });
  });
  replace_(TABS.items, m.id, items);
  replace_(TABS.people, m.id, ppl.map(function (p, i) {
    return [m.id, t, no, d, i + 1, p.name, p.position, p.org, p.role, p.type === 'guest' ? 'ผู้เข้าร่วมประชุม' : 'กรรมการ',
      PST[p.status], p.time, p.note, p.sig ? '✓' : ''];
  }));
  replace_(TABS.actions, m.id, acts);
}

function replace_(tab, id, rows) {
  var sh = sheet_(tab.name, tab.head);
  removeRows_(sh, id);
  if (!rows.length) return;
  var rng = sh.getRange(sh.getLastRow() + 1, 1, rows.length, tab.head.length);
  rng.setNumberFormat('@');
  rng.setValues(rows.map(function (r) {
    return r.map(function (v) {
      v = (v === null || v === undefined) ? '' : String(v);
      return /^[=+]/.test(v) ? "'" + v : v;
    });
  }));
}

function removeRows_(sh, id) {
  var n = sh.getLastRow();
  if (n < 2) return;
  var ids = sh.getRange(2, 1, n - 1, 1).getValues().map(function (r) { return String(r[0]).replace(/^~/, ''); });
  var i = ids.length - 1;
  while (i >= 0) {
    if (ids[i] === id) {
      var j = i;
      while (j > 0 && ids[j - 1] === id) j--;
      var cnt = i - j + 1;
      if (j === 0 && cnt >= sh.getMaxRows() - 1) sh.getRange(2, 1, cnt, Math.max(1, sh.getLastColumn())).clearContent();
      else sh.deleteRows(j + 2, cnt);
      i = j - 1;
    } else i--;
  }
}

function del_(ids) {
  ids.forEach(function (id) {
    removeRows_(dataSheet_(), id);
    Object.keys(TABS).forEach(function (k) { removeRows_(sheet_(TABS[k].name, TABS[k].head), id); });
  });
  return {ok: true, now: Date.now()};
}

/* ลบแผ่นงานว่างเริ่มต้น (Sheet1 / ชีต1) เมื่อมีแท็บข้อมูลแล้ว */
function cleanup_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ['Sheet1', 'ชีต1', 'แผ่นงาน1'].forEach(function (nm) {
    var sh = ss.getSheetByName(nm);
    if (sh && sh.getLastRow() === 0 && ss.getSheets().length > 2) ss.deleteSheet(sh);
  });
}
