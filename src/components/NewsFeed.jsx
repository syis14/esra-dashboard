import React, { useState, useEffect, useCallback } from 'react';
import { fetchEBSNews, SOURCE_BADGE_COLORS, SOURCE_ICONS } from '../services/newsService';
import './NewsFeed.css';

const RISK_COLORS = { high: '#ef4444', medium: '#f59e0b', low: '#22c55e' };
const RISK_BG     = { high: 'rgba(239,68,68,0.12)', medium: 'rgba(245,158,11,0.12)', low: 'rgba(34,197,94,0.12)' };

const toDatetimeLocalString = (date) => {
  const pad = (num) => String(num).padStart(2, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

const NewsFeed = ({ state, district, onNewsLoaded }) => {
  const [news, setNews]               = useState([]);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [customStart, setCustomStart] = useState(() => {
    const d = new Date();
    d.setHours(d.getHours() - 24);
    return toDatetimeLocalString(d);
  });
  const [customEnd, setCustomEnd]     = useState(() => {
    return toDatetimeLocalString(new Date());
  });

  const targetLabel = state
    ? (state === 'Malaysia' ? 'Seluruh Malaysia' : (district ? `Daerah ${district}, ${state}` : `Negeri ${state}`))
    : null;

  const getTimeframeRangeLabel = () => {
    const start = new Date(customStart);
    const end = new Date(customEnd);
    
    const formatDate = (date) => {
      if (isNaN(date.getTime())) return '...';
      return date.toLocaleDateString('ms-MY', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });
    };
    
    return `Liputan: ${formatDate(start)} hingga ${formatDate(end)}`;
  };

  const loadNews = useCallback(async () => {
    if (!state) { setNews([]); onNewsLoaded && onNewsLoaded([]); return; }
    setLoading(true);
    setError(null);
    try {
      const items = await fetchEBSNews(state, district, 'custom', customStart, customEnd);
      setNews(items);
      setLastUpdated(new Date().toLocaleTimeString('ms-MY', { hour: '2-digit', minute: '2-digit' }));
      onNewsLoaded && onNewsLoaded(items);
    } catch {
      setError('Gagal mendapatkan berita. Sila semak sambungan internet.');
    } finally {
      setLoading(false);
    }
  }, [state, district, customStart, customEnd, onNewsLoaded]);

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
              {lastUpdated && <span className="news-last-updated"> · Dikemaskini: {lastUpdated}</span>}
            </div>
          )}
          {state && (
            <div className="timeframe-range-label" style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
              🕒 {getTimeframeRangeLabel()}
            </div>
          )}
        </div>
        {state && (
          <div className="news-feed-controls" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <button className="news-refresh-btn" onClick={loadNews} disabled={loading} title="Muat semula">
              {loading ? '⏳' : '🔄'}
            </button>
          </div>
        )}
      </div>

      {state && (
        <div className="custom-timeframe-picker" style={{ display: 'flex', gap: '0.75rem', padding: '0.75rem 1rem', background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid var(--surface-border)', flexWrap: 'wrap', alignItems: 'center', fontSize: '0.85rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <label style={{ color: 'var(--text-secondary)' }}>Mula:</label>
            <input 
              type="datetime-local" 
              value={customStart} 
              onChange={(e) => setCustomStart(e.target.value)}
              style={{ padding: '0.3rem 0.5rem', borderRadius: '4px', border: '1px solid var(--input-border)', background: 'var(--bg-color)', color: 'var(--text-primary)', fontSize: '0.8rem' }}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <label style={{ color: 'var(--text-secondary)' }}>Hingga:</label>
            <input 
              type="datetime-local" 
              value={customEnd} 
              onChange={(e) => setCustomEnd(e.target.value)}
              style={{ padding: '0.3rem 0.5rem', borderRadius: '4px', border: '1px solid var(--input-border)', background: 'var(--bg-color)', color: 'var(--text-primary)', fontSize: '0.8rem' }}
            />
          </div>
          <button 
            onClick={loadNews} 
            disabled={loading}
            className="btn"
            style={{ padding: '0.3rem 0.75rem', fontSize: '0.8rem', minHeight: 'auto', background: 'var(--accent-color)', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
          >
            Saring
          </button>
        </div>
      )}

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
            <span className="small-hint">
              🔍 Google News · 🔴 Reddit · Tingkap Masa: Kustom
            </span>
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
