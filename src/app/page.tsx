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
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Face Scanner</h1>
      <div className="mb-4">Connection Status: {status}</div>
      
      {/* Conditions Status */}
      <div className="mb-4 space-y-2">
        <div className="flex items-center space-x-2">
          <div className={`w-3 h-3 rounded-full ${conditions.face_straight ? 'bg-green-500' : 'bg-red-500'}`} />
          <span>Face Position {conditions.face_straight ? '✓' : '×'}</span>
        </div>
        <div className="flex items-center space-x-2">
          <div className={`w-3 h-3 rounded-full ${conditions.distance_ok ? 'bg-green-500' : 'bg-red-500'}`} />
          <span>Distance {conditions.distance_ok ? '✓' : '×'}</span>
        </div>
        <div className="flex items-center space-x-2">
          <div className={`w-3 h-3 rounded-full ${conditions.lighting_ok ? 'bg-green-500' : 'bg-red-500'}`} />
          <span>Lighting {conditions.lighting_ok ? '✓' : '×'}</span>
        </div>
      </div>

      {/* Status Message */}
      <div className="mb-4 text-lg font-semibold">
        {getStatusText()}
      </div>
      
      {/* Progress Bar */}
      {(conditionsMet || analysisPending) && (
        <div className="w-full bg-gray-200 rounded-full h-2.5 mb-4 dark:bg-gray-700">
          <div 
            className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
            style={{ 
              width: analysisPending ? '100%' : `${scanProgress}%`,
              transition: analysisPending ? 'width 1s ease-in-out' : 'width 0.3s ease-in-out'
            }}
          />
        </div>
      )}
      
      {/* Scan Pass Indicator */}
      {scanProgress > 0 && !analysisPending && (
        <div className="mb-4">
          Scan Pass: {scanPass}/2
        </div>
      )}
      
      {/* Video Feed */}
      <div className="w-[640px] h-[480px] relative">
        {imageUrl && (
          <img 
            src={imageUrl} 
            alt="Face Scan"
            className="w-full h-full object-contain bg-black"
          />
        )}
        
        {/* Overlay Guide */}
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
          <div className="w-64 h-64 border-2 border-white border-opacity-50 rounded-full"></div>
        </div>
      </div>
    </div>
  )
}

export default FaceMeshViewer