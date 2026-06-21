import React from 'react';
import { malaysiaLocations } from '../data/malaysiaLocations';
import './LocationSelector.css';

const LocationSelector = ({ selectedState, setSelectedState, selectedDistrict, setSelectedDistrict }) => {
  const states = Object.keys(malaysiaLocations);
  const districts = selectedState ? malaysiaLocations[selectedState] : [];

  return (
    <div className="location-selector glass-panel">
      <h2>Target Location</h2>
      <div className="selectors-container">
        <div className="selector-group">
          <label>State</label>
          <select 
            className="input-field"
            value={selectedState} 
            onChange={(e) => {
              setSelectedState(e.target.value);
              setSelectedDistrict('');
            }}
          >
            <option value="">-- Select State --</option>
            {states.map(state => (
              <option key={state} value={state}>{state}</option>
            ))}
          </select>
        </div>
        
        <div className="selector-group">
          <label>District / State Level</label>
          <select 
            className="input-field"
            value={selectedDistrict} 
            onChange={(e) => setSelectedDistrict(e.target.value)}
            disabled={!selectedState || selectedState === 'Malaysia'}
          >
            {selectedState === 'Malaysia' ? (
              <option value="">-- Seluruh Malaysia --</option>
            ) : (
              <option value="">-- Seluruh Negeri (Peringkat JKN) --</option>
            )}
            {districts.map(district => (
              <option key={district} value={district}>{district}</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
};

export default LocationSelector;
