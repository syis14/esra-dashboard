/**
 * newsService.js
 * Fetches EBS-focused news via Google News RSS (rss2json proxy).
 * Each article is auto-scored with ESRA criteria.
 */

import { malaysiaLocations } from '../data/malaysiaLocations';

// ─── SOURCE DISPLAY ──────────────────────────────────────────────────────────

export const SOURCE_BADGE_COLORS = {
  'news.google.com':       '#4285f4',
  'reddit.com':            '#ff4500',
  'bharian.com.my':        '#0a2240',
  'sinarharian.com.my':    '#e31b23',
  'hmetro.com.my':         '#00529b',
  'astroawani.com':        '#ec1c24',
  'malaysiakini.com':      '#b22222',
  'thestar.com.my':        '#ed1c24',
  'utusan.com.my':         '#005bab',
  'freemalaysiatoday.com': '#e50e0e',
};
export const SOURCE_ICONS = {
  'news.google.com':       '🔍',
  'reddit.com':            '🔴',
  'bharian.com.my':        '📰',
  'sinarharian.com.my':    '📰',
  'hmetro.com.my':         '📰',
  'astroawani.com':        '📺',
  'malaysiakini.com':      '📰',
  'thestar.com.my':        '📰',
  'utusan.com.my':         '📰',
  'freemalaysiatoday.com': '📰',
};

// Helper to extract clean domain from URL
function getDomain(url) {
  try {
    return new URL(url).hostname.replace('www.', '');
  } catch {
    return 'news.google.com';
  }
}

