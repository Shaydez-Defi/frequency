import { Link } from 'react-router-dom';
import { Bookshelf } from '../components/Bookshelf.js';

export function Landing() {
  return (
    <section className="scr">
      <div className="nav">
        <span className="wordmark">Frequency</span>
      </div>

      <h1 className="hero-h">
        Track your GP and CGPA,
        <br />
        semester by semester.
      </h1>
      <p className="hero-p">Enter your courses once, and Frequency keeps the record.</p>

      <Link className="btn btn--primary" to="/register" style={{ textDecoration: 'none' }}>
        Get Started
      </Link>
      <p className="center muted mt16">
        Already have an account?{' '}
        <Link className="linklike" to="/login">
          Log In
        </Link>
      </p>

      <div className="hero">
        <Bookshelf />
        <div className="blob blob--1" />
        <div className="blob blob--2" />
        <div className="blob blob--3" />
        <div className="dotc dotc--1" />
        <div className="dotc dotc--2" />
      </div>

      <p className="poweredby">Built by Shaydez</p>
      <p className="foot">© 2026 Frequency</p>
    </section>
  );
}
