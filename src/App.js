import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, addDoc, query, orderBy, onSnapshot, serverTimestamp } from 'firebase/firestore';

// Environment variable handling
const appId = process.env.REACT_APP_APP_ID || 'default-app-id-local';
const firebaseConfig = process.env.REACT_APP_FIREBASE_CONFIG ? JSON.parse(process.env.REACT_APP_FIREBASE_CONFIG) : {};
const initialAuthToken = process.env.REACT_APP_INITIAL_AUTH_TOKEN === 'null' ? null : process.env.REACT_APP_INITIAL_AUTH_TOKEN;

let app, auth, db;

function App() {
  const [user, setUser] = useState(null);
  const [userId, setUserId] = useState(null);
  const [selectedFiles, setselectedFiles] = useState([]);
  const [previewImages, setPreviewImages] = useState([]);
  const [analysisResult, setAnalysisResult] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [analysisHistory, setAnalysisHistory] = useState([]);
  const [activeTab, setActiveTab] = useState('analyze');
  const [batchSummary, setBatchSummary] = useState([]);

  // Initialize Firebase
  useEffect(() => {
    try {
      if (Object.keys(firebaseConfig).length === 0) {
        console.warn("Firebase config is empty.");
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
            } else {
              await signInAnonymously(auth);
            }
          } catch (error) {
            console.error("Firebase authentication error:", error);
          }
        }
        setUser(auth.currentUser);
        setUserId(auth.currentUser?.uid || crypto.randomUUID());
      });

      return () => unsubscribe();
    } catch (error) {
      console.error("Failed to initialize Firebase:", error);
    }
  }, []);

  // Fetch History
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
      });
      return () => unsubscribe();
    }
  }, [userId, db, appId]);

  const handleFileChange = (event) => {
    const files = event.target.files;
    if (files.length > 0) {
      const limitedFiles = Array.from(files).slice(0, 25);
      setselectedFiles(limitedFiles);

      const newPreviewImages = [];
      limitedFiles.forEach(file => {
        const reader = new FileReader();
        reader.onloadend = () => {
          newPreviewImages.push(reader.result);
          if (newPreviewImages.length === limitedFiles.length) {
            setPreviewImages(newPreviewImages);
          }
        };
        reader.readAsDataURL(file);
      });
      setAnalysisResult('');
    } else {
      setselectedFiles([]);
      setPreviewImages([]);
      setAnalysisResult('');
    }
  };

  // --- UPDATED ANALYZE FUNCTION ---
  const handleAnalyze = async () => {
    if (selectedFiles.length === 0 || !userId) {
      console.error("Selection or authentication incomplete.");
      return;
    }

    setIsLoading(true);
    setAnalysisResult('');
    setBatchSummary([]);

    try {
      const resultsSummary = [];

      for (const selectedFile of selectedFiles) {
        const formData = new FormData();
        formData.append('image', selectedFile);
        formData.append('userId', userId);

        // 1. Send to Backend (Python)
        const backendApiUrl = 'http://127.0.0.1:5000/api/analyze_xray';
        const backendResponse = await fetch(backendApiUrl, {
          method: 'POST',
          body: formData,
        });

        const backendResult = await backendResponse.json();
        let classificationResultFromBackend = "Unknown";
        let measurements = {};
        let generatedReport = "Report unavailable.";

        if (backendResult.status === "success") {
          classificationResultFromBackend = backendResult.classificationResult;
          measurements = backendResult.measurements || {};
          generatedReport = backendResult.report || "No report returned from backend.";
        } else {
          console.error("Backend response error:", backendResult.error);
          continue;
        }

        // UPDATE 1: Store "spurStatus" instead of numeric value
        resultsSummary.push({
          fileName: selectedFile.name,
          spurStatus: measurements.spurStatus, // Changed from calcaneumSpur
          navicularIndex: measurements.navicularIndex,
          classification: classificationResultFromBackend,
        });

        // 2. Save to Firestore
        const analysisData = {
          userId: userId,
          fileName: selectedFile.name,
          analysisReport: generatedReport,
          previewImage: null,
          simulatedClassification: classificationResultFromBackend,
          measurements: measurements,
          timestamp: serverTimestamp()
        };

        await addDoc(collection(db, `artifacts/${appId}/users/${userId}/xray_analyses`), analysisData);
      }

      setBatchSummary(resultsSummary);
      setAnalysisResult("Batch analysis complete. Check the summary below or History tab.");

    } catch (error) {
      console.error("Error during analysis or saving:", error);
      setAnalysisResult("Failed to generate analysis reports due to an error.");
      setBatchSummary([]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-200 flex flex-col items-center font-inter">
      <header className="w-full" style={{ backgroundColor: '#036156' }}>
        <h1 className="text-white text-center text-3xl font-bold py-4">MedScan</h1>
      </header>

      <main className="flex-grow flex items-center justify-center w-full p-4">
        <div className="bg-white p-8 rounded-xl shadow-lg w-full max-w-3xl text-center">
          {userId && (
            <p className="text-sm text-gray-600 text-center mb-4">User ID: <span className="font-semibold">{userId}</span></p>
          )}

          <div className="flex justify-center mb-6">
            <button onClick={() => setActiveTab('analyze')} className={`py-2 px-4 rounded-l-lg font-semibold transition duration-300 ease-in-out ${activeTab === 'analyze' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}>Analyze X-Ray</button>
            <button onClick={() => setActiveTab('history')} className={`py-2 px-4 rounded-r-lg font-semibold transition duration-300 ease-in-out ${activeTab === 'history' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}>Analysis History</button>
          </div>

          {activeTab === 'analyze' && (
            <>
              <div className="mb-6 border-b pb-4">
                <label htmlFor="xray-upload" className="block text-gray-700 text-sm font-bold mb-2 sr-only">Upload X-Ray Image</label>
                <div className="relative border border-gray-300 rounded-md overflow-hidden bg-white">
                  <input type="file" id="xray-upload" accept="image/*" onChange={handleFileChange} multiple className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                  <div className="flex items-center justify-between px-4 py-2 bg-white text-gray-700 border-r border-gray-300">
                    <span className="truncate pr-2">{selectedFiles.length > 0 ? `${selectedFiles.length} file(s) selected` : 'Choose Files'}</span>
                    <span className="bg-gray-100 text-gray-800 text-xs font-medium px-2.5 py-0.5 rounded-full">Browse</span>
                  </div>
                </div>
                <p className="mt-2 text-xs text-gray-500">Upload an X-ray image for analysis.</p>
              </div>

              {previewImages.length > 0 && (
                <div className="mb-6 text-center border border-gray-200 rounded-lg shadow-md overflow-hidden">
                  <h2 className="text-xl font-semibold text-gray-800 mb-3 p-3 bg-gray-50">Image Previews</h2>
                  <div className="relative flex flex-wrap justify-center items-center bg-gray-100 p-2">
                    {previewImages.map((src, index) => (
                      <img
                        key={index}
                        src={src}
                        alt={`X-Ray Preview ${index + 1}`}
                        className="max-w-full h-auto rounded-md m-2"
                        style={{ maxHeight: '200px', maxWidth: '300px' }}
                      />
                    ))}
                  </div>
                </div>
              )}

              <button onClick={handleAnalyze} disabled={selectedFiles.length === 0 || isLoading || !userId} className={`w-full py-3 px-6 rounded-md font-semibold text-white transition duration-300 ease-in-out ${selectedFiles.length > 0 && !isLoading && userId ? 'bg-green-600 hover:bg-green-700 shadow-md' : 'bg-gray-400 cursor-not-allowed'}`}>
                {isLoading ? (
                  <span className="flex items-center justify-center">
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                    Analyzing...
                  </span>
                ) : (
                  `Analyze ${selectedFiles.length} X-Rays`
                )}
              </button>

              {batchSummary.length > 0 && (
                <div className="bg-white p-4 rounded-lg shadow-xl mt-6">
                  <h2 className="text-2xl font-bold text-gray-800 mb-4">Batch Analysis Summary</h2>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">S.No</th>
                          {/* UPDATE 2: Changed Header from (mm) to Status */}
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Calcaneal Spur</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Navicular Index</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Classification</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {batchSummary.map((result, index) => (
                          <tr key={index} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                            <td className="px-3 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{index + 1}</td>

                            {/* UPDATE 3: Display Text Status instead of measurement */}
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-bold">
                              <span className={`px-2 py-1 rounded-full ${result.spurStatus === 'Present' ? 'bg-orange-100 text-orange-800' : 'bg-gray-100 text-gray-800'}`}>
                                {result.spurStatus}
                              </span>
                            </td>

                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-semibold">
                              {/* 4.46 is your updated threshold */}
                              {result.navicularIndex >= 4.46 ?
                                <span className="text-red-600">{result.navicularIndex} (High)</span> :
                                <span className="text-green-600">{result.navicularIndex} (Normal)</span>
                              }
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-bold">
                              <span className={`px-2 inline-flex text-xs leading-5 rounded-full ${result.classification === 'Abnormal' ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>
                                {result.classification}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {analysisResult && (
                <div className="bg-blue-50 border border-blue-200 text-blue-800 p-4 rounded-lg shadow-sm mt-6">
                  <div className="text-gray-800 leading-relaxed">{analysisResult}</div>
                </div>
              )}
            </>
          )}

          {activeTab === 'history' && (
            <div className="mt-4">
              <h2 className="text-2xl font-bold text-gray-800 mb-4 text-center">Your Analysis History</h2>
              {analysisHistory.length === 0 ? (<p className="text-gray-600 text-center">No analysis history found.</p>) : (
                <div className="space-y-6">
                  {analysisHistory.map((entry) => (
                    <div key={entry.id} className="bg-gray-50 p-5 rounded-lg shadow-md border border-gray-200">
                      <p className="text-sm text-gray-500 mb-2">Uploaded: {entry.timestamp ? new Date(entry.timestamp.toDate()).toLocaleString() : 'N/A'}</p>
                      <p className="text-lg font-semibold text-gray-700 mb-3">File: {entry.fileName}</p>

                      {entry.previewImage ? (
                        <div className="relative flex justify-center items-center bg-gray-100 p-2 mb-4">
                          <img src={entry.previewImage} alt="X-Ray" className="max-w-full h-auto" style={{ maxHeight: '250px' }} />
                        </div>
                      ) : (
                        <div className="p-4 bg-gray-200 text-gray-500 text-sm mb-4 italic text-center rounded">Image not stored to save database space</div>
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