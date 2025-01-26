'use client'

import { useState, useEffect, useRef } from 'react'

interface ConditionsStatus {
  face_straight: boolean
  distance_ok: boolean
  lighting_ok: boolean
}

interface Prediction {
  x: number
  y: number
  width: number
  height: number
  confidence: number
  class: string
  class_id: number
}

interface AnalysisResult {
  predictions: {
    predictions: Prediction[]
  }
  analyzed_image: string
  recognition_result?: {
    class?: string
    confidence?: number
    error?: string
  }
}

declare global {
  interface Window {
    speechCommands: any;
  }
}

const MOCK_CLASSES = [
  { id: 'CSC2506', name: 'Software Engineering' },
  { id: 'SKM3144', name: 'Database Systems' },
  { id: 'SKM1102', name: 'Programming Fundamentals' },
]

const MOCK_STUDENTS = [
  { id: 1, name: 'AYMAN', status: 'Absent', timestamp: '-' },
  { id: 2, name: 'IVEN', status: 'Absent', timestamp: '-' },
  { id: 3, name: 'RAFIE', status: 'Absent', timestamp: '-' },
  { id: 4, name: 'ALIMIN', status: 'Absent', timestamp: '-' },
  { id: 5, name: 'ILHAM', status: 'Absent', timestamp: '-' },
  { id: 6, name: 'IZZAT', status: 'Absent', timestamp: '-' },
  { id: 7, name: 'MYCLE', status: 'Absent', timestamp: '-' },
  { id: 8, name: 'HAZIQ', status: 'Absent', timestamp: '-' },
  { id: 9, name: 'IDRISH', status: 'Absent', timestamp: '-' },
  { id: 10, name: 'KHAIRUL', status: 'Absent', timestamp: '-' },
  { id: 11, name: 'HAKIM', status: 'Absent', timestamp: '-' },
  { id: 12, name: 'NAJIHAH', status: 'Absent', timestamp: '-' },
  { id: 13, name: 'FAHMI', status: 'Absent', timestamp: '-' },
  { id: 14, name: 'HARIS', status: 'Absent', timestamp: '-' },
  { id: 15, name: 'KHAIRIN', status: 'Absent', timestamp: '-' },
  { id: 16, name: 'FARHAN', status: 'Absent', timestamp: '-' },
  { id: 17, name: 'MUTTAQIN', status: 'Absent', timestamp: '-' },
  { id: 18, name: 'HAIMAN', status: 'Absent', timestamp: '-' },
  { id: 19, name: 'ZAKWAN', status: 'Absent', timestamp: '-' },
  { id: 20, name: 'SHAHRIZAL', status: 'Absent', timestamp: '-' }
]

