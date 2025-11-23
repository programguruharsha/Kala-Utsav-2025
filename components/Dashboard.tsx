import React, { useState, useEffect, useMemo } from 'react';
import { 
  Plus, Trash2, Save, Download, Users, User, Edit2, Settings,
  Database, FileSpreadsheet, Link, DownloadCloud, AlertTriangle, WifiOff, RefreshCw
} from 'lucide-react';

import { initializeApp, getApps, getApp, deleteApp, FirebaseApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged, Auth } from 'firebase/auth';
import { getFirestore, collection, onSnapshot, doc, addDoc, deleteDoc, query, serverTimestamp, updateDoc, setDoc, setLogLevel, Firestore } from 'firebase/firestore';
import { getAnalytics, isSupported } from 'firebase/analytics';

import { usePDFLibrary } from '../hooks/usePDFLibrary';
import Toast from './Toast';
import Modal from './Modal';
import { Registration, RegistrationFormData, ToastState } from '../types';

// --- Global Config & Helper Hooks ---

const appId = 'cultural-fest-app';
const initialAuthToken = null;

// Valid configuration provided by user
const HARDCODED_CONFIG = {
  apiKey: "AIzaSyDlnwzSrf5WP2e6NALc2iKFgpmXEH4vrGI",
  authDomain: "kala-utsav-2025.firebaseapp.com",
  projectId: "kala-utsav-2025",
  storageBucket: "kala-utsav-2025.firebasestorage.app",
  messagingSenderId: "932515904674",
  appId: "1:932515904674:web:e006df3a336d18fcb32bfb",
  measurementId: "G-Z97561WNER"
};

const DEFAULT_SHEET_URL = 'https://script.google.com/macros/s/AKfycbyFtZEI1l_mFxS_CYy5J71pIKg3XLeJAA-mrjT6IDKyI9MMCTmtx_5Afea9lzGyOr9lUQ/exec';

const EVENT_OPTIONS = [
  "Group Song", "Group Dance", "Fashion Show", "Mad Ads", 
  "Mime", "Rangoli", "Mehendi"
];

const CLASS_OPTIONS = [
  "I PCMB", "I PCME", "I SEBA", "I CEBA", "I HEPS",
  "II PCMB", "II PCME", "II SEBA", "II CEBA", "II HEPS"
];

