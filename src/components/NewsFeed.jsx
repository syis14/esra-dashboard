import React, { useState, useEffect, useCallback } from 'react';
import { fetchEBSNews, SOURCE_BADGE_COLORS, SOURCE_ICONS } from '../services/newsService';
import './NewsFeed.css';

const RISK_COLORS = { high: '#ef4444', medium: '#f59e0b', low: '#22c55e' };
const RISK_BG     = { high: 'rgba(239,68,68,0.12)', medium: 'rgba(245,158,11,0.12)', low: 'rgba(34,197,94,0.12)' };

const NewsFeed = ({ state, district, onNewsLoaded }) => {
  const [news, setNews]               = useState([]);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  const targetLabel = state
    ? (district ? `Daerah ${district}, ${state}` : `Negeri ${state}`)
    : null;

  const loadNews = useCallback(async () => {
    if (!state) { setNews([]); onNewsLoaded && onNewsLoaded([]); return; }
    setLoading(true);
    setError(null);
    try {
      const items = await fetchEBSNews(state, district);
      setNews(items);
      setLastUpdated(new Date().toLocaleTimeString('ms-MY', { hour: '2-digit', minute: '2-digit' }));
      onNewsLoaded && onNewsLoaded(items);
    } catch {
      setError('Gagal mendapatkan berita. Sila semak sambungan internet.');
    } finally {
      setLoading(false);
    }
  }, [state, district, onNewsLoaded]);

  useEffect(() => {
    loadNews();
    const interval = setInterval(loadNews, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [loadNews]);

  const redCount    = news.filter(n => n.riskLevel === 'high').length;
  const yellowCount = news.filter(n => n.riskLevel === 'medium').length;
  const greenCount  = news.filter(n => n.riskLevel === 'low').length;

  return (
    <div className="news-feed glass-panel">
      {/* Header */}
      <div className="news-feed-header">
        <div>
          <h2>Live EBS News Feed</h2>
          {targetLabel && (
            <div className="news-feed-subtitle">
              📍 {targetLabel}
              {lastUpdated && <span className="news-last-updated"> · {lastUpdated}</span>}
            </div>
          )}
        </div>
        {state && (
          <button className="news-refresh-btn" onClick={loadNews} disabled={loading} title="Muat semula">
            {loading ? '⏳' : '🔄'}
          </button>
        )}
      </div>

      {/* ESRA summary bar */}
      {!loading && news.length > 0 && (
        <div className="esra-summary-bar">
          <span className="esra-bar-item esra-red">🔴 Merah: {redCount}</span>
          <span className="esra-bar-item esra-yellow">🟡 Kuning: {yellowCount}</span>
          <span className="esra-bar-item esra-green">🟢 Hijau: {greenCount}</span>
          <span className="esra-bar-total">· {news.length} item disaring</span>
        </div>
      )}

      {/* Content */}
      {!state ? (
        <p className="placeholder-text">
          Sila pilih <strong>Negeri</strong> untuk mengumpulkan berita EBS masa nyata.
        </p>
      ) : loading ? (
        <div className="news-loading-state">
          <div className="news-spinner"></div>
          <p>
            Mencari berita EBS untuk <strong>{targetLabel}</strong>…<br />
            <span className="small-hint">🔍 Google News · 🔴 Reddit · Tingkap Masa: 24 Jam Terakhir (Saringan 8 Pagi)</span>
          </p>
        </div>
      ) : error ? (
        <div className="news-error-state">
          <p>⚠️ {error}</p>
          <button className="btn" style={{ marginTop: '0.75rem', fontSize: '0.85rem' }} onClick={loadNews}>Cuba Semula</button>
        </div>
      ) : news.length === 0 ? (
        <div className="news-error-state">
          <p>⚠️ Tiada berita EBS berkaitan <strong>{targetLabel}</strong> hari ini.</p>
          <button className="btn" style={{ marginTop: '0.75rem', fontSize: '0.85rem' }} onClick={loadNews}>Cuba Semula</button>
        </div>
      ) : (
        <ul className="news-list">
          {news.map((item, idx) => {
            const srcColor = SOURCE_BADGE_COLORS[item.domain] || '#555';
            const srcIcon  = SOURCE_ICONS[item.domain] || '📰';
            const riskCol  = RISK_COLORS[item.riskLevel];
            const riskBg   = RISK_BG[item.riskLevel];
            return (
              <li key={item.id || idx} className="news-item" style={{ borderLeftColor: riskCol }}>
                {/* ESRA Score badge */}
                <div className="esra-score-chip" style={{ background: riskBg, border: `1px solid ${riskCol}40` }}>
                  <span style={{ color: riskCol }}>{item.esraCode} {item.esraLabel}</span>
                  <span className="esra-score-num" style={{ color: riskCol }}>{item.esraMarks}</span>
                </div>
                <a href={item.link || undefined} target="_blank" rel="noopener noreferrer" className="news-title-link">
                  <h3>{item.title}</h3>
                </a>
                <div className="news-meta">
                  <span className="news-source-badge" style={{ backgroundColor: srcColor }}>
                    {srcIcon} {item.source}
                  </span>
                  <span className="news-time">🕒 {item.time}</span>
                </div>
                {item.snippet && <p className="news-snippet">{item.snippet}</p>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default NewsFeed;
