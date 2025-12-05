import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { ConfigProvider, theme } from 'antd';
import App from './App';
import './styles/global.css';
import { I18nProvider, Language, detectLanguageFromNavigator } from './i18n';
import { AppConfig } from '../shared/models';

const root = ReactDOM.createRoot(document.getElementById('root')!);

const AppRoot: React.FC = () => {
  const [language, setLanguage] = useState<Language | null>(null);

  useEffect(() => {
    let mounted = true;
    const init = async () => {
      try {
        const config: AppConfig = await window.electronAPI.getConfig();
        let lang = config.language as Language | undefined;
        if (!lang) {
          lang = detectLanguageFromNavigator();
          // 持久化首次选择的语言，后续不再依赖系统语言
          await window.electronAPI.saveConfig({ language: lang });
        }
        if (mounted) {
          setLanguage(lang);
        }
      } catch (e) {
        console.error('Failed to init language from config:', e);
        if (mounted) {
          setLanguage(detectLanguageFromNavigator());
        }
      }
    };
    void init();
    return () => {
      mounted = false;
    };
  }, []);

  if (!language) {
    // 简单的启动占位，避免在语言尚未确定前闪烁
    return null;
  }

  return (
    <ConfigProvider
      theme={{
        algorithm: theme.darkAlgorithm,
        token: {
          colorPrimary: '#1890ff',
          borderRadius: 6,
        },
      }}
    >
      <I18nProvider
        language={language}
        onChangeLanguage={(lang) => {
          setLanguage(lang);
          window.electronAPI
            .saveConfig({ language: lang })
            .catch((e) => console.error('Failed to persist language change:', e));
        }}
      >
        <HashRouter>
          <App />
        </HashRouter>
      </I18nProvider>
    </ConfigProvider>
  );
};

root.render(
  <React.StrictMode>
    <AppRoot />
  </React.StrictMode>
);
