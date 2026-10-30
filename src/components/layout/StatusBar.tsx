import React from 'react';
import { useApp } from '../../context/AppContext';

// Company and user already appear in the header. Show only actionable status.
export const StatusBar: React.FC = () => {
  const { isOnline } = useApp();
  if (isOnline) return null;
  return <footer className="status-bar" role="status">
    <span className="status-item">Bağlantı kesildi. İnternet bağlantınızı kontrol edin.</span>
  </footer>;
};
