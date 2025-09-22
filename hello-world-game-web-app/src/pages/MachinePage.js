import React from 'react';
import CameraViewer from '../components/CameraViewer';

function MachinePage() {
  const machineId = window.location.pathname.split("/")[2];

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '20px' }}>

      <h1>Playing Desk Safari on {machineId}</h1>
      <CameraViewer machineId={machineId} />
    </div>
  );
}

export default MachinePage;