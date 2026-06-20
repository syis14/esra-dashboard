import React, { useState, useMemo, useEffect } from 'react';
import * as XLSX from 'xlsx';
import {
  preprocessRows, buildEpiWeekList, aggregateCount, median, isLateNotification, isPKDNotifier, generateMockEnotisData
} from '../utils/enotisHelpers';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend
} from 'chart.js';
import { Line, Bar } from 'react-chartjs-2';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './EnotisPanel.css';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend);

// Fix Leaflet Default Icon
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// A component to automatically fit bounds on map when markers change
const MapBounds = ({ latlngs }) => {
  const map = useMap();
  useEffect(() => {
    if (latlngs.length > 0) {
      map.fitBounds(L.latLngBounds(latlngs), { padding: [20, 20] });
    }
  }, [latlngs, map]);
  return null;
};

const EnotisPanel = ({ theme }) => {
  const [rawRows, setRawRows] = useState([]);
  
  // Filters
  const [weekFilter, setWeekFilter] = useState('ALL');
  const [districtFilter, setDistrictFilter] = useState('');
  const [mukimFilter, setMukimFilter] = useState('');
  const [diseaseFilter, setDiseaseFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const data = new Uint8Array(evt.target.result);
      const wb = XLSX.read(data, { type: "array", cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: null });
      setRawRows(preprocessRows(rows));
    };
    reader.readAsArrayBuffer(file);
  };

  const handleLoadDemo = () => {
    const demoData = generateMockEnotisData();
    setRawRows(preprocessRows(demoData));
  };

  const processedRows = rawRows; // rawRows are already preprocessed in handleFileUpload

  // Memoized Lists for Dropdowns
  const epiWeeks = useMemo(() => buildEpiWeekList(processedRows), [processedRows]);
  
  const uniqueList = (key) => {
    const s = new Set();
    processedRows.forEach(r => { if (r[key]) s.add(r[key]); });
    return Array.from(s).sort();
  };

  const districts = useMemo(() => uniqueList('district'), [processedRows]);
  const mukims = useMemo(() => uniqueList('mukim'), [processedRows]);
  const diseases = useMemo(() => uniqueList('disease'), [processedRows]);
  const statuses = useMemo(() => uniqueList('notifStatus'), [processedRows]);

  useEffect(() => {
    if (epiWeeks.length > 0 && weekFilter === 'ALL') {
      // Auto-select latest week? Kept ALL as default
    }
  }, [epiWeeks]);

  // Derived Data based on Filters
  const filteredRows = useMemo(() => {
    return processedRows.filter(r => {
      const wMatch = weekFilter === 'ALL' || `${r.epiYear}-W${r.epiWeek}` === weekFilter;
      const dMatch = !districtFilter || r.district === districtFilter;
      const mMatch = !mukimFilter || r.mukim === mukimFilter;
      const disMatch = !diseaseFilter || r.disease === diseaseFilter;
      const sMatch = !statusFilter || r.notifStatus === statusFilter;
      return wMatch && dMatch && mMatch && disMatch && sMatch;
    });
  }, [processedRows, weekFilter, districtFilter, mukimFilter, diseaseFilter, statusFilter]);

  // Update Chart Theme dynamically
  useEffect(() => {
    const textColor = theme === 'dark' ? '#9ca3af' : '#667085';
    const gridColor = theme === 'dark' ? '#1f2937' : '#e0e3f0';
    ChartJS.defaults.color = textColor;
    ChartJS.defaults.scale.grid.color = gridColor;
  }, [theme]);

  const renderSummaryCards = () => {
    const totalCases = filteredRows.length;
    
    // Top Disease
    const diseaseCounts = aggregateCount(filteredRows, r => r.disease);
    const topDisease = diseaseCounts.length ? `${diseaseCounts[0].key} (${diseaseCounts[0].count})` : "-";

    // Medians
    const onsetVals = filteredRows.map(r => r.onsetToNotif).filter(v => v != null && isFinite(v));
    const notifVals = filteredRows.map(r => r.notifToDaftar).filter(v => v != null && isFinite(v));
    const medOnset = onsetVals.length ? median(onsetVals).toFixed(1) : "n/a";
    const medNotif = notifVals.length ? median(notifVals).toFixed(1) : "n/a";

    return (
      <div className="summary-grid">
        <div className="enotis-card">
          <div className="card-title">Total Cases</div>
          <div className="card-value">{totalCases.toLocaleString()}</div>
        </div>
        <div className="enotis-card">
          <div className="card-title">Top Disease</div>
          <div className="card-value">{topDisease}</div>
        </div>
        <div className="enotis-card">
          <div className="card-title">Median Onset → Notif</div>
          <div className="card-value">{medOnset} days</div>
        </div>
        <div className="enotis-card">
          <div className="card-title">Median Notif → Daftar</div>
          <div className="card-value">{medNotif} days</div>
        </div>
      </div>
    );
  };

  const trendData = useMemo(() => {
    const weekMap = new Map();
    // Only apply district, mukim, and status filters for trend
    const trendRows = processedRows.filter(r => 
      (!districtFilter || r.district === districtFilter) &&
      (!mukimFilter || r.mukim === mukimFilter) &&
      (!statusFilter || r.notifStatus === statusFilter)
    );

    trendRows.forEach(r => {
      const label = `${r.epiYear}-W${r.epiWeek}`;
      weekMap.set(label, (weekMap.get(label) || 0) + 1);
    });

    let arr = Array.from(weekMap.entries()).map(([label, count]) => ({ label, count }));
    arr.sort((a, b) => {
      const [ya, wa] = a.label.split("-W").map(Number);
      const [yb, wb] = b.label.split("-W").map(Number);
      return ya !== yb ? ya - yb : wa - wb;
    });
    
    if (arr.length > 54) arr = arr.slice(-54);
    
    return {
      labels: arr.map(x => x.label),
      datasets: [{
        label: 'Total Notifications',
        data: arr.map(x => x.count),
        borderColor: '#3b82f6',
        backgroundColor: '#3b82f6',
        tension: 0.1
      }]
    };
  }, [processedRows, districtFilter, mukimFilter, statusFilter]);

  const mapPins = useMemo(() => filteredRows.filter(r => r.hasCoord), [filteredRows]);

  const renderTimelinessAndPending = () => {
    const pendingRows = filteredRows.filter(r => !r.daftarDate && !r.cancelDate);
    const agg = aggregateCount(pendingRows, r => r.disease, 5);

    const total = filteredRows.length || 1;
    const missingAge = filteredRows.filter(r => r.ageYear == null).length;
    const missingOnset = filteredRows.filter(r => !r.onsetDate).length;
    const missingLocality = filteredRows.filter(r => !r.locality).length;

    const pctAge = ((missingAge / total) * 100).toFixed(1);
    const pctOnset = ((missingOnset / total) * 100).toFixed(1);
    const pctLocality = ((missingLocality / total) * 100).toFixed(1);

    return (
      <div className="layout-2col" style={{marginTop: '1rem'}}>
        <div className="enotis-card">
          <div className="section-title">Kes Belum Ambil Tindakan</div>
          <div className="section-subtitle">Tiada Tkh Daftar & Tiada Tarikh Batal. Jumlah: {pendingRows.length} kes.</div>
          <div className="table-container">
            <table>
              <thead>
                <tr><th>Diagnosis</th><th>Bil Kes</th></tr>
              </thead>
              <tbody>
                {agg.map(a => <tr key={a.key}><td>{a.key}</td><td>{a.count}</td></tr>)}
              </tbody>
            </table>
          </div>
        </div>
        <div className="enotis-card">
          <div className="section-title">Data Quality Checks</div>
          <div className="section-subtitle">Medan kosong (Missing values)</div>
          <div className="table-container">
            <table>
              <thead>
                <tr><th>Medan</th><th>Kosong</th><th>%</th></tr>
              </thead>
              <tbody>
                <tr><td>Umur</td><td>{missingAge}</td><td>{pctAge}%</td></tr>
                <tr><td>Tarikh Onset</td><td>{missingOnset}</td><td>{pctOnset}%</td></tr>
                <tr><td>Lokaliti</td><td>{missingLocality}</td><td>{pctLocality}%</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  const renderBucketBar = (b) => {
    const total = (b.lt7 || 0) + (b.d8_14 || 0) + (b.gt14 || 0);
    if (!total) {
      return (
        <div title="Tiada kes">
          <div className="mini-bar"></div>
          <div className="mini-bar-label" style={{ opacity: 0.5 }}>0 kes</div>
        </div>
      );
    }
    const p1 = (b.lt7 / total) * 100;
    const p2 = (b.d8_14 / total) * 100;
    const p3 = (b.gt14 / total) * 100;

    return (
      <div title={`<7 hari: ${b.lt7} kes | 8–14 hari: ${b.d8_14} kes | >14 hari: ${b.gt14} kes`}>
        <div className="mini-bar">
          <div className="mini-bar-seg seg-good" style={{ width: `${p1}%` }}></div>
          <div className="mini-bar-seg seg-med" style={{ width: `${p2}%` }}></div>
          <div className="mini-bar-seg seg-bad" style={{ width: `${p3}%` }}></div>
        </div>
        <div className="mini-bar-label" style={{ display: 'flex', gap: '0.4rem', justifyContent: 'center', fontWeight: '500' }}>
          <span className="text-good">🟢{b.lt7}</span>
          <span className="text-med">🟡{b.d8_14}</span>
          <span className="text-bad">🔴{b.gt14}</span>
        </div>
      </div>
    );
  };

  const renderLatenessPKD = () => {
    if (!filteredRows.length) return null;

    const pkdStats = {};
    filteredRows.forEach(r => {
      const code = r.pkd || "TANPA PKD";
      if (!pkdStats[code]) {
        pkdStats[code] = {
          total: 0, late: 0, pkdInput: 0,
          daftarNotif: { lt7: 0, d8_14: 0, gt14: 0 },
          daftarKes: { lt7: 0, d8_14: 0, gt14: 0 },
          dxDaftar: { lt7: 0, d8_14: 0, gt14: 0 }
        };
      }
      const s = pkdStats[code];
      s.total++;

      if (isLateNotification(r)) s.late++;
      if (isPKDNotifier(r.notifBy)) s.pkdInput++;
      
      const addB = (obj, d) => {
        if (d == null || !isFinite(d)) return;
        if (d <= 7) obj.lt7++;
        else if (d <= 14) obj.d8_14++;
        else obj.gt14++;
      };
      
      addB(s.daftarNotif, r.inputToDaftarNotif);
      addB(s.daftarKes, r.daftarNotifToDaftarKes);
      addB(s.dxDaftar, r.dxToDaftar);
    });

    const pkdList = Object.keys(pkdStats).sort();
    const lateCases = filteredRows.filter(r => isLateNotification(r)).slice(0, 200);

    return (
      <div className="enotis-card" style={{marginTop: '1rem'}}>
        <div className="section-title">Lewat Notifikasi & Kes Input PKD</div>
        <div className="section-subtitle">
          Pecahan mengikut Pejabat Kesihatan (PKD) untuk notifikasi lewat serta prestasi pendaftaran.
        </div>
        <div className="table-container" style={{marginBottom: '1rem'}}>
          <table>
            <thead>
              <tr>
                <th>PKD</th>
                <th>Kes</th>
                <th>Lewat*</th>
                <th>% Lewat</th>
                <th>Input PKD</th>
                <th>% PKD</th>
                <th>Daftar Notif<br/>(🟢/🟡/🔴)</th>
                <th>Daftar Kes<br/>(🟢/🟡/🔴)</th>
                <th>Dx → Daftar<br/>(🟢/🟡/🔴)</th>
              </tr>
            </thead>
            <tbody>
              {pkdList.map(code => {
                const s = pkdStats[code];
                const latePct = ((s.late / s.total) * 100).toFixed(1);
                const pkdInputPct = ((s.pkdInput / s.total) * 100).toFixed(1);
                return (
                  <tr key={code}>
                    <td>{code.replace("PEJABAT KESIHATAN", "PKD")}</td>
                    <td>{s.total.toLocaleString()}</td>
                    <td>{s.late}</td>
                    <td>{latePct}%</td>
                    <td>{s.pkdInput}</td>
                    <td>{pkdInputPct}%</td>
                    <td>{renderBucketBar(s.daftarNotif)}</td>
                    <td>{renderBucketBar(s.daftarKes)}</td>
                    <td>{renderBucketBar(s.dxDaftar)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        
        <div className="section-subtitle">
          Line list kes yang lewat notifikasi (Dx → Notif melebihi ambang penyakit-spesifik, maksimum 200 rekod).
        </div>
        <div className="table-container">
          {lateCases.length === 0 ? (
            <div className="small-text" style={{padding: '1rem'}}>Tiada kes lewat.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Epi Week</th>
                  <th>Diagnosis</th>
                  <th>PKD</th>
                  <th>Lokaliti</th>
                  <th>Tarikh Dx</th>
                  <th>Tarikh Notif</th>
                  <th>Hari Lewat</th>
                </tr>
              </thead>
              <tbody>
                {lateCases.map((r, i) => (
                  <tr key={i}>
                    <td>{r.epiYear}-W{r.epiWeek}</td>
                    <td>{r.disease}</td>
                    <td>{r.pkd}</td>
                    <td>{r.locality}</td>
                    <td>{r.dxDate ? r.dxDate.toISOString().substring(0,10) : ''}</td>
                    <td>{r.notifDate ? r.notifDate.toISOString().substring(0,10) : ''}</td>
                    <td><span className="badge" style={{backgroundColor: 'var(--accent-color)'}}>{r.dxToNotif.toFixed(1)} hari</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    );
  };

  // Dynamic Tile Map based on theme
  const tileLayerUrl = theme === 'dark'
    ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
    : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
  const tileLayerAttribution = theme === 'dark'
    ? '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
    : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

  return (
    <div className="enotis-panel">
      <div className="top-bar">
        <div>
          <h2 style={{margin: 0}}>e-Notifikasi Review</h2>
          <div className="small-text">Sistem Pemantauan Data Excel. Sila muat naik fail e-Notifikasi.</div>
        </div>
        {processedRows.length > 0 && (
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <button className="btn btn-demo" onClick={handleLoadDemo} style={{ backgroundColor: 'var(--text-secondary)', padding: '0.5rem 1rem', fontSize: '0.85rem' }} title="Muat Semula Data Demo">
              ⚡ Reset / Guna Data Demo
            </button>
            <label className="btn" style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', cursor: 'pointer' }}>
              📁 Tukar Fail Excel
              <input type="file" accept=".xls,.xlsx,.csv" onChange={handleFileUpload} style={{ display: 'none' }} />
            </label>
          </div>
        )}
      </div>

      {processedRows.length > 0 && (
        <>
          <div className="controls glass-panel" style={{marginBottom: '1rem', display: 'flex', gap: '1rem', flexWrap: 'wrap', padding: '1rem'}}>
            <div>
              <div className="small-text">Epi Week:</div>
              <select value={weekFilter} onChange={e => setWeekFilter(e.target.value)}>
                <option value="ALL">All weeks (YTD)</option>
                {epiWeeks.map(w => <option key={w.label} value={w.label}>{w.label}</option>)}
              </select>
            </div>
            <div>
              <div className="small-text">Daerah:</div>
              <select value={districtFilter} onChange={e => setDistrictFilter(e.target.value)}>
                <option value="">Semua daerah</option>
                {districts.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <div className="small-text">Mukim/Zon:</div>
              <select value={mukimFilter} onChange={e => setMukimFilter(e.target.value)}>
                <option value="">Semua mukim</option>
                {mukims.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <div className="small-text">Penyakit:</div>
              <select value={diseaseFilter} onChange={e => setDiseaseFilter(e.target.value)}>
                <option value="">Semua penyakit</option>
                {diseases.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <div className="small-text">Status:</div>
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                <option value="">Semua status</option>
                {statuses.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          <div className="small-text" style={{marginBottom: '1rem', textAlign: 'right'}}>
            Rekod dijumpai: {filteredRows.length.toLocaleString()}
          </div>

          {renderSummaryCards()}

          <div className="layout-2col">
            <div className="enotis-card">
              <div className="section-title">Trend 54 Minggu</div>
              <div className="section-subtitle">Total notifications by epi week</div>
              <div style={{height: '260px'}}>
                <Line data={trendData} options={{ maintainAspectRatio: false }} />
              </div>
            </div>
            
            <div className="enotis-card">
              <div className="section-title">Peta Kes (Geo-lokasi)</div>
              <div className="section-subtitle">Pin lokasi berdasarkan Lat/Long WGS</div>
              <div style={{height: '260px', width: '100%', borderRadius: '8px', overflow: 'hidden'}}>
                <MapContainer center={[2.22, 102.25]} zoom={9} style={{ height: '100%', width: '100%' }}>
                  <TileLayer url={tileLayerUrl} attribution={tileLayerAttribution} />
                  <MapBounds latlngs={mapPins.map(r => [r.lat, r.lon])} />
                  {mapPins.map((r, idx) => (
                    <Marker key={idx} position={[r.lat, r.lon]}>
                      <Popup>
                        <b>{r.disease}</b><br/>
                        Daerah: {r.district}<br/>
                        Lokaliti: {r.locality}<br/>
                      </Popup>
                    </Marker>
                  ))}
                </MapContainer>
              </div>
            </div>
          </div>

          {renderTimelinessAndPending()}
          {renderLatenessPKD()}

          <div className="enotis-card" style={{marginTop: '1rem'}}>
            <div className="section-title">Line List Preview</div>
            <div className="section-subtitle">First 200 records of selected filters</div>
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Epi Week</th>
                    <th>Diagnosis</th>
                    <th>Daerah</th>
                    <th>Mukim</th>
                    <th>Lokaliti</th>
                    <th>Kemudahan</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.slice(0, 200).map((r, i) => (
                    <tr key={i}>
                      <td>{r.epiYear}-W{r.epiWeek}</td>
                      <td>{r.disease}</td>
                      <td>{r.district}</td>
                      <td>{r.mukim}</td>
                      <td>{r.locality}</td>
                      <td>{r.facility}</td>
                      <td>{r.notifStatus}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {processedRows.length === 0 && (
        <div className="empty-state glass-panel upload-zone-container">
          <div className="upload-icon" style={{ fontSize: '3rem', marginBottom: '1rem' }}>📂</div>
          <h3>Tiada Data Dimuat Naik</h3>
          <p style={{ marginBottom: '1.5rem', fontSize: '0.95rem' }}>
            Sila muat naik fail data Excel atau CSV e-Notifikasi menggunakan butang di bawah untuk visualisasi analisis.
          </p>
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <label className="btn" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              📁 Pilih Fail Excel
              <input type="file" accept=".xls,.xlsx,.csv" onChange={handleFileUpload} style={{ display: 'none' }} />
            </label>
            <button className="btn btn-demo" onClick={handleLoadDemo} style={{ backgroundColor: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              ⚡ Muat Data Demo Melaka
            </button>
          </div>
          <div className="small-text" style={{ marginTop: '1.2rem', opacity: 0.7, fontSize: '0.8rem' }}>
            *Data demo akan menjana 120 kes tiruan di Melaka Tengah, Alor Gajah, dan Jasin lengkap dengan peta dan koordinat.
          </div>
        </div>
      )}
    </div>
  );
};

export default EnotisPanel;
