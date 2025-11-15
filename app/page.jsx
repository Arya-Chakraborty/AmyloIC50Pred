"use client"
import Link from 'next/link';
import { usePathname } from 'next/navigation';
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
// const API_URL = "http://127.0.0.1:5328/api/predict";
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
  const [smilesToNames, setSmilesToNames] = useState({}); // Dictionary to map SMILES to compound names
  const [userEmail, setUserEmail] = useState(''); // User email for large batches
  const [showEmailInput, setShowEmailInput] = useState(false); // Show email input for large batches
  const [userName, setUserName] = useState(''); // User name for registration
  const [userAffiliation, setUserAffiliation] = useState(''); // User affiliation for registration
  const [showRegistrationForm, setShowRegistrationForm] = useState(false); // Show registration form for new users
  const [isCheckingUser, setIsCheckingUser] = useState(false); // Loading state for user check
  const pathname = usePathname();

  const navLinks = [
    { name: 'Predict', path: '/' },
    { name: 'Manual', path: 'https://drive.google.com/file/d/1AWgw5f13s9exTQxYk1WEqm0dV9QpJOd-/view?usp=sharing', external: true },
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
        name: item.name || 'N/A',  // Use name from API response
        type: item.classification.charAt(0).toUpperCase() + item.classification.slice(1),
        class: item.class !== null ? item.class : 'N/A',
        ic50: item.ic50 !== null ? item.ic50.toFixed(2) : 'N/A',
        ...item.descriptors || {}
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
  }, [results]);  // Removed smilesToNames from dependencies since we use name from API response

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
    let namesFromFile = [];
    const localSmilesToNames = {}; // Local dictionary to map SMILES to names
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
        const firstRowSecondCell = localJsonSheet[0][1] ? String(localJsonSheet[0][1]).trim().toLowerCase() : "";
        
        // Check if first row contains headers
        const hasHeaders = localJsonSheet.length > 1 &&
          ((firstRowFirstCell.includes("smiles") || firstRowFirstCell.includes("compound") || firstRowFirstCell.includes("molecule")) &&
          firstRowFirstCell.length < 50)
        
        if (hasHeaders) {
          startIndex = 1;
        }

        // Process each row
        localJsonSheet.slice(startIndex).forEach(row => {
          if (row && row[0]) {
            const smiles = String(row[0]).trim();
            const name = row[1] ? String(row[1]).trim() : "";
            
            if (smiles && smiles.length > 2 && 
                !smiles.toLowerCase().includes("smiles") && 
                !smiles.toLowerCase().includes("compound")) {
              smilesFromFile.push(smiles);
              if (name) {
                localSmilesToNames[smiles] = name;
                namesFromFile.push(name);
              } else {
                namesFromFile.push("");
              }
            }
          }
        });
      }
    } catch (error) {
      console.error("Error processing file with XLSX:", error);
      if (!isBinary && fileName.toLowerCase().endsWith('.csv')) {
        const rows = fileContent.split(/\r?\n/);
        let startIndex = 0;
        if (rows.length > 0) {
          const firstRowFirstCell = rows[0].split(/[,;\t]/)[0].trim().toLowerCase();
          const hasHeaders = rows.length > 1 &&
            (firstRowFirstCell.includes("smiles") || firstRowFirstCell.includes("compound") || firstRowFirstCell.includes("molecule")) &&
            firstRowFirstCell.length < 50;
          
          if (hasHeaders) {
            startIndex = 1;
          }

          rows.slice(startIndex).forEach(row => {
            const columns = row.split(/[,;\t]/);
            if (columns[0]) {
              const smiles = columns[0].trim();
              const name = columns[1] ? columns[1].trim() : "";
              
              if (smiles && smiles.length > 2 && 
                  !smiles.toLowerCase().includes("smiles") && 
                  !smiles.toLowerCase().includes("compound")) {
                smilesFromFile.push(smiles);
                if (name) {
                  localSmilesToNames[smiles] = name;
                  namesFromFile.push(name);
                } else {
                  namesFromFile.push("");
                }
              }
            }
          });
        }
      } else {
        throw new Error("Could not parse file. Ensure SMILES are in the first column and names in the second column of a valid Excel (xlsx, xls) or CSV file.");
      }
    }

    if (smilesFromFile.length === 0 && localJsonSheet && localJsonSheet.length > 0) {
      console.warn("File parsed but no valid SMILES extracted. Check first column and header logic.");
    }

    // Update the global smilesToNames dictionary
    setSmilesToNames(localSmilesToNames);
    
    return { smiles: smilesFromFile, namesMap: localSmilesToNames };
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
      setSmilesToNames({}); // Reset the names dictionary when a new file is selected
    } else {
      setSelectedFile(null); setFileName('');
    }
  };

  const validateManualInput = (lines) => {
    if (lines.length > MAX_COMPOUNDS) {
      setInputError(`Manual input is limited to ${MAX_COMPOUNDS} compounds maximum. You provided ${lines.length} compounds.`);
      return false;
    }
    return true;
  };

  const checkUserExists = async (email) => {
    try {
      const response = await fetch('https://meet-man-splendid.ngrok-free.app/api/check-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to check user');
      }
      return data.exists;
    } catch (error) {
      console.error('Error checking user:', error);
      setInputError('Failed to verify user. Please try again.');
      return false;
    }
  };

  const handleEmailSubmit = async () => {
    if (!userEmail.trim()) {
      setInputError('Please enter your email address.');
      return;
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(userEmail.trim())) {
      setInputError('Please enter a valid email address.');
      return;
    }

    setIsCheckingUser(true);
    setInputError('');

    try {
      const userExists = await checkUserExists(userEmail);
      
      if (userExists) {
        // User exists, proceed directly to prediction
        setShowEmailInput(false);
        setShowRegistrationForm(false);
        handleSubmit();
      } else {
        // New user, show registration form
        setShowEmailInput(false);
        setShowRegistrationForm(true);
      }
    } catch (error) {
      // Error already handled in checkUserExists
    } finally {
      setIsCheckingUser(false);
    }
  };

  const handleSubmit = async () => {
    setIsLoading(true); setResults(null); setInputError('');
    let smilesToProcess = [];
    let localSmilesToNames = {};

    if (selectedFile) {
      try {
        const fileData = await readFileContent(selectedFile);
        const parseResult = parseFileContent(fileData.content, fileData.isBinary, selectedFile.name);
        smilesToProcess = parseResult.smiles;
        localSmilesToNames = parseResult.namesMap;
        
        if (smilesToProcess.length === 0) {
          setInputError("No valid SMILES found in file. Check format (SMILES in first column, names in second column, optional header).");
          setIsLoading(false); return;
        }
      } catch (error) {
        setInputError(error.message || "Failed to process file.");
        setIsLoading(false); return;
      }
    } else if (textareaValue.trim() !== "") {
      // Process manual input (one per line in format: SMILES, Name)
      const lines = textareaValue.split('\n').filter(line => line.trim());
      
      // Validate manual input count
      if (!validateManualInput(lines)) {
        setIsLoading(false);
        return;
      }
      
      lines.forEach(line => {
        const [smiles, ...nameParts] = line.split(',').map(item => item.trim());
        const name = nameParts.join(', '); // Handle names that might contain commas
        
        if (smiles && smiles.length > 2) {
          smilesToProcess.push(smiles);
          if (name) {
            localSmilesToNames[smiles] = name;
          }
        }
      });

      setSmilesToNames(localSmilesToNames);
    }

    if (smilesToProcess.length === 0) {
      setInputError("No valid SMILES input. Enter in textarea (format: SMILES, Name) or upload file.");
      setIsLoading(false); return;
    }

    // Check if large batch and email is required
    const isLargeBatch = smilesToProcess.length > MAX_COMPOUNDS;
    if (isLargeBatch && !userEmail.trim()) {
      setShowEmailInput(true);
      setInputError(`You have ${smilesToProcess.length} compounds. For batches larger than ${MAX_COMPOUNDS}, please provide your email address.`);
      setIsLoading(false); return;
    }

    // For large batches, show immediate feedback before processing
    if (isLargeBatch) {
      setResults({
        message: 'Processing started - please wait...',
        email: userEmail.trim(),
        compound_count: smilesToProcess.length,
        isLargeBatch: true,
        isProcessing: true
      });
    }

    try {
      const payload = { 
        smiles: smilesToProcess,
        names: localSmilesToNames  // Send names mapping to backend
      };
      
      // Add email and user details for large batches
      if (isLargeBatch) {
        payload.email = userEmail.trim();
        if (userName.trim() && userAffiliation.trim()) {
          payload.name = userName.trim();
          payload.affiliation = userAffiliation.trim();
        }
      }
      
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setResults({ error: data.error || `Server Error: ${res.status}` });
      } else {
        // Handle large batch response
        if (isLargeBatch && data.message) {
          setResults({ 
            message: 'Processing completed successfully!',
            completionMessage: 'Your results will be sent to your email shortly.',
            email: data.email,
            compound_count: data.compound_count,
            isLargeBatch: true,
            isProcessing: false
          });
        } else {
          setResults(data);
        }
      }
    } catch (err) {
      setResults({ error: `Network/Parsing Error: ${err.message}` });
    } finally {
      setIsLoading(false);
    }
  };

  const clearInputs = () => {
    setTextareaValue(''); setSelectedFile(null); setFileName('');
    setInputError(''); setResults(null); setSmilesToNames({});
    setUserEmail(''); setShowEmailInput(false);
    setUserName(''); setUserAffiliation(''); setShowRegistrationForm(false);
    setIsCheckingUser(false);
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

    const descriptorList = ['RDF20e', 'SpMin2_Bhm', 'WPSA-3', 'SpMin2_Bhe', 'RDF125i', 'RDF120s', 
                            'RDF20i', 'ALogP', 'RDF20u', 'RDF135u', 'RDF20s', 'RDF20v', 'RDF135v', 
                            'RDF115s', 'BCUTc-1h', 'RDF125u', 'RDF130m', 'RDF130u', 'BCUTw-1h', 
                            'RDF20p', 'RDF125s', 'RDF130v', 'RDF125e', 'RDF115m', 'RDF110s', 'nBondsD',
                            'minssCH2', 'TDB1i', 'SHAvin', 'PPSA-3', 'Du', 'nHdsCH', 'SpMin2_Bhe', 
                            'SHBint4', 'minHBint4', 'AATS3v', 'TDB1u', 'TDB5m', 'ATSC2m', 'MATS5s', 
                            'TDB3i', 'VR2_D', 'GATS2i', 'SHdsCH', 'ndsCH', 'E2m', 'AATSC2p'];
    
    const headers = ["ID", "Compound (SMILES)", "Name", "Type", "Class", "IC50 (nM)", ...descriptorList];
    const csvRows = [
      headers.join(','),
      ...tableData.map(item => [
        escapeCSVField(item.id),
        escapeCSVField(item.smiles),
        escapeCSVField(item.name),
        escapeCSVField(item.type),
        escapeCSVField(item.class),
        escapeCSVField(item.ic50),
        ...descriptorList.map(desc => escapeCSVField(
          item[desc] !== null && item[desc] !== undefined ? item[desc].toFixed(4) : '0.0000'
        ))
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
                  link.external ? (
                    <a
                      key={link.name}
                      href={link.path}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-2 rounded-md text-sm font-medium transition-colors text-gray-700 hover:text-amber-600"
                    >
                      {link.name}
                    </a>
                  ) : (
                    <Link
                      key={link.name}
                      href={link.path}
                      className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${pathname === link.path
                        ? `text-amber-600 font-semibold`
                        : 'text-gray-700 hover:text-amber-600'
                        }`}
                    >
                      {link.name}
                    </Link>
                  )
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
                  link.external ? (
                    <a
                      key={link.name}
                      href={link.path}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block px-3 py-2 rounded-md text-base font-medium transition-colors text-gray-700 hover:text-amber-600 hover:bg-gray-100"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      {link.name}
                    </a>
                  ) : (
                    <Link
                      key={link.name}
                      href={link.path}
                      className={`block px-3 py-2 rounded-md text-base font-medium transition-colors ${pathname === link.path
                        ? `text-fuchsia-700 bg-fuchsia-50`
                        : 'text-gray-700 hover:text-amber-600 hover:bg-gray-100'
                        }`}
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      {link.name}
                    </Link>
                  )
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
              <h1 className={`text-3xl sm:text-4xl font-bold mb-4 ${brandColors.tertiaryAccent}`}>
                Amylo-IC₅₀Pred
              </h1>
              <p className="text-base sm:text-sm text-gray-600 mt-4 leading-relaxed">
                Amylo-IC₅₀Pred is capable of categorizing molecules into decoys and inhibitors, then further categorizing them into their respective classes and ultimately predicting the absolute IC50 value.              </p>
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
                  placeholder={`CCC, Compound A\nCNC(=O)C1=CN=CN1, Compound B\nOne compound per line in format: SMILES, Name\nMax ${MAX_COMPOUNDS} compounds allowed`}
                  value={textareaValue}
                  onChange={(e) => { setTextareaValue(e.target.value); setSelectedFile(null); setFileName(''); setInputError(''); setResults(null); setSmilesToNames({}); }}
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
                    <p className="text-xs text-gray-500">CSV, XLSX, XLS up to 1MB. SMILES in first column, names in second column.</p>
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

            {showEmailInput && (
              <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-4">
                <label htmlFor="emailInput" className="block text-sm font-medium text-gray-700 mb-1">
                  Email Address (Required for large batches)
                </label>
                <input
                  id="emailInput"
                  type="email"
                  className="w-full p-3 border border-gray-300 rounded-md shadow-sm focus:ring-amber-500 focus:border-amber-500 bg-gray-50 text-sm placeholder-gray-400"
                  placeholder="Enter your email address"
                  value={userEmail}
                  onChange={(e) => setUserEmail(e.target.value)}
                  disabled={isLoading || isCheckingUser}
                />
                <p className="text-xs text-gray-500 mt-1">We'll check if you're registered and proceed accordingly.</p>
                <div className="mt-3">
                  <button
                    onClick={handleEmailSubmit}
                    disabled={isLoading || isCheckingUser || !userEmail.trim()}
                    className={`py-2 px-4 rounded-md font-semibold text-sm transition-all duration-300 ease-in-out
                                text-white disabled:opacity-50 disabled:cursor-not-allowed
                                ${isCheckingUser
                      ? 'bg-amber-600 animate-pulse'
                      : 'bg-amber-600 hover:bg-amber-700'
                    }`}
                  >
                    {isCheckingUser ? (
                      <div className="flex items-center">
                        <div className="w-4 h-4 border-2 border-white/50 border-t-white rounded-full animate-spin mr-2" />
                        Checking...
                      </div>
                    ) : 'Continue'}
                  </button>
                </div>
              </motion.div>
            )}

            {showRegistrationForm && (
              <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-4">
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-md mb-4">
                  <h4 className="text-sm font-medium text-blue-800 mb-2">New User Registration</h4>
                  <p className="text-xs text-blue-700">
                    Welcome! Since this is your first time using our service, please provide your details below.
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="nameInput" className="block text-sm font-medium text-gray-700 mb-1">
                      Full Name *
                    </label>
                    <input
                      id="nameInput"
                      type="text"
                      className="w-full p-3 border border-gray-300 rounded-md shadow-sm focus:ring-amber-500 focus:border-amber-500 bg-gray-50 text-sm placeholder-gray-400"
                      placeholder="Enter your full name"
                      value={userName}
                      onChange={(e) => setUserName(e.target.value)}
                      disabled={isLoading}
                    />
                  </div>
                  <div>
                    <label htmlFor="affiliationInput" className="block text-sm font-medium text-gray-700 mb-1">
                      Affiliation *
                    </label>
                    <input
                      id="affiliationInput"
                      type="text"
                      className="w-full p-3 border border-gray-300 rounded-md shadow-sm focus:ring-amber-500 focus:border-amber-500 bg-gray-50 text-sm placeholder-gray-400"
                      placeholder="University, Company, Institution"
                      value={userAffiliation}
                      onChange={(e) => setUserAffiliation(e.target.value)}
                      disabled={isLoading}
                    />
                  </div>
                </div>
                <p className="text-xs text-gray-500 mt-2">* Required fields for new user registration</p>
              </motion.div>
            )}

            <div className="flex flex-col sm:flex-row gap-4">
              <motion.button
                onClick={handleSubmit}
                disabled={isLoading || (!textareaValue.trim() && !selectedFile) || showEmailInput || isCheckingUser || 
                         (showRegistrationForm && (!userName.trim() || !userAffiliation.trim()))}
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
                ) : showRegistrationForm ? 'Register & Predict' : 'Predict'}
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

                {results.isLargeBatch && results.message && (
                  <div className={`p-6 rounded-md ${results.isProcessing ? 'bg-blue-50 border border-blue-300 text-blue-800' : 'bg-green-50 border border-green-300 text-green-800'}`}>
                    <h3 className="text-lg font-semibold mb-2">
                      {results.isProcessing ? '⏳ Large Batch Processing' : '✓ Large Batch Processing Completed'}
                    </h3>
                    <div className="space-y-2 text-sm">
                      <p><strong>Status:</strong> {results.message}</p>
                      <p><strong>Email:</strong> {results.email}</p>
                      <p><strong>Compounds:</strong> {results.compound_count}</p>
                      {results.completionMessage && (
                        <p><strong>Next Step:</strong> {results.completionMessage}</p>
                      )}
                      <div className={`mt-3 p-3 rounded ${results.isProcessing ? 'bg-blue-100' : 'bg-green-100'}`}>
                        <p className="font-medium">
                          {results.isProcessing ? 'Processing Information:' : 'What happens next?'}
                        </p>
                        <ul className="mt-1 text-xs list-disc list-inside space-y-1">
                          {results.isProcessing ? (
                            <>
                              <li>Your batch of {results.compound_count} compounds is being processed</li>
                              <li>Results will be sent to {results.email}</li>
                              <li>Please wait while we analyze your compounds</li>
                              <li>You can close this page</li>
                            </>
                          ) : (
                            <>
                              <li>Processing has been completed successfully</li>
                              <li>Results email will be sent shortly to {results.email}</li>
                              <li>You can safely close this page</li>
                              <li>Check your email for the CSV file with detailed results</li>
                            </>
                          )}
                        </ul>
                      </div>
                    </div>
                  </div>
                )}

                {tableData.length > 0 && !results.error && (
                  <div className="mb-8">
                    <h3 className="text-xl sm:text-2xl font-semibold text-gray-800 mb-4">Results Summary</h3>



                    {/* Color-coded legend */}
                    <div className="mb-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
                      <h4 className="text-sm font-medium text-gray-700 mb-2">Inhibitor Potency Classes:</h4>
                      <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs">
                        <div className="flex items-center">
                          <span className="w-3 h-3 rounded-full bg-emerald-100 border border-emerald-300 mr-2"></span>
                          <span><span className="font-medium">Class 0</span>: Most Potent Inhibitors</span>
                        </div>
                        <div className="flex items-center">
                          <span className="w-3 h-3 rounded-full bg-violet-100 border border-violet-300 mr-2"></span>
                          <span><span className="font-medium">Class 1</span>: Moderately Potent Inhibitors</span>
                        </div>
                        <div className="flex items-center">
                          <span className="w-3 h-3 rounded-full bg-pink-100 border border-pink-300 mr-2"></span>
                          <span><span className="font-medium">Class 2</span>: Poor Inhibitors</span>
                        </div>
                      </div>
                    </div>

                    <div className="overflow-x-auto rounded-lg border border-gray-200">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th scope="col" className="px-4 py-3 text-left text-sm font-medium text-gray-800 uppercase tracking-wider">ID</th>
                            <th scope="col" className="px-4 py-3 text-left text-sm font-medium text-gray-800 uppercase tracking-wider">Compound</th>
                            <th scope="col" className="px-4 py-3 text-left text-sm font-medium text-gray-800 uppercase tracking-wider">Name</th>
                            <th scope="col" className="px-4 py-3 text-left text-sm font-medium text-gray-800 uppercase tracking-wider">Type</th>
                            <th scope="col" className="px-4 py-3 text-left text-sm font-medium text-gray-800 uppercase tracking-wider">Class</th>
                            <th scope="col" className="px-4 py-3 text-left text-sm font-medium text-gray-800 uppercase tracking-wider">IC50</th>
                            {/* Descriptor columns */}
                            {['RDF20e', 'SpMin2_Bhm', 'WPSA-3', 'SpMin2_Bhe', 'RDF125i', 'RDF120s', 
                              'RDF20i', 'ALogP', 'RDF20u', 'RDF135u', 'RDF20s', 'RDF20v', 'RDF135v', 
                              'RDF115s', 'BCUTc-1h', 'RDF125u', 'RDF130m', 'RDF130u', 'BCUTw-1h', 
                              'RDF20p', 'RDF125s', 'RDF130v', 'RDF125e', 'RDF115m', 'RDF110s', 'nBondsD',
                              'minssCH2', 'TDB1i', 'SHAvin', 'PPSA-3', 'Du', 'nHdsCH', 'SpMin2_Bhe', 
                              'SHBint4', 'minHBint4', 'AATS3v', 'TDB1u', 'TDB5m', 'ATSC2m', 'MATS5s', 
                              'TDB3i', 'VR2_D', 'GATS2i', 'SHdsCH', 'ndsCH', 'E2m', 'AATSC2p'].map(desc => (
                              <th key={desc} scope="col" className="px-2 py-3 text-left text-xs font-medium text-gray-800 uppercase tracking-wider">{desc}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {tableData.map((item) => (
                            <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                              <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-500">{item.id}</td>
                              <td className="px-4 py-3 whitespace-nowrap text-xs font-mono text-gray-700 break-all max-w-xs truncate" title={item.smiles}>{item.smiles}</td>
                              <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-700">{item.name}</td>
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
                              {/* Descriptor columns */}
                              {['RDF20e', 'SpMin2_Bhm', 'WPSA-3', 'SpMin2_Bhe', 'RDF125i', 'RDF120s', 
                                'RDF20i', 'ALogP', 'RDF20u', 'RDF135u', 'RDF20s', 'RDF20v', 'RDF135v', 
                                'RDF115s', 'BCUTc-1h', 'RDF125u', 'RDF130m', 'RDF130u', 'BCUTw-1h', 
                                'RDF20p', 'RDF125s', 'RDF130v', 'RDF125e', 'RDF115m', 'RDF110s', 'nBondsD',
                                'minssCH2', 'TDB1i', 'SHAvin', 'PPSA-3', 'Du', 'nHdsCH', 'SpMin2_Bhe', 
                                'SHBint4', 'minHBint4', 'AATS3v', 'TDB1u', 'TDB5m', 'ATSC2m', 'MATS5s', 
                                'TDB3i', 'VR2_D', 'GATS2i', 'SHdsCH', 'ndsCH', 'E2m', 'AATSC2p'].map(desc => (
                                <td key={desc} className="px-2 py-3 whitespace-nowrap text-xs text-gray-600 font-mono">
                                  {item[desc] !== null && item[desc] !== undefined ? item[desc].toFixed(4) : '0.0000'}
                                </td>
                              ))}
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
