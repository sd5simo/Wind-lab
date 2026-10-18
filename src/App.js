import React, { useState, useMemo } from 'react';
import { Upload, BarChart3, Zap, Download, Info, ChevronDown, ChevronUp, Calendar, Filter, AlertCircle } from 'lucide-react';
import { BarChart, Bar, LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import Papa from 'papaparse';

const WindAnalysisPlatform = () => {
  const [data, setData] = useState(null);
  const [filteredData, setFilteredData] = useState(null);
  const [activeTab, setActiveTab] = useState('upload');
  const [showInfo, setShowInfo] = useState(false);
  const [selectedHeight, setSelectedHeight] = useState('10m');
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [uploadStatus, setUploadStatus] = useState('');
  const [error, setError] = useState('');
  const [windRoseStyle, setWindRoseStyle] = useState('stacked'); // 'stacked' or 'pie'

  const hasMultipleHeights = useMemo(() => {
    return data && data.some(row => row.WS50M !== undefined && row.WS50M !== null);
  }, [data]);

  const processedData = useMemo(() => {
    if (!data) return null;
    
    const working = filteredData || data;
    const speedKey = selectedHeight === '50m' ? 'WS50M' : 'WS10M';
    const dirKey = selectedHeight === '50m' ? 'WD50M' : 'WD10M';
    
    const validData = working
      .filter(row => {
        const speed = parseFloat(row[speedKey]);
        const direction = parseFloat(row[dirKey]);
        
        // Filter out invalid, missing, or negative values
        return !isNaN(speed) && 
               !isNaN(direction) && 
               speed >= 0 && 
               speed < 100 && // Reasonable max wind speed
               direction >= 0 && 
               direction <= 360;
      })
      .map(row => ({
        speed: Math.abs(parseFloat(row[speedKey])), // Ensure positive
        direction: parseFloat(row[dirKey]),
        date: row.YEAR && row.MO && row.DY ? `${row.YEAR}-${String(row.MO).padStart(2, '0')}-${String(row.DY).padStart(2, '0')}` : null
      }));
  
    return validData;
  }, [data, filteredData, selectedHeight]);
  const weibullParams = useMemo(() => {
    if (!processedData || processedData.length === 0) return null;
  
    const speeds = processedData.map(d => d.speed);
    const n = speeds.length;
    const meanSpeed = speeds.reduce((a, b) => a + b, 0) / n;
    
    // Maximum Likelihood Estimation for Weibull parameters
    let k = 2; // Initial guess
    for (let iter = 0; iter < 100; iter++) {
      const currentK = k; // Capture k value for this iteration
      const sumVkLnV = speeds.reduce((sum, v) => sum + Math.pow(v, currentK) * Math.log(v), 0);
      const sumVk = speeds.reduce((sum, v) => sum + Math.pow(v, currentK), 0);
      const sumLnV = speeds.reduce((sum, v) => sum + Math.log(v), 0);
      
      const kNew = 1 / (sumVkLnV / sumVk - sumLnV / n);
      if (Math.abs(kNew - k) < 0.001) break;
      k = kNew;
    }
    
    const c = Math.pow(speeds.reduce((sum, v) => sum + Math.pow(v, k), 0) / n, 1 / k);
    
    return {
      k: isFinite(k) ? k : 2,
      c: isFinite(c) ? c : meanSpeed,
      mean: meanSpeed,
      max: Math.max(...speeds)
    };
  }, [processedData]);
  const windRoseData = useMemo(() => {
    if (!processedData) return null;

    const sectors = [
      'N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
      'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'
    ];
    const speedBins = [
      { min: 0, max: 3, label: '0-3', color: '#60a5fa' },
      { min: 3, max: 6, label: '3-6', color: '#34d399' },
      { min: 6, max: 9, label: '6-9', color: '#fbbf24' },
      { min: 9, max: 12, label: '9-12', color: '#fb923c' },
      { min: 12, max: 15, label: '12-15', color: '#f87171' },
      { min: 15, max: 999, label: '>15', color: '#dc2626' }
    ];

    const sectorData = sectors.map((sector, idx) => {
      const angle = idx * 22.5;
      const minAngle = angle - 11.25;
      const maxAngle = angle + 11.25;
      
      const sectorPoints = processedData.filter(d => {
        let dir = d.direction;
        if (minAngle < 0) {
          return dir >= (360 + minAngle) || dir < maxAngle;
        } else if (maxAngle >= 360) {
          return dir >= minAngle || dir < (maxAngle - 360);
        } else {
          return dir >= minAngle && dir < maxAngle;
        }
      });

      const bins = speedBins.map(bin => {
        const count = sectorPoints.filter(p => p.speed >= bin.min && p.speed < bin.max).length;
        return {
          ...bin,
          count,
          percentage: (count / processedData.length) * 100
        };
      });

      return {
        sector,
        direction: sector,
        angle,
        total: sectorPoints.length,
        bins,
        frequency: (sectorPoints.length / processedData.length) * 100
      };
    });

    return sectorData;
  }, [processedData]);

  const statistics = useMemo(() => {
    if (!processedData || processedData.length === 0) return null;
  
    const speeds = processedData.map(d => d.speed).filter(s => s >= 0 && s < 100);
    
    if (speeds.length === 0) return null;
    
    const sorted = [...speeds].sort((a, b) => a - b);
    const mean = speeds.reduce((a, b) => a + b, 0) / speeds.length;
    
    return {
      count: speeds.length,
      mean: mean,
      max: Math.max(...speeds),
      min: Math.min(...speeds),
      median: sorted[Math.floor(sorted.length / 2)],
      stdDev: Math.sqrt(speeds.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / speeds.length)
    };
  }, [processedData]);

  const speedCategories = useMemo(() => {
    if (!processedData) return null;

    const categories = [
      { name: 'Calm', range: '0-3 m/s', min: 0, max: 3, color: 'bg-blue-500' },
      { name: 'Light', range: '3-6 m/s', min: 3, max: 6, color: 'bg-green-500' },
      { name: 'Moderate', range: '6-9 m/s', min: 6, max: 9, color: 'bg-yellow-500' },
      { name: 'Strong', range: '9-12 m/s', min: 9, max: 12, color: 'bg-orange-500' },
      { name: 'Gale', range: '>12 m/s', min: 12, max: 999, color: 'bg-red-500' }
    ];

    return categories.map(cat => ({
      ...cat,
      count: processedData.filter(d => d.speed >= cat.min && d.speed < cat.max).length,
      percentage: (processedData.filter(d => d.speed >= cat.min && d.speed < cat.max).length / processedData.length) * 100
    }));
  }, [processedData]);

  const frequencyDistribution = useMemo(() => {
    if (!processedData) return null;

    const bins = [];
    for (let i = 0; i <= Math.ceil(statistics.max); i++) {
      bins.push({
        speed: i,
        count: processedData.filter(d => d.speed >= i && d.speed < i + 1).length
      });
    }
    return bins;
  }, [processedData, statistics]);

  const cumulativeDistribution = useMemo(() => {
    if (!frequencyDistribution) return null;

    let cumulative = 0;
    return frequencyDistribution.map(bin => {
      cumulative += bin.count;
      return {
        speed: bin.speed,
        cumulative: cumulative / processedData.length
      };
    });
  }, [frequencyDistribution, processedData]);

  const powerAnalysis = useMemo(() => {
    if (!processedData || !weibullParams) return null;

    const rho = 1.225; // Air density kg/m³
    const avgPowerDensity = processedData.reduce((sum, d) => sum + 0.5 * rho * Math.pow(d.speed, 3), 0) / processedData.length;

    let windClass = 1;
    const height = selectedHeight === '50m' ? 50 : 10;
    if (height === 50) {
      if (avgPowerDensity >= 800) windClass = 7;
      else if (avgPowerDensity >= 600) windClass = 6;
      else if (avgPowerDensity >= 500) windClass = 5;
      else if (avgPowerDensity >= 400) windClass = 4;
      else if (avgPowerDensity >= 300) windClass = 3;
      else if (avgPowerDensity >= 200) windClass = 2;
    } else {
      if (avgPowerDensity >= 400) windClass = 7;
      else if (avgPowerDensity >= 300) windClass = 6;
      else if (avgPowerDensity >= 250) windClass = 5;
      else if (avgPowerDensity >= 200) windClass = 4;
      else if (avgPowerDensity >= 150) windClass = 3;
      else if (avgPowerDensity >= 100) windClass = 2;
    }

    const classification = windClass >= 4 ? 'Good' : windClass >= 3 ? 'Fair' : 'Poor';
    
    // Estimate AEP for 2MW turbine (simplified)
    const capacityFactor = Math.min(0.45, weibullParams.mean / 12);
    const annualEnergy = 2000 * 8760 * capacityFactor; // kWh

    return {
      avgPowerDensity,
      windClass,
      classification,
      annualEnergy
    };
  }, [processedData, weibullParams, selectedHeight]);

  const weibullDistribution = useMemo(() => {
    if (!frequencyDistribution || !weibullParams) return null;

    return frequencyDistribution.map(bin => {
      const v = bin.speed + 0.5;
      const { k, c } = weibullParams;
      const probability = (k / c) * Math.pow(v / c, k - 1) * Math.exp(-Math.pow(v / c, k));
      
      return {
        speed: bin.speed,
        density: bin.count / processedData.length,
        weibull: probability
      };
    });
  }, [frequencyDistribution, weibullParams, processedData]);

  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;
  
    setUploadStatus('Uploading...');
    setError('');
  
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        let csvText = e.target.result;
        
        // Find the actual data start (after -END HEADER-)
        const headerEndIndex = csvText.indexOf('-END HEADER-');
        if (headerEndIndex !== -1) {
          // Extract everything after the header
          csvText = csvText.substring(headerEndIndex + '-END HEADER-'.length).trim();
        }
        
        // Now parse the CSV data
        Papa.parse(csvText, {
          header: true,
          dynamicTyping: false, // Changed to false to handle data manually
          skipEmptyLines: true,
          transformHeader: (header) => header.trim(), // Clean up header names
          transform: (value) => value.trim(), // Clean up all values
          complete: (results) => {
            try {
              // Manually convert numeric fields
              const processedData = results.data.map(row => {
                const processed = {};
                for (let key in row) {
                  const value = row[key];
                  // Convert numeric fields
                  if (['YEAR', 'MO', 'DY', 'HR', 'WS10M', 'WD10M', 'WS50M', 'WD50M'].includes(key)) {
                    processed[key] = value === '' || value === null ? null : parseFloat(value);
                  } else {
                    processed[key] = value;
                  }
                }
                return processed;
              });
  
              // Filter out invalid rows
              const validData = processedData.filter(row => {
                return row.WS10M !== undefined && row.WS10M !== null && !isNaN(row.WS10M) &&
                       row.WD10M !== undefined && row.WD10M !== null && !isNaN(row.WD10M);
              });
  
              if (validData.length === 0) {
                setError('No valid data found. Please check your CSV format.');
                setUploadStatus('');
                return;
              }
  
              const requiredFields = ['WS10M', 'WD10M'];
              const hasRequired = requiredFields.every(field => 
                validData[0] && validData[0].hasOwnProperty(field)
              );
  
              if (!hasRequired) {
                setError('Invalid CSV format. Required columns: WS10M, WD10M');
                setUploadStatus('');
                return;
              }
  
              // Check if 50m data exists
              const has50m = validData.some(row => 
                row.WS50M !== undefined && row.WS50M !== null && !isNaN(row.WS50M)
              );
  
              setData(validData);
              setFilteredData(null);
              setUploadStatus(`Successfully uploaded ${validData.length} records${has50m ? ' (Multi-height data detected: 10m & 50m)' : ''}`);
              setActiveTab('analysis');
              setSelectedHeight('10m');
            } catch (err) {
              setError(`Error processing data: ${err.message}`);
              setUploadStatus('');
            }
          },
          error: (error) => {
            setError(`Error parsing CSV: ${error.message}`);
            setUploadStatus('');
          }
        });
      } catch (error) {
        setError(`Error reading file: ${error.message}`);
        setUploadStatus('');
      }
    };
  
    reader.onerror = () => {
      setError('Error reading file. Please try again.');
      setUploadStatus('');
    };
  
    reader.readAsText(file);
  };

  const applyDateFilter = () => {
    if (!data || !dateRange.start || !dateRange.end) return;

    const filtered = data.filter(row => {
      if (!row.YEAR || !row.MO || !row.DY) return true;
      const date = `${row.YEAR}-${String(row.MO).padStart(2, '0')}-${String(row.DY).padStart(2, '0')}`;
      return date >= dateRange.start && date <= dateRange.end;
    });

    setFilteredData(filtered);
  };

  const clearFilter = () => {
    setFilteredData(null);
    setDateRange({ start: '', end: '' });
  };

  const exportCSV = () => {
    if (!processedData || !windRoseData) return;

    let csv = 'Wind Data Analysis Export\n';
    csv += `Date: ${new Date().toLocaleDateString()}\n`;
    csv += `Height: ${selectedHeight}\n\n`;

    csv += 'WEIBULL PARAMETERS\n';
    csv += 'Parameter,Value\n';
    csv += `Shape (k),${weibullParams.k.toFixed(3)}\n`;
    csv += `Scale (c),${weibullParams.c.toFixed(3)}\n`;
    csv += `Mean Speed,${weibullParams.mean.toFixed(2)}\n`;
    csv += `Max Speed,${weibullParams.max.toFixed(2)}\n\n`;

    csv += 'WIND ROSE DATA\n';
    csv += 'Direction,0-3 m/s,3-6 m/s,6-9 m/s,9-12 m/s,12-15 m/s,>15 m/s,Total,Frequency %\n';
    windRoseData.forEach(sector => {
      csv += `${sector.sector},${sector.bins.map(b => b.count).join(',')},${sector.total},${sector.frequency.toFixed(2)}\n`;
    });

    csv += '\nFREQUENCY DISTRIBUTION\n';
    csv += 'Speed (m/s),Count\n';
    frequencyDistribution.forEach(bin => {
      csv += `${bin.speed},${bin.count}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `wind_analysis_${selectedHeight}_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  const exportBasicPDF = () => {
    // Create HTML report
    const reportHTML = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Wind Data Analysis Report</title>
  <style>
    body { font-family: Arial, sans-serif; max-width: 800px; margin: 40px auto; padding: 20px; }
    h1 { color: #2563eb; text-align: center; margin-bottom: 10px; }
    .subtitle { text-align: center; color: #666; font-size: 14px; margin-bottom: 30px; }
    .credit { text-align: center; color: #2563eb; font-weight: bold; margin-bottom: 5px; }
    h2 { color: #1e40af; border-bottom: 2px solid #2563eb; padding-bottom: 5px; margin-top: 30px; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th { background-color: #2563eb; color: white; padding: 12px; text-align: left; }
    td { padding: 10px; border-bottom: 1px solid #ddd; }
    tr:nth-child(even) { background-color: #f9fafb; }
    .upgrade-box { background-color: #f0f9ff; border: 2px solid #2563eb; border-radius: 8px; padding: 20px; margin: 30px 0; }
    .upgrade-box h3 { color: #2563eb; text-align: center; margin-top: 0; }
    .upgrade-box ul { list-style: none; padding: 0; }
    .upgrade-box li { padding: 5px 0; text-align: center; }
    .coming-soon { color: #dc2626; font-weight: bold; text-align: center; margin-top: 15px; }
    .footer { text-align: center; color: #666; font-size: 12px; margin-top: 40px; border-top: 1px solid #ddd; padding-top: 20px; }
  </style>
</head>
<body>
  <div class="credit">Developed by: SADDEN MOHAMED AMINE</div>
  <h1>Wind Data Analysis Report</h1>
  <div class="subtitle">Date: ${new Date().toLocaleDateString()} | Analysis Height: ${selectedHeight}</div>

  <h2>Weibull Distribution Parameters</h2>
  <table>
    <tr><th>Parameter</th><th>Value</th></tr>
    <tr><td>Shape Parameter (k)</td><td>${weibullParams.k.toFixed(3)}</td></tr>
    <tr><td>Scale Parameter (c)</td><td>${weibullParams.c.toFixed(3)} m/s</td></tr>
    <tr><td>Mean Wind Speed</td><td>${weibullParams.mean.toFixed(2)} m/s</td></tr>
    <tr><td>Maximum Wind Speed</td><td>${weibullParams.max.toFixed(2)} m/s</td></tr>
  </table>

  <h2>Statistical Summary</h2>
  <table>
    <tr><th>Metric</th><th>Value</th></tr>
    <tr><td>Count</td><td>${statistics.count}</td></tr>
    <tr><td>Mean</td><td>${statistics.mean.toFixed(2)} m/s</td></tr>
    <tr><td>Median</td><td>${statistics.median.toFixed(2)} m/s</td></tr>
    <tr><td>Standard Deviation</td><td>${statistics.stdDev.toFixed(2)} m/s</td></tr>
    <tr><td>Minimum</td><td>${statistics.min.toFixed(2)} m/s</td></tr>
    <tr><td>Maximum</td><td>${statistics.max.toFixed(2)} m/s</td></tr>
  </table>

  <h2>Wind Power Analysis</h2>
  <table>
    <tr><th>Parameter</th><th>Value</th></tr>
    <tr><td>Average Power Density</td><td>${powerAnalysis.avgPowerDensity.toFixed(2)} W/m²</td></tr>
    <tr><td>Wind Power Class</td><td>Class ${powerAnalysis.windClass}</td></tr>
    <tr><td>Site Classification</td><td>${powerAnalysis.classification}</td></tr>
    <tr><td>Est. Annual Energy (2MW Turbine)</td><td>${(powerAnalysis.annualEnergy / 1000).toFixed(0)} MWh</td></tr>
  </table>

  ${hasMultipleHeights ? `
  <h2>Multi-Height Analysis</h2>
  <p>This dataset includes measurements at both 10m and 50m heights. Use the platform's height selector to compare wind characteristics at different elevations for comprehensive site assessment.</p>
  ` : ''}

  <div class="upgrade-box">
    <h3>Unlock Complete Analysis</h3>
    <ul>
      <li>✓ Complete wind rose diagrams</li>
      <li>✓ Full frequency distribution charts</li>
      <li>✓ Cumulative distribution graphs</li>
      <li>✓ Speed category breakdowns</li>
      <li>✓ Directional frequency tables</li>
      <li>✓ Professional visualizations</li>
    </ul>
    <div class="coming-soon">Premium PDF Export - Coming Soon</div>
  </div>

  <div class="footer">
    <p>Developed by: SADDEN MOHAMED AMINE</p>
    <p>WIND LAB © 2025</p>
  </div>
</body>
</html>
    `;

    // Create blob and download
    const blob = new Blob([reportHTML], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `wind_analysis_basic_${selectedHeight}_${new Date().toISOString().split('T')[0]}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const WindRose = ({ data }) => {
    const size = 500;
    const center = size / 2;
    const maxRadius = 180;
    
    const colors = ['#0000FF', '#00FFFF', '#00FF00', '#FFFF00', '#FF6600', '#FF0000', '#8B0000'];
    
    const maxFreq = Math.max(...data.map(d => d.frequency));
    
    return (
      <div className="flex flex-col items-center gap-4">
        <svg width={size} height={size} className="border rounded-lg bg-white">
          <defs>
            <marker id="arrowN" markerWidth="10" markerHeight="10" refX="5" refY="5" orient="auto">
              <polygon points="0,0 10,5 0,10 3,5" fill="#000" />
            </marker>
          </defs>
          
          {/* Concentric circles with labels */}
          {[1, 2, 3, 4, 5].map((i) => {
            const r = maxRadius * (i / 5);
            const percentage = (i * 20) / 5;
            return (
              <g key={i}>
                <circle
                  cx={center}
                  cy={center}
                  r={r}
                  fill="none"
                  stroke="#ddd"
                  strokeWidth="1"
                />
                {i === 5 && (
                  <text
                    x={center + r + 5}
                    y={center + 3}
                    fontSize="10"
                    fill="#666"
                  >
                    {percentage.toFixed(1)}%
                  </text>
                )}
              </g>
            );
          })}
          
          {/* Radial lines */}
          {data.map((sector, idx) => {
            const angle = (sector.angle - 90) * Math.PI / 180;
            const x2 = center + maxRadius * Math.cos(angle);
            const y2 = center + maxRadius * Math.sin(angle);
            return (
              <line
                key={idx}
                x1={center}
                y1={center}
                x2={x2}
                y2={y2}
                stroke="#ddd"
                strokeWidth="1"
              />
            );
          })}
          
          {/* Wind data wedges */}
          {data.map((sector, idx) => {
            const startAngle = (sector.angle - 11.25 - 90) * Math.PI / 180;
            const endAngle = (sector.angle + 11.25 - 90) * Math.PI / 180;
            let currentRadius = 0;
            
            return sector.bins.map((bin, binIdx) => {
              const binHeight = (bin.percentage / 100) * maxRadius / (maxFreq / 100);
              const innerR = currentRadius;
              const outerR = currentRadius + binHeight;
              
              currentRadius = outerR;
              
              if (bin.count === 0) return null;
              
              // Create wedge path
              const x1Inner = center + innerR * Math.cos(startAngle);
              const y1Inner = center + innerR * Math.sin(startAngle);
              const x2Inner = center + innerR * Math.cos(endAngle);
              const y2Inner = center + innerR * Math.sin(endAngle);
              
              const x1Outer = center + outerR * Math.cos(startAngle);
              const y1Outer = center + outerR * Math.sin(startAngle);
              const x2Outer = center + outerR * Math.cos(endAngle);
              const y2Outer = center + outerR * Math.sin(endAngle);
              
              const largeArc = 0;
              
              const path = `
                M ${x1Inner} ${y1Inner}
                L ${x1Outer} ${y1Outer}
                A ${outerR} ${outerR} 0 ${largeArc} 1 ${x2Outer} ${y2Outer}
                L ${x2Inner} ${y2Inner}
                A ${innerR} ${innerR} 0 ${largeArc} 0 ${x1Inner} ${y1Inner}
                Z
              `;
              
              return (
                <path
                  key={`${idx}-${binIdx}`}
                  d={path}
                  fill={colors[binIdx]}
                  stroke="#fff"
                  strokeWidth="0.5"
                  opacity="0.9"
                />
              );
            });
          })}
          
          {/* Cardinal direction arrows and labels */}
          {[
            { dir: 'N', angle: 0, hasArrow: true },
            { dir: 'NE', angle: 45, hasArrow: false },
            { dir: 'E', angle: 90, hasArrow: true },
            { dir: 'SE', angle: 135, hasArrow: false },
            { dir: 'S', angle: 180, hasArrow: true },
            { dir: 'SW', angle: 225, hasArrow: false },
            { dir: 'W', angle: 270, hasArrow: true },
            { dir: 'NW', angle: 315, hasArrow: false }
          ].map(({ dir, angle, hasArrow }) => {
            const rad = (angle - 90) * Math.PI / 180;
            const labelRadius = maxRadius + 35;
            const arrowRadius = maxRadius + 15;
            const x = center + labelRadius * Math.cos(rad);
            const y = center + labelRadius * Math.sin(rad);
            
            return (
              <g key={dir}>
                {hasArrow && (
                  <line
                    x1={center + (maxRadius + 5) * Math.cos(rad)}
                    y1={center + (maxRadius + 5) * Math.sin(rad)}
                    x2={center + arrowRadius * Math.cos(rad)}
                    y2={center + arrowRadius * Math.sin(rad)}
                    stroke="#000"
                    strokeWidth="2"
                    markerEnd={dir === 'N' ? 'url(#arrowN)' : ''}
                  />
                )}
                <text
                  x={x}
                  y={y}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize="14"
                  fontWeight="bold"
                  fill="#000"
                >
                  {dir}
                </text>
              </g>
            );
          })}
          
          {/* Center calm circle */}
          <circle cx={center} cy={center} r={25} fill="#fff" stroke="#666" strokeWidth="2" />
          <text x={center} y={center - 5} textAnchor="middle" fontSize="11" fontWeight="bold" fill="#000">
            Calm
          </text>
          <text x={center} y={center + 8} textAnchor="middle" fontSize="10" fill="#666">
            {((data.reduce((sum, s) => sum + s.bins[0].count, 0) / processedData.length) * 100).toFixed(1)}%
          </text>
        </svg>
        
        {/* Legend */}
        <div className="flex flex-wrap gap-3 justify-center items-center">
          <span className="text-sm font-semibold mr-2">Wind Speed [mph]</span>
          {['2-4.9', '5-6.9', '7-9.9', '10-14.9', '15-19.9', '20+'].map((label, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <div className="w-5 h-5 rounded" style={{ backgroundColor: colors[idx] }}></div>
              <span className="text-sm">{label}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-cyan-50 p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <img 
                src="/logo.png" 
                alt="Wind Lab Logo" 
                className="w-12 h-12 object-contain"
              />
              <div>
                <h1 className="text-3xl font-bold text-gray-800">Wind Lab</h1>
                <p className="text-gray-600">Science Behind the Wind (v1.0)</p>
              </div>
            </div>
            {hasMultipleHeights && processedData && (
              <div className="flex items-center gap-3 bg-blue-50 px-4 py-2 rounded-lg">
                <span className="text-sm font-medium text-gray-700">Height:</span>
                <button
                  onClick={() => setSelectedHeight('10m')}
                  className={`px-4 py-2 rounded ${selectedHeight === '10m' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700'}`}
                >
                  10m
                </button>
                <button
                  onClick={() => setSelectedHeight('50m')}
                  className={`px-4 py-2 rounded ${selectedHeight === '50m' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700'}`}
                >
                  50m
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Info Panel */}
        <div className="bg-white rounded-lg shadow-lg mb-6">
          <button
            onClick={() => setShowInfo(!showInfo)}
            className="w-full flex items-center justify-between p-4 hover:bg-gray-50"
          >
            <div className="flex items-center gap-2">
              <Info className="w-5 h-5 text-blue-600" />
              <span className="font-semibold text-gray-800">Information & Guide</span>
            </div>
            {showInfo ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
          </button>
          
          {showInfo && (
            <div className="p-6 border-t space-y-4 text-sm text-gray-700">
              <div>
                <h3 className="font-semibold text-lg mb-2">About This Platform</h3>
                <p>This professional tool analyzes wind data from NASA POWER database for wind energy site assessment, wind farm planning, and meteorological research.</p>
              </div>
              
              <div>
                <h3 className="font-semibold mb-2">Weibull Distribution</h3>
                <p>The Weibull distribution models wind speed probability. Parameters k (shape) and c (scale) characterize the wind regime. Higher k means more consistent winds, while c indicates average wind speed.</p>
              </div>
              
              <div>
                <h3 className="font-semibold mb-2">Wind Rose</h3>
                <p>A polar diagram showing wind direction frequency and speed distribution. Each sector represents a compass direction, with colors indicating wind speed ranges.</p>
              </div>
              
              <div>
                <h3 className="font-semibold mb-2">Power Analysis</h3>
                <p>Wind power density (W/m²) indicates the energy available in the wind. Wind power class (1-7) classifies site potential, with Class 4+ considered good for wind energy development.</p>
              </div>
              
              <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <Upload className="w-5 h-5 text-blue-600" />
                  How to Get NASA POWER Data
                </h3>
                <div className="space-y-2 mb-4">
                  <p className="font-medium">Step 1: Visit NASA POWER Data Access Viewer</p>
                  <a 
                    href="https://power.larc.nasa.gov/data-access-viewer/" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-800 underline block"
                  >
                    https://power.larc.nasa.gov/data-access-viewer/
                  </a>
                  
                  <p className="font-medium mt-3">Step 2: Select Parameters</p>
                  <ul className="list-disc ml-5 space-y-1">
                    <li>Choose your location on the map or enter coordinates</li>
                    <li>Select temporal average: <strong>Daily</strong></li>
                    <li>Select parameters: <strong>WS10M, WD10M</strong> (required)</li>
                    <li>Optional: Add <strong>WS50M, WD50M</strong> for 50m analysis</li>
                    <li>Choose your date range</li>
                  </ul>
                  
                  <p className="font-medium mt-3">Step 3: Download as CSV</p>
                  <p>Click "Submit" and download the CSV file with all selected parameters.</p>
                </div>
                
                <div className="flex justify-center">
                  <input
                    type="file"
                    accept=".csv"
                    onChange={handleFileUpload}
                    className="hidden"
                    id="info-file-upload"
                  />
                  <label
                    htmlFor="info-file-upload"
                    className="inline-flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-lg cursor-pointer hover:bg-blue-700 transition-colors font-medium"
                  >
                    <Upload className="w-5 h-5" />
                    Upload NASA POWER CSV
                  </label>
                </div>
              </div>
              
              <div>
                <h3 className="font-semibold mb-2">CSV Format Requirements</h3>
                <p className="mb-1"><strong>Required columns:</strong> WS10M (wind speed at 10m), WD10M (wind direction at 10m)</p>
                <p><strong>Optional columns:</strong> WS50M, WD50M (for 50m analysis), YEAR, MO, DY (for date filtering)</p>
              </div>
            </div>
          )}
        </div>

        {/* Tab Navigation */}
        <div className="bg-white rounded-lg shadow-lg mb-6">
          <div className="flex border-b overflow-x-auto">
            {[
              { id: 'upload', label: 'Upload Data', icon: Upload },
              { id: 'analysis', label: 'Analysis', icon: BarChart3 },
              { id: 'statistics', label: 'Statistics', icon: BarChart3 },
              { id: 'power', label: 'Power', icon: Zap },
              { id: 'export', label: 'Export', icon: Download }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-6 py-4 font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'text-blue-600 border-b-2 border-blue-600'
                    : 'text-gray-600 hover:text-blue-600'
                }`}
              >
                <tab.icon className="w-5 h-5" />
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="p-6">
            {activeTab === 'upload' && (
              <div className="space-y-6">
                <div className="border-2 border-dashed border-blue-300 rounded-lg p-12 text-center bg-blue-50">
                  <Upload className="w-16 h-16 text-blue-600 mx-auto mb-4" />
                  <h3 className="text-xl font-semibold mb-2">Upload Wind Data CSV</h3>
                  <p className="text-gray-600 mb-4">NASA POWER database format with WS10M, WD10M columns</p>
                  <input
                    type="file"
                    accept=".csv"
                    onChange={handleFileUpload}
                    className="hidden"
                    id="file-upload"
                  />
                  <label
                    htmlFor="file-upload"
                    className="inline-block bg-blue-600 text-white px-6 py-3 rounded-lg cursor-pointer hover:bg-blue-700 transition-colors"
                  >
                    Choose CSV File
                  </label>
                  
                  {uploadStatus && (
                    <div className="mt-4 p-3 bg-green-100 text-green-800 rounded-lg">
                      {uploadStatus}
                    </div>
                  )}
                  
                  {error && (
                    <div className="mt-4 p-3 bg-red-100 text-red-800 rounded-lg flex items-center gap-2 justify-center">
                      <AlertCircle className="w-5 h-5" />
                      {error}
                    </div>
                  )}
                </div>

                {data && (
                  <div className="bg-gray-50 rounded-lg p-6">
                    <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                      <Calendar className="w-5 h-5" />
                      Date Range Filter (Optional)
                    </h3>
                    <div className="flex flex-wrap gap-4 items-end">
                      <div>
                        <label className="block text-sm font-medium mb-2">Start Date</label>
                        <input
                          type="date"
                          value={dateRange.start}
                          onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
                          className="px-4 py-2 border rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2">End Date</label>
                        <input
                          type="date"
                          value={dateRange.end}
                          onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
                          className="px-4 py-2 border rounded-lg"
                        />
                      </div>
                      <button
                        onClick={applyDateFilter}
                        className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2"
                      >
                        <Filter className="w-4 h-4" />
                        Apply Filter
                      </button>
                      {filteredData && (
                        <button
                          onClick={clearFilter}
                          className="bg-gray-600 text-white px-6 py-2 rounded-lg hover:bg-gray-700"
                        >
                          Clear Filter
                        </button>
                      )}
                    </div>
                    {filteredData && (
                      <div className="mt-4 p-3 bg-blue-100 text-blue-800 rounded-lg">
                        Filtered to {filteredData.length} records
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'analysis' && processedData && (
              <div className="space-y-6">
                {/* Weibull Distribution */}
                <div className="bg-white rounded-lg shadow p-6">
                  <h3 className="text-xl font-semibold mb-4">Weibull Distribution Analysis</h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                    {[
                      { label: 'Shape (k)', value: weibullParams.k.toFixed(3), color: 'bg-blue-500', tooltip: 'Determines the shape of the distribution' },
                      { label: 'Scale (c)', value: `${weibullParams.c.toFixed(3)} m/s`, color: 'bg-green-500', tooltip: 'Characteristic wind speed' },
                      { label: 'Mean Speed', value: `${weibullParams.mean.toFixed(2)} m/s`, color: 'bg-purple-500', tooltip: 'Average wind speed' },
                      { label: 'Max Speed', value: `${weibullParams.max.toFixed(2)} m/s`, color: 'bg-orange-500', tooltip: 'Maximum recorded speed' }
                    ].map((param, idx) => (
                      <div key={idx} className="bg-gray-50 rounded-lg p-4">
                        <div className={`w-3 h-3 rounded-full ${param.color} mb-2`}></div>
                        <div className="text-sm text-gray-600" title={param.tooltip}>{param.label}</div>
                        <div className="text-2xl font-bold text-gray-800">{param.value}</div>
                      </div>
                    ))}
                  </div>

                  <ResponsiveContainer width="100%" height={400}>
                    <LineChart data={weibullDistribution}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="speed" label={{ value: 'Wind Speed (m/s)', position: 'insideBottom', offset: -5 }} />
                      <YAxis label={{ value: 'Probability Density', angle: -90, position: 'insideLeft' }} />
                      <Tooltip />
                      <Legend />
                      <Line type="monotone" dataKey="density" stroke="#3b82f6" strokeWidth={2} name="Observed Density" dot={false} />
                      <Line type="monotone" dataKey="weibull" stroke="#ef4444" strokeWidth={3} name="Weibull Fit" dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                {/* Wind Rose */}
                <div className="bg-white rounded-lg shadow p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-xl font-semibold">Wind Rose Diagram</h3>
                    <div className="flex items-center gap-2 bg-gray-100 rounded-lg p-1">
                      <button
                        onClick={() => setWindRoseStyle('stacked')}
                        className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
                          windRoseStyle === 'stacked' 
                            ? 'bg-blue-600 text-white' 
                            : 'text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        Stacked Bars
                      </button>
                      <button
                        onClick={() => setWindRoseStyle('pie')}
                        className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
                          windRoseStyle === 'pie' 
                            ? 'bg-blue-600 text-white' 
                            : 'text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        Wedge Style
                      </button>
                    </div>
                  </div>
                  <WindRose data={windRoseData} />
                  
                  <div className="mt-6 overflow-x-auto">
                    <h4 className="font-semibold mb-3">Directional Frequency Table</h4>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-blue-600 text-white">
                          <th className="p-2 text-left">Direction</th>
                          <th className="p-2 text-right">0-3</th>
                          <th className="p-2 text-right">3-6</th>
                          <th className="p-2 text-right">6-9</th>
                          <th className="p-2 text-right">9-12</th>
                          <th className="p-2 text-right">12-15</th>
                          <th className="p-2 text-right">&gt;15</th>
                          <th className="p-2 text-right">Frequency %</th>
                        </tr>
                      </thead>
                      <tbody>
                        {windRoseData.map((sector, idx) => (
                          <tr key={idx} className={idx % 2 === 0 ? 'bg-gray-50' : ''}>
                            <td className="p-2 font-medium">{sector.sector}</td>
                            {sector.bins.map((bin, binIdx) => (
                              <td key={binIdx} className="p-2 text-right">{bin.count}</td>
                            ))}
                            <td className="p-2 text-right font-semibold">{sector.frequency.toFixed(2)}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'statistics' && processedData && (
              <div className="space-y-6">
                {/* Summary Stats */}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                  {[
                    { label: 'Count', value: statistics.count, color: 'bg-blue-500' },
                    { label: 'Mean', value: `${statistics.mean.toFixed(2)} m/s`, color: 'bg-green-500' },
                    { label: 'Median', value: `${statistics.median.toFixed(2)} m/s`, color: 'bg-purple-500' },
                    { label: 'Std Dev', value: `${statistics.stdDev.toFixed(2)} m/s`, color: 'bg-orange-500' },
                    { label: 'Min', value: `${statistics.min.toFixed(2)} m/s`, color: 'bg-red-500' },
                    { label: 'Max', value: `${statistics.max.toFixed(2)} m/s`, color: 'bg-indigo-500' }
                  ].map((stat, idx) => (
                    <div key={idx} className="bg-white rounded-lg shadow p-4">
                      <div className={`w-3 h-3 rounded-full ${stat.color} mb-2`}></div>
                      <div className="text-sm text-gray-600">{stat.label}</div>
                      <div className="text-xl font-bold text-gray-800">{stat.value}</div>
                    </div>
                  ))}
                </div>

                {/* Speed Categories */}
                <div className="bg-white rounded-lg shadow p-6">
                  <h3 className="text-xl font-semibold mb-4">Wind Speed Categories</h3>
                  <div className="space-y-4">
                    {speedCategories.map((cat, idx) => (
                      <div key={idx}>
                        <div className="flex justify-between mb-2">
                          <span className="font-medium">{cat.name} ({cat.range})</span>
                          <span className="text-gray-600">{cat.count} records ({cat.percentage.toFixed(1)}%)</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-6">
                          <div
                            className={`${cat.color} h-6 rounded-full flex items-center justify-end pr-2`}
                            style={{ width: `${cat.percentage}%` }}
                          >
                            <span className="text-white text-sm font-semibold">{cat.percentage.toFixed(1)}%</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Frequency Distribution */}
                <div className="bg-white rounded-lg shadow p-6">
                  <h3 className="text-xl font-semibold mb-4">Frequency Distribution</h3>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={frequencyDistribution}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="speed" label={{ value: 'Wind Speed (m/s)', position: 'insideBottom', offset: -5 }} />
                      <YAxis label={{ value: 'Count', angle: -90, position: 'insideLeft' }} />
                      <Tooltip />
                      <Bar dataKey="count" fill="#3b82f6" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Cumulative Distribution */}
                <div className="bg-white rounded-lg shadow p-6">
                  <h3 className="text-xl font-semibold mb-4">Cumulative Distribution Function</h3>
                  <ResponsiveContainer width="100%" height={300}>
                    <AreaChart data={cumulativeDistribution}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="speed" label={{ value: 'Wind Speed (m/s)', position: 'insideBottom', offset: -5 }} />
                      <YAxis domain={[0, 1]} label={{ value: 'Cumulative Probability', angle: -90, position: 'insideLeft' }} />
                      <Tooltip formatter={(value) => value.toFixed(3)} />
                      <Area type="monotone" dataKey="cumulative" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.6} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {activeTab === 'power' && processedData && (
              <div className="space-y-6">
                {/* Power Metrics */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[
                    { label: 'Avg Power Density', value: `${powerAnalysis.avgPowerDensity.toFixed(2)} W/m²`, color: 'bg-blue-500', desc: 'Energy available in the wind' },
                    { label: 'Wind Power Class', value: `Class ${powerAnalysis.windClass}`, color: 'bg-green-500', desc: 'Site potential rating (1-7)' }
                  ].map((metric, idx) => (
                    <div key={idx} className="bg-white rounded-lg shadow p-6">
                      <div className={`w-4 h-4 rounded-full ${metric.color} mb-2`}></div>
                      <div className="text-sm text-gray-600 mb-1">{metric.label}</div>
                      <div className="text-2xl font-bold text-gray-800 mb-2">{metric.value}</div>
                      <div className="text-xs text-gray-500">{metric.desc}</div>
                    </div>
                  ))}
                </div>

                {/* Power Class Info */}
                <div className="bg-white rounded-lg shadow p-6">
                  <h3 className="text-xl font-semibold mb-4">Wind Power Class Information</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-blue-600 text-white">
                          <th className="p-3 text-left">Class</th>
                          <th className="p-3 text-left">Power Density (W/m²) at {selectedHeight}</th>
                          <th className="p-3 text-left">Resource Potential</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[
                          { class: 1, power: selectedHeight === '50m' ? '<200' : '<100', potential: 'Poor' },
                          { class: 2, power: selectedHeight === '50m' ? '200-300' : '100-150', potential: 'Marginal' },
                          { class: 3, power: selectedHeight === '50m' ? '300-400' : '150-200', potential: 'Fair' },
                          { class: 4, power: selectedHeight === '50m' ? '400-500' : '200-250', potential: 'Good' },
                          { class: 5, power: selectedHeight === '50m' ? '500-600' : '250-300', potential: 'Excellent' },
                          { class: 6, power: selectedHeight === '50m' ? '600-800' : '300-400', potential: 'Outstanding' },
                          { class: 7, power: selectedHeight === '50m' ? '>800' : '>400', potential: 'Superb' }
                        ].map((row, idx) => (
                          <tr key={idx} className={`${row.class === powerAnalysis.windClass ? 'bg-blue-100 font-semibold' : idx % 2 === 0 ? 'bg-gray-50' : ''}`}>
                            <td className="p-3">Class {row.class}</td>
                            <td className="p-3">{row.power}</td>
                            <td className="p-3">{row.potential}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Power Calculation Details */}
                <div className="bg-white rounded-lg shadow p-6">
                  <h3 className="text-xl font-semibold mb-4">Power Analysis Details</h3>
                  <div className="space-y-3 text-gray-700">
                    <p><strong>Power Density Formula:</strong> P = 0.5 × ρ × v³</p>
                    <p><strong>Air Density (ρ):</strong> 1.225 kg/m³ (standard conditions)</p>
                    <p><strong>Analysis Height:</strong> {selectedHeight}</p>
                    <p className="pt-3 border-t"><strong>Site Assessment:</strong> This site is classified as <span className="font-bold text-blue-600">{powerAnalysis.classification}</span> for wind energy development with a Wind Power Class of <span className="font-bold text-blue-600">{powerAnalysis.windClass}</span>.</p>
                    {powerAnalysis.windClass >= 4 && (
                      <p className="text-green-700 bg-green-50 p-3 rounded">✓ This site shows good potential for commercial wind energy development.</p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'export' && processedData && (
              <div className="space-y-6">
                {/* Export Options */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* CSV Export */}
                  <div className="bg-white rounded-lg shadow p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold">CSV Export</h3>
                      <div className="px-3 py-1 bg-green-100 text-green-800 text-sm rounded-full font-semibold">FREE</div>
                    </div>
                    <p className="text-gray-600 mb-4">Complete raw data with all calculations, ready for Excel/Python/R analysis.</p>
                    <ul className="text-sm text-gray-700 space-y-2 mb-6">
                      <li>✓ All 16 directional sectors</li>
                      <li>✓ Speed bin distributions</li>
                      <li>✓ Frequency data</li>
                      <li>✓ Weibull parameters</li>
                    </ul>
                    <button
                      onClick={exportCSV}
                      className="w-full bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 flex items-center justify-center gap-2"
                    >
                      <Download className="w-5 h-5" />
                      Download CSV
                    </button>
                  </div>

                  {/* Basic PDF */}
                  <div className="bg-white rounded-lg shadow p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold">Basic Report (HTML)</h3>
                      <div className="px-3 py-1 bg-green-100 text-green-800 text-sm rounded-full font-semibold">FREE</div>
                    </div>
                    <p className="text-gray-600 mb-4">Professional summary report with key metrics and parameters.</p>
                    <ul className="text-sm text-gray-700 space-y-2 mb-6">
                      <li>✓ Weibull parameters</li>
                      <li>✓ Statistical summary</li>
                      <li>✓ Power analysis</li>
                      <li>✓ Multi-height comparison</li>
                    </ul>
                    <button
                      onClick={exportBasicPDF}
                      className="w-full bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 flex items-center justify-center gap-2"
                    >
                      <Download className="w-5 h-5" />
                      Download Report
                    </button>
                  </div>

                  {/* Premium PDF */}
                  <div className="bg-white rounded-lg shadow p-6 relative overflow-hidden">
                    <div className="absolute inset-0 bg-gray-100 opacity-50"></div>
                    <div className="relative">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold">Premium PDF Report</h3>
                        <div className="px-3 py-1 bg-orange-100 text-orange-800 text-sm rounded-full font-semibold">COMING SOON</div>
                      </div>
                      <p className="text-gray-600 mb-4">Complete analysis with all visualizations and detailed tables.</p>
                      <ul className="text-sm text-gray-700 space-y-2 mb-6">
                        <li>✓ All charts and graphs</li>
                        <li>✓ Wind rose diagrams</li>
                        <li>✓ Frequency tables</li>
                        <li>✓ Complete analysis</li>
                      </ul>
                      <button
                        disabled
                        className="w-full bg-gray-400 text-white px-6 py-3 rounded-lg cursor-not-allowed flex items-center justify-center gap-2"
                      >
                        <Download className="w-5 h-5" />
                        Coming Soon
                      </button>
                    </div>
                  </div>
                </div>

                {/* Export Info */}
                <div className="bg-blue-50 rounded-lg p-6">
                  <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                    <Info className="w-5 h-5 text-blue-600" />
                    Export Information
                  </h3>
                  <div className="space-y-2 text-sm text-gray-700">
                    <p>• All exports include a timestamp and analysis height ({selectedHeight})</p>
                    <p>• CSV files contain complete raw data for further analysis in your preferred tools</p>
                    <p>• PDF reports are formatted for professional presentations and reporting</p>
                    <p>• Basic PDF includes developer credit: SADDEN MOHAMED AMINE</p>
                    {hasMultipleHeights && <p>• Multi-height data detected - export separately for each height level</p>}
                  </div>
                </div>
              </div>
            )}

            {!processedData && activeTab !== 'upload' && (
              <div className="text-center py-12">
                <AlertCircle className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-gray-600 mb-2">No Data Loaded</h3>
                <p className="text-gray-500">Please upload a CSV file to begin analysis</p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="text-center text-gray-600 text-sm mt-6">
          <p>
            Developed by:{' '}
            <a 
              href="https://www.linkedin.com/in/mohamed-amine-sadden/" 
              target="_blank" 
              rel="noopener noreferrer"
              className="font-semibold text-blue-600 hover:text-blue-800 hover:underline transition-colors"
            >
              SADDEN MOHAMED AMINE
            </a>
          </p>
          <p className="mt-1">Professional Wind Data Analysis Platform © 2025</p>
        </div>
      </div>
    </div>
  );
};

export default WindAnalysisPlatform;