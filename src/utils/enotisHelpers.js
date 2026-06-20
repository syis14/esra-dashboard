import * as XLSX from 'xlsx';

export const COL = {
  epiYear: "Epid Tahun (Tkh Input Notifikasi)",
  epiWeek: "Epid Minggu (Tkh Input Notifikasi)",
  disease: "Diagnosis",
  subDisease: "Sub Diagnosis",
  district: "Daerah",
  mukim: "Mukim/Zon",
  locality: "Lokaliti",
  facility: "Kemudahan Kesihatan",
  pkd: "Pejabat Kesihatan",
  onset: "Tarikh Onset",
  notif: "Tkh Notifikasi",
  notifInput: "Tkh Input Notifikasi",
  notifReceive: "Tkh Terima Notifikasi",
  daftarNotif: "Tkh Daftar Notifikasi",
  daftar: "Tkh Daftar",
  dxDate: "Tarikh Diagnosis",
  cancelDate: "Tarikh Batal",
  ageYear: "Umur (Tahun)",
  sex: "Jantina",
  statusNotifikasi: "Notifikasi Status",
  notifBy: "Pihak Pemberitahu",
  latWgs: "Latitude (WGS)",
  lonWgs: "Longitude (WGS)"
};

const NOTIF_THRESHOLD_DAYS = {
  "DENGUE FEVER": 1,
  "DENGUE": 1,
  "DF": 1,
  "HAND FOOT AND MOUTH DISEASE": 1,
  "HFMD": 1,
  "MEASLES": 1,
  "CAMPAK": 1,
  "TUBERCULOSIS": 7,
  "TB": 7,
  "HEPATITIS": 7,
  "HEPATITIS A": 7,
  "HEPATITIS B": 7,
  "HEPATITIS C": 7,
  "HEPATITIS E": 7
};

export function getNotifThresholdDays(diseaseRaw) {
  if (!diseaseRaw) return 7;
  const d = diseaseRaw.toString().trim().toUpperCase();
  if (NOTIF_THRESHOLD_DAYS[d] != null) return NOTIF_THRESHOLD_DAYS[d];
  if (d.startsWith("HEPATITIS")) return 7;
  if (d.startsWith("DENGUE")) return 1;
  if (d.startsWith("TB") || d.startsWith("TUBERCULOSIS")) return 7;
  return 7;
}

export function isPKDNotifier(notifBy) {
  if (!notifBy) return false;
  const s = notifBy.toString().toUpperCase();
  const keywords = ["PKD", "PEJABAT KESIHATAN", "DISTRICT HEALTH OFFICE", "DHO"];
  return keywords.some(k => s.includes(k));
}