// Helper to decode Google News RSS tracking URL to actual publisher destination
function decodeGoogleNewsUrl(sourceUrl) {
  try {
    if (!sourceUrl.includes('news.google.com/rss/articles/')) return sourceUrl;
    const parts = sourceUrl.split('/');
    const base64Part = parts[parts.length - 1];
    
    let cleanedB64 = base64Part.split('?')[0];
    
    // Add base64 padding
    while (cleanedB64.length % 4 !== 0) {
      cleanedB64 += '=';
    }
    
    const decoded = atob(cleanedB64.replace(/-/g, '+').replace(/_/g, '/'));
    const httpIdx = decoded.indexOf('http');
    if (httpIdx === -1) return sourceUrl;
    
    let extracted = decoded.substring(httpIdx);
    const match = extracted.match(/https?:\/\/[^\s"'<>\(\)\{\}\[\]\\^\`\x00-\x1f\x7f-\xff]+/);
    return match ? match[0] : sourceUrl;
  } catch (e) {
    return sourceUrl;
  }
}

// ─── STATE KEYWORDS & LOCAL MEDIA ───────────────────────────────────────────────

export const STATE_KEYWORDS = {
  'Johor':           ['Johor', 'Johor Bahru', 'JB', 'Batu Pahat', 'Muar', 'Kluang', 'Segamat', 'Pontian', 'Mersing'],
  'Kedah':           ['Kedah', 'Alor Setar', 'Sungai Petani', 'Kulim', 'Langkawi', 'Baling'],
  'Kelantan':        ['Kelantan', 'Kota Bharu', 'Gua Musang', 'Pasir Mas', 'Bachok', 'Tumpat'],
  'Melaka':          ['Melaka', 'Malacca', 'Alor Gajah', 'Jasin'],
  'Negeri Sembilan': ['Negeri Sembilan', 'N9', 'Seremban', 'Port Dickson', 'Tampin'],
  'Pahang':          ['Pahang', 'Kuantan', 'Temerloh', 'Bentong', 'Cameron Highlands', 'Raub'],
  'Perak':           ['Perak', 'Ipoh', 'Taiping', 'Teluk Intan', 'Kampar', 'Manjung'],
  'Perlis':          ['Perlis', 'Kangar', 'Padang Besar'],
  'Pulau Pinang':    ['Pulau Pinang', 'Penang', 'George Town', 'Seberang Perai', 'Butterworth'],
  'Sabah':           ['Sabah', 'Kota Kinabalu', 'KK', 'Sandakan', 'Tawau', 'Keningau', 'Lahad Datu'],
  'Sarawak':         ['Sarawak', 'Kuching', 'Miri', 'Sibu', 'Bintulu', 'Kapit'],
  'Selangor':        ['Selangor', 'Shah Alam', 'Petaling Jaya', 'PJ', 'Klang', 'Subang', 'Sepang'],
  'Terengganu':      ['Terengganu', 'Kuala Terengganu', 'Kemaman', 'Dungun', 'Besut'],
  'Kuala Lumpur':    ['Kuala Lumpur', 'KL', 'KLCC', 'Chow Kit', 'Bukit Bintang'],
  'Putrajaya':       ['Putrajaya'],
  'Labuan':          ['Labuan'],
};

// Local state-specific media (to force Google News to pick them up)
export const STATE_MEDIA = {
  'Johor': 'JohorKini OR "Media Digital Johor"',
  'Melaka': '"Melaka Hari Ini" OR MHI',
  'Selangor': 'Selangorkini OR "Media Selangor"',
  'Kedah': '"Warta Kedah"',
  'Terengganu': 'TRDI OR "Urus Setia Penerangan Darul Iman"',
  'Kelantan': 'UPKN OR "Urusetia Penerangan Kerajaan Negeri Kelantan"',
  'Perak': '"Perak Kini"',
  'Pahang': '"Pahang Media"',
  'Sabah': '"Sabah Media" OR "Daily Express"',
  'Sarawak': 'TVS OR "Sarawak Edition" OR "Borneo Post"',
  'Pulau Pinang': 'Buletin Mutiara'
};

// ─── EBS HEALTH TOPIC QUERIES ─────────────────────────────────────────────────
// Each query targets a specific EBS surveillance domain

const EBS_TOPICS = [
  { label: 'penyakit berjangkit',  query: 'wabak OR denggi OR leptospirosis OR taun OR campak OR keracunan' },
  { label: 'bencana & kecemasan', query: 'banjir OR bencana OR kebakaran OR jerebu OR haze OR tanah runtuh' },
  { label: 'kesihatan awam',       query: 'hospital OR klinik OR wad penuh OR kes meningkat OR outbreak' },
];

// ─── ESRA SCORING ENGINE (Mengikut Infografik ESRA KKM - Max 38) ──────────────
//
// 10 Domains:
// 1. Public Health Threat (5)
// 2. Transmission / Risk Expansion (5)
// 3. Unusualness (4)
// 4. Severity (4)
// 5. Information Spread (3)
// 6. Public Disorder / Social Impact (3)
// 7. Commercial / Product Impact (2)
// 8. Border & Trade Disruption (3)
// 9. Geographical Expansion (5)
// 10. Security / Political Risk (4)
//
// Urgency Levels:
// 🟥 High Urgent  : Score 35-38 OR Red Flag
// 🟨 Moderate     : Score 25-34
// 🟩 Archive      : Score < 24

export function scoreArticle(item) {
  const text = `${item.title} ${item.snippet}`.toLowerCase();

  let score = 0;
  let isRedFlag = false;

  // 1. Public Health Threat (5)
  if (/(wabak|berjangkit|denggi|taun|leptospirosis|malaria|kecemasan kesihatan|outbreak|infectious|disease|virus|疫情|感染|病毒|தொற்றுநோய்)/i.test(text)) score += 5;
  
  // 2. Transmission / Risk Expansion (5)
  if (/(merebak|meningkat|kluster|penularan|tular penyakit|spread|cluster|increase|传播|扩散|集群|பரவல்|கிளஸ்டர்)/i.test(text)) score += 5;
  
  // 3. Unusualness (4)
  if (/(luar biasa|pelik|misteri|tidak dijangka|mengejut|aneh|unusual|mystery|strange|sudden|罕见|神秘|不明|மர்ம|விசித்திரமான)/i.test(text)) score += 4;
  
  // 4. Severity (4)
  if (/(maut|mati|kematian|parah|kritikal|terkorban|icu|fatal|death|critical|killed|死亡|致命|严重|இறப்பு|உயிரிழப்பு|கவலைக்கிடம்)/i.test(text)) score += 4;
  
  // 5. Information Spread (3)
  if (/(tular|viral|media sosial|netizen|gempar|kecoh|trending|疯传|社交媒体|வைரல்)/i.test(text)) score += 3;
  
  // 6. Public Disorder / Social Impact (3)
  if (/(panik|bimbang|cemas|bantahan|marah|merusuh|ketegangan|panic|protest|riot|恐慌|抗议|骚乱|பீதி|கலவரம்)/i.test(text)) score += 3;
  
  // 7. Commercial / Product Impact (2)
  if (/(keracunan|makanan|air|pencemaran|kilang|bekalan|produk|poisoning|contaminated|toxic|factory|中毒|污染|工厂|விஷம்|மாசடைந்த)/i.test(text)) score += 2;
  
  // 8. Border & Trade Disruption (3)
  if (/(sempadan|pelancong|warga asing|rentas|import|eksport|border|tourist|foreigner|边境|游客|外籍|எல்லை|சுற்றுலா)/i.test(text)) score += 3;
  
  // 9. Geographical Expansion (5)
  if (/(beberapa daerah|seluruh negeri|mukim lain|daerah lain|merebak ke|multiple districts|statewide|spread to|多个地区|全州|பல்வேறு மாவட்டங்கள்)/i.test(text)) score += 5;
  
  // 10. Security / Political Risk (4)
  if (/(polis|keselamatan|sabotaj|kementerian|menteri|skandal|kerajaan|police|security|sabotage|ministry|minister|government|警察|安全|政府|காவல்துறை|பாதுகாப்பு)/i.test(text)) score += 4;

  // ── RED FLAG RULES ──────────────────────────────────────────────────────────
  if (
    /(1[1-9]|[2-9][0-9]) (maut|mati|terkorban|kematian|deaths|killed|死亡|இறப்பு)/i.test(text) ||     // >10 kematian
    /(radiasi|kimia|toksik|virus baharu|agen luar biasa|radiation|chemical|new virus|辐射|化学|新病毒|கதிர்வீச்சு|புதிய வைரஸ்)/i.test(text) || // Agen luar biasa
    /(darurat|bencana besar|letupan besar|emergency|major disaster|huge explosion|紧急状态|大灾难|大爆炸|அவசரநிலை|பேரழிவு)/i.test(text) || // Kejadian besar
    /(sempadan negara|antarabangsa|international border|国际边界|சர்வதேச எல்லை)/i.test(text) // Impak rentas sempadan
  ) {
    isRedFlag = true;
  }

  // Jika tiada kata kunci khusus ditemui, tapi ini ialah feed kesihatan/bencana (EBS),
  // kita berikan skor minima 3 sebagai 'Archive' value.
  if (score === 0) score = 3;

  // Tentukan tahap berdasarkan skor sebenar 38 mata
  if (isRedFlag || score >= 35) {
    return { esraCode: '🟥', esraLabel: 'Merah', esraScore: score, esraMarks: `${score}`, riskLevel: 'high' };
  } else if (score >= 25 && score <= 34) {
    return { esraCode: '🟨', esraLabel: 'Kuning', esraScore: score, esraMarks: `${score}`, riskLevel: 'medium' };
  } else {
    // Score < 24
    return { esraCode: '🟩', esraLabel: 'Hijau', esraScore: score, esraMarks: `${score}`, riskLevel: 'low' };
  }
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function formatRelativeTime(date) {
  const d = Math.floor((Date.now() - date.getTime()) / 1000);
  if (d < 60)    return `${d} saat lepas`;
  if (d < 3600)  return `${Math.floor(d / 60)} minit lepas`;
  if (d < 86400) return `${Math.floor(d / 3600)} jam lepas`;
  return `${Math.floor(d / 86400)} hari lepas`;
}

// Helper: is relevant to the state/district
function isRelevant(item, keywords, state = '', district = '') {
  const t = item.title.toLowerCase();
  const s = (item.snippet || '').toLowerCase();
  
  // Special case: Melaka Tengah
  if (state === 'Melaka' && district === 'Melaka Tengah') {
    const mentionsOther = ['alor gajah', 'jasin'].some(d => {
      const regex = new RegExp(`\\b${d}\\b`, 'i');
      return regex.test(t) || regex.test(s);
    });
    if (mentionsOther) return false;
  } else if (state && state !== 'Malaysia' && district && malaysiaLocations[state]) {
    // 1. If a specific district is selected, filter out other districts of the same state
    const matchesDistrict = t.includes(district.toLowerCase()) || s.includes(district.toLowerCase());
    
    if (!matchesDistrict) {
      const otherDistricts = malaysiaLocations[state].filter(d => d.toLowerCase() !== district.toLowerCase());
      const mentionsOtherDistrict = otherDistricts.some(d => {
        const ld = d.toLowerCase();
        // Strict boundary matching for other district names to prevent accidental false positives
        const regex = new RegExp(`\\b${ld}\\b`, 'i');
        return regex.test(t) || regex.test(s);
      });
      
      if (mentionsOtherDistrict) {
        return false; // Reject since it's about a different district and doesn't mention our target district
      }
    }
  }

  // 2. Mesti mengandungi nama negeri/daerah (kecuali Malaysia)
  if (state !== 'Malaysia') {
    const hasLocation = keywords.some(k => {
      const lk = k.toLowerCase();
      return t.includes(lk) || s.includes(lk);
    });
    if (!hasLocation) return false;
  }

  // 3. Buang spam iklan dan berita tidak relevan
  const garbageWords = [
    'sewa', 'rent', 'property', 'hartanah', 'jual', 'beli', 'sale', 'sales',
    'shopee', 'lazada', 'discount', 'diskaun', 'shop', 'retail', 'space for',
    'condo', 'apartment', 'villa', 'jawatan kosong', 'hiring', 'vacancy',
    'offer', 'promosi', 'promotion', 'voucher', 'ringgit', 'rm', 'harga',
    'pilihan raya', 'pilihanraya', 'prk', 'pru', 'undi', 'pengundi', 'parlimen', 'dun', 'calon', 'kempen',
    'sukan', 'bola sepak', 'bolasepak', 'badminton', 'olimpik', 'skuad', 'liga', 'perlawanan',
    'artis', 'pelakon', 'penyanyi', 'konsert', 'filem', 'drama', 'sinema', 'hiburan',
    'saham', 'bursa', 'pelaburan', 'dividen', 'kewangan', 'ekonomi',
    'resepi', 'resipi', 'masakan', 'menu', 'restoran'
  ];

  const isGarbage = garbageWords.some(w => t.includes(` ${w} `) || t.includes(`${w} `) || t.endsWith(w));
  
  if (isGarbage) return false;

  return true;
}

// ─── DATE CUTOFF HELPER ────────────────────────────────────────────────────────

/**
 * Returns a dynamic window based on selected timeframe.
 */
function getReportWindow(timeFrame, customStart = null, customEnd = null) {
  if (timeFrame === 'custom' && customStart && customEnd) {
    return { start: new Date(customStart), end: new Date(customEnd) };
  }

  const end = new Date();
  const start = new Date(end);

  if (timeFrame === '3d') {
    start.setDate(start.getDate() - 3);
  } else if (timeFrame === '7d') {
    start.setDate(start.getDate() - 7);
  } else {
    // default 24h
    start.setHours(start.getHours() - 24);
  }

  return { start, end };
}

const GAS_API_URL = 'https://script.google.com/macros/s/AKfycbzBFKLUNSGo39jWGirr_kzh52k2EqRinEIblR3Y7bD10MGlC4LD3OnPiBBivUzZh4m8EQ/exec';

async function fetchGasBackend(query, timeFrame, customStart, customEnd) {
  try {
    // We send 'q' parameter so React controls the exact keywords
    const url = `${GAS_API_URL}?q=${encodeURIComponent(query)}`;
    const resp = await fetch(url);
    if (!resp.ok) return [];
    
    const json = await resp.json();
    if (json.status !== 'success' || !json.data) return [];

    const { start, end } = getReportWindow(timeFrame, customStart, customEnd);

    return json.data
      .filter(item => {
        const pubDate = new Date(item.pubDate);
        return pubDate >= start && pubDate <= end;
      })
      .map(item => {
        const cleanLink = decodeGoogleNewsUrl(item.link || '');
        return {
          id:       item.link || Math.random().toString(),
          title:    item.title || '',
          source:   item.source || 'Google News',
          domain:   getDomain(cleanLink),
          link:     cleanLink,
          snippet:  '', 
          time:     formatRelativeTime(new Date(item.pubDate)),
          pubDate:  new Date(item.pubDate),
        };
      });
  } catch { return []; }
}

async function fetchReddit(query, timeFrame, customStart, customEnd) {
  let tParams = 'week';
  if (timeFrame === '24h') tParams = 'day';
  if (timeFrame === '3d') tParams = 'week';
  if (timeFrame === '7d') tParams = 'week';
  if (timeFrame === 'custom') tParams = 'all'; // get all, filter locally

  const url = `https://www.reddit.com/search.json?q=${encodeURIComponent(query)}&sort=new&limit=25&t=${tParams}`;
  try {
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'ESRA-EBS-Dashboard/1.0' },
      signal:  AbortSignal.timeout(10000),
    });
    if (!resp.ok) return [];
    const data  = await resp.json();
    const posts = data?.data?.children || [];
    
    const { start, end } = getReportWindow(timeFrame, customStart, customEnd);

    return posts
      .filter(p => {
        const pubDate = new Date(p.data.created_utc * 1000);
        return pubDate >= start && pubDate <= end;
      })
      .map(p => ({
        id:      `r-${p.data.id}`,
        title:   p.data.title,
        source:  `Reddit r/${p.data.subreddit}`,
        domain:  'reddit.com',
        link:    `https://www.reddit.com${p.data.permalink}`,
        snippet: p.data.selftext ? p.data.selftext.substring(0, 250) : `👍 ${p.data.score} upvotes · 💬 ${p.data.num_comments} ulasan`,
        time:    formatRelativeTime(new Date(p.data.created_utc * 1000)),
        pubDate: new Date(p.data.created_utc * 1000),
      }));
  } catch { return []; }
}