const Dashboard: React.FC = () => {
  const pdfLibraryLoaded = usePDFLibrary();

  // --- Firebase State ---
  const [db, setDb] = useState<Firestore | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [isFirebaseReady, setIsFirebaseReady] = useState(false);
  
  // --- App State ---
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [formData, setFormData] = useState<RegistrationFormData>({
    id: null,
    type: 'individual',
    event: '',
    classVal: '',
    names: ['']
  });

  const [baseFontSize, setBaseFontSize] = useState(14);
  const [isEditing, setIsEditing] = useState(false);

  // --- Google Sheets Sync State ---
  const [sheetUrl, setSheetUrl] = useState(localStorage.getItem('sheet_url') || DEFAULT_SHEET_URL);
  const [showSheetModal, setShowSheetModal] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  
  // --- UI State & Error Handling ---
  const [toast, setToast] = useState<ToastState | null>(null);
  const [deleteModal, setDeleteModal] = useState<{ show: boolean; id: string | null }>({ show: false, id: null });
  
  // New: Offline / Config Logic
  const [isOffline, setIsOffline] = useState(false);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [manualConfigJson, setManualConfigJson] = useState('');
  
  // Initialize with local storage config if available, else hardcoded
  const [activeConfig, setActiveConfig] = useState(() => {
    const saved = localStorage.getItem('firebase_config_override');
    return saved ? JSON.parse(saved) : HARDCODED_CONFIG;
  });

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type });
  };

  // Save URL to local storage when changed
  useEffect(() => {
    if (sheetUrl) {
      localStorage.setItem('sheet_url', sheetUrl);
    }
  }, [sheetUrl]);

  // --- Firebase Init ---
  useEffect(() => {
    // If we are already in offline mode, don't try to connect
    if (isOffline) return;

    // Check for placeholder/invalid keys immediately
    if (!activeConfig?.apiKey || activeConfig.apiKey.includes("Your-Unique-Key-Here")) {
      console.warn("Invalid API Key detected. Switching to setup mode.");
      setShowConfigModal(true);
      return;
    }

    let unsubscribeAuth: (() => void) | undefined;

    const initFirebase = async () => {
      try {
        setLogLevel('silent');
        
        let app: FirebaseApp;
        // Check if app exists
        if (getApps().length > 0) {
           const existingApp = getApp();
           // Check if config matches (to handle hot reloads or config updates)
           if (existingApp.options.apiKey !== activeConfig.apiKey || existingApp.options.projectId !== activeConfig.projectId) {
              try {
                await deleteApp(existingApp);
              } catch (err) {
                console.warn("Error deleting existing app:", err);
              }
              app = initializeApp(activeConfig);
           } else {
             app = existingApp;
           }
        } else {
          app = initializeApp(activeConfig);
        }
        
        // Initialize Analytics if supported (safe check)
        isSupported().then((supported) => {
            if (supported) {
                getAnalytics(app);
            }
        }).catch(err => console.debug("Analytics not supported in this env:", err));
        
        const firestoreDb = getFirestore(app);
        const firebaseAuth = getAuth(app);
        setDb(firestoreDb);

        const setupAuth = async () => {
            try {
                if (initialAuthToken) {
                    await signInWithCustomToken(firebaseAuth, initialAuthToken);
                } else {
                    await signInAnonymously(firebaseAuth);
                }
            } catch (error: any) {
                console.error("Auth Error:", error);
                
                if (error.code === 'auth/api-key-not-valid' || error.code === 'auth/invalid-api-key') {
                  setShowConfigModal(true);
                  showToast("Invalid API Key. Please update config.", "error");
                } else if (error.code === 'auth/configuration-not-found' || error.message.includes('auth/configuration-not-found')) {
                   // This error means Auth isn't enabled in the Firebase Console
                   showToast("Auth not configured. Switching to Offline Mode.", "info");
                   setIsOffline(true);
                } else if (error.code === 'auth/operation-not-allowed') {
                   // This means Anonymous Auth isn't enabled
                   showToast("Anonymous Auth disabled. Switching to Offline Mode.", "info");
                   setIsOffline(true);
                } else {
                  showToast("Authentication failed. Switching to Offline Mode.", "error");
                  setIsOffline(true);
                }
            }
        };

        unsubscribeAuth = onAuthStateChanged(firebaseAuth, (user) => {
            if (user) {
                setUserId(user.uid);
                setIsFirebaseReady(true);
                setShowConfigModal(false); // Close modal on success
            } else {
                setUserId(null);
                setIsFirebaseReady(false); 
            }
        });

        setupAuth();
      } catch (e: any) {
        console.error("Firebase init error", e);
        // If critical init fails, fallback to offline to keep app usable
        setIsOffline(true);
        showToast("Init Failed. Offline Mode Active.", "error");
      }
    };

    initFirebase();

    return () => {
      if (unsubscribeAuth) unsubscribeAuth();
    };
  }, [activeConfig, isOffline]);

  // --- Firestore Subscription ---
  useEffect(() => {
    if (isOffline || !isFirebaseReady || !db || !userId) return;

    const collectionPath = `artifacts/${appId}/public/data/festRegistrations`;
    const regsCollectionRef = collection(db, collectionPath);
    const q = query(regsCollectionRef); 

    const unsubscribe = onSnapshot(q, (snapshot) => {
        const fetchedRegistrations = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        })) as Registration[];
        const sortedRegistrations = fetchedRegistrations.sort((a, b) => a.event.localeCompare(b.event));
        setRegistrations(sortedRegistrations);
    }, (error) => {
        console.error("Firestore Error:", error);
        if (error.code !== 'permission-denied') {
            showToast("Lost connection to database.", "error");
        }
    });

    return () => unsubscribe();
  }, [isFirebaseReady, db, userId, isOffline]); 

  // --- Configuration Handlers ---

  const handleSaveConfig = () => {
    try {
      const newConfig = JSON.parse(manualConfigJson);
      if (!newConfig.apiKey) throw new Error("Missing apiKey in JSON");
      
      localStorage.setItem('firebase_config_override', JSON.stringify(newConfig));
      setActiveConfig(newConfig);
      setIsOffline(false);
      setShowConfigModal(false);
      showToast("Configuration updated. Connecting...", "info");
      // Force reload to ensure clean Firebase instance if needed, 
      // though react state update might be enough for simple cases.
      // window.location.reload(); 
    } catch (e) {
      showToast("Invalid JSON Config", "error");
    }
  };

  const handleGoOffline = () => {
    setIsOffline(true);
    setShowConfigModal(false);
    showToast("Entered Offline Mode. Data will be local only.", "info");
  };

  // --- Data Handlers ---

  const handleSyncToSheets = async () => {
    if (!sheetUrl) {
      setShowSheetModal(true);
      return;
    }

    setIsSyncing(true);
    try {
      const payload = registrations.map(reg => ({
        id: reg.id,
        type: reg.type,
        event: reg.event,
        classVal: reg.classVal,
        names: reg.names,
        timestamp: new Date().toISOString()
      }));

      await fetch(sheetUrl, {
        method: 'POST',
        mode: 'no-cors', 
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      showToast("Sent data to Google Sheets! (Check sheet to confirm)", "success");
      
    } catch (error) {
      console.error("Sync Error:", error);
      showToast("Sync failed. Check connection.", "error");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleImportFromSheets = async () => {
    // In Offline mode, we allow import to populate local state
    if (!sheetUrl) {
       showToast("Missing Sheet URL", "error");
       return;
    }
    
    // In online mode, guard against missing DB
    if (!isOffline && (!db || !userId)) {
       showToast("Database not ready", "error");
       return;
    }

    setIsImporting(true);
    try {
      const response = await fetch(sheetUrl);
      
      const contentType = response.headers.get("content-type");
      if (contentType && contentType.indexOf("application/json") === -1) {
        throw new Error("Received HTML instead of JSON. Check Script Deployment.");
      }

      if (!response.ok) throw new Error(`Server returned ${response.status}`);
      
      const sheetData = await response.json();
      
      if (sheetData.error) {
        throw new Error(sheetData.error);
      }

      if (!Array.isArray(sheetData) || sheetData.length === 0) {
        showToast("Sheet is empty or no data found.", "info");
        setIsImporting(false);
        return;
      }

      let count = 0;
      
      if (isOffline) {
        // Offline: Just replace/merge local state
        const newRegs = sheetData.map((item: any) => ({
            id: item.id || Date.now().toString() + Math.random(),
            type: item.type || 'individual',
            event: item.event || 'Unknown',
            classVal: item.classVal || 'Unknown',
            names: item.names || [],
            timestamp: new Date()
        }));
        // Simple merge strategy for offline: append new ones that don't exist by ID
        setRegistrations(prev => {
           const existingIds = new Set(prev.map(r => r.id));
           const uniqueNew = newRegs.filter((r: Registration) => !existingIds.has(r.id));
           return [...prev, ...uniqueNew];
        });
        count = newRegs.length;
      } else {
        // Online: Write to Firestore
        const batchPromises = sheetData.map(async (item: any) => {
          if (!item.id) return; 
          const docRef = doc(db, `artifacts/${appId}/public/data/festRegistrations`, item.id);
          
          await setDoc(docRef, {
              id: item.id,
              type: item.type,
              event: item.event,
              classVal: item.classVal,
              names: item.names,
              timestamp: serverTimestamp() 
          }, { merge: true });
          count++;
        });
        await Promise.all(batchPromises);
      }

      showToast(`Imported entries from Sheets!`, "success");
      setTimeout(() => setShowSheetModal(false), 1500);

    } catch (error: any) {
      console.error("Import Error:", error);
      showToast(error.message || "Failed to import.", "error");
    } finally {
      setIsImporting(false);
    }
  };

  const handleInputChange = (field: keyof RegistrationFormData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleNameChange = (index: number, value: string) => {
    const newNames = [...formData.names];
    newNames[index] = value;
    setFormData(prev => ({ ...prev, names: newNames }));
  };

  const addMemberField = () => {
    setFormData(prev => ({ ...prev, names: [...prev.names, ''] }));
  };

  const removeMemberField = (index: number) => {
    if (formData.names.length > 1) {
      const newNames = formData.names.filter((_, i) => i !== index);
      setFormData(prev => ({ ...prev, names: newNames }));
    }
  };

  const handleTypeChange = (type: 'individual' | 'group') => {
    setFormData(prev => ({
      ...prev,
      type,
      names: type === 'individual' ? [prev.names[0] || ''] : prev.names
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!isOffline && (!isFirebaseReady || !db || !userId)) {
        showToast("Database connection not ready.", "error");
        return;
    }

    if (!formData.event || !formData.classVal || formData.names.some(n => !n.trim())) {
      showToast("Please fill in all required fields.", "error");
      return;
    }

    // Common data structure
    const regData = {
      type: formData.type,
      event: formData.event,
      classVal: formData.classVal,
      names: formData.names.filter(n => n.trim() !== ''),
    };

    try {
      if (isOffline) {
        // --- Offline CRUD ---
        if (isEditing && formData.id) {
           setRegistrations(prev => prev.map(r => r.id === formData.id ? { ...r, ...regData } : r));
           showToast("Updated locally (Offline)", "info");
        } else {
           const newId = Date.now().toString();
           setRegistrations(prev => [...prev, { ...regData, id: newId, timestamp: new Date() } as Registration]);
           showToast("Saved locally (Offline)", "info");
        }
      } else {
        // --- Firebase CRUD ---
        if (isEditing && formData.id) {
          const docRef = doc(db, `artifacts/${appId}/public/data/festRegistrations`, formData.id);
          await updateDoc(docRef, { ...regData, timestamp: serverTimestamp() });
          showToast("Entry updated successfully!", "success");
        } else {
          const collectionRef = collection(db, `artifacts/${appId}/public/data/festRegistrations`);
          await addDoc(collectionRef, { ...regData, timestamp: serverTimestamp() });
          showToast("Registration added successfully!", "success");
        }
      }
      setIsEditing(false);
    } catch (error) {
      console.error("Save Error:", error);
      showToast("Failed to save data.", "error");
    }

    setFormData({
      id: null,
      type: 'individual',
      event: '',
      classVal: '',
      names: ['']
    });
  };

  const handleEdit = (entry: Registration) => {
    setFormData(entry);
    setIsEditing(true);
    document.querySelector('main')?.scrollIntoView({ behavior: 'smooth' });
  };

  const confirmDelete = (id: string) => {
    setDeleteModal({ show: true, id });
  };

  const executeDelete = async () => {
    if (!deleteModal.id) return;

    if (!isOffline && (!isFirebaseReady || !db || !userId)) return;

    try {
      if (isOffline) {
        setRegistrations(prev => prev.filter(r => r.id !== deleteModal.id));
        showToast("Deleted locally.", "info");
      } else {
        const docRef = doc(db, `artifacts/${appId}/public/data/festRegistrations`, deleteModal.id);
        await deleteDoc(docRef);
        showToast("Entry deleted.", "info");
      }
    } catch (error) {
      console.error("Delete Error:", error);
      showToast("Failed to delete data.", "error");
    } finally {
      setDeleteModal({ show: false, id: null });
    }
  };

  const groupedData = useMemo(() => {
    const groups: Record<string, Registration[]> = {};
    registrations.forEach(reg => {
      if (!groups[reg.event]) groups[reg.event] = [];
      groups[reg.event].push(reg);
    });
    return groups;
  }, [registrations]);

  const generatePDF = () => {
    if (!window.jspdf || !window.jspdf.jsPDF) {
      showToast("PDF Library still loading...", "info");
      return;
    }

    const jsPDF = window.jspdf.jsPDF;
    const doc = new jsPDF();
    
    if (typeof doc.autoTable !== 'function') {
      showToast("PDF Plugin Error. Please refresh.", "error");
      return;
    }
    
    const pageWidth = doc.internal.pageSize.width;
    let currentY = 20;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("BEL COMPOSITE PU COLLEGE", pageWidth / 2, currentY, { align: "center" });
    currentY += 8;
    doc.text("CULTURAL FEST 2025", pageWidth / 2, currentY, { align: "center" });
    currentY += 5;
    
    doc.setLineWidth(0.5);
    doc.line(10, currentY, pageWidth - 10, currentY);
    currentY += 10;

    Object.keys(groupedData).forEach((eventName) => {
      const entries = groupedData[eventName];

      if (currentY > 250) {
        doc.addPage();
        currentY = 20;
      }

      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setFillColor(240, 240, 240);
      doc.rect(14, currentY - 5, pageWidth - 28, 8, 'F');
      doc.text(eventName.toUpperCase(), 14, currentY);
      currentY += 5;

      const tableBody = entries.map((entry, index) => [
        index + 1,
        entry.classVal,
        entry.names.join(", ")
      ]);

      doc.autoTable({
        startY: currentY,
        head: [['Sl.no', 'Class', 'Names of the Team Members']],
        body: tableBody,
        theme: 'grid',
        styles: { font: 'helvetica', fontSize: 10, cellPadding: 3 },
        headStyles: { fillColor: [41, 37, 36], textColor: 255, fontStyle: 'bold', halign: 'center' },
        columnStyles: {
          0: { cellWidth: 20, halign: 'center' },
          1: { cellWidth: 40, halign: 'center' },
          2: { cellWidth: 'auto' }
        },
        margin: { left: 14, right: 14 },
        didDrawPage: (data: any) => { currentY = data.cursor.y + 10; }
      });

      currentY = doc.lastAutoTable.finalY + 10;
    });

    doc.save("Cultural_Fest_2025_Data.pdf");
    showToast("PDF downloaded successfully!", "success");
  };

  return (
    <div className="min-h-screen bg-stone-50 p-4 md:p-8 relative">
      {/* Toast Notification */}
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* Delete Confirmation Modal */}
      <Modal 
        isOpen={deleteModal.show} 
        onClose={() => setDeleteModal({ show: false, id: null })}
        title="Confirm Deletion"
        footer={
          <>
            <button 
              onClick={() => setDeleteModal({ show: false, id: null })}
              className="px-4 py-2 rounded-lg text-stone-600 hover:bg-stone-100 font-medium transition-colors"
            >
              Cancel
            </button>
            <button 
              onClick={executeDelete}
              className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white font-medium shadow-sm transition-colors"
            >
              Delete Entry
            </button>
          </>
        }
      >
        <div className="flex flex-col items-center text-center">
          <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mb-4">
            <Trash2 className="w-6 h-6 text-red-600" />
          </div>
          <p className="text-stone-600">
            Are you sure you want to delete this registration? This action cannot be undone.
          </p>
        </div>
      </Modal>

      {/* Database Setup / Config Modal */}
      <Modal
        isOpen={showConfigModal}
        onClose={() => {}} // Disallow closing without choice
        title="Database Setup"
        footer={
           <div className="flex justify-between w-full gap-4">
             <button 
                onClick={handleGoOffline}
                className="px-4 py-2 rounded-lg text-stone-600 hover:bg-stone-100 font-medium flex items-center gap-2"
              >
                <WifiOff className="w-4 h-4" />
                Use Offline Mode
              </button>
              <button 
                onClick={handleSaveConfig}
                className="px-4 py-2 rounded-lg bg-stone-800 hover:bg-stone-900 text-white font-medium"
              >
                Connect Database
              </button>
           </div>
        }
      >
        <div className="space-y-4">
          <div className="bg-amber-50 text-amber-800 p-3 rounded-lg text-sm flex items-start gap-2">
            <AlertTriangle className="w-5 h-5 flex-shrink-0" />
            <p>
              <strong>Missing or Invalid Configuration:</strong> The app needs a valid Firebase Config object to connect to the database.
            </p>
          </div>
          <div>
            <label className="block text-sm font-semibold text-stone-700 mb-1">Paste Firebase Config JSON:</label>
            <textarea
              className="w-full h-40 p-3 text-xs font-mono bg-stone-100 border border-stone-200 rounded-lg outline-none focus:ring-2 focus:ring-stone-500"
              placeholder={`{\n  "apiKey": "AIza...",\n  "authDomain": "...",\n  "projectId": "..."\n}`}
              value={manualConfigJson}
              onChange={(e) => setManualConfigJson(e.target.value)}
            />
          </div>
          <p className="text-xs text-stone-500">
            Or choose <strong>Offline Mode</strong> to use the app without a backend (Data will be lost on refresh unless imported from Sheets).
          </p>
        </div>
      </Modal>

      {/* Google Sheets Configuration Modal */}
      <Modal
        isOpen={showSheetModal}
        onClose={() => setShowSheetModal(false)}
        title="Connect Google Sheets"
        footer={
          <div className="flex flex-col gap-3 w-full">
            <div className="grid grid-cols-2 gap-3">
              <button 
                onClick={handleImportFromSheets}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2"
                disabled={isImporting || isSyncing}
                title="Read from Sheets and update App"
              >
                {isImporting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Importing...
                  </>
                ) : (
                  <>
                    <DownloadCloud className="w-4 h-4" />
                    Import Data
                  </>
                )}
              </button>
              
              <button 
                onClick={handleSyncToSheets}
                className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white font-medium shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2"
                disabled={isSyncing || isImporting}
                title="Write App data to Sheets"
              >
                {isSyncing ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Syncing...
                  </>
                ) : (
                  <>
                    <FileSpreadsheet className="w-4 h-4" />
                    Sync to Sheets
                  </>
                )}
              </button>
            </div>
            <p className="text-xs text-center text-stone-500">
              Use "Import" to pull missing data. Use "Sync" to save changes.
            </p>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-stone-600">
            Paste your <strong>Google Apps Script Web App URL</strong> below.
          </p>
          <div className="relative">
            <Link className="absolute left-3 top-3 w-4 h-4 text-stone-400" />
            <input 
              type="text" 
              placeholder="https://script.google.com/macros/s/..." 
              value={sheetUrl}
              onChange={(e) => setSheetUrl(e.target.value)}
              className="w-full pl-10 p-2 bg-stone-50 border border-stone-200 rounded-lg focus:ring-2 focus:ring-green-500 outline-none text-sm font-mono"
            />
          </div>
          <div className="text-xs bg-blue-50 text-blue-800 p-3 rounded border border-blue-100">
             <strong>Debug:</strong> If you see "Received HTML instead of JSON", it means your Script is not deployed correctly.
          </div>
        </div>
      </Modal>

      <header className="max-w-6xl mx-auto mb-8 text-center border-b-2 border-stone-200 pb-6">
        <h1 className="text-3xl md:text-4xl font-bold text-stone-900 tracking-tight">BEL COMPOSITE PU COLLEGE</h1>
        <div className="flex items-center justify-center gap-2 mt-2 text-purple-700">
          <Users className="w-5 h-5" />
          <h2 className="text-xl font-semibold">CULTURAL FEST 2025</h2>
        </div>
        <div className="mt-4 flex justify-center gap-4">
           {/* Status Indicator */}
          <div className={`text-xs font-mono p-2 rounded-lg inline-flex items-center cursor-pointer transition-colors ${isOffline ? 'bg-amber-100 text-amber-800' : 'bg-stone-100 text-stone-500'}`} onClick={() => isOffline && setShowConfigModal(true)}>
              {isOffline ? (
                <>
                  <WifiOff className="w-3 h-3 mr-2 text-amber-600"/>
                  <span className="font-semibold">Offline Mode (Click to Connect)</span>
                </>
              ) : (
                <>
                  <Database className={`w-3 h-3 mr-2 ${isFirebaseReady ? 'text-green-600' : 'text-stone-400'}`}/>
                  {isFirebaseReady && userId ? (
                    <span className="font-semibold text-green-700">● Live Shared Database</span>
                  ) : (
                    "Connecting..."
                  )}
                </>
              )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* --- LEFT COLUMN: INPUT FORM --- */}
        <div className="lg:col-span-4">
          <div className="bg-white rounded-xl shadow-lg border border-stone-200 p-6 sticky top-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold flex items-center gap-2">
                {isEditing ? <Edit2 className="w-5 h-5 text-blue-600"/> : <Plus className="w-5 h-5 text-green-600"/>}
                {isEditing ? "Edit Entry" : "New Registration"}
              </h3>
              {isEditing && (
                <button 
                  onClick={() => {
                    setIsEditing(false);
                    setFormData({ id: null, type: 'individual', event: '', classVal: '', names: [''] });
                  }}
                  className="text-xs text-red-500 hover:text-red-700 font-medium"
                >
                  Cancel
                </button>
              )}
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-stone-600">Participation Type</label>
                <div className="grid grid-cols-2 gap-4">
                  <label className={`flex items-center justify-center p-3 rounded-lg border-2 cursor-pointer transition-all ${formData.type === 'individual' ? 'border-purple-600 bg-purple-50 text-purple-700' : 'border-stone-200 hover:border-stone-300'}`}>
                    <input 
                      type="radio" 
                      name="type" 
                      value="individual" 
                      checked={formData.type === 'individual'} 
                      onChange={() => handleTypeChange('individual')} 
                      className="hidden" 
                    />
                    <User className="w-4 h-4 mr-2"/> Individual
                  </label>
                  <label className={`flex items-center justify-center p-3 rounded-lg border-2 cursor-pointer transition-all ${formData.type === 'group' ? 'border-purple-600 bg-purple-50 text-purple-700' : 'border-stone-200 hover:border-stone-300'}`}>
                    <input 
                      type="radio" 
                      name="type" 
                      value="group" 
                      checked={formData.type === 'group'} 
                      onChange={() => handleTypeChange('group')} 
                      className="hidden" 
                    />
                    <Users className="w-4 h-4 mr-2"/> Group
                  </label>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-stone-600">Select Event</label>
                <select 
                  className="w-full p-3 bg-stone-50 border border-stone-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition-all"
                  value={formData.event}
                  onChange={(e) => handleInputChange('event', e.target.value)}
                  required
                >
                  <option value="">-- Choose Event --</option>
                  {EVENT_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-stone-600">Select Class</label>
                <select 
                  className="w-full p-3 bg-stone-50 border border-stone-200 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none"
                  value={formData.classVal}
                  onChange={(e) => handleInputChange('classVal', e.target.value)}
                  required
                >
                  <option value="">-- Choose Class --</option>
                  {CLASS_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              </div>

              <div className="space-y-3">
                <div className="flex justify-between items-end">
                  <label className="text-sm font-semibold text-stone-600">
                    {formData.type === 'individual' ? 'Participant Name' : 'Team Members'}
                  </label>
                  {formData.type === 'group' && (
                    <button 
                      type="button" 
                      onClick={addMemberField}
                      className="text-xs bg-stone-100 hover:bg-stone-200 text-stone-700 px-2 py-1 rounded flex items-center gap-1 transition-colors"
                      disabled={!isFirebaseReady && !isOffline}
                    >
                      <Plus className="w-3 h-3"/> Add Member
                    </button>
                  )}
                </div>
                
                {formData.names.map((name, index) => (
                  <div key={index} className="flex gap-2 animate-in slide-in-from-left-2 duration-200">
                    <input
                      type="text"
                      placeholder={formData.type === 'group' ? `Member ${index + 1} Name` : "Full Name"}
                      value={name}
                      onChange={(e) => handleNameChange(index, e.target.value)}
                      className="flex-1 p-3 bg-stone-50 border border-stone-200 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none"
                      required
                      disabled={!isFirebaseReady && !isOffline}
                    />
                    {formData.type === 'group' && formData.names.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeMemberField(index)}
                        className="p-3 text-red-500 hover:bg-red-50 rounded-lg border border-transparent hover:border-red-100 transition-colors"
                        disabled={!isFirebaseReady && !isOffline}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <button 
                type="submit" 
                disabled={!isFirebaseReady && !isOffline}
                className={`w-full py-3 px-4 rounded-lg text-white font-semibold shadow-md transition-all active:scale-95 flex justify-center items-center gap-2 ${
                  (!isFirebaseReady && !isOffline)
                    ? 'bg-stone-400 cursor-not-allowed' 
                    : (isEditing ? 'bg-blue-600 hover:bg-blue-700' : 'bg-stone-800 hover:bg-stone-900')
                }`}
              >
                <Save className="w-4 h-4" />
                {isEditing ? "Update Entry" : "Save Registration"}
              </button>
            </form>
          </div>
        </div>


        {/* --- RIGHT COLUMN: PREVIEW & EXPORT --- */}
        <div className="lg:col-span-8 space-y-6">
          
          <div className="bg-white p-4 rounded-xl shadow-sm border border-stone-200 flex flex-col sm:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-3">
              <Settings className="w-4 h-4 text-stone-400" />
              <span className="text-sm font-medium text-stone-600">Font Size: {baseFontSize}px</span>
              <input 
                type="range" 
                min="10" 
                max="24" 
                value={baseFontSize} 
                onChange={(e) => setBaseFontSize(Number(e.target.value))}
                className="w-32 h-2 bg-stone-200 rounded-lg appearance-none cursor-pointer accent-purple-600"
              />
            </div>

            <div className="flex gap-2">
              <button 
                onClick={() => setShowSheetModal(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium shadow-sm transition-all bg-green-600 hover:bg-green-700 text-white"
                title="Sync to Google Sheets"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span className="hidden sm:inline">Sync Sheets</span>
              </button>

              <button 
                onClick={generatePDF}
                disabled={!pdfLibraryLoaded || registrations.length === 0}
                className={`flex items-center gap-2 px-5 py-2 rounded-lg font-medium shadow-sm transition-all ${
                  registrations.length === 0 
                    ? 'bg-stone-200 text-stone-400 cursor-not-allowed' 
                    : 'bg-red-600 hover:bg-red-700 text-white hover:shadow-md'
                }`}
              >
                <Download className="w-4 h-4" />
                Export PDF
              </button>
            </div>
          </div>

          {/* The "Paper" Preview */}
          <div className="bg-white shadow-xl min-h-[600px] p-8 md:p-12 border border-stone-200 rounded-sm relative">
            <div className="absolute left-4 top-0 bottom-0 w-8 border-r-2 border-red-100 border-double hidden md:block"></div>
            
            <div className="md:pl-8" style={{ fontSize: `${baseFontSize}px` }}>
              
              <div className="text-center mb-8 border-b-2 border-stone-800 pb-4">
                <h2 className="font-bold text-[1.4em] leading-tight">BEL COMPOSITE PU COLLEGE</h2>
                <div className="text-[1.1em] font-medium mt-2 text-stone-600">CULTURAL FEST 2025</div>
              </div>

              {registrations.length === 0 ? (
                <div className="text-center py-20 text-stone-400 italic flex flex-col items-center gap-2">
                  <div className="w-16 h-16 bg-stone-50 rounded-full flex items-center justify-center mb-2">
                    <Database className="w-8 h-8 text-stone-300" />
                  </div>
                  {isFirebaseReady && userId ? 
                    "No shared registrations found. Add one to start!" : 
                    (isOffline ? "Offline Mode: Add entries locally." : "Loading registrations...")
                  }
                </div>
              ) : (
                <div className="space-y-8">
                  {Object.keys(groupedData).map((eventName) => (
                    <div key={eventName} className="break-inside-avoid">
                      <div className="bg-stone-100 border-y border-stone-300 py-2 px-4 font-bold text-stone-800 mb-0 flex justify-between items-center">
                        <span>{eventName}</span>
                        <span className="text-[0.7em] font-normal bg-white px-2 py-0.5 rounded border border-stone-200">
                          {groupedData[eventName].length} Teams
                        </span>
                      </div>
                      
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="bg-stone-800 text-white text-[0.8em]">
                              <th className="p-3 w-16 text-center border border-stone-700">Sl.no</th>
                              <th className="p-3 w-32 text-center border border-stone-700">Class</th>
                              <th className="p-3 border border-stone-700">Names of Team Members</th>
                              <th className="p-3 w-24 text-center border border-stone-700 print:hidden">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {groupedData[eventName].map((entry, idx) => (
                              <tr key={entry.id} className="border-b border-stone-200 hover:bg-blue-50 transition-colors">
                                <td className="p-3 text-center border-x border-stone-200">{idx + 1}</td>
                                <td className="p-3 text-center font-medium border-x border-stone-200">{entry.classVal}</td>
                                <td className="p-3 border-x border-stone-200">
                                  <div className="flex flex-wrap gap-1">
                                    {entry.names.map((n, i) => (
                                      <span key={i}>
                                        {n}{i < entry.names.length - 1 ? ', ' : ''}
                                      </span>
                                    ))}
                                  </div>
                                </td>
                                <td className="p-3 text-center border-x border-stone-200 print:hidden">
                                  <div className="flex justify-center gap-2">
                                    <button 
                                      onClick={() => handleEdit(entry)}
                                      className="p-1.5 text-blue-600 hover:bg-blue-100 rounded transition-colors"
                                      title="Edit"
                                      disabled={!isFirebaseReady && !isOffline}
                                    >
                                      <Edit2 className="w-4 h-4" />
                                    </button>
                                    <button 
                                      onClick={() => confirmDelete(entry.id)}
                                      className="p-1.5 text-red-600 hover:bg-red-100 rounded transition-colors"
                                      title="Delete"
                                      disabled={!isFirebaseReady && !isOffline}
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;