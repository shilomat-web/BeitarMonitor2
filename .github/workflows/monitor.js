const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
const fs = require('fs');
const https = require('https');

const URL = 'https://www.leaan.co.il/category/%D7%A1%D7%A4%D7%95%D7%A8%D7%98/%D7%9B%D7%93%D7%95%D7%A8%D7%92%D7%9C/%D7%91%D7%99%D7%AA%D7%A8-%D7%99%D7%A8%D7%95%D7%A9%D7%9C%D7%99%D7%9D';
const CACHE_FILE = 'events_cache.json';

// טעינת cache קודם
function loadCache() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    }
  } catch (e) {
    console.log('No previous cache found');
  }
  return [];
}

// שמירת cache
function saveCache(events) {
  fs.writeFileSync(CACHE_FILE, JSON.stringify(events, null, 2));
}

// שליחת הודעה לטלגרם
function sendTelegram(message) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  
  if (!token || !chatId) {
    console.log('Missing Telegram credentials!');
    return Promise.resolve();
  }

  const data = JSON.stringify({
    chat_id: chatId,
    text: message,
    parse_mode: 'HTML',
    disable_web_page_preview: false
  });

  const options = {
    hostname: 'api.telegram.org',
    path: `/bot${token}/sendMessage`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': data.length
    }
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      res.on('data', () => {});
      res.on('end', () => resolve());
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// הפונקציה הראשית
async function checkEvents() {
  console.log('Starting browser...');
  
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled'
    ]
  });

  try {
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 },
      locale: 'he-IL'
    });

    const page = await context.newPage();
    
    console.log('Navigating to page...');
    await page.goto(URL, { 
      waitUntil: 'networkidle',
      timeout: 30000 
    });

    // המתנה לטעינת התוכן הדינמי
    console.log('Waiting for content...');
    await page.waitForTimeout(5000);

    // חילוץ כל הכותרות h4
    const events = await page.$$eval('h4', elements => 
      elements.map(el => el.textContent.trim()).filter(text => text.length > 0)
    );

    console.log(`Found ${events.length} events:`, events);

    // השוואה ל-cache
    const cachedEvents = loadCache();
    const newEvents = events.filter(e => !cachedEvents.includes(e));

    if (newEvents.length > 0) {
      console.log(`Found ${newEvents.length} new events!`);
      
      let message = '🔥 <b>אירועים חדשים בביתר ירושלים!</b>\n\n';
      newEvents.forEach(event => {
        message += `⚽ ${event}\n`;
      });
      message += `\n🔗 <a href="${URL}">לרכישת כרטיסים</a>`;

      await sendTelegram(message);
      console.log('Telegram notification sent!');
    } else {
      console.log('No new events found');
    }

    // שמירת cache מעודכן
    saveCache(events);

  } catch (error) {
    console.error('Error:', error);
    await sendTelegram(`❌ שגיאה במעקב: ${error.message}`);
  } finally {
    await browser.close();
  }
}

// הרצה
checkEvents().catch(console.error);