const FaceMeshViewer = () => {
  const [status, setStatus] = useState('Connecting...')
  const [imageUrl, setImageUrl] = useState('')
  const [conditions, setConditions] = useState<ConditionsStatus>({
    face_straight: false,
    distance_ok: false,
    lighting_ok: false
  })
  const [scanProgress, setScanProgress] = useState(0)
  const [scanPass, setScanPass] = useState(1)
  const [conditionsMet, setConditionsMet] = useState(false)
  const [scanComplete, setScanComplete] = useState(false)
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null)
  const [analysisPending, setAnalysisPending] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const frameRequestRef = useRef<number | undefined>(undefined)
  const [isListening, setIsListening] = useState(false);
  const [voicePredictions, setVoicePredictions] = useState<string[]>([]);
  
  // New states for authentication and class selection
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [selectedClass, setSelectedClass] = useState<string | null>(null)
  const [showFaceRecognition, setShowFaceRecognition] = useState(false)
  const [loginData, setLoginData] = useState({
    username: '',
    password: ''
  })

  const URL = "./my_model/";

  useEffect(() => {
    // Only set up WebSocket if scan is not complete
    if (!scanComplete) {
      connectWebSocket()
    }
    
    return () => cleanup()
  }, [scanComplete])

  const connectWebSocket = () => {
    const ws = new WebSocket(`ws://127.0.0.1:8000/ws/${Date.now()}`)
    wsRef.current = ws

    ws.onopen = () => {
      setStatus('Connected')
      requestNextFrame()
    }

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data)
        
        switch(message.type) {
          case 'video_feed':
            setImageUrl(`data:image/jpeg;base64,${message.data}`)
            setConditions(message.conditions_status)
            setConditionsMet(message.conditions_met)
            setScanProgress(message.scan_progress)
            setScanPass(message.scan_pass)

            // Check for recognition result
            if (message.recognition_result) {
              console.log("Recognition complete!", message.recognition_result)
              setAnalysisResult({
                predictions: { predictions: [] },
                analyzed_image: message.data,
                recognition_result: message.recognition_result
              })
              setScanComplete(true)
              cleanup()
            } else if (message.scan_pass > 2 && !analysisPending) {
              setAnalysisPending(true)
              console.log("Scan complete, waiting for recognition...")
            } else {
              frameRequestRef.current = window.setTimeout(requestNextFrame, 20)
            }
            break

          case 'analysis_complete':
            console.log("Analysis complete!", message)
            setAnalysisResult({
              predictions: message.predictions,
              analyzed_image: message.data
            })
            setScanComplete(true)
            cleanup()
            break

          case 'analysis_error':
            console.error("Analysis failed:", message.message)
            setStatus('Analysis Failed')
            cleanup()
            break
        }
      } catch (error) {
        console.error('Error:', error)
      }
    }

    ws.onclose = () => {
      setStatus('Disconnected')
    }

    ws.onerror = (error) => {
      console.error('WebSocket error:', error)
      setStatus('Connection Error')
    }
  }

  const cleanup = () => {
    if (frameRequestRef.current) {
      clearTimeout(frameRequestRef.current)
    }
    if (wsRef.current) {
      wsRef.current.close()
    }
  }

  const requestNextFrame = () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send('next')
    }
  }

  const handleReset = () => {
    setScanComplete(false)
    setScanProgress(0)
    setScanPass(1)
    setConditionsMet(false)
    setImageUrl('')
    setAnalysisResult(null)
    setAnalysisPending(false)
  }

  const getStatusText = () => {
    if (analysisPending) return "Analyzing face..."
    if (!conditions.face_straight) return "Please face straight ahead"
    if (!conditions.distance_ok) return "Please adjust your distance"
    if (!conditions.lighting_ok) return "Please improve lighting"
    if (conditionsMet) {
      return `Scanning in progress: ${Math.round(scanProgress)}%`
    }
    return "Please maintain position"
  }

  async function createModel() {
    const checkpointURL = URL + "model.json";
    const metadataURL = URL + "metadata.json";

    const recognizer = await window.speechCommands.create(
      "BROWSER_FFT",
      undefined,
      checkpointURL,
      metadataURL
    );

    await recognizer.ensureModelLoaded();
    return recognizer;
  }

  async function initVoiceRecognition() {
    try {
      const recognizer = await createModel();
      const classLabels = recognizer.wordLabels();
      
      setIsListening(true);
      
      recognizer.listen(
        (result: { scores: number[] }) => {
          const scores = result.scores;
          const predictions = classLabels.map(
            (label: string, index: number) => 
              `${label}: ${scores[index].toFixed(2)}`
          );
          setVoicePredictions(predictions);
        },
        {
          includeSpectrogram: true,
          probabilityThreshold: 0.75,
          invokeCallbackOnNoiseAndUnknown: true,
          overlapFactor: 0.50
        }
      );
    } catch (error) {
      console.error('Error initializing audio recognition:', error);
    }
  }

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault()
    // Mock authentication - replace with actual authentication
    if (loginData.username && loginData.password) {
      setIsAuthenticated(true)
    }
  }

  // If not authenticated, show login form
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="bg-white p-8 rounded-lg shadow-md w-96">
          <h2 className="text-2xl font-bold mb-6 text-center">Login</h2>
          <form onSubmit={handleLogin}>
            <div className="mb-4">
              <label className="block text-gray-700 mb-2">Username</label>
              <input
                type="text"
                className="w-full p-2 border rounded"
                value={loginData.username}
                onChange={(e) => setLoginData(prev => ({...prev, username: e.target.value}))}
              />
            </div>
            <div className="mb-6">
              <label className="block text-gray-700 mb-2">Password</label>
              <input
                type="password"
                className="w-full p-2 border rounded"
                value={loginData.password}
                onChange={(e) => setLoginData(prev => ({...prev, password: e.target.value}))}
              />
            </div>
            <button
              type="submit"
              className="w-full bg-blue-500 text-white py-2 rounded hover:bg-blue-600"
            >
              Login
            </button>
          </form>
        </div>
      </div>
    )
  }

  // If authenticated but no class selected, show class selection
  if (!selectedClass) {
    return (
      <div className="min-h-screen p-8 bg-gray-100">
        <h2 className="text-2xl font-bold mb-6">Select Class</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {MOCK_CLASSES.map((classItem) => (
            <div
              key={classItem.id}
              className="bg-white p-6 rounded-lg shadow-md cursor-pointer hover:shadow-lg transition-shadow"
              onClick={() => setSelectedClass(classItem.id)}
            >
              <h3 className="text-xl font-semibold mb-2">{classItem.id}</h3>
              <p className="text-gray-600">{classItem.name}</p>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // If class selected but face recognition not started, show attendance list
  if (!showFaceRecognition) {
    return (
      <div className="min-h-screen p-8 bg-gray-100">
        <div className="mb-6 flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold">Class: {selectedClass}</h2>
            <p className="text-gray-600">
              {MOCK_CLASSES.find(c => c.id === selectedClass)?.name}
            </p>
          </div>
          <div className="space-x-4">
            <button
              onClick={() => setSelectedClass(null)}
              className="bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600"
            >
              Change Class
            </button>
            <button
              onClick={() => setShowFaceRecognition(true)}
              className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600"
            >
              Register Attendance
            </button>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">ID</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {MOCK_STUDENTS.map((student) => (
                <tr key={student.id}>
                  <td className="px-6 py-4">{student.id}</td>
                  <td className="px-6 py-4">{student.name}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-full text-sm ${
                      student.status === 'Present' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                    }`}>
                      {student.status}
                    </span>
                  </td>
                  <td className="px-6 py-4">{student.timestamp}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  if (scanComplete && analysisResult) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center">
        <div className="bg-white p-8 rounded-lg text-center max-w-4xl w-full">
          <h2 className="text-2xl font-bold mb-4 text-green-600">Scan Complete!</h2>
          
          {/* Display the analyzed image */}
          <div className="mb-6 relative">
            <img 
              src={`data:image/jpeg;base64,${analysisResult.analyzed_image}`}
              alt="Analysis Result"
              className="max-w-full h-auto mx-auto"
            />
          </div>

          {/* Display recognition results */}
          <div className="mb-6">
            {analysisResult.recognition_result ? (
              analysisResult.recognition_result.error ? (
                <div className="p-4 bg-red-100 text-red-700 rounded-lg">
                  <h3 className="text-xl font-semibold mb-2">Recognition Failed</h3>
                  <p>{analysisResult.recognition_result.error}</p>
                  {analysisResult.recognition_result.confidence && (
                    <p className="text-sm mt-2">
                      Confidence: {(analysisResult.recognition_result.confidence * 100).toFixed(1)}%
                    </p>
                  )}
                </div>
              ) : (
                <div className="p-4 bg-green-100 text-green-700 rounded-lg">
                  <h3 className="text-xl font-semibold mb-2">Face Recognized</h3>
                  <p className="text-lg">Are you {analysisResult.recognition_result.class}?</p>
                  {analysisResult.recognition_result.confidence && (
                    <p className="text-sm mt-2">
                      Confidence: {(analysisResult.recognition_result.confidence * 100).toFixed(1)}%
                    </p>
                  )}
                </div>
              )
            ) : (
              <div className="p-4 bg-yellow-100 text-yellow-700 rounded-lg">
                <p>No recognition results available</p>
              </div>
            )}
          </div>

          {/* Voice Recognition Section */}
          <div className="mb-6">
            <button
              onClick={initVoiceRecognition}
              disabled={isListening}
              className={`mb-4 px-4 py-2 rounded ${
                isListening 
                  ? 'bg-gray-400 cursor-not-allowed' 
                  : 'bg-blue-500 hover:bg-blue-600 text-white'
              }`}
            >
              {isListening ? 'Listening...' : 'Start Voice Recognition'}
            </button>

            <div className="space-y-2">
              {voicePredictions.map((prediction, index) => (
                <div key={index} className="p-2 bg-gray-100 rounded">
                  {prediction}
                </div>
              ))}
            </div>
          </div>

          {/* Buttons */}
          <div className="flex justify-center space-x-4">
            {analysisResult.recognition_result && !analysisResult.recognition_result.error && (
              <>
                <button 
                  onClick={() => {/* Handle Yes click */}}
                  className="bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-6 rounded transition-colors"
                >
                  Yes
                </button>
                <button 
                  onClick={() => handleReset()}
                  className="bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-6 rounded transition-colors"
                >
                  No
                </button>
              </>
            )}
            {(!analysisResult.recognition_result || analysisResult.recognition_result.error) && (
              <button 
                onClick={handleReset}
                className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-6 rounded transition-colors"
              >
                Scan Again
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 overflow-hidden">
      {/* Video Feed Container with Overlay */}
      <div className="relative w-full h-full">
        {/* Full-size Video Feed */}
        {imageUrl && (
          <img 
            src={imageUrl} 
            alt="Face Scan"
            className="w-full h-full object-cover bg-black"
          />
        )}
        
        {/* Status Overlay - positioned at the bottom left */}
        <div className="absolute bottom-4 left-4 bg-black bg-opacity-50 p-4 rounded-lg text-white">
          <div className="text-sm mb-2">Connection Status: {status}</div>
          
          {/* Conditions Status */}
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <div className={`w-2 h-2 rounded-full ${conditions.face_straight ? 'bg-green-500' : 'bg-red-500'}`} />
              <span className="text-sm">Face Position {conditions.face_straight ? '✓' : '×'}</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className={`w-2 h-2 rounded-full ${conditions.distance_ok ? 'bg-green-500' : 'bg-red-500'}`} />
              <span className="text-sm">Distance {conditions.distance_ok ? '✓' : '×'}</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className={`w-2 h-2 rounded-full ${conditions.lighting_ok ? 'bg-green-500' : 'bg-red-500'}`} />
              <span className="text-sm">Lighting {conditions.lighting_ok ? '✓' : '×'}</span>
            </div>
          </div>

          {/* Status Message */}
          <div className="mt-2 text-sm font-semibold">
            {getStatusText()}
          </div>
          
          {/* Progress Bar */}
          {(conditionsMet || analysisPending) && (
            <div className="w-full bg-gray-200 rounded-full h-2 mt-2 dark:bg-gray-700">
              <div 
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ 
                  width: analysisPending ? '100%' : `${scanProgress}%`,
                  transition: analysisPending ? 'width 1s ease-in-out' : 'width 0.3s ease-in-out'
                }}
              />
            </div>
          )}
          
          {/* Scan Pass Indicator */}
          {scanProgress > 0 && !analysisPending && (
            <div className="mt-2 text-sm">
              Scan Pass: {scanPass}/2
            </div>
          )}
        </div>
        
        {/* Face Guide Overlay */}
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
          <div className="w-64 h-64 border-2 border-white border-opacity-50 rounded-full"></div>
        </div>
      </div>
    </div>
  )
}

export default FaceMeshViewer