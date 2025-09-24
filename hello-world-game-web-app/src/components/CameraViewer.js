import React, { useState, useEffect, useRef } from 'react';
import { createRobotClient, StreamClient, VisionClient, ButtonClient, Struct } from '@viamrobotics/sdk';
import Cookies from "js-cookie";

// Create a Viam client
async function createClient() {
    try {
      // Get credentials from localStorage
      let apiKeyId = "";
      let apiKeySecret = "";
      let host = "";
      let machineId = "";

      // Extract the machine identifier from the URL
      const machineCookieKey = window.location.pathname.split("/")[2];
      ({
        apiKey: { id: apiKeyId, key: apiKeySecret },
        machineId: machineId,
        hostname: host,
      } = JSON.parse(Cookies.get(machineCookieKey)));

      if (!apiKeySecret || !apiKeyId) {
        throw new Error('API credentials not found');
      }

      const client = await createRobotClient({
        host,
        signalingAddress: 'https://app.viam.com:443',
        credentials: {
          type: 'api-key',
          payload: apiKeySecret,
          authEntity: apiKeyId
        }
      });

      return client;
    } catch (error) {
      console.error('Error creating client:', error);
      throw error;
    }
};

function CameraViewer({ machineId }) {
  const [cameras, setCameras] = useState([]);
  const [selectedCamera, setSelectedCamera] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [viamClient, setViamClient] = useState(null);
  const [detections, setDetections] = useState([]);
  const [gameStatus, setGameStatus] = useState('Ready to start');
  const [isGameRunning, setIsGameRunning] = useState(false);
  let [mediaStream, setMediaStream] = useState(null);
  let isStreaming = useRef(false);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const detectionIntervalRef = useRef(null);
  const [gameData, setGameData] = useState({ score: 0, item_to_detect: '', time_round_start: 'None' });
  const gameDataIntervalRef = useRef(null);
  const isGameRunningRef = useRef(false);
  const [timeRemaining, setTimeRemaining] = useState(0);

  useEffect(() => {
    async function fetchAndSetCameras() {
        const viamClient = await createClient();
        setViamClient(viamClient);

        const resourceNames = await viamClient.resourceNames();
        const cameraResources = resourceNames.filter(resource => resource.subtype === 'camera');

        const tmpCameras = cameraResources.map(cameraResource => ({
            id: cameraResource.name,
            name: cameraResource.name
        }));
        setCameras(tmpCameras);
        setLoading(false);

        return 0;
    };

    if (cameras.length === 0) {
        fetchAndSetCameras();
    }

    if (!machineId) {
      setCameras([]);
      setLoading(false);
      return;
    }

}, [machineId, cameras.length]);

    async function updateCameraStream(cameraId) {
        try {
            if (!viamClient) {
                throw new Error("Viam client not initialized");
            }
            const streamClient = new StreamClient(viamClient);
            const newStream = await streamClient.getStream(cameraId);
            setMediaStream(newStream);

            // If we have a video element, set its srcObject directly
            if (videoRef.current) {
                videoRef.current.srcObject = newStream;
            }
        } catch (error) {
            console.error("Error updating camera stream:", error);
            setError(error.message);
        }
    }

    async function getDetections(cameraId) {
        try {
            if (!viamClient) {
                console.log("No Viam client available for detections");
                return;
            }

            console.log("Getting detections for camera:", cameraId);
            const visionClient = new VisionClient(viamClient, 'object-detector');
            const detections = await visionClient.getDetectionsFromCamera(cameraId);

            console.log("Raw detections received:", detections);
            console.log("Number of detections:", detections.length);

            if (detections.length > 0) {
                console.log("First detection sample:", detections[0]);
            }

            setDetections(detections);
        } catch (error) {
            console.error("Error getting detections:", error);
            console.error("Error details:", error.message, error.stack);
            // Don't set error state for detection failures, just log them
        }
    }

    const drawDetections = () => {
        const canvas = canvasRef.current;
        const video = videoRef.current;

        console.log("Drawing detections - canvas:", !!canvas, "video:", !!video, "detections count:", detections.length);

        if (!canvas || !video) {
            console.log("Missing canvas or video element");
            return;
        }

        const ctx = canvas.getContext('2d');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        console.log("Canvas dimensions:", canvas.width, "x", canvas.height);

        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Draw detection boxes
        detections.forEach((detection, index) => {
            console.log(`Drawing detection ${index}:`, detection);

            const { xMin, yMin, xMax, yMax, className, confidence } = detection;

            // Convert BigInt coordinates to numbers
            const xMinNum = Number(xMin);
            const yMinNum = Number(yMin);
            const xMaxNum = Number(xMax);
            const yMaxNum = Number(yMax);
            const confidenceNum = Number(confidence);

            console.log(`Detection ${index} coordinates:`, {
                xMin: xMinNum, yMin: yMinNum, xMax: xMaxNum, yMax: yMaxNum,
                className, confidence: confidenceNum
            });

            // Check if coordinates are already in pixel format (larger than 1)
            // or normalized format (between 0 and 1)
            let x, y, width, height;

            if (xMinNum > 1 || yMinNum > 1) {
                // Coordinates are already in pixel format
                x = xMinNum;
                y = yMinNum;
                width = xMaxNum - xMinNum;
                height = yMaxNum - yMinNum;
                console.log(`Detection ${index} - using pixel coordinates directly`);
            } else {
                // Coordinates are normalized (0-1), convert to pixels
                x = xMinNum * canvas.width;
                y = yMinNum * canvas.height;
                width = (xMaxNum - xMinNum) * canvas.width;
                height = (yMaxNum - yMinNum) * canvas.height;
                console.log(`Detection ${index} - converting normalized to pixel coordinates`);
            }

            console.log(`Detection ${index} final pixel coordinates:`, { x, y, width, height });

            // Draw bounding box
            ctx.strokeStyle = '#00ff00';
            ctx.lineWidth = 2;
            ctx.strokeRect(x, y, width, height);

            // Draw label background
            const labelText = `${className} (${(confidenceNum * 100).toFixed(1)}%)`;
            ctx.font = '32px Arial'; // Increased from 24px to 32px
            const textMetrics = ctx.measureText(labelText);
            const labelHeight = 40; // Increased from 32 to 40
            const padding = 16; // Increased from 12 to 16

            ctx.fillStyle = 'rgba(0, 255, 0, 0.8)';
            ctx.fillRect(x, y - labelHeight, textMetrics.width + padding, labelHeight);

            // Draw label text
            ctx.fillStyle = '#000000';
            ctx.fillText(labelText, x + 8, y - 12); // Adjusted positioning

            console.log(`Drew detection ${index}: ${labelText}`);
        });

        console.log("Finished drawing detections");
    };

    useEffect(() => {
        if (detections.length > 0) {
            drawDetections();
        }
    }, [detections]);

    const startStream = async (cameraId) => {
        console.log("Starting stream for camera:", cameraId);
        isStreaming.current = true;
        // Wait for the stream to be set before updating
        await updateCameraStream(cameraId);

        // Start detection polling
        if (detectionIntervalRef.current) {
            clearInterval(detectionIntervalRef.current);
        }

        console.log("Starting detection polling for camera:", cameraId);
        detectionIntervalRef.current = setInterval(() => {
            if (isStreaming.current) {
                console.log("Polling for detections...");
                getDetections(cameraId);
            }
        }, 500); // Get detections every 500ms
    };

    const stopStream = () => {
        if (mediaStream) {
          mediaStream.getTracks().forEach(track => track.stop());
        }
        isStreaming.current = false;
        setMediaStream(null);
        setDetections([]);

        // Clear detection interval
        if (detectionIntervalRef.current) {
            clearInterval(detectionIntervalRef.current);
            detectionIntervalRef.current = null;
        }
    };

    const handleCameraSelect = async (cameraId) => {
        stopStream();
        setSelectedCamera(cameraId);
        await startStream(cameraId);
    };

    const calculateTimeRemaining = (timeRoundStart) => {
      if (!timeRoundStart || timeRoundStart === 'None') {
        return 0;
      }

      const roundStartTime = new Date(timeRoundStart);
      const roundEndTime = new Date(roundStartTime.getTime() + 60000); // Add 60 seconds
      const now = new Date();

      const remaining = Math.max(0, Math.floor((roundEndTime - now) / 1000));
      return remaining;
    };

    const getGameData = async () => {
      try {
        if (!viamClient) return;

        const button = new ButtonClient(viamClient, 'button-1');
        const result = await button.doCommand(
          Struct.fromJson({
            "action": "",
          })
        );
        console.log("Result:", result);

        setGameData(result);

        // Update countdown
        const remaining = calculateTimeRemaining(result.time_round_start);
        setTimeRemaining(remaining);

        // Check if game is over
        if (result.item_to_detect === '' && result.time_round_start === 'None') {
          setIsGameRunning(false);
          isGameRunningRef.current = false;
          setGameStatus('Game Over - Ready to start');

          // Clear the game data polling interval
          if (gameDataIntervalRef.current) {
            clearInterval(gameDataIntervalRef.current);
            gameDataIntervalRef.current = null;
          }
        } else if (result.item_to_detect && result.item_to_detect !== 'None') {
          setGameStatus('Game in progress...');
          setIsGameRunning(true);
          isGameRunningRef.current = true;
        }

      } catch (error) {
        console.error("Error getting game data:", error);
      }
    };

    const startGame = async () => {
      try {
        if (!viamClient) {
          throw new Error("Viam client not initialized");
        }

        setGameStatus('Starting game...');
        setIsGameRunning(true);
        isGameRunningRef.current = true; // Set the ref

        const button = new ButtonClient(viamClient, 'button-1');
        await button.push();

        setGameStatus('Game started!');

        // Start polling game data
        if (gameDataIntervalRef.current) {
          clearInterval(gameDataIntervalRef.current);
        }

        gameDataIntervalRef.current = setInterval(() => {
          if (isGameRunningRef.current) { // Use ref instead of state
            console.log("Polling game data...");
            getGameData();
          }
        }, 1000); // Poll every second

      } catch (error) {
        console.error("Error starting game:", error);
        setGameStatus('Error starting game: ' + error.message);
        setIsGameRunning(false);
        isGameRunningRef.current = false; // Reset the ref
      }
    };

    const stopGame = () => {
      setIsGameRunning(false);
      isGameRunningRef.current = false;
      if (gameDataIntervalRef.current) {
        clearInterval(gameDataIntervalRef.current);
        gameDataIntervalRef.current = null;
      }
    };

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (detectionIntervalRef.current) {
                clearInterval(detectionIntervalRef.current);
            }
            if (gameDataIntervalRef.current) {
              clearInterval(gameDataIntervalRef.current);
            }
        };
    }, []);

    useEffect(() => {
      const countdownInterval = setInterval(() => {
        if (gameData.time_round_start && gameData.time_round_start !== 'None') {
          const remaining = calculateTimeRemaining(gameData.time_round_start);
          setTimeRemaining(remaining);
        }
      }, 1000);

      return () => clearInterval(countdownInterval);
    }, [gameData.time_round_start]);

  if (!machineId) return null;
  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div style={{
      fontFamily: 'Arial, sans-serif',
      maxWidth: '1200px',
      margin: '0 auto',
      padding: '20px',
      backgroundColor: '#f5f5f5',
      minHeight: '100vh'
    }}>

      {/* Game Controls */}
      <div style={{
        marginBottom: '30px',
        padding: '25px',
        backgroundColor: 'white',
        border: 'none',
        borderRadius: '12px',
        boxShadow: '0 4px 15px rgba(0,0,0,0.1)'
      }}>
        <h3 style={{
          fontSize: '20px',
          fontWeight: 'bold',
          color: '#2c3e50',
          margin: '0 0 20px 0',
          borderBottom: '2px solid #3498db',
          paddingBottom: '10px'
        }}>
          Game Controls
        </h3>

        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          gap: '20px',
          marginTop: '20px'
        }}>
          <div style={{
            padding: '15px',
            backgroundColor: '#ecf0f1',
            borderRadius: '8px',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between'
          }}>
            <div>
              <div style={{ fontSize: '12px', color: '#7f8c8d', marginBottom: '5px' }}>STATUS</div>
              <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#2c3e50', marginBottom: '10px' }}>
                {gameStatus}
              </div>
            </div>
            <button
              onClick={startGame}
              disabled={isGameRunning}
              style={{
                padding: '8px 16px',
                fontSize: '14px',
                fontWeight: 'bold',
                backgroundColor: isGameRunning ? '#95a5a6' : '#27ae60',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: isGameRunning ? 'not-allowed' : 'pointer',
                boxShadow: isGameRunning ? 'none' : '0 2px 8px rgba(39, 174, 96, 0.3)',
                transition: 'all 0.3s ease'
              }}
            >
              {isGameRunning ? 'Running...' : 'Start Game'}
            </button>
          </div>

          <div style={{
            padding: '15px',
            backgroundColor: '#e8f5e8',
            borderRadius: '8px',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '12px', color: '#7f8c8d', marginBottom: '5px' }}>SCORE</div>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#27ae60' }}>
              {gameData.score}
            </div>
          </div>

          <div style={{
            padding: '15px',
            backgroundColor: '#ffe8e8',
            borderRadius: '8px',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '12px', color: '#7f8c8d', marginBottom: '5px' }}>TIME LEFT</div>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#e74c3c' }}>
              {timeRemaining}s
            </div>
          </div>
        </div>

        <div style={{
          marginTop: '20px',
          padding: '15px',
          backgroundColor: '#f8f9fa',
          borderRadius: '8px',
          border: '1px solid #dee2e6'
        }}>
          <div style={{ fontSize: '14px', color: '#6c757d', marginBottom: '5px' }}>SHOW THIS ITEM TO THE CAMERA</div>
          <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#495057' }}>
            {gameData.item_to_detect || '-'}
          </div>
        </div>
      </div>

      {/* Camera Selection */}

      {/* Camera Feed */}
      {selectedCamera && (
        <div style={{
          backgroundColor: 'white',
          borderRadius: '12px',
          padding: '20px',
          boxShadow: '0 4px 15px rgba(0,0,0,0.1)',
          textAlign: 'center'
        }}>
          <h3 style={{
            fontSize: '18px',
            fontWeight: 'bold',
            color: '#2c3e50',
            margin: '0 0 15px 0'
          }}>
            Live Camera Feed
          </h3>
          <div style={{
            position: 'relative',
            display: 'inline-block',
            borderRadius: '8px',
            overflow: 'hidden',
            boxShadow: '0 4px 20px rgba(0,0,0,0.2)'
          }}>
            <video
              ref={videoRef}
              autoPlay={true}
              playsInline={true}
              muted={true}
              alt="Camera feed"
              style={{
                maxWidth: '100%',
                height: 'auto',
                display: 'block'
              }}
            />
            <canvas
              ref={canvasRef}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                pointerEvents: 'none'
              }}
            />
          </div>
        </div>
      )}

      <div style={{
        marginBottom: '20px',
        padding: '15px',
        backgroundColor: 'white',
        borderRadius: '8px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        textAlign: 'center'
      }}>
        <label style={{
          display: 'block',
          fontSize: '14px',
          fontWeight: 'bold',
          color: '#2c3e50',
          marginBottom: '8px'
        }}>
          Select Camera:
        </label>
        <select
          onChange={(e) => handleCameraSelect(e.target.value)}
          style={{
            padding: '10px 15px',
            fontSize: '16px',
            border: '2px solid #bdc3c7',
            borderRadius: '6px',
            backgroundColor: 'white',
            cursor: 'pointer',
            minWidth: '200px'
          }}
        >
          <option value="">Select a camera</option>
          {cameras.map(camera => (
            <option key={camera.id} value={camera.name}>{camera.name}</option>
          ))}
        </select>
      </div>

    </div>
  );
}

export default CameraViewer;