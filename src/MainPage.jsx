import React, { useState, useEffect, useRef } from 'react';
import { Upload, Mic, Play, Download, Send, X, AlertCircle, CheckCircle, Loader } from 'lucide-react';
import './index.css'
// Card Component
const Card = ({ children, className = '' }) => (
  <div className={`bg-white shadow-lg rounded-lg ${className}`}>
    {children}
  </div>
);

// Button Component
const Button = ({ children, onClick, variant = 'primary', disabled = false, className = '' }) => {
  const baseStyles = "px-4 py-2 rounded-md font-medium transition-colors duration-200 flex items-center justify-center gap-2";
  const variants = {
    primary: "bg-green-600 text-white hover:bg-green-700 disabled:bg-green-300",
    secondary: "bg-gray-200 text-gray-800 hover:bg-gray-300 disabled:bg-gray-100",
    danger: "bg-red-600 text-white hover:bg-red-700 disabled:bg-red-300",
    success: "bg-green-600 text-white hover:bg-green-700 disabled:bg-green-300"
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`${baseStyles} ${variants[variant]} ${className}`}
    >
      {children}
    </button>
  );
};

// Alert Component
const Alert = ({ children, type = 'error' }) => {
  const types = {
    error: 'bg-red-50 text-red-800 border-red-200',
    success: 'bg-green-50 text-green-800 border-green-200',
    warning: 'bg-yellow-50 text-yellow-800 border-yellow-200'
  };

  return (
    <div className={`${types[type]} p-4 rounded-md border flex items-start gap-2`}>
      {type === 'error' && <AlertCircle className="w-5 h-5 mt-0.5" />}
      {type === 'success' && <CheckCircle className="w-5 h-5 mt-0.5" />}
      {children}
    </div>
  );
};