function parseDate(val) {
  if (!val) return null;
  if (val instanceof Date) return val;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

function diffDays(a, b) {
  if (!a || !b) return null;
  const ms = b.getTime() - a.getTime();
  return ms / (1000 * 60 * 60 * 24);
}

/**
 * Flexible column header matcher to handle minor variations in Excel naming.
 * Ignores casing, trailing/leading spaces, and internal multiple spaces.
 * Also supports substring fallback.
 */
export function getFlexibleVal(row, officialHeader) {
  if (!row) return null;
  if (row[officialHeader] !== undefined) return row[officialHeader];

  const cleanOfficial = officialHeader.toLowerCase().replace(/\s+/g, ' ').trim();

  // 1. Try exact match (normalized case and spaces)
  for (const key of Object.keys(row)) {
    const cleanKey = key.toLowerCase().replace(/\s+/g, ' ').trim();
    if (cleanKey === cleanOfficial) {
      return row[key];
    }
  }

  // 2. Try substring match (e.g. if sheet has "Daerah" and official is "Daerah", or official is "Epid Tahun (...)" and sheet is "Epid Tahun")
  for (const key of Object.keys(row)) {
    const cleanKey = key.toLowerCase().replace(/\s+/g, ' ').trim();
    if (cleanKey.includes(cleanOfficial) || cleanOfficial.includes(cleanKey)) {
      return row[key];
    }
  }

  return null;
}

export function preprocessRows(rawRows) {
  return rawRows.map(r => {
    const epiYear = getFlexibleVal(r, COL.epiYear);
    const epiWeek = getFlexibleVal(r, COL.epiWeek);
    const disease = (getFlexibleVal(r, COL.disease) || "").toString().trim() || "(Tiada Diagnosis)";
    const district = (getFlexibleVal(r, COL.district) || "").toString().trim().toUpperCase();
    const mukim = (getFlexibleVal(r, COL.mukim) || "").toString().trim();
    const locality = (getFlexibleVal(r, COL.locality) || "").toString().trim();
    const facility = (getFlexibleVal(r, COL.facility) || "").toString().trim();
    const pkd = (getFlexibleVal(r, COL.pkd) || "").toString().trim();
    const ageYear = getFlexibleVal(r, COL.ageYear);
    const sex = (getFlexibleVal(r, COL.sex) || "").toString().trim();
    const notifStatus = (getFlexibleVal(r, COL.statusNotifikasi) || "").toString().trim();
    const notifBy = (getFlexibleVal(r, COL.notifBy) || "").toString().trim();

    const onsetDate = parseDate(getFlexibleVal(r, COL.onset));
    const notifInputDate = parseDate(getFlexibleVal(r, COL.notifInput));
    const notifReceiveDate = parseDate(getFlexibleVal(r, COL.notifReceive));
    const daftarNotifDate = parseDate(getFlexibleVal(r, COL.daftarNotif));
    const daftarDate = parseDate(getFlexibleVal(r, COL.daftar));
    const dxDate = parseDate(getFlexibleVal(r, COL.dxDate));
    const cancelDate = parseDate(getFlexibleVal(r, COL.cancelDate));

    const notifDate = parseDate(getFlexibleVal(r, COL.notif)) || notifInputDate || notifReceiveDate;

    const onsetToNotif = diffDays(onsetDate, notifDate);
    const notifToDaftar = diffDays(notifDate, daftarDate);
    const dxToNotif = diffDays(dxDate, notifDate);
    const inputToDaftarNotif = diffDays(notifInputDate, daftarNotifDate);
    const daftarNotifToDaftarKes = diffDays(daftarNotifDate, daftarDate);
    const dxToDaftar = diffDays(dxDate, daftarDate);

    const latVal = getFlexibleVal(r, COL.latWgs);
    const lonVal = getFlexibleVal(r, COL.lonWgs);
    const lat = latVal != null ? Number(latVal) : null;
    const lon = lonVal != null ? Number(lonVal) : null;
    const hasCoord = lat != null && lon != null && !isNaN(lat) && !isNaN(lon);

    return {
      raw: r,
      epiYear,
      epiWeek,
      disease,
      district,
      mukim,
      locality,
      facility,
      pkd,
      ageYear,
      sex,
      notifStatus,
      notifBy,
      onsetDate,
      notifInputDate,
      notifReceiveDate,
      notifDate,
      daftarNotifDate,
      daftarDate,
      dxDate,
      cancelDate,
      onsetToNotif,
      notifToDaftar,
      dxToNotif,
      inputToDaftarNotif,
      daftarNotifToDaftarKes,
      dxToDaftar,
      lat,
      lon,
      hasCoord
    };
  }).filter(row => row.epiWeek != null && row.epiYear != null);
}

export function buildEpiWeekList(processedRows) {
  const map = new Map();
  processedRows.forEach(r => {
    const label = `${r.epiYear}-W${r.epiWeek}`;
    if (!map.has(label)) map.set(label, { label, year: Number(r.epiYear), week: Number(r.epiWeek) });
  });
  return Array.from(map.values()).sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year;
    return a.week - b.week;
  });
}

