import { BrowserRouter, Link, Route, Routes } from "react-router-dom";

import Arena from "./pages/Arena";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Profile from "./pages/Profile";


export default function App() {
  return (
    <BrowserRouter>
      <div className="app-shell">
        <header className="app-header">
          <div className="logo-box">
            <Link className="logo" to="/">
              <span className="logo-badge">AI</span>
              <span>Coach Interviu</span>
            </Link>
          </div>
          <nav className="nav-links">
            <Link className="nav-link" to="/arena">
              Arena
            </Link>
            <Link className="nav-link" to="/profile">
              Profil
            </Link>
            <Link className="nav-link" to="/login">
              Autentificare
            </Link>
          </nav>
        </header>

        <main className="app-main">
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/arena" element={<Arena />} />
            <Route path="/profile" element={<Profile />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
