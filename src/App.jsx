import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import {
  Frame,
  Navigation,
  TopBar,
} from '@shopify/polaris';
import {
  HomeIcon,
  LockIcon,
  CodeIcon,
  SettingsIcon,
} from '@shopify/polaris-icons';

import Dashboard from './pages/Dashboard';
import RulesPage from './pages/RulesPage';
import RuleEditor from './pages/RuleEditor';
import ScriptPage from './pages/ScriptPage';
import SettingsPage from './pages/SettingsPage';

function NavContent() {
  const location = useLocation();
  const isActive = (path) => location.pathname.startsWith(path);

  return (
    <Navigation location={location.pathname}>
      <Navigation.Section
        items={[
          {
            url: '/',
            label: 'Dashboard',
            icon: HomeIcon,
            selected: location.pathname === '/',
          },
          {
            url: '/rules',
            label: 'Lock Rules',
            icon: LockIcon,
            selected: isActive('/rules'),
          },
          {
            url: '/script',
            label: 'Script & Embed',
            icon: CodeIcon,
            selected: isActive('/script'),
          },
          {
            url: '/settings',
            label: 'Settings',
            icon: SettingsIcon,
            selected: isActive('/settings'),
          },
        ]}
      />
    </Navigation>
  );
}

export default function App() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const topBar = (
    <TopBar
      showNavigationToggle
      onNavigationToggle={() => setMobileNavOpen(!mobileNavOpen)}
    />
  );

  return (
    <Router>
      <Frame
        topBar={topBar}
        navigation={<NavContent />}
        showMobileNavigation={mobileNavOpen}
        onNavigationDismiss={() => setMobileNavOpen(false)}
      >
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/rules" element={<RulesPage />} />
          <Route path="/rules/new" element={<RuleEditor />} />
          <Route path="/rules/:id" element={<RuleEditor />} />
          <Route path="/rules/:id/button" element={<RuleEditor initialTab={1} />} />
          <Route path="/script" element={<ScriptPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </Frame>
    </Router>
  );
}
