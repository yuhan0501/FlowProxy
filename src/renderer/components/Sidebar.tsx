import React, { useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Layout, Menu } from 'antd';
import {
  DashboardOutlined,
  SwapOutlined,
  ApartmentOutlined,
  AppstoreOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import { useI18n } from '../i18n';

const { Sider } = Layout;

const Sidebar: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useI18n();

  const menuItems = useMemo(
    () => [
      { key: '/dashboard', icon: <DashboardOutlined />, label: t('nav.dashboard') },
      { key: '/requests', icon: <SwapOutlined />, label: t('nav.requests') },
      { key: '/flows', icon: <ApartmentOutlined />, label: t('nav.flows') },
      { key: '/components', icon: <AppstoreOutlined />, label: t('nav.components') },
      { key: '/settings', icon: <SettingOutlined />, label: t('nav.settings') },
    ],
    [t]
  );

  const selectedKey =
    menuItems.find((item) => location.pathname.startsWith(item.key))?.key ||
    '/dashboard';

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
