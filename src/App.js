import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, addDoc, query, orderBy, onSnapshot, serverTimestamp } from 'firebase/firestore';

// For local development, these variables are expected to be set as environment variables
// prefixed with REACT_APP_. When deployed in Canvas, the global __ variables will override.
// We'll provide default empty/null values for local testing if not explicitly set.
const appId = process.env.REACT_APP_APP_ID || 'default-app-id-local';
const firebaseConfig = process.env.REACT_APP_FIREBASE_CONFIG ? JSON.parse(process.env.REACT_APP_FIREBASE_CONFIG) : {};
const initialAuthToken = process.env.REACT_APP_INITIAL_AUTH_TOKEN || null;

// Placeholder for Firebase instances
let app, auth, db;

// Main App Component
function App() {
  const [user, setUser] = useState(null);
  const [userId, setUserId] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewImage, setPreviewImage] = useState(null);
  const [analysisResult, setAnalysisResult] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [modalMessage, setModalMessage] = useState('');
  const [analysisHistory, setAnalysisHistory] = useState([]);
  const [activeTab, setActiveTab] = useState('analyze');

  // Removed: Canvas drawing states and logic

  // Initialize Firebase and handle authentication
  useEffect(() => {
    try {
      // Use the firebaseConfig from environment variables or default
      if (Object.keys(firebaseConfig).length === 0) {
        console.warn("Firebase config is empty. Please ensure REACT_APP_FIREBASE_CONFIG is set in .env.local or Firebase is initialized in Canvas.");
        // If no config, we can't initialize Firebase. Show a modal and return.
        setModalMessage("Firebase configuration is missing. Please check your .env.local file or run in Canvas environment.");
        setShowModal(true);
        setIsAuthReady(true); // Mark ready to stop loading, but with an error
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
            setModalMessage(`Authentication failed: ${error.message}. Please try again.`);
            setShowModal(true);
          }
        }
        setUser(auth.currentUser);
        // Use auth.currentUser?.uid for logged-in users, otherwise a random UUID for anonymous
        setUserId(auth.currentUser?.uid || crypto.randomUUID());
        setIsAuthReady(true);
      });

      return () => unsubscribe();
    } catch (error) {
      console.error("Failed to initialize Firebase:", error);
      setModalMessage(`Firebase initialization failed: ${error.message}.`);
      setShowModal(true);
    }
  }, []); // Empty dependency array means this runs once on mount

  // Fetch analysis history
  useEffect(() => {
    // Only fetch history if Firebase is ready and userId is available
    if (isAuthReady && userId && db) {
      // Define the collection path for private user data
      const historyCollectionRef = collection(db, `artifacts/${appId}/users/${userId}/xray_analyses`);

      // Order by timestamp to get most recent first
      const q = query(historyCollectionRef, orderBy('timestamp', 'desc'));

      const unsubscribe = onSnapshot(q, (snapshot) => {
        const history = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setAnalysisHistory(history);
      }, (error) => {
        console.error("Error fetching analysis history:", error);
        setModalMessage(`Failed to load history: ${error.message}.`);
        setShowModal(true);
      });

      return () => unsubscribe(); // Clean up the snapshot listener
    }
  }, [isAuthReady, userId, db, appId]); // Re-run when auth state, userId, or appId changes

  // Handle file selection
  const handleFileChange = (event) => {
    const file = event.target.files[0];
    if (file) {
      setSelectedFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviewImage(reader.result);
        setAnalysisResult('');
        // Removed: setDrawnShapes([]); // Clear drawings on new image
        // Removed: setCurrentShape(null);
      };
      reader.readAsDataURL(file);
    } else {
      setSelectedFile(null);
      setPreviewImage(null);
      setAnalysisResult('');
      // Removed: setDrawnShapes([]);
      // Removed: setCurrentShape(null);
    }
  };

  // Removed: Canvas Drawing Logic (useEffect, getCanvasCoordinates, startDrawing, draw, endDrawing, clearDrawings)

  // Simulate AI analysis using Gemini API and save to Firestore
  const handleAnalyze = async () => {
    if (!selectedFile) {
      setModalMessage("Please upload an X-ray image first.");
      setShowModal(true);
      return;
    }
    if (!userId) {
      setModalMessage("User not authenticated. Please wait for authentication to complete.");
      setShowModal(true);
      return;
    }

    setIsLoading(true);
    setAnalysisResult('');

    try {
      // Simulate a binary classification result (Normal/Abnormal)
      const isAbnormal = Math.random() > 0.5; // 50% chance of being abnormal for simulation
      let classificationResult = isAbnormal ? "Abnormal" : "Normal";

      // Removed: drawingDescription construction
      const basePrompt = `Generate a detailed mock X-ray report for a lateral view of a human foot, specifically mentioning the calcaneum, plantar fascia, medial longitudinal arch, and the presence/absence of a calcaneal spur. The simulated AI classification for this image is: **${classificationResult}**. Based on this classification, provide findings. Example for Normal: "Calcaneal spur: Absent. Medial longitudinal arch: Maintained. Plantar fascia: Normal." Example for Abnormal: "Calcaneal spur: Present, superior aspect. Medial longitudinal arch: Mildly flattened. Plantar fascia: Thickened."`;

      const combinedPrompt = basePrompt; // No drawing description to combine

      let chatHistory = [];
      chatHistory.push({ role: "user", parts: [{ text: combinedPrompt }] });

      const payload = { contents: chatHistory };
      const apiKey = ""; // Canvas will automatically provide this in runtime, or use a real key for local testing
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const result = await response.json(); // Use await here
      let generatedReport = "Could not generate analysis report.";

      if (result.candidates && result.candidates.length > 0 &&
        result.candidates[0].content && result.candidates[0].content.parts &&
        result.candidates[0].content.parts.length > 0) {
        generatedReport = result.candidates[0].content.parts[0].text;
      } else {
        console.error("Gemini API response structure unexpected:", result);
      }
      setAnalysisResult(generatedReport);

      // Save analysis result to Firestore
      const analysisData = {
        userId: userId,
        fileName: selectedFile.name,
        analysisReport: generatedReport,
        // Removed: drawnShapes: drawnShapes, // No longer saving drawn shapes
        previewImage: previewImage, // Still save the Data URL of the preview image for history
        simulatedClassification: classificationResult, // Save the simulated classification
        timestamp: serverTimestamp()
      };
      const docRef = await addDoc(collection(db, `artifacts/${appId}/users/${userId}/xray_analyses`), analysisData);
      console.log("Analysis result saved to Firestore with ID:", docRef.id);

    } catch (error) {
      console.error("Error during AI analysis or data saving:", error);
      setModalMessage(`Error during analysis or saving: ${error.message}.`);
      setShowModal(true);
      setAnalysisResult("Failed to generate analysis report due to an error.");
    } finally {
      setIsLoading(false);
    }
  };

  // Custom Modal Component
  const Modal = ({ message, onClose }) => {
    return (
      <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white p-6 rounded-lg shadow-xl max-w-sm w-full mx-4">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Notification</h3>
          <p className="text-gray-700 mb-6">{message}</p>
          <button
            onClick={onClose}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-md transition duration-300 ease-in-out"
          >
            Close
          </button>
        </div>
      </div>
    );
  };

  if (!isAuthReady) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100 font-inter">
        <div className="text-xl text-gray-700">Loading application...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-200 flex flex-col items-center font-inter">
      {showModal && <Modal message={modalMessage} onClose={() => setShowModal(false)} />}

      {/* Header */}
      <header className="w-full" style={{ backgroundColor: '#036156' }}> {/* Updated background color */}
        <h1 className="text-white text-center text-3xl font-bold py-4">MedScan</h1> {/* Added py-4 here */}
      </header>

      {/* Main Content Area */}
      <main className="flex-grow flex items-center justify-center w-full p-4">
        <div className="bg-white p-8 rounded-xl shadow-lg w-full max-w-3xl text-center">
          {/* User Info */}
          {userId && (
            <p className="text-sm text-gray-600 text-center mb-4">
              User ID: <span className="font-semibold">{userId}</span>
            </p>
          )}

          {/* Tabs for Analyze and History */}
          <div className="flex justify-center mb-6">
            <button
              onClick={() => setActiveTab('analyze')}
              className={`py-2 px-4 rounded-l-lg font-semibold transition duration-300 ease-in-out ${activeTab === 'analyze'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
            >
              Analyze X-Ray
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`py-2 px-4 rounded-r-lg font-semibold transition duration-300 ease-in-out ${activeTab === 'history'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
            >
              Analysis History
            </button>
          </div>

          {activeTab === 'analyze' && (
            <>
              {/* Upload Section */}
              <div className="mb-6 border-b pb-4">
                <label htmlFor="xray-upload" className="block text-gray-700 text-sm font-bold mb-2 sr-only">
                  Upload X-Ray Image
                </label>
                <div className="relative border border-gray-300 rounded-md overflow-hidden bg-white">
                  <input
                    type="file"
                    id="xray-upload"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <div className="flex items-center justify-between px-4 py-2 bg-white text-gray-700 border-r border-gray-300">
                    <span className="truncate pr-2">
                      {selectedFile ? selectedFile.name : 'Choose File'}
                    </span>
                    <span className="bg-gray-100 text-gray-800 text-xs font-medium px-2.5 py-0.5 rounded-full">Browse</span>
                  </div>
                </div>
                <p className="mt-2 text-xs text-gray-500">
                  Upload an X-ray image for analysis.
                </p>
              </div>

              {/* Image Preview Area (no drawing) */}
              {previewImage && (
                <div className="mb-6 text-center border border-gray-200 rounded-lg shadow-md overflow-hidden">
                  <h2 className="text-xl font-semibold text-gray-800 mb-3 p-3 bg-gray-50">
                    Image Preview
                  </h2>
                  <div className="relative flex justify-center items-center bg-gray-100 p-2">
                    <img
                      src={previewImage}
                      alt="X-Ray Preview"
                      className="max-w-full h-auto rounded-md"
                      style={{ maxHeight: '400px', maxWidth: '600px' }} // Ensure image fits
                    />
                  </div>
                  {/* Removed: Drawing buttons */}
                </div>
              )}

              {/* Analyze Button */}
              <button
                onClick={handleAnalyze}
                disabled={!selectedFile || isLoading}
                className={`w-full py-3 px-6 rounded-md font-semibold text-white transition duration-300 ease-in-out ${selectedFile && !isLoading
                    ? 'bg-green-600 hover:bg-green-700 shadow-md'
                    : 'bg-gray-400 cursor-not-allowed'
                  }`}
              >
                {isLoading ? (
                  <span className="flex items-center justify-center">
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Analyzing...
                  </span>
                ) : (
                  'Analyze X-Ray'
                )}
              </button>
              <p className="mt-2 text-sm text-gray-600">
                (Note: This analysis is simulated. The report is saved to your private history.)
              </p>

              {/* Analysis Results */}
              {analysisResult && (
                <div className="bg-blue-50 border border-blue-200 text-blue-800 p-4 rounded-lg shadow-sm mt-6">
                  <h2 className="text-xl font-semibold mb-3">Analysis Report:</h2>
                  <div className="whitespace-pre-wrap text-gray-800 leading-relaxed">
                    {analysisResult}
                  </div>
                </div>
              )}
            </>
          )}

          {activeTab === 'history' && (
            <div className="mt-4">
              <h2 className="text-2xl font-bold text-gray-800 mb-4 text-center">
                Your Analysis History
              </h2>
              {analysisHistory.length === 0 ? (
                <p className="text-gray-600 text-center">No analysis history found. Upload an X-ray to get started!</p>
              ) : (
                <div className="space-y-6">
                  {analysisHistory.map((entry) => (
                    <div key={entry.id} className="bg-gray-50 p-5 rounded-lg shadow-md border border-gray-200">
                      <p className="text-sm text-gray-500 mb-2">
                        Uploaded: {entry.timestamp ? new Date(entry.timestamp.toDate()).toLocaleString() : 'N/A'}
                      </p>
                      <p className="text-lg font-semibold text-gray-700 mb-3">File: {entry.fileName}</p>

                      {/* Display the image preview from history */}
                      {entry.previewImage && (
                        <div className="relative flex justify-center items-center bg-gray-100 p-2 mb-4">
                          <img
                            src={entry.previewImage}
                            alt={`X-Ray for ${entry.fileName}`}
                            className="max-w-full h-auto rounded-lg shadow-sm border border-gray-100"
                            style={{ maxHeight: '250px', maxWidth: '400px' }}
                          />
                        </div>
                      )}

                      <h3 className="text-md font-bold text-gray-800 mb-2">Report:</h3>
                      <div className="whitespace-pre-wrap text-gray-700 text-sm leading-relaxed border border-gray-200 p-3 rounded-md bg-white">
                        {entry.analysisReport}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full py-3 text-center text-sm mt-auto" style={{ backgroundColor: '#036156' }}>
        <span className="text-white">&copy; 2025 MedScan</span>
      </footer>
    </div>
  );
}

export default App;
