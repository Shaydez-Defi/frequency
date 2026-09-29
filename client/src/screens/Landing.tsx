import { Link } from 'react-router-dom';
import { Bookshelf } from '../components/Bookshelf.js';

export function Landing() {
  return (
    <section className="scr">
      <div className="nav">
        <span className="wordmark">GP·CGPA</span>
        <span className="navlinks">
          <span>HOME</span>
          <span>ABOUT</span>
          <span>PRODUCT</span>
          <span>CONTACT</span>
        </span>
      </div>

      <h1 className="hero-h">
        Calculate.
        <br />
        Track.
        <br />
        Know your CGPA.
      </h1>
      <p className="hero-p">Your academic performance, organized in one place.</p>

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
      <p className="foot">Built by Shaydez · © 2026 · 2026–2027 Agric Elections</p>
    </section>
  );
}