const MainPage = () => {
  const [code, setCode] = useState('');
  const [files, setFiles] = useState({});
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [assessmentResults, setAssessmentResults] = useState([]);
  const [isRecording, setIsRecording] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [progress, setProgress] = useState(0);
  const [audioBlob, setAudioBlob] = useState(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const [assessmentStarted, setAssessmentStarted] = useState(false);
  const [averageScore, setAverageScore] = useState(0);

  useEffect(() => {
    // Calculate average score when results change
    if (assessmentResults.length > 0) {
      const avg = assessmentResults.reduce((acc, curr) => acc + curr.score, 0) / assessmentResults.length;
      setAverageScore(avg);
    }
  }, [assessmentResults]);

  const handleFileUpload = async (event) => {
    const uploadedFiles = event.target.files;
    setLoading(true);
    setError('');

    try {
      const filePromises = Array.from(uploadedFiles).map(file => {
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => {
            // Validate file content
            if (e.target.result.length > 5000000) { // 5MB limit
              reject(new Error(`${file.name} is too large`));
              return;
            }
            resolve({ name: file.name, content: e.target.result });
          };
          reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
          reader.readAsText(file);
        });
      });

      const results = await Promise.all(filePromises);
      const newFiles = {};
      results.forEach(file => {
        newFiles[file.name] = file.content;
      });
      setFiles(prev => ({ ...prev, ...newFiles }));
      setSuccess('Files uploaded successfully');
    } catch (err) {
      setError(err.message || 'Failed to upload files');
    } finally {
      setLoading(false);
    }
  };

  const startAssessment = async () => {
    if (!code.trim() && Object.keys(files).length === 0) {
      setError('Please either paste your code or upload files');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch('http://localhost:5000/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, files })
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      if (data.questions && data.questions.length > 0) {
        setQuestions(data.questions);
        setCurrentQuestion(0);
        setProgress(0);
        setAssessmentStarted(true);
        setSuccess('Assessment started successfully');
      } else {
        throw new Error('No questions received from server');
      }
    } catch (err) {
      setError(err.message || 'Failed to start assessment');
    } finally {
      setLoading(false);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorderRef.current.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
        setAudioBlob(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorderRef.current.start();
      setIsRecording(true);
      setError('');
    } catch (err) {
      setError('Failed to access microphone. Please ensure microphone permissions are granted.');
      setIsRecording(false);
    }
  };

  const stopRecording = async () => {
    if (!mediaRecorderRef.current) {
      setError('No active recording found');
      return;
    }

    mediaRecorderRef.current.stop();
    setIsRecording(false);
    setLoading(true);

    try {
      const formData = new FormData();
      formData.append('audio', audioBlob);
      formData.append('question', questions[currentQuestion]);

      const response = await fetch('http://localhost:5000/evaluate', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      setAssessmentResults(prev => [...prev, result]);
      
      if (currentQuestion < questions.length - 1) {
        setCurrentQuestion(prev => prev + 1);
        setProgress(((currentQuestion + 1) / questions.length) * 100);
      } else {
        setCurrentQuestion(null);
        setAssessmentStarted(false);
        setSuccess('Assessment completed successfully!');
      }
    } catch (err) {
      setError(err.message || 'Failed to process recording');
    } finally {
      setLoading(false);
      setAudioBlob(null);
    }
  };

  const generateReport = async () => {
    setLoading(true);
    try {
      const response = await fetch('http://localhost:5000/generate-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          results: assessmentResults,
          code,
          files,
          averageScore
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `assessment_report_${new Date().toISOString().slice(0,10)}.docx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      setSuccess('Report downloaded successfully');
    } catch (err) {
      setError(err.message || 'Failed to generate report');
    } finally {
      setLoading(false);
    }
  };

  const removeFile = (filename) => {
    const newFiles = { ...files };
    delete newFiles[filename];
    setFiles(newFiles);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-4xl font-bold text-gray-900 tracking-tight">Code Assessment Interview</h1>
          <p className="mt-3 text-xl text-gray-500">Submit your code and complete the verbal assessment</p>
        </div>

        {/* Alerts */}
        {error && (
          <Alert type="error">
            <p>{error}</p>
            <button onClick={() => setError('')} className="ml-auto">
              <X className="w-4 h-4" />
            </button>
          </Alert>
        )}
        {success && (
          <Alert type="success">
            <p>{success}</p>
            <button onClick={() => setSuccess('')} className="ml-auto">
              <X className="w-4 h-4" />
            </button>
          </Alert>
        )}

        {!assessmentStarted && (
          <div className="space-y-6">
            {/* Code Input */}
            <Card className="overflow-hidden">
              <div className="p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Code Input</h2>
                <textarea
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className="w-full h-64 p-4 border rounded-lg font-mono text-sm bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Paste your code here (optional if uploading files)..."
                />
              </div>
            </Card>

            {/* File Upload */}
            <Card>
              <div className="p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">File Upload</h2>
                <div className="flex items-center justify-center w-full">
                  <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer hover:bg-gray-50 border-gray-300 hover:border-blue-500 transition-colors duration-200">
                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                      <Upload className="w-8 h-8 mb-4 text-gray-500" />
                      <p className="mb-2 text-sm text-gray-500">
                        <span className="font-semibold">Click to upload</span> or drag and drop
                      </p>
                      <p className="text-xs text-gray-500">.py, .txt, .md, .json, .yaml, .yml, .css, .html, .js</p>
                    </div>
                    <input
                      type="file"
                      className="hidden"
                      multiple
                      accept=".py,.txt,.md,.json,.yaml,.yml,.css,.html,.js"
                      onChange={handleFileUpload}
                    />
                  </label>
                </div>

                {/* File List */}
                {Object.keys(files).length > 0 && (
                  <div className="mt-4">
                    <h4 className="text-sm font-medium text-gray-900 mb-2">Uploaded Files:</h4>
                    <div className="space-y-2">
                      {Object.keys(files).map(filename => (
                        <div key={filename} className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-md">
                          <span className="text-sm text-gray-600">{filename}</span>
                          <button
                            onClick={() => removeFile(filename)}
                            className="text-gray-400 hover:text-red-500 transition-colors duration-200"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </Card>

            {/* Start Assessment Button */}
            <Button
              onClick={startAssessment}
              disabled={loading || (!code && Object.keys(files).length === 0)}
              className="w-full"
            >
              {loading ? (
                <>
                  <Loader className="w-5 h-5 animate-spin" />
                  Starting Assessment...
                </>
              ) : (
                <>
                  <Play className="w-5 h-5" />
                  Start Assessment
                </>
              )}
            </Button>
          </div>
        )}

        {/* Assessment Progress */}
        {assessmentStarted && currentQuestion !== null && (
          <Card className="p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Assessment in Progress</h2>
            
            {/* Progress Bar */}
            <div className="mb-6">
              <div className="flex justify-between text-sm text-gray-600 mb-2">
                <span>Progress</span>
                <span>{Math.round(progress)}%</span>
              </div>
              <div className="h-2 bg-gray-200 rounded-full">
                <div
                  className="h-2 bg-blue-600 rounded-full transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>

            {/* Current Question */}
            <div className="mb-6">
              <h3 className="text-lg font-medium text-gray-900 mb-2">
              {currentQuestion + 1}: {questions[currentQuestion]}
              </h3>

              {/* Recording Controls */}
              <div className="mt-8 flex flex-col items-center gap-4">
                <Button
                  onClick={isRecording ? stopRecording : startRecording}
                  variant={isRecording ? 'danger' : 'primary'}
                  disabled={loading}
                  className="w-48"
                >
                  {loading ? (
                    <>
                      <Loader className="w-5 h-5 animate-spin" />
                      Processing...
                    </>
                  ) : isRecording ? (
                    <>
                      <Mic className="w-5 h-5" />
                      Stop Recording
                    </>
                  ) : (
                    <>
                      <Mic className="w-5 h-5" />
                      Start Recording
                    </>
                  )}
                </Button>

                {isRecording && (
                  <div className="flex items-center gap-2 text-red-600">
                    <div className="w-3 h-3 bg-red-600 rounded-full animate-pulse" />
                    Recording in progress...
                  </div>
                )}

                {audioBlob && !isRecording && (
                  <div className="w-full max-w-md">
                    <audio
                      src={URL.createObjectURL(audioBlob)}
                      controls
                      className="w-full mt-4"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Previous Answers Summary */}
            {assessmentResults.length > 0 && (
              <div className="mt-8 border-t pt-6">
                <h4 className="text-lg font-medium text-gray-900 mb-4">Previous Responses</h4>
                <div className="space-y-4">
                  {assessmentResults.map((result, index) => (
                    <div key={index} className="bg-gray-50 rounded-lg p-4">
                      <div className="flex justify-between items-start mb-2">
                        <h5 className="font-medium text-gray-900">Question {index + 1}</h5>
                        <span className={`px-2 py-1 rounded-full text-sm ${
                          result.score >= 8 ? 'bg-green-100 text-green-800' :
                          result.score >= 6 ? 'bg-yellow-100 text-yellow-800' :
                          'bg-red-100 text-red-800'
                        }`}>
                          Score: {result.score}/10
                        </span>
                      </div>
                      <p className="text-gray-600 text-sm">{result.explanation}</p>
                      {result.followup && (
                        <p className="mt-2 text-sm text-blue-600">
                          Follow-up: {result.followup}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>
        )}

        {/* Final Results */}
        {assessmentResults.length > 0 && currentQuestion === null && (
          <Card className="p-6">
            <div className="text-center mb-6">
              <h2 className="text-2xl font-bold text-gray-900">Assessment Complete!</h2>
              <p className="text-gray-600 mt-2">
                Final Score: {averageScore.toFixed(1)}/10
              </p>
            </div>

            {/* Score Breakdown */}
            <div className="mb-8">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Score Breakdown</h3>
              <div className="space-y-4">
                {assessmentResults.map((result, index) => (
                  <div key={index} className="bg-gray-50 rounded-lg p-4">
                    <div className="flex justify-between items-center mb-2">
                      <h4 className="font-medium text-gray-900">Question {index + 1}</h4>
                      <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                        result.score >= 8 ? 'bg-green-100 text-green-800' :
                        result.score >= 6 ? 'bg-yellow-100 text-yellow-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        {result.score}/10
                      </span>
                    </div>
                    <div className="mt-2 space-y-2">
                      <p className="text-sm text-gray-600">{result.explanation}</p>
                      {result.recommendations && (
                        <p className="text-sm text-blue-600">
                          Recommendation: {result.recommendations}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Performance Summary */}
            <div className="mb-8 bg-blue-50 rounded-lg p-4">
              <h3 className="text-lg font-medium text-blue-900 mb-2">Performance Summary</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white rounded-lg p-3 shadow-sm">
                  <div className="text-sm text-gray-500">Average Score</div>
                  <div className="text-2xl font-bold text-blue-600">
                    {averageScore.toFixed(1)}/10
                  </div>
                </div>
                <div className="bg-white rounded-lg p-3 shadow-sm">
                  <div className="text-sm text-gray-500">Questions Completed</div>
                  <div className="text-2xl font-bold text-blue-600">
                    {assessmentResults.length}/{questions.length}
                  </div>
                </div>
              </div>
            </div>

            {/* Download Report Button */}
            <Button
              onClick={generateReport}
              variant="success"
              disabled={loading}
              className="w-full"
            >
              {loading ? (
                <>
                  <Loader className="w-5 h-5 animate-spin" />
                  Generating Report...
                </>
              ) : (
                <>
                  <Download className="w-5 h-5" />
                  Download Detailed Report
                </>
              )}
            </Button>

            {/* Restart Assessment Button */}
            <Button
              onClick={() => {
                setAssessmentResults([]);
                setQuestions([]);
                setCurrentQuestion(null);
                setProgress(0);
                setCode('');
                setFiles({});
                setError('');
                setSuccess('');
                setAverageScore(0);
              }}
              variant="secondary"
              className="w-full mt-4"
            >
              Start New Assessment
            </Button>
          </Card>
        )}
      </div>
    </div>
  );
};

export default MainPage;