// ─── MAIN EXPORT ──────────────────────────────────────────────────────────────

/**
 * Fetch EBS-focused news for a state/district.
 * Returns articles with ESRA scores attached, sorted by risk (Red → Yellow → Green) then date.
 */
export async function fetchEBSNews(state, district, timeFrame = '24h', customStart = null, customEnd = null) {
  const keywords = state === 'Malaysia' ? ['Malaysia'] : [...(STATE_KEYWORDS[state] || [state])];
  if (district) keywords.unshift(district);
  
  // For Melaka Tengah, search for "Melaka" to broaden search, then filter out other districts locally
  const loc = (state === 'Melaka' && district === 'Melaka Tengah')
    ? `"Melaka"`
    : (state === 'Malaysia' ? `"Malaysia"` : (district ? `"${district}"` : `"${state}"`));

  const localMedia = STATE_MEDIA[state] ? ` OR ${STATE_MEDIA[state]}` : '';

  let ebsQueries = [];

  if (state === 'Malaysia') {
    // Broader searches for the entire country
    ebsQueries = [
      `${loc} (wabak OR jangkitan OR virus OR outbreak OR penyakit berjangkit OR demam OR kkm OR promed)`,
      `${loc} ("kematian misteri" OR "simptom pelik" OR "kesihatan awam" OR kecemasan OR hospital)`,
      `${loc} (keracunan makanan OR pencemaran air OR toksik OR kimia OR sisa)`,
      `${loc} (bencana alam OR banjir OR runtuh OR letupan OR kebakaran besar)`
    ];
  } else {
    // 1. KKM/WHO Event-Based Surveillance (EBS) Target Queries
    // Menggunakan terma "payung" (umbrella terms) dalam 4 bahasa (Melayu, Inggeris, Cina, Tamil)
    // supaya kita tidak terikat pada nama spesifik penyakit, dan dapat menangkap akhbar vernakular.
    ebsQueries = [
      // 1. Penyakit Berjangkit & Zoonotik (Infectious & Zoonotic)
      `${loc} (wabak OR jangkitan OR virus OR outbreak OR promed OR infection OR disease OR 疫情 OR 感染 OR 病毒 OR தொற்றுநோய் OR பரவல்)`, 
      // 2. Kematian Luar Biasa / Simptom Misteri (Mystery Death/Symptoms)
      `${loc} ("kematian mengejut" OR misteri OR "simptom pelik" OR "sudden death" OR "mystery illness" OR 猝死 OR 不明疾病 OR "திடீர் மரணம்" OR "மர்ம நோய்")`,
      // 3. Keselamatan Makanan, Air & Alam Sekitar (Food, Water, Env)
      `${loc} (keracunan OR pencemaran OR toksik OR kimia OR poisoning OR contaminated OR toxic OR chemical OR 中毒 OR 污染 OR 有毒 OR விஷம் OR மாசடைந்த)`,
      // 4. Bencana Alam, Radiasi & Bahan Kimia (Disasters & Hazards)
      `${loc} (bencana OR banjir OR runtuh OR letupan OR disaster OR flood OR landslide OR explosion OR 灾难 OR 洪水 OR 爆炸 OR பேரிடர் OR வெள்ளம்)`, 
      // 5. Insiden Massa & Kapasiti Kesihatan (Mass Incidents & Capacity)
      `${loc} ("kemalangan maut" OR rusuhan OR kecemasan OR hospital OR "fatal accident" OR riot OR emergency OR 致命车祸 OR 骚乱 OR 医院 OR விபத்து OR கலவரம் OR மருத்துவமனை)`,
      // 6. Social Media target queries for localized events
      `${loc} (site:facebook.com OR site:x.com OR site:twitter.com OR site:threads.net) (wabak OR denggi OR keracunan OR banjir OR hospital)` 
    ];

    // Tambah carian umum berserta media tempatan
    if (localMedia) {
      ebsQueries.push(`${loc} (kesihatan OR hospital OR kemalangan ${localMedia})`);
    }
  }

  // Fire GAS queries in parallel
  const gnResults = await Promise.allSettled(
    ebsQueries.map(q => fetchGasBackend(q, timeFrame, customStart, customEnd))
  );
  
  // Flatten results
  const gnItems = gnResults.flatMap(r => r.status === 'fulfilled' ? r.value : []);

  // 2. Reddit fetch (merangkumi kesemua EBS secara rawak)
  const rdItems = await fetchReddit(`${loc} (banjir OR hospital OR kemalangan OR penyakit OR keracunan OR mati)`, timeFrame, customStart, customEnd);

  // Gabungkan hasil dari GAS dan Reddit
  const all      = [...gnItems, ...rdItems];
  const relevant = all.filter(item => isRelevant(item, keywords, state, district));

  // --- "SMART AI" DEDUPLICATION (Jaccard Similarity) ---
  // Fungsi untuk membuang perkataan am (Stop words) dan tanda baca
  const getTokens = (text) => {
    return text.toLowerCase()
      .replace(/[^\w\s]/gi, '')
      .split(/\s+/)
      .filter(w => w.length > 3 && !['untuk','dalam','kepada','dengan','yang','dari','pada','akan','telah'].includes(w));
  };

  const calculateSimilarity = (title1, title2) => {
    const tokens1 = new Set(getTokens(title1));
    const tokens2 = new Set(getTokens(title2));
    if (tokens1.size === 0 || tokens2.size === 0) return 0;
    
    let intersection = 0;
    for (const t of tokens1) {
      if (tokens2.has(t)) intersection++;
    }
    
    const union = tokens1.size + tokens2.size - intersection;
    return intersection / union; // Skor 0.0 ke 1.0
  };

  const dedup = [];
  for (const item of relevant) {
    let isDuplicate = false;
    for (const existing of dedup) {
      // Jika kedua-dua tajuk berkongsi lebih 40% konteks perkataan (kejadian sama), anggap sebagai duplikat
      if (calculateSimilarity(item.title, existing.title) > 0.40) {
        isDuplicate = true;
        break;
      }
    }
    if (!isDuplicate) {
      dedup.push(item);
    }
  }
  // -----------------------------------------------------

  // Attach ESRA score to each article
  const scored = dedup.map(item => ({ ...item, ...scoreArticle(item) }));

  // Sort: Red first, then Yellow, then Green; within each group newest first
  const order = { high: 0, medium: 1, low: 2 };
  scored.sort((a, b) => {
    const rDiff = order[a.riskLevel] - order[b.riskLevel];
    return rDiff !== 0 ? rDiff : b.pubDate - a.pubDate;
  });

  return scored.slice(0, 25);
}

/**
 * Shortens a URL using TinyURL or da.gd with proper abort timeouts.
 * Falls back to the original URL if they fail or time out.
 */
export async function shortenUrl(longUrl) {
  if (!longUrl) return '';
  if (longUrl.length < 60) return longUrl;

  // Try tinyurl.com first
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(longUrl)}`, {
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    if (res.ok) {
      const short = await res.text();
      if (short && short.trim().startsWith('http')) {
        return short.trim();
      }
    }
  } catch (err) {
    console.warn('TinyURL shortener failed, trying da.gd...', err);
  }

  // Try da.gd as fallback
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(`https://da.gd/s?url=${encodeURIComponent(longUrl)}`, {
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    if (res.ok) {
      const short = await res.text();
      if (short && short.trim().startsWith('http')) {
        return short.trim();
      }
    }
  } catch (err) {
    console.warn('da.gd shortener failed, falling back to original link', err);
  }

  return longUrl;
}

