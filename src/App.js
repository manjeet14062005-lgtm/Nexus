import React, { useEffect, useState } from "react";
import { BrowserRouter as Router } from "react-router-dom";
import { NotifProvider } from "./components/common/NotifProvider";
import { MainApp } from "./pages/MainApp";
import { auth } from "./lib/supabaseLegacy";

export default function App() {
  const [user, setUser] = useState(null);
  useEffect(() => { const unsub = auth.onAuthStateChanged((u) => setUser(u)); return () => unsub(); }, []);
  return (
    <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <NotifProvider user={user}>
        <MainApp />
      </NotifProvider>
    </Router>
  );
}
