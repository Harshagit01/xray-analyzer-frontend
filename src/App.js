import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, addDoc, query, orderBy, onSnapshot, serverTimestamp } from 'firebase/firestore';

// For local development, these variables are expected to be set as environment variables
// prefixed with REACT_APP_. When deployed in Canvas, the global __ variables will override.
// We'll provide default empty/null values for local testing if not explicitly set.
const appId = process.env.REACT_APP_APP_ID || 'default-app-id-local';
const firebaseConfig = process.env.REACT_APP_FIREBASE_CONFIG ? JSON.parse(process.env.REACT_APP_FIREBASE_CONFIG) : {};
// Corrected logic to handle the 'null' string from .env file
const initialAuthToken = process.env.REACT_APP_INITIAL_AUTH_TOKEN === 'null' ? null : process.env.REACT_APP_INITIAL_AUTH_TOKEN;

// Placeholder for Firebase instances
let app, auth, db;

// Main App Component
function App() {
  const [user, setUser] = useState(null);
  const [userId, setUserId] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewImage, setPreviewImage] = useState(null);
  const [analysisResult, setAnalysisResult] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  // Removed: showModal and modalMessage state variables
  const [analysisHistory, setAnalysisHistory] = useState([]);
  const [activeTab, setActiveTab] = useState('analyze');

  // Initialize Firebase and handle authentication
  useEffect(() => {
    try {
      if (Object.keys(firebaseConfig).length === 0) {
        console.warn("Firebase config is empty. Please ensure REACT_APP_FIREBASE_CONFIG is set in .env.local or Firebase is initialized in Canvas.");
        return;
      }

      app = initializeApp(firebaseConfig);
      auth = getAuth(app);
      db = getFirestore(app);

      const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
        if (!currentUser) {
          try {
            if (initialAuthToken) {
              await signInWithCustomToken(auth, initialAuthToken);
              console.log("Signed in with custom token.");
            } else {
              await signInAnonymously(auth);
              console.log("Signed in anonymously.");
            }
          } catch (error) {
            console.error("Firebase authentication error:", error);
            // Removed: setModalMessage and setShowModal calls
          }
        }
        setUser(auth.currentUser);
        setUserId(auth.currentUser?.uid || crypto.randomUUID());
      });

      return () => unsubscribe();
    } catch (error) {
      console.error("Failed to initialize Firebase:", error);
      // Removed: setModalMessage and setShowModal calls
    }
  }, []);

  // Fetch analysis history
  useEffect(() => {
    if (userId && db) {
      const historyCollectionRef = collection(db, `artifacts/${appId}/users/${userId}/xray_analyses`);

      const q = query(historyCollectionRef, orderBy('timestamp', 'desc'));

      const unsubscribe = onSnapshot(q, (snapshot) => {
        const history = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setAnalysisHistory(history);
      }, (error) => {
        console.error("Error fetching analysis history:", error);
        // Removed: setModalMessage and setShowModal calls
      });

      return () => unsubscribe();
    }
  }, [userId, db, appId]);

  // Handle file selection
  const handleFileChange = (event) => {
    const file = event.target.files[0];
    if (file) {
      setSelectedFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviewImage(reader.result);
        setAnalysisResult('');
      };
      reader.readAsDataURL(file);
    } else {
      setSelectedFile(null);
      setPreviewImage(null);
      setAnalysisResult('');
    }
  };

  // Handle AI analysis via Backend and then Gemini
  const handleAnalyze = async () => {
    if (!selectedFile) {
      // Replaced modal with a simple console error for silent failure
      console.error("No file selected.");
      return;
    }
    if (!userId) {
      console.error("Authentication not ready. Cannot process request.");
      return;
    }

    setIsLoading(true);
    setAnalysisResult('');

    try {
      const formData = new FormData();
      formData.append('image', selectedFile);
      formData.append('userId', userId);

      const backendApiUrl = 'http://127.0.0.1:5000/api/analyze_xray';

      const backendResponse = await fetch(backendApiUrl, {
        method: 'POST',
        body: formData,
      });

      const backendResult = await backendResponse.json();
      let classificationResultFromBackend = "Unknown";
      let measurements = {};

      if (backendResult.status === "success" && backendResult.classificationResult) {
        classificationResultFromBackend = backendResult.classificationResult;
        measurements = backendResult.measurements || {};
        console.log("AI Classification from Backend:", classificationResultFromBackend);
        console.log("Simulated Measurements:", measurements);
      } else {
        console.error("Backend response error:", backendResult.error || backendResult);
        // Removed modal call here
        setIsLoading(false);
        return;
      }

      const basePrompt = `Generate a detailed mock X-ray report for a lateral view of a human foot. The AI classification for this image is: **${classificationResultFromBackend}**. Based on this classification, provide findings.
      
      **Instructions for the Report:**
      - The calcaneal spur measurement is ${measurements.calcaneumSpur}mm.
      - The Navicular Index measurement is ${measurements.navicularIndex}.
      - A navicular index of < 9.96 is normal; >= 9.96 is abnormal.
      - A calcaneal spur measurement > 2mm is considered abnormal.
      - DO NOT mention Bohler's angle.
      - The report should be specific to the given measurements and classification.
      - Do NOT include any patient information (e.g., Patient ID, name, date, etc.)
      `;

      let chatHistory = [];
      chatHistory.push({ role: "user", parts: [{ text: basePrompt }] });

      const payload = { contents: chatHistory };
      const apiKey = "AIzaSyBn1gxPv3t3Ew5jJ_cBnsu-QxSyHBaWyMY";
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

      const geminiResponse = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const geminiResult = await geminiResponse.json();
      let generatedReport = "Could not generate analysis report from Gemini.";

      if (geminiResult.candidates && geminiResult.candidates[0].content && geminiResult.candidates[0].content.parts && geminiResult.candidates[0].content.parts.length > 0) {
        generatedReport = geminiResult.candidates[0].content.parts[0].text;
      } else {
        console.error("Gemini API response structure unexpected:", geminiResult);
      }
      setAnalysisResult(generatedReport);

      const analysisData = {
        userId: userId,
        fileName: selectedFile.name,
        analysisReport: generatedReport,
        previewImage: previewImage,
        simulatedClassification: classificationResultFromBackend,
        measurements: measurements,
        timestamp: serverTimestamp()
      };
      const docRef = await addDoc(collection(db, `artifacts/${appId}/users/${userId}/xray_analyses`), analysisData);
      console.log("Analysis result saved to Firestore with ID:", docRef.id);

    } catch (error) {
      console.error("Error during analysis or saving:", error);
      // Removed modal call here
      setAnalysisResult("Failed to generate analysis report due to an error.");
    } finally {
      setIsLoading(false);
    }
  };

  const Modal = ({ message, onClose }) => {
    return (
      <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white p-6 rounded-lg shadow-xl max-w-sm w-full mx-4">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Notification</h3>
          <p className="text-gray-700 mb-6">{message}</p>
          <button onClick={onClose} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-md transition duration-300 ease-in-out">Close</button>
        </div>
      </div>
    );
  };

  // The application now renders immediately, without a loading screen.
  // The UI and buttons are controlled by the `userId` state, which is set asynchronously.
  return (
    <div className="min-h-screen bg-gray-200 flex flex-col items-center font-inter">
      {/* Removed: Conditional rendering of the modal */}

      <header className="w-full" style={{ backgroundColor: '#036156' }}>
        <h1 className="text-white text-center text-3xl font-bold py-4">MedScan</h1>
      </header>

      <main className="flex-grow flex items-center justify-center w-full p-4">
        <div className="bg-white p-8 rounded-xl shadow-lg w-full max-w-3xl text-center">
          {userId && (
            <p className="text-sm text-gray-600 text-center mb-4">User ID: <span className="font-semibold">{userId}</span></p>
          )}

          {/* Main content is now rendered immediately. */}
          {/* The functionality will be disabled if userId is not ready. */}

          <div className="flex justify-center mb-6">
            <button onClick={() => setActiveTab('analyze')} className={`py-2 px-4 rounded-l-lg font-semibold transition duration-300 ease-in-out ${activeTab === 'analyze' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}>Analyze X-Ray</button>
            <button onClick={() => setActiveTab('history')} className={`py-2 px-4 rounded-r-lg font-semibold transition duration-300 ease-in-out ${activeTab === 'history' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}>Analysis History</button>
          </div>

          {activeTab === 'analyze' && (
            <>
              <div className="mb-6 border-b pb-4">
                <label htmlFor="xray-upload" className="block text-gray-700 text-sm font-bold mb-2 sr-only">Upload X-Ray Image</label>
                <div className="relative border border-gray-300 rounded-md overflow-hidden bg-white">
                  <input type="file" id="xray-upload" accept="image/*" onChange={handleFileChange} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                  <div className="flex items-center justify-between px-4 py-2 bg-white text-gray-700 border-r border-gray-300">
                    <span className="truncate pr-2">{selectedFile ? selectedFile.name : 'Choose File'}</span>
                    <span className="bg-gray-100 text-gray-800 text-xs font-medium px-2.5 py-0.5 rounded-full">Browse</span>
                  </div>
                </div>
                <p className="mt-2 text-xs text-gray-500">Upload an X-ray image for analysis.</p>
              </div>

              {previewImage && (
                <div className="mb-6 text-center border border-gray-200 rounded-lg shadow-md overflow-hidden">
                  <h2 className="text-xl font-semibold text-gray-800 mb-3 p-3 bg-gray-50">Image Preview</h2>
                  <div className="relative flex justify-center items-center bg-gray-100 p-2">
                    <img
                      src={previewImage}
                      alt="X-Ray Preview"
                      className="max-w-full h-auto rounded-md"
                      style={{ maxHeight: '400px', maxWidth: '600px' }}
                    />
                  </div>
                </div>
              )}

              <button onClick={handleAnalyze} disabled={!selectedFile || isLoading || !userId} className={`w-full py-3 px-6 rounded-md font-semibold text-white transition duration-300 ease-in-out ${selectedFile && !isLoading && userId ? 'bg-green-600 hover:bg-green-700 shadow-md' : 'bg-gray-400 cursor-not-allowed'}`}>
                {isLoading ? (
                  <span className="flex items-center justify-center">
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                    Analyzing...
                  </span>
                ) : (
                  'Analyze X-Ray'
                )}
              </button>
              <p className="mt-2 text-sm text-gray-600">(Note: This analysis is simulated. The report is saved to your private history.)</p>

              {analysisResult && (
                <div className="bg-blue-50 border border-blue-200 text-blue-800 p-4 rounded-lg shadow-sm mt-6">
                  <h2 className="text-xl font-semibold mb-3">Analysis Report:</h2>
                  <div className="whitespace-pre-wrap text-gray-800 leading-relaxed">{analysisResult}</div>
                </div>
              )}
            </>
          )}

          {activeTab === 'history' && (
            <div className="mt-4">
              <h2 className="text-2xl font-bold text-gray-800 mb-4 text-center">Your Analysis History</h2>
              {analysisHistory.length === 0 ? (<p className="text-gray-600 text-center">No analysis history found. Upload an X-ray to get started!</p>) : (
                <div className="space-y-6">
                  {analysisHistory.map((entry) => (
                    <div key={entry.id} className="bg-gray-50 p-5 rounded-lg shadow-md border border-gray-200">
                      <p className="text-sm text-gray-500 mb-2">Uploaded: {entry.timestamp ? new Date(entry.timestamp.toDate()).toLocaleString() : 'N/A'}</p>
                      <p className="text-lg font-semibold text-gray-700 mb-3">File: {entry.fileName}</p>
                      {entry.previewImage && (
                        <div className="relative flex justify-center items-center bg-gray-100 p-2 mb-4">
                          <img src={entry.previewImage} alt={`X-Ray for ${entry.fileName}`} className="max-w-full h-auto rounded-lg shadow-sm border border-gray-100" style={{ maxHeight: '250px', maxWidth: '400px' }} />
                        </div>
                      )}
                      <h3 className="text-md font-bold text-gray-800 mb-2">Report:</h3>
                      <div className="whitespace-pre-wrap text-gray-700 text-sm leading-relaxed border border-gray-200 p-3 rounded-md bg-white">{entry.analysisReport}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      <footer className="w-full py-3 text-center text-sm mt-auto" style={{ backgroundColor: '#036156' }}>
        <span className="text-white">&copy; 2025 MedScan</span>
      </footer>
    </div>
  );
}

export default App;
