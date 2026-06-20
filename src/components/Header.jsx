import React from 'react';
import './Header.css';

const Header = ({ theme, toggleTheme, activeTab, setActiveTab }) => {
  return (
    <header className="header">
      <div className="header-left">
        <div className="logo-icon">📊</div>
        <h1>KKM Surveillance Dashboard</h1>
      </div>
      
      <div className="header-center">
        <nav className="tab-nav">
          <button 
            className={`tab-btn ${activeTab === 'esra' ? 'active' : ''}`}
            onClick={() => setActiveTab('esra')}
          >
            ESRA Surveillance
          </button>
          <button 
            className={`tab-btn ${activeTab === 'enotis' ? 'active' : ''}`}
            onClick={() => setActiveTab('enotis')}
          >
            e-Notifikasi Review
          </button>
        </nav>
      </div>

      <div className="header-right">
        <button className="theme-toggle" onClick={toggleTheme} aria-label="Toggle Theme">
          {theme === 'dark' ? '☀️ Light' : '🌙 Dark'}
        </button>
        <div className="user-profile">
          <span className="user-initials">MSZ</span>
        </div>
      </div>
    </header>
  );
};

export default Header;
