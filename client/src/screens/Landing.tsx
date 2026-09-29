import { Link } from 'react-router-dom';
import { Bookshelf } from '../components/Bookshelf.js';

export function Landing() {
  return (
    <section className="scr">
      <div className="nav">
        <span className="wordmark">Frequency</span>
        <span className="navlinks">
          <span>HOME</span>
          <span>ABOUT</span>
          <span>PRODUCT</span>
          <span>CONTACT</span>
        </span>
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

      <p className="poweredby">Powered by Eze Munachimso Gideon</p>
      <p className="foot">Built by Shaydez · © 2026 · 2026-2027 Agric Elections</p>
    </section>
  );
}
