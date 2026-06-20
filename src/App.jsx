import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import LocationSelector from './components/LocationSelector';
import NewsFeed from './components/NewsFeed';
import EsraPanel from './components/EsraPanel';
import EnotisPanel from './components/EnotisPanel';

function App() {
  const [selectedState, setSelectedState]       = useState('');
  const [selectedDistrict, setSelectedDistrict] = useState('');
  const [activeTab, setActiveTab]               = useState('esra');
  const [theme, setTheme]                       = useState('dark');
  const [ebsNewsItems, setEbsNewsItems]         = useState([]); // shared between NewsFeed ↔ EsraPanel

  // Toggle theme on body
  useEffect(() => {
    document.body.className = theme;
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

  return (
    <div className="app-container">
      <Header theme={theme} toggleTheme={toggleTheme} activeTab={activeTab} setActiveTab={setActiveTab} />
      
      <main>
        {activeTab === 'esra' && (
          <div className="tab-content esra-view">
            <LocationSelector 
              selectedState={selectedState} 
              setSelectedState={setSelectedState} 
              selectedDistrict={selectedDistrict}
              setSelectedDistrict={setSelectedDistrict}
            />
            
            <div className="dashboard-grid">
              <div className="left-column">
                <NewsFeed
                  state={selectedState}
                  district={selectedDistrict}
                  onNewsLoaded={setEbsNewsItems}
                />
              </div>
              
              <div className="right-column">
                <EsraPanel
                  state={selectedState}
                  district={selectedDistrict}
                  newsItems={ebsNewsItems}
                />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'enotis' && (
          <div className="tab-content enotis-view">
            <EnotisPanel theme={theme} />
          </div>
        )}
      </main>

      <footer className="footer">
        <p>&copy; {new Date().getFullYear()} Dr. Mohd Syis bin Zulkipli (<a href="mailto:drsyizz@gmail.com">drsyizz@gmail.com</a>)</p>
        <p>Pakar Perubatan Kesihatan Awam</p>
      </footer>
    </div>
  );
}

export default App;
