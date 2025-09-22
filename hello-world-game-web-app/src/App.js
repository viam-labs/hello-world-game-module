import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import MachinePage from './pages/MachinePage';

function App() {

  return (
    <Router basename="/machine">
      <Routes>
        <Route path="/:machineId" element={<MachinePage />} />
      </Routes>
    </Router>
  );
}

export default App;