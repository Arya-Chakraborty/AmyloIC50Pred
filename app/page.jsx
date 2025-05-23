"use client"
import Link from 'next/link';
import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import * as XLSX from 'xlsx';
import {
  PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip as RechartsTooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid
} from 'recharts';

// --- Configuration ---
const MAX_COMPOUNDS = 20;
const API_URL = 'https://meet-man-splendid.ngrok-free.app/api/predict'; 
// --- Helper Components / Icons ---
const IconUpload = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 mr-2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
  </svg>
);

const CHART_COLORS = {
  Inhibitor: '#F59E0B', // Amber
  Decoy: '#3B82F6', // Blue
  Class0: '#10B981', // Emerald
  Class1: '#8B5CF6', // Violet
  Class2: '#EC4899' // Pink
};

export default function Home() {
  const [textareaValue, setTextareaValue] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileName, setFileName] = useState('');
  const [results, setResults] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [inputError, setInputError] = useState('');
  const [tableData, setTableData] = useState([]);
  const [pieChartData, setPieChartData] = useState([]);
  const [barChartData, setBarChartData] = useState([]);
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navLinks = [
    { name: 'Predict', path: '/' },
    { name: 'Contact us', path: '/contact' }
  ];

  const brandColors = {
    primaryAccent: 'text-amber-600',
    secondaryAccent: 'text-emerald-600',
    tertiaryAccent: 'text-fuchsia-700',
    backgroundLight: 'bg-gray-50',
    textDark: 'text-gray-800',
    borderLight: 'border-gray-200',
    hoverBgLight: 'hover:bg-gray-100',
  };

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    if (results && results.predictions) {
      // Process table data
      const newTableData = results.predictions.map((item, index) => ({
        id: index + 1,
        smiles: item.smiles,
        type: item.classification.charAt(0).toUpperCase() + item.classification.slice(1),
        class: item.class !== null ? item.class : 'N/A',
        ic50: item.ic50 !== null ? item.ic50.toFixed(2) : 'N/A'
      }));
      setTableData(newTableData);

      // Process pie chart data (Inhibitor vs Decoy)
      const typeCounts = results.predictions.reduce((acc, item) => {
        const type = item.classification.charAt(0).toUpperCase() + item.classification.slice(1);
        acc[type] = (acc[type] || 0) + 1;
        return acc;
      }, {});

      const newPieChartData = Object.entries(typeCounts)
        .filter(([, value]) => value > 0)
        .map(([name, value]) => ({ name, value }));
      setPieChartData(newPieChartData);

      // Process bar chart data (Inhibitor classes)
      const classCounts = results.predictions
        .filter(item => item.classification === 'inhibitor' && item.class !== null)
        .reduce((acc, item) => {
          acc[`Class ${item.class}`] = (acc[`Class ${item.class}`] || 0) + 1;
          return acc;
        }, {});

      // Ensure all classes are represented even if count is 0
      const newBarChartData = [0, 1, 2].map(classNum => ({
        name: `Class ${classNum}`,
        value: classCounts[`Class ${classNum}`] || 0
      }));
      setBarChartData(newBarChartData);
    } else {
      setTableData([]);
      setPieChartData([]);
      setBarChartData([]);
    }
  }, [results]);

  const readFileContent = useCallback((file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve({
        content: e.target.result,
        isBinary: !file.name.toLowerCase().endsWith('.csv') && file.type !== 'text/csv'
      });
      reader.onerror = (err) => reject(new Error(`File reading error: ${err.message}`));

      if (file.name.toLowerCase().endsWith('.csv') || file.type === 'text/csv') {
        reader.readAsText(file);
      } else {
        reader.readAsBinaryString(file);
      }
    });
  }, []);

  const parseFileContent = useCallback((fileContent, isBinary, fileName) => {
    let smilesFromFile = [];
    let localJsonSheet = [];
    try {
      const workbook = XLSX.read(fileContent, { type: isBinary ? 'binary' : 'string', cellNF: false, cellDates: false });
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) throw new Error("No sheets found in the file.");
      const worksheet = workbook.Sheets[sheetName];
      localJsonSheet = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: true, blankrows: false });

      if (localJsonSheet.length > 0) {
        let startIndex = 0;
        const firstRowFirstCell = String(localJsonSheet[0][0] || "").trim().toLowerCase();
        if (localJsonSheet.length > 1 &&
          (firstRowFirstCell.includes("smiles") || firstRowFirstCell.includes("compound") || firstRowFirstCell.includes("molecule")) &&
          firstRowFirstCell.length < 50) {
          startIndex = 1;
        }

        smilesFromFile = localJsonSheet.slice(startIndex)
          .map(row => (row && row[0]) ? String(row[0]).trim() : "")
          .filter(s => s && s.length > 2 && !s.toLowerCase().includes("smiles") && !s.toLowerCase().includes("compound"));
      }
    } catch (error) {
      console.error("Error processing file with XLSX:", error);
      if (!isBinary && fileName.toLowerCase().endsWith('.csv')) {
        const rows = fileContent.split(/\r?\n/);
        let startIndex = 0;
        if (rows.length > 0) {
          const firstRowFirstCell = rows[0].split(/[,;\t]/)[0].trim().toLowerCase();
          if (rows.length > 1 &&
            (firstRowFirstCell.includes("smiles") || firstRowFirstCell.includes("compound") || firstRowFirstCell.includes("molecule")) &&
            firstRowFirstCell.length < 50) {
            startIndex = 1;
          }
          smilesFromFile = rows.slice(startIndex)
            .map(row => row.split(/[,;\t]/)[0] ? row.split(/[,;\t]/)[0].trim() : "")
            .filter(s => s && s.length > 2 && !s.toLowerCase().includes("smiles") && !s.toLowerCase().includes("compound"));
        }
      } else {
        throw new Error("Could not parse file. Ensure SMILES are in the first column of a valid Excel (xlsx, xls) or CSV file.");
      }
    }
    if (smilesFromFile.length === 0 && localJsonSheet && localJsonSheet.length > 0) {
      console.warn("File parsed but no valid SMILES extracted. Check first column and header logic.");
    }
    return smilesFromFile;
  }, []);

  const handleFileChange = (event) => {
    const file = event.target.files[0];
    if (file) {
      const allowedTypes = ['.csv', '.xls', '.xlsx'];
      const fileExtension = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
      if (!allowedTypes.includes(fileExtension)) {
        setInputError('Invalid file type. Please upload CSV, XLS, or XLSX.');
        setSelectedFile(null); setFileName(''); event.target.value = null;
        return;
      }
      setSelectedFile(file); setFileName(file.name);
      setTextareaValue(''); setInputError(''); setResults(null);
    } else {
      setSelectedFile(null); setFileName('');
    }
  };

  const handleSubmit = async () => {
    setIsLoading(true); setResults(null); setInputError('');
    let smilesToProcess = [];

    if (selectedFile) {
      try {
        const fileData = await readFileContent(selectedFile);
        smilesToProcess = parseFileContent(fileData.content, fileData.isBinary, selectedFile.name);
        if (smilesToProcess.length === 0) {
          setInputError("No valid SMILES found in file. Check format (SMILES in first column, optional header).");
          setIsLoading(false); return;
        }
      } catch (error) {
        setInputError(error.message || "Failed to process file.");
        setIsLoading(false); return;
      }
    } else if (textareaValue.trim() !== "") {
      smilesToProcess = textareaValue.split(/[\n,]+/).map(s => s.trim()).filter(s => s);
    }

    if (smilesToProcess.length === 0) {
      setInputError("No SMILES input. Enter in textarea or upload file.");
      setIsLoading(false); return;
    }
    if (smilesToProcess.length > MAX_COMPOUNDS) {
      setInputError(`Max ${MAX_COMPOUNDS} compounds allowed. You provided ${smilesToProcess.length}.`);
      setIsLoading(false); return;
    }

    try {
      const payload = { smiles: smilesToProcess };
      const res = await fetch(API_URL, {
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setResults({ error: data.error || `Server Error: ${res.status}` });
      } else {
        setResults(data);
      }
    } catch (err) {
      setResults({ error: `Network/Parsing Error: ${err.message}` });
    } finally {
      setIsLoading(false);
    }
  };

  const clearInputs = () => {
    setTextareaValue(''); setSelectedFile(null); setFileName('');
    setInputError(''); setResults(null);
    const fileInput = document.getElementById('fileUpload');
    if (fileInput) fileInput.value = null;
  };

  const escapeCSVField = (field) => {
    if (field === null || typeof field === 'undefined') return '';
    let stringField = String(field);
    if (stringField.includes(',') || stringField.includes('"') || stringField.includes('\n') || stringField.includes('\r')) {
      stringField = stringField.replace(/"/g, '""');
      return `"${stringField}"`;
    }
    return stringField;
  };

  const handleExportCSV = () => {
    if (!tableData.length) return;

    const headers = ["ID", "Compound (SMILES)", "Type", "Class", "IC50 (nM)"];
    const csvRows = [
      headers.join(','),
      ...tableData.map(item => [
        escapeCSVField(item.id),
        escapeCSVField(item.smiles),
        escapeCSVField(item.type),
        escapeCSVField(item.class),
        escapeCSVField(item.ic50)
      ].join(','))
    ];
    const csvString = csvRows.join('\n');
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', 'amylo-ic50_results.csv');
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }
  };

  return (
    <>
      <nav className={`fixed w-full z-50 transition-all duration-300 ${isScrolled ? 'bg-white/90 backdrop-blur-md shadow-sm' : 'bg-white/80 backdrop-blur-sm'}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo and brand name - left side */}
            <div className="flex-shrink-0 flex items-center">
              <Link href="/" className="flex items-center space-x-2" onClick={() => setMobileMenuOpen(false)}>
                <img
                  src="logo.jpg"
                  alt="Amylo-IC50Pred Logo"
                  className="h-8 w-auto"
                />
                <span className={`text-xl font-bold ${brandColors.tertiaryAccent}`}>
                  Amylo-IC₅₀Pred
                </span>
              </Link>
            </div>

            {/* Desktop navigation - right side */}
            <div className="hidden md:block">
              <div className="ml-10 flex items-center space-x-8">
                {navLinks.map((link) => (
                  <Link
                    key={link.name}
                    href={link.path}
                    className={`text-gray-700 hover:text-amber-600 px-3 py-2 rounded-md text-sm font-medium transition-colors ${link.path === '/' ? `font-semibold ${brandColors.tertiaryAccent}` : ''}`}
                  >
                    {link.name}
                  </Link>
                ))}
              </div>
            </div>

            {/* Mobile menu button */}
            <div className="md:hidden flex items-center">
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className={`inline-flex items-center justify-center p-2 rounded-md text-gray-700 hover:text-amber-600 focus:outline-none`}
                aria-expanded="false"
              >
                <span className="sr-only">Open main menu</span>
                {!mobileMenuOpen ? (
                  <svg className="block h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                ) : (
                  <svg className="block h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile menu */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="md:hidden overflow-hidden"
            >
              <div className={`px-2 pt-2 pb-3 space-y-1 sm:px-3 bg-white`}>
                {navLinks.map((link) => (
                  <Link
                    key={link.name}
                    href={link.path}
                    className={`block px-3 py-2 rounded-md text-base font-medium ${link.path === '/' ? `${brandColors.tertiaryAccent}` : 'text-gray-700'} hover:text-amber-600 ${brandColors.hoverBgLight} transition-colors`}
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    {link.name}
                  </Link>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>

      <div className={`min-h-screen font-sans transition-colors duration-300 ${brandColors.backgroundLight} ${brandColors.textDark} overflow-x-hidden pt-8`}>
        <div className="relative z-10 container mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <header className="mb-12 text-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="max-w-3xl mx-auto"
            >
              <h1 className={`text-3xl sm:text-4xl font-bold mb-4 ${brandColors.textDark}`}>
                Amylo-IC₅₀Pred
              </h1>
              <p className="text-base sm:text-sm text-gray-600 mt-4 leading-relaxed">
                Predict inhibitory activity (IC50) of compounds against Amyloid beta aggregation and classify them into different classes
              </p>
            </motion.div>
          </header>

          <motion.div
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.1 }}
            className={`bg-white/70 backdrop-blur-md shadow-xl rounded-xl p-6 sm:p-8 border ${brandColors.borderLight}`}
          >
            <div className="grid md:grid-cols-2 gap-6 mb-6">
              <div>
                <label htmlFor="smilesInput" className="block text-sm font-medium text-gray-700 mb-1">
                  Enter SMILES Strings
                </label>
                <textarea
                  id="smilesInput" rows={6}
                  className="w-full p-3 border border-gray-300 rounded-md shadow-sm focus:ring-amber-500 focus:border-amber-500 bg-gray-50 text-sm font-mono placeholder-gray-400"
                  placeholder={`CCC,CCO\nCNC(=O)C1=CN=CN1\nMax ${MAX_COMPOUNDS} compounds, separated by comma or newline.`}
                  value={textareaValue}
                  onChange={(e) => { setTextareaValue(e.target.value); setSelectedFile(null); setFileName(''); setInputError(''); setResults(null); }}
                  disabled={isLoading}
                />
              </div>
              <div>
                <label htmlFor="fileUpload" className="block text-sm font-medium text-gray-700 mb-1">
                  Or Upload File
                </label>
                <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-md hover:border-amber-500 transition-colors">
                  <div className="space-y-1 text-center">
                    <div className="flex text-sm text-gray-600">
                      <IconUpload />
                      <label htmlFor="fileUpload" className="relative cursor-pointer bg-white rounded-md font-medium text-amber-600 hover:text-amber-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-amber-500 px-1">
                        <span>Upload a file</span>
                        <input id="fileUpload" name="fileUpload" type="file" className="sr-only"
                          accept=".csv, .xlsx, .xls" onChange={handleFileChange} disabled={isLoading} />
                      </label>
                      <p className="pl-1">or drag and drop</p>
                    </div>
                    <p className="text-xs text-gray-500">CSV, XLSX, XLS up to 1MB. SMILES in first column.</p>
                    {fileName && <p className="text-xs text-amber-600 mt-1">Selected: {fileName}</p>}
                  </div>
                </div>
              </div>
            </div>

            {inputError && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mb-4 p-3 bg-red-100 border border-red-300 rounded-md text-red-700 text-sm">
                {inputError}
              </motion.div>
            )}

            <div className="flex flex-col sm:flex-row gap-4">
              <motion.button
                onClick={handleSubmit}
                disabled={isLoading || (!textareaValue.trim() && !selectedFile)}
                className={`w-full sm:w-auto flex-grow py-3 px-6 rounded-md font-semibold text-base transition-all duration-300 ease-in-out
                            text-white disabled:opacity-50 disabled:cursor-not-allowed
                            ${isLoading
                    ? 'bg-amber-600 animate-pulse'
                    : 'bg-amber-600 hover:bg-amber-700'
                  }
                            focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-amber-500`}
                whileHover={{ scale: isLoading ? 1 : 1.03 }}
                whileTap={{ scale: isLoading ? 1 : 0.97 }}
                animate={isLoading ? {
                  boxShadow: ["0 0 0px 0px rgba(217, 119, 6, 0.0)", "0 0 8px 2px rgba(217, 119, 6, 0.7)", "0 0 0px 0px rgba(217, 119, 6, 0.0)"],
                } : {}}
                transition={isLoading ? { duration: 1.5, repeat: Infinity, ease: "linear" } : { duration: 0.15 }}
              >
                {isLoading ? (
                  <div className="flex items-center justify-center">
                    <div className="w-5 h-5 border-2 border-white/50 border-t-white rounded-full animate-spin mr-2" />
                    Analyzing...
                  </div>
                ) : 'Predict'}
              </motion.button>
              <button onClick={clearInputs} disabled={isLoading}
                className="w-full sm:w-auto py-3 px-6 rounded-md font-semibold text-sm bg-gray-200 hover:bg-gray-300 text-gray-700 transition-colors disabled:opacity-50">
                Clear All
              </button>
            </div>
          </motion.div>

          <AnimatePresence>
            {isLoading && !results && (
              <motion.div
                key="loadingResults"
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className="mt-8 text-center text-gray-500">
                Fetching results, please wait...
              </motion.div>
            )}
            {results && (
              <motion.div
                key="resultsContent"
                initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className={`mt-10 bg-white/70 backdrop-blur-md shadow-xl rounded-xl p-6 sm:p-8 border ${brandColors.borderLight}`}
              >
                {results.error && (
                  <div className="p-4 bg-red-100 border border-red-300 rounded-md text-red-700">
                    <h3 className="text-lg font-semibold mb-1">API Error</h3>
                    <p className="text-sm">{results.error}</p>
                  </div>
                )}

                {tableData.length > 0 && !results.error && (
                  <div className="mb-8">
                    <h3 className="text-xl sm:text-2xl font-semibold text-gray-800 mb-4">Results Summary</h3>
                    <div className="overflow-x-auto rounded-lg border border-gray-200">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID</th>
                            <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Compound</th>
                            <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                            <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Class</th>
                            <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">IC50</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {tableData.map((item) => (
                            <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                              <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-500">{item.id}</td>
                              <td className="px-4 py-3 whitespace-nowrap text-xs font-mono text-gray-700 break-all max-w-xs truncate" title={item.smiles}>{item.smiles}</td>
                              <td className="px-4 py-3 whitespace-nowrap text-xs">
                                <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full
                                  ${item.type === "Inhibitor" ? "bg-amber-100 text-amber-800" : "bg-blue-100 text-blue-800"}`}>
                                  {item.type}
                                </span>
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-xs">
                                {item.class !== 'N/A' ? (
                                  <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full
                                    ${item.class === 0 ? "bg-emerald-100 text-emerald-800" :
                                      item.class === 1 ? "bg-violet-100 text-violet-800" :
                                        "bg-pink-100 text-pink-800"}`}>
                                    Class {item.class}
                                  </span>
                                ) : 'N/A'}
                              </td>
                              <td className={`px-4 py-3 whitespace-nowrap text-xs ${item.type === 'Inhibitor' && item.ic50 !== 'N/A' ? 'text-gray-700' : 'text-gray-400'}`}>
                                {item.ic50}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {(pieChartData.length > 0 || barChartData.length > 0) && !results.error && (
                  <div className="grid md:grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
                    {pieChartData.length > 0 && (
                      <div>
                        <h3 className="text-xl sm:text-2xl font-semibold text-gray-800 mb-4">Compound Type Distribution</h3>
                        <div style={{ width: '100%', height: 350 }}>
                          <ResponsiveContainer>
                            <PieChart>
                              <Pie 
                                data={pieChartData} 
                                dataKey="value" 
                                nameKey="name" 
                                cx="50%" 
                                cy="50%" 
                                outerRadius={100} 
                                label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                              >
                                {pieChartData.map((entry, index) => (
                                  <Cell key={`cell-${index}`} fill={CHART_COLORS[entry.name]} />
                                ))}
                              </Pie>
                              <RechartsTooltip
                                formatter={(value, name) => [`${value} compound(s)`, name]}
                                contentStyle={{ backgroundColor: '#ffffff', borderColor: '#D1D5DB' }}
                                itemStyle={{ color: '#1F2937' }}
                              />
                              <Legend />
                            </PieChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    )}
                    {barChartData.length > 0 && (
                      <div>
                        <h3 className="text-xl sm:text-2xl font-semibold text-gray-800 mb-4">Inhibitor Class Distribution</h3>
                        <div style={{ width: '100%', height: 350 }}>
                          <ResponsiveContainer>
                            <BarChart
                              data={barChartData}
                              margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                            >
                              <CartesianGrid strokeDasharray="3 3" />
                              <XAxis dataKey="name" />
                              <YAxis />
                              <RechartsTooltip
                                formatter={(value) => [`${value} inhibitor(s)`, 'Count']}
                                contentStyle={{ backgroundColor: '#ffffff', borderColor: '#D1D5DB' }}
                                itemStyle={{ color: '#1F2937' }}
                              />
                              <Legend />
                              <Bar dataKey="value" name="Inhibitors">
                                {barChartData.map((entry, index) => (
                                  <Cell key={`cell-${index}`} fill={CHART_COLORS[`Class${index}`]} />
                                ))}
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {tableData.length === 0 && pieChartData.length === 0 && barChartData.length === 0 && !results.error && !isLoading && (
                  <p className="text-center text-gray-500 py-4">No results to display. Submit SMILES for analysis.</p>
                )}

                {tableData.length > 0 && !results.error && (
                  <div className="mt-8 text-center sm:text-right">
                    <button
                      onClick={handleExportCSV}
                      disabled={isLoading}
                      className="py-2 px-5 rounded-md font-semibold text-sm bg-emerald-600 hover:bg-emerald-700 text-white transition-colors disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500"
                    >
                      Export Results as CSV
                    </button>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </>
  );
}