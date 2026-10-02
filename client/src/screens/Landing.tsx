import { Bookshelf } from '../components/Bookshelf.js';
import { GoogleButton } from './Auth.js';

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

      <GoogleButton />
      <p className="center muted mt16">One tap signs you in with Google. New students complete a short profile next.</p>

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
