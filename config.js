// ตั้งค่าการเชื่อมต่อ Google Sheet
// วาง URL ของ Apps Script Web App (ลงท้ายด้วย /exec) แทนข้อความด้านล่าง
window.APP_CONFIG = {
  API_URL: 'https://script.google.com/macros/s/AKfycbwIkh99GNsAzdL84gaATIpBADyHpKPAxhA-g8DDX0kU8hW57uG-79spduVIEetsZ5pk-Q/exec',
  // ที่อยู่เว็บบน GitHub Pages — ใช้สร้างลิงก์/QR หน้าลงชื่อ เมื่อเปิดระบบจากไฟล์ในเครื่อง (เช่น ผ่าน WorkHub)
  SITE_URL: 'https://nuttawit61.github.io/Reportmeeting/',
  // ออกจากระบบอัตโนมัติเมื่อไม่มีการใช้งานเกินกี่นาที (ใส่ 0 = ปิด) — ไม่นับช่วงที่เปิด "โหมดลงชื่อเข้าประชุม"
  IDLE_MINUTES: 30
};
