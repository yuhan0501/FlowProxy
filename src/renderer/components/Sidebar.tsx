import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Layout, Menu } from 'antd';
import {
  DashboardOutlined,
  SwapOutlined,
  ApartmentOutlined,
  AppstoreOutlined,
  SettingOutlined,
} from '@ant-design/icons';

const { Sider } = Layout;

const menuItems = [
  { key: '/dashboard', icon: <DashboardOutlined />, label: 'Dashboard' },
  { key: '/requests', icon: <SwapOutlined />, label: 'Requests' },
  { key: '/flows', icon: <ApartmentOutlined />, label: 'Flows' },
  { key: '/components', icon: <AppstoreOutlined />, label: 'Components' },
  { key: '/settings', icon: <SettingOutlined />, label: 'Settings' },
];

const Sidebar: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const selectedKey = menuItems.find(item => 
    location.pathname.startsWith(item.key)
  )?.key || '/dashboard';

  return (
    <Sider 
      width={200} 
      style={{ 
        background: '#1f1f1f',
        borderRight: '1px solid #303030'
      }}
    >
      <Menu
        mode="inline"
        selectedKeys={[selectedKey]}
        items={menuItems}
        onClick={({ key }) => navigate(key)}
        style={{ 
          height: '100%', 
          borderRight: 0,
          background: '#1f1f1f'
        }}
      />
    </Sider>
  );
};

export default Sidebar;
