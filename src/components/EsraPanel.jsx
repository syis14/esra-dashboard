import React, { useState, useRef, useEffect } from 'react';
import './EsraPanel.css';
import { screenWithGemini, testGeminiApiKey } from '../services/geminiService';

const EsraPanel = ({ state, district, newsItems = [] }) => {
  const [loading, setLoading]     = useState(false);
  const [report, setReport]       = useState(null);
  const [lastRunTime, setLastRunTime] = useState(null);
  const [copied, setCopied]       = useState(false);
  const reportRef                 = useRef(null);
  
  const [aiFilter, setAiFilter]   = useState(true);
  const [geminiKey, setGeminiKey] = useState('');
  const [showKeyInput, setShowKeyInput] = useState(false);

  // New state variables for password toggle & key testing
  const [showPassword, setShowPassword] = useState(false);
  const [testStatus, setTestStatus] = useState(null); // 'loading', 'success', 'error'
  const [testError, setTestError] = useState('');

  useEffect(() => {
    const savedKey = localStorage.getItem('gemini_api_key');
    if (savedKey) {
      setGeminiKey(savedKey);
    }
  }, []);

  const saveKey = (e) => {
    const val = e.target.value;
    setGeminiKey(val);
    localStorage.setItem('gemini_api_key', val);
    setTestStatus(null); // reset testing indicator on key change
  };

  const handleTestKey = async () => {
    if (!geminiKey) {
      alert("Sila masukkan API Key terlebih dahulu.");
      return;
    }
    setTestStatus('loading');
    setTestError('');
    try {
      const res = await testGeminiApiKey(geminiKey);
      if (res.success) {
        setTestStatus('success');
      } else {
        setTestStatus('error');
        setTestError(res.error || 'Ralat sambungan API');
      }
    } catch (err) {
      setTestStatus('error');
      setTestError(err.message);
    }
  };

  const targetName = district ? `Daerah ${district}` : `Negeri ${state}`;
  const roleName   = district ? 'Pejabat Kesihatan Daerah (PKD)' : 'Jabatan Kesihatan Negeri (JKN)';

  /* ── Build WhatsApp-ready plain text report from real news ─────────────── */
  const buildReport = (items) => {
    const now     = new Date();
    
    // Format date like: 20 JUN 2026
    const months = ['JAN', 'FEB', 'MAC', 'APR', 'MEI', 'JUN', 'JUL', 'OGS', 'SEP', 'OKT', 'NOV', 'DIS'];
    const dateStr = `${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()}`;
    
    const days = ['Ahad', 'Isnin', 'Selasa', 'Rabu', 'Khamis', 'Jumaat', 'Sabtu'];
    const dayStr  = days[now.getDay()];
    
    // Format time like: 09.00 AM
    let hours = now.getHours();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12; // the hour '0' should be '12'
    const hoursStr = hours < 10 ? '0' + hours : hours;
    const minutesStr = now.getMinutes() < 10 ? '0' + now.getMinutes() : now.getMinutes();
    const timeStr = `${hoursStr}.${minutesStr} ${ampm}`;

    const red    = items.filter(i => i.riskLevel === 'high');
    const yellow = items.filter(i => i.riskLevel === 'medium');
    const green  = items.filter(i => i.riskLevel === 'low');

    // Count unique sources
    const uniqueSources = new Set(items.flatMap(i => (i.source || '').split(', '))).size;

    // Format each news item exactly as requested
    const formatItem = (item) => {
      const sourceStr = item.source ? `${item.source}: ` : '';
      const link = item.link ? `\n${item.link}` : '';
      return `${sourceStr}${item.title}${link}\n (ESRA : ${item.esraCode}, score ${item.esraMarks})`;
    };

    const allNewsText = items.map(formatItem).join('\n\n');

    const reportText = [
      `*LAPORAN HARIAN PEMANTAUAN PELAPORAN MEDIA ONLINE*`,
      `*${dateStr} , ${dayStr}@ ${timeStr}*`,
      `*CPRC ${roleName.replace(/\([^)]*\)/, '').trim()} ${state}*`,
      ``,
      ``,
      allNewsText,
      ``,
      ``,
      `*Ringkasan :* `,
      `Sumber berita : ${uniqueSources || items.length}`,
      `Kod Merah : ${red.length}`,
      `Kod Kuning : ${yellow.length}`,
      `Kod Hijau    : ${green.length}`
    ].join('\n');

    // Default overall risk calculation (for UI only)
    const overallRisk = red.length >= 2 ? '🔴 TINGGI'
                      : red.length === 1 ? '🟡 SEDERHANA TINGGI'
                      : yellow.length >= 2 ? '🟡 SEDERHANA'
                      : '🟢 RENDAH';

    return { reportText, dateStr, timeStr, red, yellow, green, overallRisk, items };
  };

  const generateReport = async () => {
    if (!state) return;
    if (newsItems.length === 0) {
      alert('Sila tunggu berita EBS dimuatkan dahulu, atau klik 🔄 di panel Live News Feed.');
      return;
    }

    if (aiFilter && !geminiKey) {
      setShowKeyInput(true);
      alert('Sila masukkan API Key Gemini anda untuk menggunakan Pilihan Pintar AI.');
      return;
    }

    setLoading(true);

    let itemsToReport = newsItems;
    
    if (aiFilter && geminiKey) {
      // Panggil Gemini AI Sebenar
      const geminiResult = await screenWithGemini(newsItems, geminiKey, state, district);
      
      if (geminiResult && geminiResult.success && geminiResult.data.length > 0) {
        itemsToReport = geminiResult.data;
      } else {
        const errMsg = geminiResult ? geminiResult.error : "Ralat tidak diketahui";
        alert(`Saringan AI gagal: ${errMsg.substring(0, 200)}...\n\nSistem akan menggunakan laporan penuh hasil saringan tempatan.`);
        // Fallback to the full deduplicated news list
        itemsToReport = newsItems;
      }
    }

    const now     = new Date();
    const timeStr = now.toLocaleTimeString('ms-MY', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const dateStr = now.toLocaleDateString('ms-MY', { day: 'numeric', month: 'long', year: 'numeric' });
    const result  = buildReport(itemsToReport);
    
    setReport(result);
    setLastRunTime(`${dateStr}, ${timeStr}`);
    setLoading(false);
  };

  const copyToWhatsApp = () => {
    if (!report) return;
    navigator.clipboard.writeText(report.reportText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }).catch(() => {
      // Fallback
      const el = document.createElement('textarea');
      el.value = report.reportText;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  const newsReady = newsItems.length > 0;

  return (
    <div className="esra-panel glass-panel">
      <h2>Jana Laporan ESRA</h2>
      <p className="description">
        Laporan dijana secara automatik berdasarkan berita EBS sebenar yang diambil daripada Live News Feed.
        Setiap berita dianalisis dan diberi skor ESRA (1–38) ikut kriteria EBS KKM.
      </p>

      <div className="disclaimer-banner">
        <strong>⚠️ Disclaimer & Sumber Data:</strong>
        <p>
          Berita diambil secara masa nyata daripada Google News dan Reddit menggunakan carian EBS-fokus
          (wabak, denggi, banjir, keracunan, hospital dll). Skor ESRA dikira automatik berdasarkan
          kata kunci. Laporan ini untuk saringan awal — pengesahan pegawai diperlukan sebelum tindakan lanjut.
        </p>
      </div>

      {/* Status indicator */}
      <div className="news-status-row">
        {!state ? (
          <span className="status-pill status-idle">⬜ Pilih negeri dahulu</span>
        ) : !newsReady ? (
          <span className="status-pill status-loading">⏳ Menunggu berita EBS dimuatkan…</span>
        ) : (
          <span className="status-pill status-ready">
            ✅ {newsItems.length} berita EBS sedia — {newsItems.filter(n=>n.riskLevel==='high').length} 🔴 {newsItems.filter(n=>n.riskLevel==='medium').length} 🟡 {newsItems.filter(n=>n.riskLevel==='low').length} 🟢
          </span>
        )}
      </div>

      <div className="ai-filter-toggle" style={{ margin: '1rem 0', display: 'flex', flexDirection: 'column', gap: '0.8rem', background: 'var(--bg-color)', padding: '0.8rem', borderRadius: '8px', border: '1px solid var(--surface-border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <input 
              type="checkbox" 
              id="aiFilter" 
              checked={aiFilter} 
              onChange={(e) => setAiFilter(e.target.checked)} 
              style={{ width: '18px', height: '18px', cursor: 'pointer' }}
            />
            <label htmlFor="aiFilter" style={{ cursor: 'pointer', fontWeight: '500', color: 'var(--text-primary)' }}>
              ✨ AI Saringan Pintar (Gemini LLM) <span style={{ color: 'var(--text-secondary)', fontWeight: '400', fontSize: '0.9em' }}>(Deduplikasi semantik)</span>
            </label>
          </div>
          
          {geminiKey && (
            <button 
              type="button" 
              onClick={() => setShowKeyInput(!showKeyInput)} 
              style={{ background: 'none', border: 'none', color: 'var(--accent-color)', cursor: 'pointer', fontSize: '0.85rem', padding: 0 }}
            >
              {showKeyInput ? 'Sembunyi Tetapan Kunci' : '⚙️ Kemaskini Kunci API'}
            </button>
          )}
        </div>
        
        {aiFilter && (showKeyInput || !geminiKey) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem', padding: '0.8rem', background: 'var(--surface-color)', borderRadius: '6px', border: '1px solid var(--surface-border)' }}>
            <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Masukkan API Key Gemini (<a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" style={{ color: 'var(--accent-color)' }}>Dapatkan Percuma di sini</a>). Ia disimpan dengan selamat di pelayar anda sahaja.
            </label>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <input 
                  type={showPassword ? "text" : "password"} 
                  placeholder="AIzaSyA..." 
                  value={geminiKey} 
                  onChange={saveKey}
                  style={{ padding: '0.6rem', paddingRight: '2.5rem', borderRadius: '4px', border: '1px solid var(--input-border)', background: 'var(--bg-color)', color: 'var(--text-primary)', width: '100%' }}
                />
                <button 
                  type="button" 
                  onClick={() => setShowPassword(!showPassword)}
                  style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem', color: 'var(--text-secondary)' }}
                  title={showPassword ? "Sembunyi Kunci" : "Papar Kunci"}
                >
                  {showPassword ? '👁️' : '🔒'}
                </button>
              </div>
              <button
                type="button"
                className="btn btn-test-key"
                onClick={handleTestKey}
                disabled={!geminiKey || testStatus === 'loading'}
                style={{ padding: '0.6rem 1rem', fontSize: '0.85rem', background: 'var(--text-secondary)' }}
              >
                {testStatus === 'loading' ? '⏳...' : '🔌 Uji Kunci'}
              </button>
            </div>

            {/* Test result message */}
            {testStatus === 'success' && (
              <div style={{ fontSize: '0.85rem', color: '#22c55e', marginTop: '0.2rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                ✅ Kunci API sah & bersedia!
              </div>
            )}
            {testStatus === 'error' && (
              <div style={{ fontSize: '0.85rem', color: '#ef4444', marginTop: '0.2rem' }}>
                ❌ Ralat Kunci: {testError.substring(0, 100)}
              </div>
            )}
          </div>
        )}
      </div>

      <button
        className="btn btn-generate"
        onClick={generateReport}
        disabled={!state || !newsReady || loading}
      >
        {loading ? '🤖 AI Sedang Menyaring Berita...' : '📋 Jana Laporan ESRA'}
      </button>

      {lastRunTime && !loading && (
        <div className="run-time-badge">🕒 Terakhir Dijana: {lastRunTime}</div>
      )}

      {/* Report output */}
      {report && !loading && (
        <div className="esra-result" ref={reportRef}>
          {/* Toolbar */}
          <div className="report-toolbar">
            <div className="report-risk-summary">
              <span className="risk-chip risk-red">🔴 {report.red.length} Merah</span>
              <span className="risk-chip risk-yellow">🟡 {report.yellow.length} Kuning</span>
              <span className="risk-chip risk-green">🟢 {report.green.length} Hijau</span>
              <span className="risk-overall">{report.overallRisk}</span>
            </div>
            <button
              className={`btn btn-copy ${copied ? 'btn-copied' : ''}`}
              onClick={copyToWhatsApp}
            >
              {copied ? '✅ Disalin!' : '📲 Salin ke WhatsApp'}
            </button>
          </div>

          {/* Report preview — WhatsApp-style */}
          <div className="report-preview">
            <pre className="report-text">{report.reportText}</pre>
          </div>
        </div>
      )}
    </div>
  );
};

export default EsraPanel;