export function aggregateCount(rows, keyFn, topN = null) {
  const m = new Map();
  rows.forEach(r => {
    const key = keyFn(r) || "(Tidak diketahui)";
    m.set(key, (m.get(key) || 0) + 1);
  });
  let arr = Array.from(m.entries()).map(([key, count]) => ({ key, count }));
  arr.sort((a, b) => b.count - a.count);
  if (topN != null) arr = arr.slice(0, topN);
  return arr;
}

export function median(arr) {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) return (sorted[mid - 1] + sorted[mid]) / 2;
  return sorted[mid];
}

export function isLateNotification(r) {
  if (r.dxToNotif == null || !isFinite(r.dxToNotif)) return false;
  const thr = getNotifThresholdDays(r.disease);
  return r.dxToNotif > thr;
}

/**
 * Generates highly realistic e-Notifikasi mock data for JKN Melaka.
 * Used for demo purposes when no file is uploaded.
 */
export function generateMockEnotisData() {
  const mockData = [];
  const diseasesList = [
    { name: "DENGUE FEVER", prob: 0.6 },
    { name: "HAND FOOT AND MOUTH DISEASE", prob: 0.2 },
    { name: "TUBERCULOSIS", prob: 0.1 },
    { name: "LEPTOSPIROSIS", prob: 0.05 },
    { name: "FOOD POISONING", prob: 0.05 }
  ];

  const districtsList = [
    { name: "MELAKA TENGAH", pkd: "PKD MELAKA TENGAH", lat: 2.22, lon: 102.25, mukims: ["Kawasan Bandar", "Bukit Baru", "Ayer Keroh", "Klebang", "Batu Berendam"] },
    { name: "ALOR GAJAH", pkd: "PKD ALOR GAJAH", lat: 2.38, lon: 102.21, mukims: ["Masjid Tanah", "Selandar", "Kuala Sungai Baru", "Pulau Sebang"] },
    { name: "JASIN", pkd: "PKD JASIN", lat: 2.31, lon: 102.43, mukims: ["Merlimau", "Jasin", "Bemban", "Rim"] }
  ];

  const facilitiesList = [
    "Hospital Melaka", "Klinik Kesihatan Peringgit", "Klinik Kesihatan Alor Gajah",
    "Klinik Kesihatan Jasin", "Klinik Kesihatan Ayer Keroh", "Poliklinik Swasta Hidayah",
    "Klinik Panel KKM", "Hospital Pantai Ayer Keroh"
  ];

  const localitiesList = [
    "Taman Melaka Raya", "Taman Ayer Keroh Heights", "Kampung Masjid Tanah",
    "Taman Merlimau Jaya", "Kampung Bukit Baru", "Taman Klebang Utama",
    "Taman Muzaffar Syah", "Kampung Selandar", "Taman Jasin Bestari"
  ];

  const year = 2026;
  const totalRows = 120; // Enough to look full but performant

  for (let i = 0; i < totalRows; i++) {
    // 1. Pick disease based on probability
    let rand = Math.random();
    let diseaseSelected = diseasesList[0].name;
    let sum = 0;
    for (const d of diseasesList) {
      sum += d.prob;
      if (rand <= sum) {
        diseaseSelected = d.name;
        break;
      }
    }

    // 2. Pick district
    const distObj = districtsList[Math.floor(Math.random() * districtsList.length)];
    const mukimSelected = distObj.mukims[Math.floor(Math.random() * distObj.mukims.length)];
    
    // 3. Select week
    const week = Math.floor(Math.random() * 24) + 1; // W1 to W24
    
    // 4. Build dates based on week
    // Approximate date for the week (e.g. week * 7 days from Jan 1)
    const baseDate = new Date(year, 0, 1 + (week - 1) * 7);
    // Add random offset within the week
    baseDate.setDate(baseDate.getDate() + Math.floor(Math.random() * 7));

    const dxDate = new Date(baseDate);
    const onsetDate = new Date(dxDate);
    onsetDate.setDate(onsetDate.getDate() - (Math.floor(Math.random() * 4) + 2)); // 2-5 days before Dx

    // Notification Date (can be late depending on random factor)
    const notifDate = new Date(dxDate);
    const isLate = Math.random() < 0.15; // 15% late cases
    const delay = isLate 
      ? (diseaseSelected.startsWith("DENGUE") || diseaseSelected.startsWith("HAND") ? 3 : 12) 
      : (diseaseSelected.startsWith("DENGUE") || diseaseSelected.startsWith("HAND") ? 1 : 4);
    notifDate.setDate(notifDate.getDate() + Math.floor(delay));

    const notifInputDate = new Date(notifDate);
    const notifReceiveDate = new Date(notifDate);
    const daftarNotifDate = new Date(notifInputDate);
    daftarNotifDate.setDate(daftarNotifDate.getDate() + Math.floor(Math.random() * 2));

    const daftarDate = new Date(daftarNotifDate);
    // Registry delay buckets: lt7, d8_14, gt14
    const regRand = Math.random();
    const regDelay = regRand < 0.7 ? Math.floor(Math.random() * 5) + 1  // <7 days
                   : regRand < 0.9 ? Math.floor(Math.random() * 6) + 8  // 8-14 days
                   : Math.floor(Math.random() * 15) + 15;               // >14 days
    daftarDate.setDate(daftarDate.getDate() + regDelay);

    // Cancel date (empty for 95% of cases)
    const cancelDate = Math.random() < 0.05 ? new Date(daftarDate) : null;

    // Lat/Lon coordinates with tiny randomized offsets
    const hasCoord = Math.random() < 0.85; // 85% coordinates populated
    const lat = hasCoord ? distObj.lat + (Math.random() - 0.5) * 0.08 : null;
    const lon = hasCoord ? distObj.lon + (Math.random() - 0.5) * 0.08 : null;

    // Data Quality checks (leave some fields null occasionally)
    const hasAge = Math.random() < 0.94; // 6% missing age
    const ageYear = hasAge ? Math.floor(Math.random() * 70) + 1 : null;

    const hasLocality = Math.random() < 0.92; // 8% missing locality
    const localitySelected = hasLocality ? localitiesList[Math.floor(Math.random() * localitiesList.length)] : null;

    const hasOnset = Math.random() < 0.96; // 4% missing onset date

    const row = {
      [COL.epiYear]: year,
      [COL.epiWeek]: week,
      [COL.disease]: diseaseSelected,
      [COL.subDisease]: "",
      [COL.district]: distObj.name,
      [COL.mukim]: mukimSelected,
      [COL.locality]: localitySelected,
      [COL.facility]: facilitiesList[Math.floor(Math.random() * facilitiesList.length)],
      [COL.pkd]: distObj.pkd,
      [COL.onset]: hasOnset ? onsetDate : null,
      [COL.notif]: notifDate,
      [COL.notifInput]: notifInputDate,
      [COL.notifReceive]: notifReceiveDate,
      [COL.daftarNotif]: daftarNotifDate,
      [COL.daftar]: cancelDate ? null : daftarDate, // if cancelled, often not registered
      [COL.dxDate]: dxDate,
      [COL.cancelDate]: cancelDate,
      [COL.ageYear]: ageYear,
      [COL.sex]: Math.random() < 0.52 ? "LELAKI" : "PEREMPUAN",
      [COL.statusNotifikasi]: cancelDate ? "BATAL" : "DAFTAR",
      [COL.notifBy]: Math.random() < 0.4 ? distObj.pkd : "HOSPITAL/KLINIK SWASTA",
      [COL.latWgs]: lat,
      [COL.lonWgs]: lon
    };

    mockData.push(row);
  }

  return mockData;
}
