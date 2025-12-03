import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from 'antd';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import Dashboard from './pages/Dashboard';
import Requests from './pages/Requests';
import Flows from './pages/Flows';
import FlowEditor from './pages/FlowEditor';
import Components from './pages/Components';
import Settings from './pages/Settings';

const { Content } = Layout;

const App: React.FC = () => {
  return (
    <Layout style={{ height: '100vh' }}>
      <Header />
      <Layout>
        <Sidebar />
        <Content style={{ 
          padding: '16px', 
          overflow: 'auto',
          background: '#141414'
        }}>
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/requests" element={<Requests />} />
            <Route path="/flows" element={<Flows />} />
            <Route path="/flows/:id" element={<FlowEditor />} />
            <Route path="/components" element={<Components />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </Content>
      </Layout>
    </Layout>
  );
};

export default App;
