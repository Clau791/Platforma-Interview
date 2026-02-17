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
          <Link className="logo" to="/">
            <span className="logo-badge">AI</span>
            <span>Interview Coach</span>
          </Link>
          <nav className="nav-links">
            <Link className="nav-link" to="/arena">
              Arena
            </Link>
            <Link className="nav-link" to="/profile">
              Profile
            </Link>
            <Link className="nav-link" to="/login">
              Login
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
